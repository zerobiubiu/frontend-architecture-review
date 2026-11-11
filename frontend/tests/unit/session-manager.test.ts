import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionBroadcastChannel, SessionBroadcastMessage } from '@/app/session/broadcast';
import {
  type SessionActionResult,
  SessionManager,
  type SessionManagerOptions,
  type SessionSnapshot,
} from '@/app/session/manager';
import type { AuthApi, AuthSessionData } from '@/features/auth/types';
import type { ApiOutcome } from '@/services/api/types';
import { ADMIN_USER, AUTH_DATA, OWNER_USER } from '../msw/auth-fixtures';

const ADMIN_DATA: AuthSessionData = { user: ADMIN_USER, csrfToken: 'a'.repeat(43) };
const OWNER_DATA: AuthSessionData = { user: OWNER_USER, csrfToken: 'o'.repeat(43) };
const LOGIN = { username: 'trader', password: ' password ' };

function deferred<T>() {
  let accept: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    accept = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!accept) throw new Error('受控 Promise 尚未初始化');
      accept(value);
    },
  };
}

function success<T>(data: T): ApiOutcome<T> {
  return {
    kind: 'success',
    status: 200,
    data,
    receipt: { kind: 'absent' },
    requestId: null,
    sessionEpoch: 0,
  };
}

function httpError(code: string, status: number): ApiOutcome<never> {
  return {
    kind: 'http-error',
    status,
    error: { code, message: `错误：${code}`, requestId: null },
    receipt: { kind: 'absent' },
    sessionEpoch: 0,
  };
}

function transport(reason: 'network' | 'timeout' | 'aborted'): ApiOutcome<never> {
  return { kind: 'transport-error', reason, attempted: true, message: '连接中断', sessionEpoch: 0 };
}

class FakeChannel implements SessionBroadcastChannel {
  readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();
  readonly sent: SessionBroadcastMessage[] = [];
  readonly peers = new Set<FakeChannel>();
  closed = false;

  postMessage(message: SessionBroadcastMessage): void {
    if (this.closed) throw new Error('测试通道已关闭');
    this.sent.push(message);
    for (const peer of this.peers) peer.emit(message);
  }

  addEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void): void {
    this.listeners.delete(listener);
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
  }

  emit(data: unknown): void {
    for (const listener of this.listeners) listener(new MessageEvent('message', { data }));
  }
}

const disposables: { manager: SessionManager; queryClient: QueryClient }[] = [];

function createHarness(options: Omit<SessionManagerOptions, 'api' | 'queryClient'> = {}) {
  const api = {
    me: vi.fn<AuthApi['me']>().mockResolvedValue(success(AUTH_DATA)),
    login: vi.fn<AuthApi['login']>().mockResolvedValue(success(AUTH_DATA)),
    logout: vi.fn<AuthApi['logout']>().mockResolvedValue(success({ loggedOut: true } as const)),
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  const manager = new SessionManager({ api, queryClient, broadcastFactory: () => null, ...options });
  disposables.push({ manager, queryClient });
  return { api, manager, queryClient };
}

async function start(manager: SessionManager): Promise<void> {
  manager.start();
  await manager.restore();
}

function nextStatus(manager: SessionManager, status: SessionSnapshot['status']): Promise<void> {
  if (manager.getSnapshot().status === status) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = manager.subscribe(() => {
      if (manager.getSnapshot().status !== status) return;
      unsubscribe();
      resolve();
    });
  });
}

afterEach(() => {
  for (const { manager, queryClient } of disposables.splice(0)) {
    manager.stop();
    queryClient.clear();
  }
  vi.useRealTimers();
});

