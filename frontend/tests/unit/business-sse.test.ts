import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryConvergence, type SyncSession, sessionQueryKey } from '@/app/business-sync/query-convergence';
import {
  type BusinessEventSource,
  type BusinessEventSourceFactory,
  BusinessSseManager,
} from '@/services/realtime/manager';
import { BUSINESS_RESOURCES, type BusinessResource } from '@/services/realtime/types';
import { TRADER_USER } from '../msw/auth-fixtures';

class FakeEventSource implements BusinessEventSource {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly url: string;
  readonly withCredentials: boolean;
  closed = false;

  constructor(url: string, options: { readonly withCredentials: true }) {
    this.url = url;
    this.withCredentials = options.withCredentials;
  }

  close(): void {
    this.closed = true;
  }

  open(): void {
    this.onopen?.(new Event('open'));
  }

  frame(value: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(value) }));
  }

  transportError(): void {
    this.onerror?.(new Event('error'));
  }
}

const cleanups: Array<() => void> = [];
const SESSION: SyncSession = { epoch: 1, user: TRADER_USER };

function convergenceSpies() {
  return {
    start: vi.fn<() => void>(),
    stop: vi.fn<() => void>(),
    reset: vi.fn<() => void>(),
    refresh: vi.fn<(resources: readonly BusinessResource[]) => void>(),
    converge: vi.fn<() => void>(),
  };
}

function harness(initialSession: SyncSession | null = SESSION) {
  const state = { session: initialSession };
  const sources: FakeEventSource[] = [];
  let maximumConcurrent = 0;
  const factory = vi.fn<BusinessEventSourceFactory>((url, options) => {
    const source = new FakeEventSource(url, options);
    sources.push(source);
    maximumConcurrent = Math.max(maximumConcurrent, sources.filter((item) => !item.closed).length);
    return source;
  });
  const convergence = convergenceSpies();
  const onUnauthorized = vi.fn<(epoch: number) => void>();
  const onIdentityHint = vi.fn<(epoch: number) => void>();
  const manager = new BusinessSseManager({
    url: '/api/v1/events',
    getSession: () => state.session,
    convergence,
    onUnauthorized,
    onIdentityHint,
    createEventSource: factory,
  });
  cleanups.push(() => manager.stop());
  function latest(): FakeEventSource {
    const source = sources.at(-1);
    if (!source) throw new Error('测试尚未建立事件流');
    return source;
  }
  return {
    state,
    sources,
    factory,
    convergence,
    onUnauthorized,
    onIdentityHint,
    manager,
    latest,
    maximumConcurrent: () => maximumConcurrent,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-10T00:00:00.000Z'));
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers();
});

