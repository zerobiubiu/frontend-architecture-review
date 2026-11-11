import { QueryClient, type QueryKey, QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryConvergence, type SyncSession, sessionQueryKey } from '@/app/business-sync/query-convergence';
import type { AuthUser } from '@/features/auth/types';
import type { BusinessResource } from '@/services/realtime/types';
import { ADMIN_USER, TRADER_USER } from '../msw/auth-fixtures';

interface ControlledRead {
  readonly promise: Promise<number>;
  resolve(value: number): void;
  reject(error: Error): void;
}

function controlledRead(): ControlledRead {
  let resolve: ((value: number) => void) | undefined;
  let reject: ((error: Error) => void) | undefined;
  const promise = new Promise<number>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {
    promise,
    resolve(value) {
      if (!resolve) throw new Error('受控读取尚未初始化');
      resolve(value);
    },
    reject(error) {
      if (!reject) throw new Error('受控读取尚未初始化');
      reject(error);
    },
  };
}

const cleanups: Array<() => void> = [];

interface WatchOptions {
  readonly queryKey?: QueryKey;
  readonly accountId?: string | null;
  readonly canRead?: (user: AuthUser) => boolean;
  readonly read?: () => Promise<number>;
  readonly enabled?: boolean;
  readonly registered?: boolean;
  readonly dependencies?: readonly BusinessResource[];
  readonly retainWhileCached?: boolean;
}

function harness(supplementalIntervalMs = 0) {
  const state: { session: SyncSession | null } = { session: { epoch: 1, user: TRADER_USER } };
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false },
    },
  });
  const convergence = new QueryConvergence({
    queryClient,
    getSession: () => state.session,
    mergeWindowMs: 20,
    supplementalIntervalMs,
  });
  cleanups.push(
    () => queryClient.clear(),
    () => convergence.stop(),
  );
  function watch(resource: BusinessResource, options: WatchOptions = {}) {
    const session = state.session;
    if (!session) throw new Error('测试需要已认证会话');
    const accountId = options.accountId ?? null;
    const queryKey = options.queryKey ?? sessionQueryKey(session, resource, accountId);
    let version = 0;
    const queryFn = vi.fn(options.read ?? (() => Promise.resolve(++version)));
    const observer = new QueryObserver(queryClient, {
      queryKey,
      queryFn,
      initialData: 0,
      staleTime: Infinity,
      enabled: options.enabled ?? true,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    const unregister =
      options.registered === false
        ? () => undefined
        : convergence.register({
            resource,
            queryKey,
            accountId,
            canRead: options.canRead ?? (() => true),
            ...(options.dependencies ? { dependencies: options.dependencies } : {}),
            ...(options.retainWhileCached ? { retainWhileCached: true } : {}),
          });
    cleanups.push(() => observer.destroy(), unregister);
    return { queryKey, queryFn, observer, unsubscribe, unregister };
  }
  convergence.start();
  return { state, queryClient, convergence, watch };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-10T00:00:00.000Z'));
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers();
});