describe('会话状态与安全分类', () => {
  it('构造不请求、不建通道、不读时钟、不清缓存，未启动动作不发送', async () => {
    const factory = vi.fn(() => new FakeChannel());
    const now = vi.fn(() => 1);
    const { manager, api, queryClient } = createHarness({ broadcastFactory: factory, now });
    queryClient.setQueryData(['保留至启动'], { value: 1 });
    const initial = manager.getSnapshot();
    expect(initial).toEqual({
      status: 'initializing',
      epoch: 0,
      user: null,
      error: null,
      apiReachable: null,
    });
    expect(manager.getSnapshot()).toBe(initial);
    expect(manager.getSessionSignal().aborted).toBe(true);
    expect(manager.getCsrfToken()).toBeNull();
    expect(await manager.login(LOGIN)).toEqual({ kind: 'stale' });
    expect(await manager.logout()).toEqual({ kind: 'stale' });
    expect(await manager.restore()).toEqual({ kind: 'stale' });
    expect(await manager.verifyFromSignal()).toEqual({ kind: 'stale' });
    expect(api.me).not.toHaveBeenCalled();
    expect(api.login).not.toHaveBeenCalled();
    expect(api.logout).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(['保留至启动'])).toEqual({ value: 1 });
  });

  it('启动自动恢复且并发恢复合并，身份单一拥有、CSRF 不进入快照', async () => {
    const { manager, api } = createHarness();
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);
    const getSnapshot = manager.getSnapshot;
    manager.start();
    expect(getSnapshot()).toMatchObject({ status: 'checking', epoch: 1, user: null });
    const first = manager.restore();
    expect(manager.restore()).toBe(first);
    expect(await first).toEqual({ kind: 'success' });
    expect(api.me).toHaveBeenCalledTimes(1);
    expect(getSnapshot()).toMatchObject({
      status: 'authenticated',
      epoch: 1,
      user: AUTH_DATA.user,
      apiReachable: true,
    });
    expect(manager.getCsrfToken()).toBe(AUTH_DATA.csrfToken);
    expect(manager.isCurrent(1)).toBe(true);
    expect(manager.getSessionSignal().aborted).toBe(false);
    expect(JSON.stringify(getSnapshot())).not.toContain(AUTH_DATA.csrfToken);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    manager.invalidate(1);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(manager.getSnapshot()).toMatchObject({ status: 'anonymous', epoch: 2, user: null });
  });

  it('只有当前明确未认证的恢复响应确认未登录', async () => {
    const { manager, api } = createHarness();
    api.me.mockResolvedValue(httpError('UNAUTHENTICATED', 401));
    await start(manager);
    expect(manager.getSnapshot()).toMatchObject({
      status: 'anonymous',
      user: null,
      error: null,
      apiReachable: true,
    });
    expect(manager.getCsrfToken()).toBeNull();
    expect(manager.getSessionSignal().aborted).toBe(true);
  });

  it.each([
    ['网络错误', transport('network'), false],
    ['请求超时', transport('timeout'), false],
    ['请求中断', transport('aborted'), false],
    ['未知四零一', httpError('OTHER_UNAUTHORIZED', 401), true],
    ['禁止访问', httpError('FORBIDDEN', 403), true],
    ['令牌错误', httpError('CSRF_INVALID', 403), true],
    ['服务故障', httpError('INTERNAL_ERROR', 500), true],
    ['频率受限', httpError('RATE_LIMITED', 429), true],
    [
      '畸形响应',
      {
        kind: 'malformed',
        status: 200,
        message: '非法身份',
        body: null,
        receipt: { kind: 'absent' },
        sessionEpoch: 0,
      },
      true,
    ],
    [
      '非成功数据信封',
      {
        kind: 'http-data',
        status: 503,
        data: AUTH_DATA,
        receipt: { kind: 'absent' },
        requestId: null,
        sessionEpoch: 0,
      },
      true,
    ],
  ] satisfies readonly (readonly [string, ApiOutcome<AuthSessionData>, boolean])[])(
    '%s 不冒充未登录，也不开放旧身份',
    async (_name, outcome, apiReachable) => {
      const { manager, api } = createHarness();
      api.me.mockResolvedValue(outcome);
      await start(manager);
      expect(manager.getSnapshot()).toMatchObject({ status: 'unavailable', user: null, apiReachable });
      expect(manager.getSnapshot().error).toEqual(expect.any(String));
      expect(manager.getCsrfToken()).toBeNull();
      expect(manager.isCurrent(manager.getSnapshot().epoch)).toBe(false);
    },
  );

  it('登录保留密码原值，真实凭据拒绝与限流、断网、响应异常分别返回', async () => {
    const { manager, api } = createHarness();
    api.me.mockResolvedValue(httpError('UNAUTHENTICATED', 401));
    await start(manager);
    api.login.mockResolvedValueOnce(httpError('LOGIN_FAILED', 401));
    expect(await manager.login(LOGIN)).toEqual({ kind: 'error', message: '错误：LOGIN_FAILED' });
    expect(manager.getSnapshot()).toMatchObject({
      status: 'anonymous',
      error: '错误：LOGIN_FAILED',
      apiReachable: true,
    });
    expect(api.login).toHaveBeenLastCalledWith(LOGIN, expect.any(AbortSignal));
    expect(api.login.mock.calls[0]?.[0].password).toBe(' password ');
    api.login.mockResolvedValueOnce(httpError('RATE_LIMITED', 429));
    expect(await manager.login(LOGIN)).toEqual({ kind: 'error', message: '错误：RATE_LIMITED' });
    expect(manager.getSnapshot().status).toBe('unavailable');
    api.login.mockResolvedValueOnce(transport('network'));
    expect(await manager.login(LOGIN)).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('网络不可达'),
    });
    expect(manager.getSnapshot().apiReachable).toBe(false);
    api.login.mockResolvedValueOnce({
      kind: 'malformed',
      status: 200,
      message: '缺字段',
      body: null,
      receipt: { kind: 'absent' },
      sessionEpoch: 0,
    });
    expect(await manager.login(LOGIN)).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('响应异常'),
    });
    expect(manager.getSnapshot()).toMatchObject({ status: 'unavailable', user: null, apiReachable: true });
  });

  it('暂时不可用不自动重试，只有显式恢复才重新确认身份', async () => {
    const { manager, api } = createHarness();
    api.me.mockResolvedValueOnce(transport('network'));
    await start(manager);
    expect(manager.getSnapshot().status).toBe('unavailable');
    expect(await manager.verifyFromSignal()).toEqual({ kind: 'stale' });
    expect(api.me).toHaveBeenCalledTimes(1);
    api.me.mockResolvedValueOnce(success(ADMIN_DATA));
    expect(await manager.restore()).toEqual({ kind: 'success' });
    expect(manager.getSnapshot()).toMatchObject({ status: 'authenticated', user: ADMIN_USER });
    expect(manager.getCsrfToken()).toBe(ADMIN_DATA.csrfToken);
    expect(api.me).toHaveBeenCalledTimes(2);
  });

  it('认证实现意外抛出时仍关闭门禁，不把可能含秘密的异常当错误提示', async () => {
    const { manager, api } = createHarness();
    await start(manager);
    api.login.mockRejectedValueOnce(new Error('password=不应暴露'));
    expect(await manager.login(LOGIN)).toEqual({ kind: 'error', message: '认证请求失败，暂时无法确认会话' });
    expect(manager.getSnapshot()).toMatchObject({ status: 'unavailable', user: null, apiReachable: false });
    expect(JSON.stringify(manager.getSnapshot())).not.toContain('不应暴露');
  });
});