describe('业务 SSE 生命周期', () => {
  it('构造无副作用且未认证不建连，认证后使用带凭据的单连接', () => {
    const h = harness(null);
    const initialSnapshot = h.manager.getSnapshot();
    expect(h.factory).not.toHaveBeenCalled();
    expect(h.convergence.start).not.toHaveBeenCalled();
    h.manager.start();
    h.manager.start();
    expect(h.factory).not.toHaveBeenCalled();
    expect(h.manager.getSnapshot()).toBe(initialSnapshot);
    expect(vi.getTimerCount()).toBe(0);

    h.state.session = SESSION;
    h.manager.reconcile();
    h.manager.reconcile();
    h.manager.start();
    expect(h.factory).toHaveBeenCalledExactlyOnceWith('/api/v1/events', { withCredentials: true });
    expect(h.latest().withCredentials).toBe(true);
    expect(h.manager.getSnapshot()).toEqual({ status: 'connecting', error: null, retryAt: null });
    h.latest().open();
    expect(h.manager.getSnapshot()).toEqual({ status: 'open', error: null, retryAt: null });
    expect(h.convergence.converge).toHaveBeenCalledTimes(1);
    expect(h.maximumConcurrent()).toBe(1);
  });

  it('默认工厂真正创建原生 EventSource 并启用 Cookie 凭据', () => {
    const sources: FakeEventSource[] = [];
    class NativeEventSource extends FakeEventSource {
      constructor(url: string, options: { readonly withCredentials: true }) {
        super(url, options);
        sources.push(this);
      }
    }
    vi.stubGlobal('EventSource', NativeEventSource);
    const manager = new BusinessSseManager({
      url: '/api/v1/events',
      getSession: () => SESSION,
      convergence: convergenceSpies(),
      onUnauthorized: vi.fn(),
      onIdentityHint: vi.fn(),
    });
    cleanups.push(() => manager.stop());
    expect(sources).toHaveLength(0);
    manager.start();
    expect(sources).toHaveLength(1);
    expect(sources[0]?.url).toBe('/api/v1/events');
    expect(sources[0]?.withCredentials).toBe(true);
    manager.stop();
    expect(sources[0]?.closed).toBe(true);
  });

  it('默认 message 复用解析器，空数组、未知及畸形帧不会放大全量刷新', () => {
    const h = harness();
    h.manager.start();
    const source = h.latest();
    source.frame({ kind: 'refresh', resources: ['orders', '未知资源'] });
    expect(h.convergence.refresh).toHaveBeenLastCalledWith(['orders']);
    source.frame({ kind: 'refresh', resources: [] });
    expect(h.convergence.refresh).toHaveBeenLastCalledWith([]);
    source.frame({ kind: 'refresh', resources: ['未知资源'] });
    expect(h.convergence.refresh).toHaveBeenLastCalledWith([]);
    expect(h.onIdentityHint).not.toHaveBeenCalled();
    source.frame({ kind: 'refresh' });
    expect(h.convergence.refresh).toHaveBeenLastCalledWith(BUSINESS_RESOURCES);
    expect(h.onIdentityHint).not.toHaveBeenCalled();
    const calls = h.convergence.refresh.mock.calls.length;
    source.frame({ kind: 'refresh', resources: 'orders' });
    source.onmessage?.(new MessageEvent('message', { data: '不是 JSON' }));
    expect(h.convergence.refresh).toHaveBeenCalledTimes(calls);
    source.frame({ kind: 'refresh', resources: ['users'] });
    expect(h.onIdentityHint).toHaveBeenCalledExactlyOnceWith(1);
    expect(h.convergence.converge).not.toHaveBeenCalled();
  });

  it('每个连接的首个有效刷新只做基线收敛，后续 users 通知才核对身份', async () => {
    const h = harness();
    h.manager.start();
    h.latest().frame({ kind: '未知帧' });
    h.latest().frame({ kind: 'refresh', resources: BUSINESS_RESOURCES });
    expect(h.convergence.refresh).toHaveBeenLastCalledWith(BUSINESS_RESOURCES);
    expect(h.onIdentityHint).not.toHaveBeenCalled();
    h.latest().frame({ kind: 'refresh', resources: ['users'] });
    expect(h.onIdentityHint).toHaveBeenCalledExactlyOnceWith(1);
    h.latest().transportError();
    await vi.advanceTimersByTimeAsync(3_000);
    h.latest().frame({ kind: 'refresh', resources: BUSINESS_RESOURCES });
    expect(h.onIdentityHint).toHaveBeenCalledTimes(1);
    h.latest().frame({ kind: 'refresh', resources: ['users'] });
    expect(h.onIdentityHint).toHaveBeenCalledTimes(2);
    expect(h.maximumConcurrent()).toBe(1);
  });

  it('明确未认证帧关闭并终止当前代次，不能被 focus 或手动重试绕过', async () => {
    const h = harness();
    h.manager.start();
    const source = h.latest();
    const lateMessage = source.onmessage;
    source.frame({ error: { code: 'UNAUTHENTICATED', message: '会话已失效', requestId: '鉴权帧' } });
    expect(source.closed).toBe(true);
    expect(source.onmessage).toBeNull();
    expect(h.manager.getSnapshot()).toEqual({ status: 'idle', error: '会话已失效', retryAt: null });
    expect(h.onUnauthorized).toHaveBeenCalledExactlyOnceWith(1);
    lateMessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: '迟到错误' } }),
      }),
    );
    h.manager.retry();
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.sources).toHaveLength(1);
    expect(h.onUnauthorized).toHaveBeenCalledTimes(1);
    expect(h.convergence.converge).not.toHaveBeenCalled();

    h.state.session = { ...SESSION, epoch: 2 };
    h.manager.reconcile();
    expect(h.sources).toHaveLength(2);
    expect(h.maximumConcurrent()).toBe(1);
  });

  it('不可用业务帧与传输错误都有限恢复，但传输错误不伪造 HTTP 鉴权或身份复核', async () => {
    const h = harness();
    h.manager.start();
    const first = h.latest();
    const initialTime = Date.now();
    first.frame({ error: { code: 'EVENT_STREAM_UNAVAILABLE', message: '事件存储暂不可用' } });
    expect(first.closed).toBe(true);
    expect(h.manager.getSnapshot()).toEqual({
      status: 'reconnecting',
      error: '事件存储暂不可用',
      retryAt: initialTime + 3_000,
    });
    await vi.advanceTimersByTimeAsync(2_999);
    expect(h.sources).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.sources).toHaveLength(2);
    h.latest().open();
    h.latest().transportError();
    expect(h.latest().closed).toBe(true);
    expect(h.manager.getSnapshot()).toMatchObject({ status: 'reconnecting', retryAt: initialTime + 9_000 });
    expect(h.onUnauthorized).not.toHaveBeenCalled();
    expect(h.onIdentityHint).not.toHaveBeenCalled();
    expect(h.maximumConcurrent()).toBe(1);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(h.sources).toHaveLength(3);
    expect(h.maximumConcurrent()).toBe(1);
  });

  it('仅自动重连三次，open 不重置计数，耗尽后需显式重试', async () => {
    const h = harness();
    h.manager.start();
    let expectedTime = Date.now();
    for (const delay of [3_000, 6_000, 12_000]) {
      h.latest().open();
      h.latest().transportError();
      expectedTime += delay;
      expect(h.manager.getSnapshot()).toMatchObject({ status: 'reconnecting', retryAt: expectedTime });
      await vi.advanceTimersByTimeAsync(delay);
    }
    expect(h.sources).toHaveLength(4);
    h.latest().open();
    h.latest().transportError();
    expect(h.manager.getSnapshot().status).toBe('degraded');
    expect(h.latest().closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(120_000);
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    expect(h.sources).toHaveLength(4);
    h.manager.retry();
    expect(h.sources).toHaveLength(5);
    h.latest().open();
    expect(h.manager.getSnapshot().status).toBe('open');
    expect(h.maximumConcurrent()).toBe(1);
  });

  it('未知业务错误保守降级且不自动重开，显式重试仍经过预算', async () => {
    const h = harness();
    h.manager.start();
    h.latest().frame({ error: { code: 'FORBIDDEN', message: '资源权限不足' } });
    expect(h.manager.getSnapshot()).toEqual({ status: 'degraded', error: '资源权限不足', retryAt: null });
    expect(h.latest().closed).toBe(true);
    expect(h.onUnauthorized).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.sources).toHaveLength(1);
    h.manager.retry();
    expect(h.sources).toHaveLength(2);
    expect(h.maximumConcurrent()).toBe(1);
  });

  it('旧同代次实例的迟到 open、刷新、鉴权及传输回调全部丢弃', async () => {
    const h = harness();
    h.manager.start();
    const first = h.latest();
    const oldOpen = first.onopen;
    const oldMessage = first.onmessage;
    const oldError = first.onerror;
    first.transportError();
    await vi.advanceTimersByTimeAsync(3_000);
    const second = h.latest();
    second.open();
    const snapshot = h.manager.getSnapshot();
    const convergeCalls = h.convergence.converge.mock.calls.length;
    oldOpen?.(new Event('open'));
    oldMessage?.(new MessageEvent('message', { data: JSON.stringify({ kind: 'refresh' }) }));
    oldMessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: '旧实例错误' } }),
      }),
    );
    oldError?.(new Event('error'));
    expect(h.manager.getSnapshot()).toBe(snapshot);
    expect(h.convergence.converge).toHaveBeenCalledTimes(convergeCalls);
    expect(h.convergence.refresh).not.toHaveBeenCalled();
    expect(h.onUnauthorized).not.toHaveBeenCalled();
    expect(second.closed).toBe(false);
    expect(h.sources).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('旧代次在父层 reconcile 前后均不能污染新会话', () => {
    const h = harness();
    h.manager.start();
    const first = h.latest();
    const oldMessage = first.onmessage;
    h.state.session = { ...SESSION, epoch: 2 };
    first.frame({ kind: 'refresh', resources: ['orders', 'users'] });
    first.frame({ error: { code: 'UNAUTHENTICATED', message: '旧代次错误' } });
    expect(h.convergence.refresh).not.toHaveBeenCalled();
    expect(h.onUnauthorized).not.toHaveBeenCalled();
    h.manager.reconcile();
    expect(first.closed).toBe(true);
    oldMessage?.(new MessageEvent('message', { data: JSON.stringify({ kind: 'refresh' }) }));
    expect(h.convergence.refresh).not.toHaveBeenCalled();
    h.latest().frame({ kind: 'refresh', resources: BUSINESS_RESOURCES });
    h.latest().frame({ kind: 'refresh', resources: ['users'] });
    expect(h.onIdentityHint).toHaveBeenCalledExactlyOnceWith(2);
    expect(h.maximumConcurrent()).toBe(1);
  });

  it('六十秒四次预算跨退出和新 epoch 保留，窗口恢复也不自动解除降级', async () => {
    const h = harness();
    h.manager.start();
    const initialTime = Date.now();
    for (let epoch = 2; epoch <= 5; epoch += 1) {
      h.state.session = null;
      h.manager.reconcile();
      h.state.session = { ...SESSION, epoch };
      h.manager.reconcile();
    }
    expect(h.sources).toHaveLength(4);
    expect(h.sources.every((source) => source.closed)).toBe(true);
    expect(h.manager.getSnapshot()).toMatchObject({ status: 'degraded', retryAt: initialTime + 60_000 });
    h.manager.retry();
    expect(h.sources).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(59_999);
    h.manager.retry();
    expect(h.sources).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(1);
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    expect(h.sources).toHaveLength(4);
    expect(h.manager.getSnapshot().status).toBe('degraded');
    h.manager.retry();
    expect(h.sources).toHaveLength(5);
    expect(h.maximumConcurrent()).toBe(1);
  });

  it('认证复核的新 epoch 与 StrictMode 重挂载均不能清除恢复次数上限', async () => {
    const h = harness();
    h.manager.start();
    for (const delay of [3_000, 6_000, 12_000]) {
      h.latest().transportError();
      await vi.advanceTimersByTimeAsync(delay);
    }
    h.latest().transportError();
    await vi.advanceTimersByTimeAsync(60_000);
    h.state.session = { ...SESSION, epoch: 2 };
    h.manager.reconcile();
    h.manager.stop();
    h.manager.start();
    window.dispatchEvent(new Event('focus'));
    expect(h.sources).toHaveLength(4);
    expect(h.manager.getSnapshot().status).toBe('degraded');
    h.manager.retry();
    expect(h.sources).toHaveLength(5);
  });

  it('focus 与 online 合并 REST 收敛且不替换连接或跳过正在等待的退避', async () => {
    const h = harness();
    h.manager.start();
    h.latest().open();
    for (let index = 0; index < 20; index += 1) {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
    }
    expect(h.convergence.converge).toHaveBeenCalledTimes(2);
    expect(h.sources).toHaveLength(1);
    h.latest().transportError();
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(1_000);
    window.dispatchEvent(new Event('focus'));
    expect(h.convergence.converge).toHaveBeenCalledTimes(3);
    expect(h.sources).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.sources).toHaveLength(2);
    expect(h.maximumConcurrent()).toBe(1);
  });

  it('退出清理退避、原生回调和窗口监听，StrictMode 可逆重启不并发', async () => {
    const h = harness();
    h.manager.start();
    h.latest().transportError();
    expect(vi.getTimerCount()).toBe(1);
    h.state.session = null;
    h.manager.reconcile();
    const convergenceCalls = h.convergence.converge.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    expect(h.convergence.converge).toHaveBeenCalledTimes(convergenceCalls);
    expect(h.sources).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    h.manager.retry();
    expect(h.sources).toHaveLength(1);

    h.state.session = { ...SESSION, epoch: 2 };
    h.manager.reconcile();
    h.manager.stop();
    h.manager.stop();
    h.manager.start();
    h.manager.start();
    expect(h.sources).toHaveLength(3);
    expect(h.maximumConcurrent()).toBe(1);
    expect(h.sources.slice(0, -1).every((source) => source.closed)).toBe(true);
    h.latest().open();
    const beforeFocus = h.convergence.converge.mock.calls.length;
    window.dispatchEvent(new Event('focus'));
    expect(h.convergence.converge).toHaveBeenCalledTimes(beforeFocus + 1);
    h.manager.stop();
    const stoppedCalls = h.convergence.converge.mock.calls.length;
    window.dispatchEvent(new Event('focus'));
    expect(h.convergence.converge).toHaveBeenCalledTimes(stoppedCalls);
  });

  it('服务端注释保活不可观察，不创建虚假的消息心跳超时或额外连接', async () => {
    const h = harness();
    h.manager.start();
    h.latest().open();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(h.sources).toHaveLength(1);
    expect(h.latest().closed).toBe(false);
    expect(h.manager.getSnapshot().status).toBe('open');
    expect(h.onUnauthorized).not.toHaveBeenCalled();
  });

  it('订阅接口稳定且解除订阅后不再通知', () => {
    const h = harness();
    const getSnapshot = h.manager.getSnapshot;
    const subscribe = h.manager.subscribe;
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    h.manager.start();
    expect(listener).toHaveBeenCalledTimes(1);
    h.latest().open();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(h.manager.getSnapshot).toBe(getSnapshot);
    expect(h.manager.subscribe).toBe(subscribe);
    unsubscribe();
    h.manager.stop();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('原生构造失败也计入预算并有限终止，不形成同步重试循环', async () => {
    const factory = vi.fn<BusinessEventSourceFactory>(() => {
      throw new Error('浏览器拒绝建连');
    });
    const manager = new BusinessSseManager({
      url: '/api/v1/events',
      getSession: () => SESSION,
      convergence: convergenceSpies(),
      onUnauthorized: vi.fn(),
      onIdentityHint: vi.fn(),
      createEventSource: factory,
    });
    cleanups.push(() => manager.stop());
    manager.start();
    expect(factory).toHaveBeenCalledTimes(1);
    for (const delay of [3_000, 6_000, 12_000]) await vi.advanceTimersByTimeAsync(delay);
    expect(factory).toHaveBeenCalledTimes(4);
    expect(manager.getSnapshot().status).toBe('degraded');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('业务 SSE 到真实 QueryObserver 的集成', () => {
  it('首连、默认刷新和在途尾随实际重读活动缓存，未认证后不补读', async () => {
    let session: SyncSession | null = SESSION;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const convergence = new QueryConvergence({
      queryClient,
      getSession: () => session,
      mergeWindowMs: 20,
      supplementalIntervalMs: 0,
    });
    let resolveFirst: ((value: number) => void) | undefined;
    let resolveSecond: ((value: number) => void) | undefined;
    const first = new Promise<number>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<number>((resolve) => {
      resolveSecond = resolve;
    });
    let calls = 0;
    const queryFn = vi.fn(() => (++calls === 1 ? first : second));
    const queryKey = sessionQueryKey(SESSION, 'orders', '账户甲');
    const observer = new QueryObserver(queryClient, {
      queryKey,
      queryFn,
      initialData: 0,
      staleTime: Infinity,
    });
    observer.subscribe(() => undefined);
    convergence.register({ resource: 'orders', queryKey, accountId: '账户甲', canRead: () => true });
    const inactiveKey = sessionQueryKey(SESSION, 'ledger', null);
    queryClient.setQueryData(inactiveKey, 0);
    convergence.register({ resource: 'ledger', queryKey: inactiveKey, accountId: null, canRead: () => true });
    const deniedKey = sessionQueryKey(SESSION, 'users', null);
    queryClient.setQueryData(deniedKey, 0);
    convergence.register({ resource: 'users', queryKey: deniedKey, accountId: null, canRead: () => false });
    const sources: FakeEventSource[] = [];
    const manager = new BusinessSseManager({
      url: '/api/v1/events',
      getSession: () => session,
      convergence,
      createEventSource: (url, options) => {
        const source = new FakeEventSource(url, options);
        sources.push(source);
        return source;
      },
      onIdentityHint: vi.fn(),
      onUnauthorized: (epoch) => {
        expect(epoch).toBe(1);
        session = null;
        manager.reconcile();
      },
    });
    cleanups.push(
      () => queryClient.clear(),
      () => observer.destroy(),
      () => manager.stop(),
    );
    manager.start();
    const source = sources[0];
    if (!source) throw new Error('未建立集成测试事件流');
    source.open();
    await vi.advanceTimersByTimeAsync(20);
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult().fetchStatus).toBe('fetching');
    expect(queryClient.getQueryState(inactiveKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(deniedKey)?.isInvalidated).toBe(false);
    source.frame({ kind: 'refresh', resources: [] });
    source.frame({ kind: 'refresh', resources: ['未知资源'] });
    source.frame({ kind: 'refresh', resources: 'orders' });
    for (let index = 0; index < 20; index += 1) source.frame({ kind: 'refresh', resources: ['orders'] });
    await vi.advanceTimersByTimeAsync(20);
    expect(queryFn).toHaveBeenCalledTimes(1);
    if (!resolveFirst || !resolveSecond) throw new Error('未初始化受控 GET');
    resolveFirst(1);
    await vi.advanceTimersByTimeAsync(20);
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(queryKey)).toBe(1);
    source.frame({ kind: 'refresh', resources: ['orders'] });
    source.frame({ error: { code: 'UNAUTHENTICATED', message: '会话终止' } });
    resolveSecond(2);
    await vi.advanceTimersByTimeAsync(100_000);
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(source.closed).toBe(true);
    expect(manager.getSnapshot().status).toBe('idle');
    expect(vi.getTimerCount()).toBe(0);
  });
});