describe('业务查询有界收敛', () => {
  it('未确认用户的查询键即使被误登记也不能读取或失效当前会话缓存', async () => {
    const { convergence, watch, queryClient } = harness();
    const pending = watch('orders', {
      queryKey: sessionQueryKey({ epoch: 1, user: null }, 'orders', null),
    });
    convergence.refresh(['orders']);
    await vi.advanceTimersByTimeAsync(20);
    expect(pending.queryFn).not.toHaveBeenCalled();
    expect(queryClient.getQueryState(pending.queryKey)?.isInvalidated).toBe(false);
  });

  it('聚合查询的有限次级依赖只合并一次读取，不刷新无关资源', async () => {
    const { convergence, watch, queryClient } = harness();
    const overview = watch('accounts', { dependencies: ['orders', 'tasks'] });
    const unrelated = watch('worker');
    convergence.refresh(['orders', 'tasks']);
    await vi.advanceTimersByTimeAsync(20);
    expect(overview.queryFn).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(overview.queryKey)).toBe(1);
    expect(unrelated.queryFn).not.toHaveBeenCalled();
  });

  it('页面离开后缓存登记保留失效但不读取，重访只按最新版本读取', async () => {
    const { convergence, watch, queryClient } = harness();
    const previous = watch('orders', { retainWhileCached: true });
    previous.unsubscribe();
    previous.unregister();
    convergence.refresh(['orders']);
    await vi.advanceTimersByTimeAsync(20);
    expect(previous.queryFn).not.toHaveBeenCalled();
    expect(queryClient.getQueryState(previous.queryKey)?.isInvalidated).toBe(true);
    const revisited = watch('orders', { retainWhileCached: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(revisited.queryFn).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(revisited.queryKey)).toBe(1);
  });

  it('缓存移除会结束保留登记，新建的未登记同名缓存不继承旧副作用', async () => {
    const { convergence, watch, queryClient } = harness();
    const previous = watch('orders', { retainWhileCached: true });
    previous.unsubscribe();
    previous.unregister();
    queryClient.removeQueries({ queryKey: previous.queryKey, exact: true });
    queryClient.setQueryData(previous.queryKey, 9);
    convergence.refresh(['orders']);
    await vi.advanceTimersByTimeAsync(20);
    expect(previous.queryFn).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(previous.queryKey)).toBe(9);
    expect(queryClient.getQueryState(previous.queryKey)?.isInvalidated).toBe(false);
  });

  it('没有消费者时只标记已注册缓存过期，不创建查询或发送全站读取', async () => {
    const { convergence, watch, queryClient } = harness();
    const inactive = watch('orders');
    inactive.unsubscribe();
    const unregistered = watch('ledger', { registered: false });
    unregistered.unsubscribe();
    convergence.register({
      resource: 'accounts',
      queryKey: ['session', 1, TRADER_USER.id, null, 'accounts'],
      accountId: null,
      canRead: () => true,
    });
    const count = queryClient.getQueryCache().getAll().length;

    convergence.converge();
    await vi.advanceTimersByTimeAsync(20);

    expect(inactive.queryFn).not.toHaveBeenCalled();
    expect(unregistered.queryFn).not.toHaveBeenCalled();
    expect(queryClient.getQueryState(inactive.queryKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(unregistered.queryKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(count);
  });

  it('全量提示只读取当前会话中已注册且具备权限和精确账户作用域的活动查询', async () => {
    const { convergence, watch, queryClient } = harness();
    const allowed = watch('orders', { accountId: '账户甲', canRead: (user) => user.role === 'TRADER' });
    const denied = watch('users', { canRead: (user) => user.role === 'ADMIN' });
    const wrongAccount = watch('ledger', {
      accountId: '账户甲',
      queryKey: ['session', 1, TRADER_USER.id, '账户乙', 'ledger'],
    });
    const oldEpoch = watch('accounts', { queryKey: ['session', 0, TRADER_USER.id, null, 'accounts'] });
    const otherUser = watch('tasks', { queryKey: ['session', 1, ADMIN_USER.id, null, 'tasks'] });
    const wrongResource = watch('audit', { queryKey: ['session', 1, TRADER_USER.id, null, 'settings'] });
    const unregistered = watch('events', { registered: false });
    const disabled = watch('worker', { enabled: false });
    convergence.register({
      resource: 'orders',
      queryKey: allowed.queryKey,
      accountId: '账户甲',
      canRead: () => true,
    });
    const count = queryClient.getQueryCache().getAll().length;

    convergence.converge();
    await vi.advanceTimersByTimeAsync(20);

    expect(allowed.queryFn).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(allowed.queryKey)).toBe(1);
    for (const excluded of [denied, wrongAccount, oldEpoch, otherUser, wrongResource, unregistered]) {
      expect(excluded.queryFn).not.toHaveBeenCalled();
      expect(queryClient.getQueryState(excluded.queryKey)?.isInvalidated).toBe(false);
    }
    expect(disabled.queryFn).not.toHaveBeenCalled();
    expect(queryClient.getQueryState(disabled.queryKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(count);
  });

  it('显式空资源不失效缓存，突发重复资源只合并为一次读取', async () => {
    const { convergence, watch, queryClient } = harness();
    const orders = watch('orders');
    convergence.refresh([]);
    await vi.advanceTimersByTimeAsync(20);
    expect(queryClient.getQueryState(orders.queryKey)?.isInvalidated).toBe(false);
    expect(orders.queryFn).not.toHaveBeenCalled();

    for (let index = 0; index < 50; index += 1) convergence.refresh(['orders', 'orders']);
    await vi.advanceTimersByTimeAsync(19);
    expect(orders.queryFn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(orders.queryFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(orders.queryFn).toHaveBeenCalledTimes(1);
  });

  it('真实 GET 在途收到的多个通知保留为一次尾随读取，不取消原 GET', async () => {
    const first = controlledRead();
    const second = controlledRead();
    const { convergence, watch, queryClient } = harness();
    const reads = [first, second];
    let index = 0;
    const orders = watch('orders', {
      read: () => {
        const read = reads[index++];
        if (!read) throw new Error('出现多余读取');
        return read.promise;
      },
    });
    convergence.refresh(['orders']);
    await vi.advanceTimersByTimeAsync(20);
    expect(queryClient.getQueryState(orders.queryKey)?.fetchStatus).toBe('fetching');

    for (let count = 0; count < 25; count += 1) convergence.refresh(['orders']);
    await vi.advanceTimersByTimeAsync(100);
    expect(orders.queryFn).toHaveBeenCalledTimes(1);
    first.resolve(10);
    await vi.advanceTimersByTimeAsync(0);
    expect(queryClient.getQueryData(orders.queryKey)).toBe(10);
    expect(queryClient.getQueryState(orders.queryKey)?.isInvalidated).toBe(true);
    await vi.advanceTimersByTimeAsync(20);
    expect(orders.queryFn).toHaveBeenCalledTimes(2);
    second.resolve(20);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(queryClient.getQueryData(orders.queryKey)).toBe(20);
    expect(queryClient.getQueryState(orders.queryKey)?.isInvalidated).toBe(false);
    expect(orders.queryFn).toHaveBeenCalledTimes(2);
  });

  it('由 QueryObserver 发起的在途 GET 同样保留后续通知，不并行重启', async () => {
    const first = controlledRead();
    const second = controlledRead();
    const { convergence, watch, queryClient } = harness();
    let calls = 0;
    const orders = watch('orders', { read: () => (++calls === 1 ? first.promise : second.promise) });
    const initial = orders.observer.refetch();
    expect(orders.observer.getCurrentResult().fetchStatus).toBe('fetching');
    convergence.converge();
    await vi.advanceTimersByTimeAsync(20);
    expect(orders.queryFn).toHaveBeenCalledTimes(1);
    first.resolve(1);
    await initial;
    await vi.advanceTimersByTimeAsync(20);
    expect(orders.queryFn).toHaveBeenCalledTimes(2);
    second.resolve(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(queryClient.getQueryData(orders.queryKey)).toBe(2);
    expect(orders.queryFn).toHaveBeenCalledTimes(2);
  });

  it('合并窗口内已被外部 GET 覆盖的通知不额外重读', async () => {
    const { convergence, watch } = harness();
    const orders = watch('orders');
    convergence.refresh(['orders']);
    await orders.observer.refetch();
    await vi.advanceTimersByTimeAsync(100);
    expect(orders.queryFn).toHaveBeenCalledTimes(1);
  });

  it('尾随 GET 期间的新变化再收敛一次，最后没有新信号就停止', async () => {
    const reads = [controlledRead(), controlledRead(), controlledRead()];
    const { convergence, watch, queryClient } = harness();
    let index = 0;
    const orders = watch('orders', {
      read: () => {
        const read = reads[index++];
        if (!read) throw new Error('出现无限读取');
        return read.promise;
      },
    });
    convergence.refresh(['orders']);
    await vi.advanceTimersByTimeAsync(20);
    convergence.refresh(['orders']);
    reads[0]?.resolve(1);
    await vi.advanceTimersByTimeAsync(20);
    expect(orders.queryFn).toHaveBeenCalledTimes(2);
    convergence.refresh(['orders']);
    reads[1]?.resolve(2);
    await vi.advanceTimersByTimeAsync(20);
    expect(orders.queryFn).toHaveBeenCalledTimes(3);
    reads[2]?.resolve(3);
    await vi.advanceTimersByTimeAsync(100_000);
    expect(queryClient.getQueryData(orders.queryKey)).toBe(3);
    expect(orders.queryFn).toHaveBeenCalledTimes(3);
  });

  it('读取失败只消费已有通知，不把 stale 错误状态变成无限重试', async () => {
    const first = controlledRead();
    const { convergence, watch, queryClient } = harness();
    let calls = 0;
    const orders = watch('orders', {
      read: () => (++calls === 1 ? first.promise : Promise.reject(new Error('暂时不可用'))),
    });
    convergence.refresh(['orders']);
    await vi.advanceTimersByTimeAsync(20);
    convergence.refresh(['orders']);
    first.reject(new Error('首次读取失败'));
    await vi.advanceTimersByTimeAsync(20);
    expect(orders.queryFn).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryState(orders.queryKey)?.status).toBe('error');
    await vi.advanceTimersByTimeAsync(100_000);
    expect(orders.queryFn).toHaveBeenCalledTimes(2);
  });

  it('会话代次改变会丢弃旧 GET 的尾随任务，新会话查询独立收敛', async () => {
    const first = controlledRead();
    const { state, convergence, watch } = harness();
    const oldOrders = watch('orders', { read: () => first.promise });
    convergence.refresh(['orders']);
    await vi.advanceTimersByTimeAsync(20);
    convergence.refresh(['orders']);
    state.session = { epoch: 2, user: TRADER_USER };
    const newOrders = watch('orders');
    first.resolve(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(oldOrders.queryFn).toHaveBeenCalledTimes(1);
    expect(newOrders.queryFn).not.toHaveBeenCalled();
    convergence.refresh(['orders']);
    await vi.advanceTimersByTimeAsync(20);
    expect(newOrders.queryFn).toHaveBeenCalledTimes(1);
    expect(oldOrders.queryFn).toHaveBeenCalledTimes(1);
  });

  it('同代次权限撤回在发送前和 GET 完成后都重新判断，不读取或尾随', async () => {
    const first = controlledRead();
    const { state, convergence, watch } = harness();
    const orders = watch('orders', { canRead: (user) => user.role === 'TRADER', read: () => first.promise });
    convergence.refresh(['orders']);
    state.session = { epoch: 1, user: { ...TRADER_USER, role: 'ADMIN' } };
    await vi.advanceTimersByTimeAsync(20);
    expect(orders.queryFn).not.toHaveBeenCalled();

    state.session = { epoch: 1, user: TRADER_USER };
    convergence.refresh(['orders']);
    await vi.advanceTimersByTimeAsync(20);
    convergence.refresh(['orders']);
    state.session = { epoch: 1, user: { ...TRADER_USER, role: 'ADMIN' } };
    first.resolve(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(orders.queryFn).toHaveBeenCalledTimes(1);
  });

  it('消费者卸载后在途变化只保留 stale，不再尾随读取', async () => {
    const first = controlledRead();
    const { convergence, watch, queryClient } = harness();
    const orders = watch('orders', { read: () => first.promise });
    convergence.refresh(['orders']);
    await vi.advanceTimersByTimeAsync(20);
    convergence.refresh(['orders']);
    orders.unsubscribe();
    first.resolve(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(orders.queryFn).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryState(orders.queryKey)?.isInvalidated).toBe(true);
    convergence.refresh(['orders']);
    await vi.advanceTimersByTimeAsync(20);
    expect(orders.queryFn).toHaveBeenCalledTimes(1);
  });

  it('取消最后一个注册会取消待发送刷新，重复注册可独立解除', async () => {
    const { convergence, watch } = harness();
    const orders = watch('orders');
    const registration = {
      resource: 'orders' as const,
      queryKey: orders.queryKey,
      accountId: null,
      canRead: () => true,
    };
    const removeOne = convergence.register(registration);
    const removeTwo = convergence.register(registration);
    orders.unregister();
    removeOne();
    convergence.refresh(['orders']);
    await vi.advanceTimersByTimeAsync(20);
    expect(orders.queryFn).toHaveBeenCalledTimes(1);
    convergence.refresh(['orders']);
    removeTwo();
    await vi.advanceTimersByTimeAsync(20);
    expect(orders.queryFn).toHaveBeenCalledTimes(1);
  });

  it('补充刷新只覆盖活动注册查询，退出后移除计时器与缓存订阅', async () => {
    const { state, convergence, watch, queryClient } = harness(60_000);
    const orders = watch('orders');
    const inactive = watch('ledger');
    inactive.unsubscribe();
    await vi.advanceTimersByTimeAsync(60_020);
    expect(orders.queryFn).toHaveBeenCalledTimes(1);
    expect(inactive.queryFn).not.toHaveBeenCalled();
    expect(queryClient.getQueryState(inactive.queryKey)?.isInvalidated).toBe(false);
    convergence.refresh(['orders']);
    state.session = null;
    convergence.reset();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(orders.queryFn).toHaveBeenCalledTimes(1);
  });

  it('退出与 StrictMode 停止可取消尾随，再次启动同一实例不会重复订阅', async () => {
    const first = controlledRead();
    const { convergence, watch } = harness();
    let calls = 0;
    const orders = watch('orders', { read: () => (++calls === 1 ? first.promise : Promise.resolve(2)) });
    convergence.start();
    convergence.refresh(['orders']);
    await vi.advanceTimersByTimeAsync(20);
    convergence.refresh(['orders']);
    convergence.stop();
    convergence.stop();
    first.resolve(1);
    await vi.advanceTimersByTimeAsync(100);
    convergence.refresh(['orders']);
    expect(orders.queryFn).toHaveBeenCalledTimes(1);
    convergence.start();
    convergence.start();
    convergence.refresh(['orders']);
    await vi.advanceTimersByTimeAsync(100);
    expect(orders.queryFn).toHaveBeenCalledTimes(2);
  });
});