describe('认证串行、代次隔离与清理', () => {
  it.each([
    ['旧成功', success(AUTH_DATA)],
    ['旧四零一', httpError('UNAUTHENTICATED', 401)],
    ['旧四零三', httpError('CSRF_INVALID', 403)],
  ] satisfies readonly (readonly [string, ApiOutcome<AuthSessionData>])[])(
    '%s 不覆盖新登录，后发认证等旧响应结束才发送',
    async (_name, outcome) => {
      const { manager, api } = createHarness();
      const entered = deferred<AbortSignal | undefined>();
      const response = deferred<ApiOutcome<AuthSessionData>>();
      api.me.mockImplementationOnce((signal) => {
        entered.resolve(signal);
        return response.promise;
      });
      manager.start();
      const restoration = manager.restore();
      const signal = await entered.promise;
      const oldEpoch = manager.getSnapshot().epoch;
      api.login.mockResolvedValueOnce(success(ADMIN_DATA));
      const login = manager.login({ username: 'admin', password: '密码' });
      const newEpoch = manager.getSnapshot().epoch;
      expect(newEpoch).toBeGreaterThan(oldEpoch);
      expect(manager.getSnapshot()).toMatchObject({ status: 'signing-in', user: null });
      expect(signal?.aborted).toBe(false);
      expect(api.login).not.toHaveBeenCalled();
      response.resolve(outcome);
      expect(await restoration).toEqual({ kind: 'stale' });
      expect(await login).toEqual({ kind: 'success' });
      const current = manager.getSnapshot();
      manager.invalidate(oldEpoch);
      expect(manager.getSnapshot()).toBe(current);
      expect(current).toMatchObject({ status: 'authenticated', epoch: newEpoch, user: ADMIN_USER });
      expect(manager.getCsrfToken()).toBe(ADMIN_DATA.csrfToken);
      expect(api.login).toHaveBeenCalledTimes(1);
    },
  );

  it('发送前跳过已失去意义的排队动作，旧登录回调返回过期', async () => {
    const { manager, api } = createHarness();
    await start(manager);
    const entered = deferred<void>();
    const response = deferred<ApiOutcome<AuthSessionData>>();
    api.login.mockImplementationOnce(() => {
      entered.resolve(undefined);
      return response.promise;
    });
    const first = manager.login(LOGIN);
    await entered.promise;
    const skipped = manager.login({ username: '不应发送', password: '旧密码' });
    api.login.mockResolvedValueOnce(success(OWNER_DATA));
    const latest = manager.login({ username: 'owner', password: '新密码' });
    expect(api.login).toHaveBeenCalledTimes(1);
    response.resolve(success(ADMIN_DATA));
    expect(await first).toEqual({ kind: 'stale' });
    expect(await skipped).toEqual({ kind: 'stale' });
    expect(await latest).toEqual({ kind: 'success' });
    expect(api.login.mock.calls.map(([input]) => input.username)).toEqual(['trader', 'owner']);
    expect(manager.getSnapshot().user).toEqual(OWNER_USER);
  });

  it('登录、恢复、退出交错时只保留最终退出，并受控取得真实当前 CSRF', async () => {
    const { manager, api } = createHarness();
    await start(manager);
    const entered = deferred<void>();
    const response = deferred<ApiOutcome<AuthSessionData>>();
    api.login.mockImplementationOnce(() => {
      entered.resolve(undefined);
      return response.promise;
    });
    const seen: SessionSnapshot['status'][] = [];
    manager.subscribe(() => seen.push(manager.getSnapshot().status));
    const login = manager.login(LOGIN);
    await entered.promise;
    const check = manager.restore();
    const logout = manager.logout();
    api.me.mockResolvedValueOnce(success(OWNER_DATA));
    expect(api.me).toHaveBeenCalledTimes(1);
    expect(api.logout).not.toHaveBeenCalled();
    response.resolve(success(ADMIN_DATA));
    expect(await login).toEqual({ kind: 'stale' });
    expect(await check).toEqual({ kind: 'stale' });
    expect(await logout).toEqual({ kind: 'success' });
    expect(api.me).toHaveBeenCalledTimes(2);
    expect(api.logout).toHaveBeenCalledExactlyOnceWith(OWNER_DATA.csrfToken, expect.any(AbortSignal));
    expect(seen).not.toContain('authenticated');
    expect(manager.getSnapshot()).toMatchObject({ status: 'anonymous', user: null });
  });

  it('旧退出错误不会退出之后的新身份，退出与新登录也不并发发送', async () => {
    const { manager, api } = createHarness();
    await start(manager);
    const entered = deferred<void>();
    const response = deferred<ApiOutcome<{ loggedOut: true }>>();
    api.logout.mockImplementationOnce(() => {
      entered.resolve(undefined);
      return response.promise;
    });
    const logout = manager.logout();
    await entered.promise;
    api.login.mockResolvedValueOnce(success(ADMIN_DATA));
    const login = manager.login({ username: 'admin', password: '密码' });
    expect(api.login).not.toHaveBeenCalled();
    response.resolve(httpError('UNAUTHENTICATED', 401));
    expect(await logout).toEqual({ kind: 'stale' });
    expect(await login).toEqual({ kind: 'success' });
    expect(manager.getSnapshot()).toMatchObject({ status: 'authenticated', user: ADMIN_USER });
  });

  it.each(['登录', '恢复', '退出', '失效'] as const)(
    '%s 在发送前立即取消旧请求、清 Query 与 mutation 缓存',
    async (action) => {
      const { manager, api, queryClient } = createHarness();
      await start(manager);
      const oldEpoch = manager.getSnapshot().epoch;
      const sessionSignal = manager.getSessionSignal();
      const entered = deferred<AbortSignal>();
      const response = deferred<string>();
      const query = queryClient
        .fetchQuery({
          queryKey: ['session', oldEpoch, AUTH_DATA.user.id, null, 'orders'],
          queryFn: ({ signal }) => {
            entered.resolve(signal);
            return response.promise;
          },
        })
        .catch((error: unknown) => error);
      const querySignal = await entered.promise;
      queryClient.setQueryData(['另一个敏感缓存'], { secret: '旧身份数据' });
      queryClient.getMutationCache().build(queryClient, { mutationKey: ['敏感写入'] });
      expect(queryClient.getMutationCache().getAll()).toHaveLength(1);
      let result: Promise<SessionActionResult> | undefined;
      if (action === '登录') result = manager.login(LOGIN);
      else if (action === '恢复') result = manager.restore();
      else if (action === '退出') result = manager.logout();
      else manager.invalidate(oldEpoch);
      expect(manager.getSnapshot().epoch).toBeGreaterThan(oldEpoch);
      expect(manager.getSnapshot().user).toBeNull();
      expect(manager.getCsrfToken()).toBeNull();
      expect(sessionSignal.aborted).toBe(true);
      expect(querySignal.aborted).toBe(true);
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
      expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
      expect(api.login).not.toHaveBeenCalled();
      expect(api.logout).not.toHaveBeenCalled();
      response.resolve('迟到旧查询');
      await query;
      await result;
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    },
  );

  it('等待 Query 取消完成后才发送认证，等待期间变旧的认证仍不发送', async () => {
    const { manager, api, queryClient } = createHarness();
    await start(manager);
    const cancelled = deferred<void>();
    vi.spyOn(queryClient, 'cancelQueries').mockReturnValueOnce(cancelled.promise);
    const oldLogin = manager.login(LOGIN);
    const logout = manager.logout();
    expect(api.login).not.toHaveBeenCalled();
    expect(api.logout).not.toHaveBeenCalled();
    cancelled.resolve(undefined);
    expect(await oldLogin).toEqual({ kind: 'stale' });
    expect(await logout).toEqual({ kind: 'success' });
    expect(api.login).not.toHaveBeenCalled();
    expect(api.logout).toHaveBeenCalledTimes(1);
  });

  it('订阅回调重入的新动作不会给旧任务贴上最新代次', async () => {
    const { manager, api } = createHarness();
    await start(manager);
    let logout: Promise<SessionActionResult> | undefined;
    const unsubscribe = manager.subscribe(() => {
      if (manager.getSnapshot().status !== 'signing-in') return;
      unsubscribe();
      logout = manager.logout();
    });
    expect(await manager.login(LOGIN)).toEqual({ kind: 'stale' });
    expect(await logout).toEqual({ kind: 'success' });
    expect(api.login).not.toHaveBeenCalled();
    expect(manager.getSnapshot().status).toBe('anonymous');
  });
});

describe('退出未确认与显式恢复', () => {
  it('退出断网后不自动恢复，信号、广播和 StrictMode 重启不能撤销退出意图，重试只发送一次', async () => {
    const channels: FakeChannel[] = [];
    const { manager, api } = createHarness({
      broadcastFactory: () => {
        const channel = new FakeChannel();
        channels.push(channel);
        return channel;
      },
      recheckMinIntervalMs: 0,
    });
    await start(manager);
    api.logout.mockResolvedValueOnce(transport('network'));
    const oldEpoch = manager.getSnapshot().epoch;
    expect(await manager.logout()).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('服务端注销未确认'),
    });
    expect(manager.getSnapshot()).toMatchObject({
      status: 'logout-unconfirmed',
      user: null,
      apiReachable: false,
    });
    expect(manager.getCsrfToken()).toBeNull();
    expect(await manager.verifyFromSignal(oldEpoch)).toEqual({ kind: 'stale' });
    expect(await manager.verifyFromSignal()).toEqual({ kind: 'stale' });
    channels[0]?.emit({ type: 'session-settled', user: OWNER_USER });
    manager.stop();
    manager.start();
    channels[1]?.emit({ type: 'session-settled' });
    expect(manager.getSnapshot().status).toBe('logout-unconfirmed');
    expect(api.me).toHaveBeenCalledTimes(1);
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(await manager.logout()).toEqual({ kind: 'success' });
    expect(api.me).toHaveBeenCalledTimes(1);
    expect(api.logout.mock.calls.map(([csrf]) => csrf)).toEqual([AUTH_DATA.csrfToken, AUTH_DATA.csrfToken]);
    expect(manager.getSnapshot()).toMatchObject({ status: 'anonymous', user: null, error: null });
  });

  it('用户显式重新核对才可以从退出未知恢复服务端实际身份', async () => {
    const { manager, api } = createHarness();
    await start(manager);
    api.logout.mockResolvedValueOnce(transport('timeout'));
    await manager.logout();
    api.me.mockResolvedValueOnce(success(ADMIN_DATA));
    expect(await manager.restore()).toEqual({ kind: 'success' });
    expect(manager.getSnapshot()).toMatchObject({
      status: 'authenticated',
      user: ADMIN_USER,
      apiReachable: true,
    });
    expect(manager.getCsrfToken()).toBe(ADMIN_DATA.csrfToken);
  });

  it.each([
    ['任意四零一', httpError('LOGIN_FAILED', 401)],
    ['来源拒绝', httpError('ORIGIN_FORBIDDEN', 403)],
    ['服务异常', httpError('INTERNAL_ERROR', 503)],
    ['超时', transport('timeout')],
  ] satisfies readonly (readonly [string, ApiOutcome<{ loggedOut: true }>])[])(
    '%s 不证明服务端已退出',
    async (_name, outcome) => {
      const { manager, api } = createHarness();
      await start(manager);
      api.logout.mockResolvedValueOnce(outcome);
      expect(await manager.logout()).toMatchObject({ kind: 'error' });
      expect(manager.getSnapshot()).toMatchObject({ status: 'logout-unconfirmed', user: null });
      expect(api.me).toHaveBeenCalledTimes(1);
      expect(api.logout).toHaveBeenCalledTimes(1);
    },
  );

  it('退出未确认时跨标签变更仍不能恢复身份，后续显式重试才核对当前令牌', async () => {
    const channel = new FakeChannel();
    const { manager, api } = createHarness({ broadcastFactory: () => channel, recheckMinIntervalMs: 0 });
    await start(manager);
    api.logout.mockResolvedValueOnce(transport('network'));
    await manager.logout();
    channel.emit({ type: 'session-changing', user: OWNER_USER });
    channel.emit({ type: 'session-settled', user: OWNER_USER });
    expect(await manager.verifyFromSignal()).toEqual({ kind: 'stale' });
    expect(manager.getSnapshot()).toMatchObject({ status: 'logout-unconfirmed', user: null });
    expect(api.me).toHaveBeenCalledTimes(1);
    api.me.mockResolvedValueOnce(success(ADMIN_DATA));
    expect(await manager.logout()).toEqual({ kind: 'success' });
    expect(api.me).toHaveBeenCalledTimes(2);
    expect(api.logout).toHaveBeenLastCalledWith(ADMIN_DATA.csrfToken, expect.any(AbortSignal));
  });

  it('退出的明确未认证响应可确认无会话，而不是只看 HTTP 四零一', async () => {
    const { manager, api } = createHarness();
    await start(manager);
    api.logout.mockResolvedValueOnce(httpError('UNAUTHENTICATED', 401));
    expect(await manager.logout()).toEqual({ kind: 'success' });
    expect(manager.getSnapshot()).toMatchObject({ status: 'anonymous', error: null, apiReachable: true });
  });

  it('没有 CSRF 时的受控核对不会短暂恢复身份，明确无会话时也不发送退出', async () => {
    const { manager, api } = createHarness();
    api.me.mockResolvedValue(httpError('UNAUTHENTICATED', 401));
    await start(manager);
    const states: SessionSnapshot['status'][] = [];
    manager.subscribe(() => states.push(manager.getSnapshot().status));
    expect(await manager.logout()).toEqual({ kind: 'success' });
    expect(api.me).toHaveBeenCalledTimes(2);
    expect(api.logout).not.toHaveBeenCalled();
    expect(states).toEqual(['signing-out', 'anonymous']);
  });

  it('受控核对的未知四零一不能伪装成退出成功', async () => {
    const { manager, api } = createHarness();
    api.me.mockResolvedValueOnce(httpError('UNAUTHENTICATED', 401));
    await start(manager);
    api.me.mockResolvedValueOnce(httpError('OTHER_UNAUTHORIZED', 401));
    expect(await manager.logout()).toMatchObject({ kind: 'error' });
    expect(manager.getSnapshot().status).toBe('logout-unconfirmed');
    expect(api.logout).not.toHaveBeenCalled();
  });

  it('CSRF 明确无效后不自动重放退出，下一次显式重试才重新取令牌', async () => {
    const { manager, api } = createHarness();
    await start(manager);
    api.logout.mockResolvedValueOnce(httpError('CSRF_INVALID', 403));
    await manager.logout();
    expect(manager.getSnapshot().status).toBe('logout-unconfirmed');
    expect(api.me).toHaveBeenCalledTimes(1);
    expect(api.logout).toHaveBeenCalledTimes(1);
    api.me.mockResolvedValueOnce(success(OWNER_DATA));
    expect(await manager.logout()).toEqual({ kind: 'success' });
    expect(api.me).toHaveBeenCalledTimes(2);
    expect(api.logout.mock.calls.map(([csrf]) => csrf)).toEqual([AUTH_DATA.csrfToken, OWNER_DATA.csrfToken]);
  });
});

describe('跨标签通知与可逆生命周期', () => {
  it('默认通道不误用 jsdom 中的 Node 全局能力', async () => {
    const native = vi.fn();
    vi.stubGlobal('BroadcastChannel', native);
    const { manager, api, queryClient } = createHarness();
    const nativeManager = new SessionManager({ api, queryClient });
    disposables.push({ manager: nativeManager, queryClient });
    await start(nativeManager);
    expect(native).not.toHaveBeenCalled();
    expect(manager.getSnapshot().status).toBe('initializing');
  });

  it('只广播无秘密的两阶段通知，恢复与收到伪造身份不会形成回环', async () => {
    const channel = new FakeChannel();
    const { manager, api } = createHarness({ broadcastFactory: () => channel, recheckMinIntervalMs: 0 });
    await start(manager);
    expect(channel.sent).toEqual([]);
    await manager.login(LOGIN);
    expect(channel.sent).toEqual([{ type: 'session-changing' }, { type: 'session-settled' }]);
    const sent = channel.sent.length;
    channel.emit({ type: 'authenticated', user: OWNER_USER, csrfToken: OWNER_DATA.csrfToken, epoch: 999 });
    expect(manager.getSnapshot().user).toEqual(AUTH_DATA.user);
    channel.emit({ type: 'session-changing', user: OWNER_USER, csrfToken: OWNER_DATA.csrfToken, epoch: 999 });
    const isolatedEpoch = manager.getSnapshot().epoch;
    expect(manager.getSnapshot()).toMatchObject({ status: 'checking', user: null });
    expect(manager.getCsrfToken()).toBeNull();
    expect(isolatedEpoch).not.toBe(999);
    expect(api.me).toHaveBeenCalledTimes(1);
    api.me.mockResolvedValueOnce(success(ADMIN_DATA));
    const restored = nextStatus(manager, 'authenticated');
    channel.emit({ type: 'session-settled', user: OWNER_USER, csrfToken: OWNER_DATA.csrfToken, epoch: 999 });
    channel.emit({ type: 'session-settled' });
    await restored;
    expect(api.me).toHaveBeenCalledTimes(2);
    expect(manager.getSnapshot().user).toEqual(ADMIN_USER);
    expect(manager.getCsrfToken()).toBe(ADMIN_DATA.csrfToken);
    expect(channel.sent).toHaveLength(sent);
    expect(JSON.stringify(channel.sent)).not.toContain('csrf');
    expect(JSON.stringify(channel.sent)).not.toContain('user');
  });

  it('两个标签只将变更变成服务端复核，不相互反复广播', async () => {
    const left = new FakeChannel();
    const right = new FakeChannel();
    left.peers.add(right);
    right.peers.add(left);
    const a = createHarness({ broadcastFactory: () => left, recheckMinIntervalMs: 0 });
    const b = createHarness({ broadcastFactory: () => right, recheckMinIntervalMs: 0 });
    await Promise.all([start(a.manager), start(b.manager)]);
    a.api.login.mockResolvedValueOnce(success(ADMIN_DATA));
    b.api.me.mockResolvedValueOnce(success(ADMIN_DATA));
    const login = a.manager.login({ username: 'admin', password: '密码' });
    expect(b.manager.getSnapshot()).toMatchObject({ status: 'checking', user: null });
    const restored = nextStatus(b.manager, 'authenticated');
    await login;
    await restored;
    expect(a.manager.getSnapshot().user).toEqual(ADMIN_USER);
    expect(b.manager.getSnapshot().user).toEqual(ADMIN_USER);
    expect(left.sent).toEqual([{ type: 'session-changing' }, { type: 'session-settled' }]);
    expect(right.sent).toEqual([]);
    expect(b.api.me).toHaveBeenCalledTimes(2);
  });

  it('自动复核合并并按默认三十秒限频，不跨新 epoch 重置额度', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const channel = new FakeChannel();
    const { manager, api } = createHarness({ broadcastFactory: () => channel });
    await start(manager);
    const initial = manager.getSnapshot();
    expect(await manager.verifyFromSignal(initial.epoch)).toEqual({ kind: 'stale' });
    expect(manager.getSnapshot()).toBe(initial);
    channel.emit({ type: 'session-settled' });
    channel.emit({ type: 'session-settled' });
    expect(manager.getSnapshot()).toMatchObject({ status: 'checking', user: null });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(api.me).toHaveBeenCalledTimes(1);
    const restored = nextStatus(manager, 'authenticated');
    await vi.advanceTimersByTimeAsync(1);
    await restored;
    expect(api.me).toHaveBeenCalledTimes(2);
    const current = manager.getSnapshot();
    expect(current.epoch).toBeGreaterThan(initial.epoch);
    expect(await manager.verifyFromSignal(current.epoch)).toEqual({ kind: 'stale' });
    channel.emit({ type: 'session-settled' });
    await vi.advanceTimersByTimeAsync(0);
    manager.stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.me).toHaveBeenCalledTimes(2);
  });

  it('最近登录成功重新建立复核限频，初始用户通知不会立即触发第二次核对', async () => {
    let time = 0;
    const { manager, api } = createHarness({ now: () => time });
    await start(manager);
    time = 60_000;
    api.login.mockResolvedValueOnce(success(ADMIN_DATA));
    expect(await manager.login({ username: 'admin', password: '密码' })).toEqual({ kind: 'success' });
    const authenticated = manager.getSnapshot();
    expect(await manager.verifyFromSignal(authenticated.epoch)).toEqual({ kind: 'stale' });
    time = 89_999;
    expect(await manager.verifyFromSignal(authenticated.epoch)).toEqual({ kind: 'stale' });
    expect(manager.getSnapshot()).toBe(authenticated);
    expect(api.me).toHaveBeenCalledTimes(1);
    time = 90_000;
    api.me.mockResolvedValueOnce(success(ADMIN_DATA));
    expect(await manager.verifyFromSignal(authenticated.epoch)).toEqual({ kind: 'success' });
    expect(api.me).toHaveBeenCalledTimes(2);
  });

  it('信号复核在允许时关闭旧身份并合并正在进行的核对，不广播或伪造令牌轮换', async () => {
    let time = 0;
    const channel = new FakeChannel();
    const { manager, api } = createHarness({ now: () => time, broadcastFactory: () => channel });
    await start(manager);
    const oldEpoch = manager.getSnapshot().epoch;
    time = 30_000;
    const response = deferred<ApiOutcome<AuthSessionData>>();
    api.me.mockReturnValueOnce(response.promise);
    const check = manager.verifyFromSignal(oldEpoch);
    const checkingEpoch = manager.getSnapshot().epoch;
    expect(manager.getSnapshot()).toMatchObject({ status: 'checking', user: null });
    expect(manager.getCsrfToken()).toBeNull();
    expect(manager.verifyFromSignal(checkingEpoch)).toBe(check);
    expect(await manager.verifyFromSignal(oldEpoch)).toEqual({ kind: 'stale' });
    response.resolve(success(AUTH_DATA));
    expect(await check).toEqual({ kind: 'success' });
    expect(manager.getCsrfToken()).toBe(AUTH_DATA.csrfToken);
    expect(channel.sent).toEqual([]);
  });

  it('退出在途时停止保持未确认，旧成功也不能让重启自动恢复或冒充已确认', async () => {
    const { manager, api } = createHarness();
    await start(manager);
    const entered = deferred<void>();
    const response = deferred<ApiOutcome<{ loggedOut: true }>>();
    api.logout.mockImplementationOnce(() => {
      entered.resolve(undefined);
      return response.promise;
    });
    const logout = manager.logout();
    await entered.promise;
    manager.stop();
    manager.start();
    expect(manager.getSnapshot()).toMatchObject({ status: 'logout-unconfirmed', user: null });
    expect(api.me).toHaveBeenCalledTimes(1);
    response.resolve(success({ loggedOut: true } as const));
    expect(await logout).toEqual({ kind: 'stale' });
    expect(manager.getSnapshot().status).toBe('logout-unconfirmed');
    expect(await manager.logout()).toEqual({ kind: 'success' });
    expect(manager.getSnapshot().status).toBe('anonymous');
    expect(api.me).toHaveBeenCalledTimes(1);
  });

  it('同步 start-stop-start 只发送最新生命周期请求，重复启停幂等且清监听', async () => {
    const channels: FakeChannel[] = [];
    const { manager, api } = createHarness({
      broadcastFactory: () => {
        const channel = new FakeChannel();
        channels.push(channel);
        return channel;
      },
    });
    manager.start();
    manager.start();
    manager.stop();
    manager.stop();
    manager.start();
    await manager.restore();
    expect(api.me).toHaveBeenCalledTimes(1);
    expect(channels).toHaveLength(2);
    expect(channels[0]?.closed).toBe(true);
    expect(channels[0]?.listeners.size).toBe(0);
    expect(channels[1]?.listeners.size).toBe(1);
    manager.stop();
    expect(channels[1]?.closed).toBe(true);
    expect(channels[1]?.listeners.size).toBe(0);
    expect(manager.getSessionSignal().aborted).toBe(true);
    expect(manager.getCsrfToken()).toBeNull();
  });

  it('停止取消认证信号，迟到成功和旧通道回调不能污染重新启动的身份', async () => {
    const channels: FakeChannel[] = [];
    const { manager, api } = createHarness({
      broadcastFactory: () => {
        const channel = new FakeChannel();
        channels.push(channel);
        return channel;
      },
    });
    const entered = deferred<AbortSignal | undefined>();
    const response = deferred<ApiOutcome<AuthSessionData>>();
    api.me.mockImplementationOnce((signal) => {
      entered.resolve(signal);
      return response.promise;
    });
    manager.start();
    const oldCheck = manager.restore();
    const signal = await entered.promise;
    const oldListener = channels[0]?.listeners.values().next().value;
    manager.stop();
    expect(signal?.aborted).toBe(true);
    api.me.mockResolvedValueOnce(success(ADMIN_DATA));
    manager.start();
    const currentCheck = manager.restore();
    expect(api.me).toHaveBeenCalledTimes(1);
    response.resolve(success(OWNER_DATA));
    expect(await oldCheck).toEqual({ kind: 'stale' });
    expect(await currentCheck).toEqual({ kind: 'success' });
    const snapshot = manager.getSnapshot();
    oldListener?.(new MessageEvent('message', { data: { type: 'session-changing' } }));
    expect(manager.getSnapshot()).toBe(snapshot);
    expect(snapshot.user).toEqual(ADMIN_USER);
    expect(api.me).toHaveBeenCalledTimes(2);
  });
});
