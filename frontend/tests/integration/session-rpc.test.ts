import { QueryClient } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionManager, type SessionSnapshot } from '@/app/session/manager';
import { createAuthApi } from '@/features/auth/api';
import { StaleSessionResponseError } from '@/services/api/request';
import { createRpcApi } from '@/services/api/rpc';
import { ADMIN_USER, AUTH_DATA } from '../msw/auth-fixtures';
import { API } from '../msw/handlers';
import { server } from '../msw/server';

const ADMIN_DATA = { user: ADMIN_USER, csrfToken: 'a'.repeat(43) };
const UNAUTHENTICATED = { error: { code: 'UNAUTHENTICATED', message: '请先登录', requestId: 'req-session' } };

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

const disposables: { manager: SessionManager; queryClient: QueryClient }[] = [];

function createSession() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let manager: SessionManager;
  const onUnauthorized = vi.fn((epoch: number) => manager.invalidate(epoch));
  const rpc = createRpcApi({
    baseUrl: API,
    getSessionEpoch: () => manager.getSnapshot().epoch,
    getCsrfToken: () => manager.getCsrfToken(),
    getSessionSignal: () => manager.getSessionSignal(),
    isSessionCurrent: (epoch) => manager.isCurrent(epoch),
    onUnauthorized,
  });
  const api = createAuthApi(rpc);
  manager = new SessionManager({ api, queryClient, broadcastFactory: () => null, recheckMinIntervalMs: 0 });
  disposables.push({ manager, queryClient });
  return { manager, queryClient, api, rpc, onUnauthorized };
}

async function start(manager: SessionManager): Promise<void> {
  manager.start();
  await manager.restore();
}

afterEach(() => {
  for (const { manager, queryClient } of disposables.splice(0)) {
    manager.stop();
    queryClient.clear();
  }
});

describe('真实认证适配器与 Hono RPC 的会话链', () => {
  it('恢复、登录、退出各发送一次，清理后仍使用本次退出保存的真实 CSRF', async () => {
    const nativeFetch = vi.spyOn(globalThis, 'fetch');
    const received: { path: string; csrf: string | null; body: unknown }[] = [];
    server.use(
      http.get(`${API}/auth/me`, ({ request }) => {
        received.push({
          path: new URL(request.url).pathname,
          csrf: request.headers.get('X-CSRF-Token'),
          body: null,
        });
        return HttpResponse.json(UNAUTHENTICATED, { status: 401 });
      }),
      http.post(`${API}/auth/login`, async ({ request }) => {
        received.push({
          path: new URL(request.url).pathname,
          csrf: request.headers.get('X-CSRF-Token'),
          body: await request.json(),
        });
        return HttpResponse.json({ data: AUTH_DATA });
      }),
      http.post(`${API}/auth/logout`, ({ request }) => {
        received.push({
          path: new URL(request.url).pathname,
          csrf: request.headers.get('X-CSRF-Token'),
          body: null,
        });
        return HttpResponse.json({ data: { loggedOut: true } });
      }),
    );
    const { manager, queryClient, onUnauthorized } = createSession();
    await start(manager);
    expect(manager.getSnapshot()).toMatchObject({ status: 'anonymous', user: null });
    expect(await manager.login({ username: 'trader', password: ' password ' })).toEqual({ kind: 'success' });
    expect(manager.getSnapshot()).toMatchObject({ status: 'authenticated', user: AUTH_DATA.user });
    queryClient.setQueryData(
      ['session', manager.getSnapshot().epoch, AUTH_DATA.user.id, null, 'orders'],
      ['敏感缓存'],
    );
    const signal = manager.getSessionSignal();
    const logout = manager.logout();
    expect(manager.getSnapshot()).toMatchObject({ status: 'signing-out', user: null });
    expect(manager.getCsrfToken()).toBeNull();
    expect(signal.aborted).toBe(true);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(await logout).toEqual({ kind: 'success' });
    expect(manager.getSnapshot()).toMatchObject({ status: 'anonymous', user: null, error: null });
    expect(received).toEqual([
      { path: '/api/v1/auth/me', csrf: null, body: null },
      { path: '/api/v1/auth/login', csrf: null, body: { username: 'trader', password: ' password ' } },
      { path: '/api/v1/auth/logout', csrf: AUTH_DATA.csrfToken, body: null },
    ]);
    expect(nativeFetch).toHaveBeenCalledTimes(3);
    for (const [, init] of nativeFetch.mock.calls) expect(init?.credentials).toBe('include');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('真实登录失败协议返回凭据错误，不触发通用四零一失效回调', async () => {
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json(UNAUTHENTICATED, { status: 401 })),
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'LOGIN_FAILED',
              message: '账号或密码错误，或账号已被禁用',
              requestId: 'req-login',
            },
          },
          { status: 401 },
        ),
      ),
    );
    const { manager, onUnauthorized } = createSession();
    await start(manager);
    const epoch = manager.getSnapshot().epoch;
    expect(await manager.login({ username: 'trader', password: '错误密码' })).toEqual({
      kind: 'error',
      message: '账号或密码错误，或账号已被禁用',
    });
    expect(manager.getSnapshot()).toMatchObject({ status: 'anonymous', user: null, apiReachable: true });
    expect(manager.getSnapshot().epoch).toBeGreaterThan(epoch);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it.each([
    ['非法身份', { data: { ...AUTH_DATA, user: { ...AUTH_DATA.user, id: '伪造身份' } } }],
    ['权限扩大', { data: { ...AUTH_DATA, user: { ...AUTH_DATA.user, canManageAdmins: true } } }],
    ['缺少令牌', { data: { user: AUTH_DATA.user } }],
  ])('%s 通过运行时边界拒绝，不凭 RPC 静态类型进入会话', async (_name, body) => {
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json(body)));
    const { manager } = createSession();
    await start(manager);
    expect(manager.getSnapshot()).toMatchObject({ status: 'unavailable', user: null, apiReachable: true });
    expect(manager.getSnapshot().error).toContain('响应异常');
    expect(manager.getCsrfToken()).toBeNull();
  });

  it.each([
    ['网络故障', () => HttpResponse.error(), false],
    ['非 JSON 响应', () => HttpResponse.text('网关异常', { status: 502 }), true],
    [
      '服务故障',
      () =>
        HttpResponse.json(
          {
            error: { code: 'INTERNAL_ERROR', message: '服务不可用', requestId: 'req-error' },
          },
          { status: 503 },
        ),
      true,
    ],
    [
      '非认证四零一',
      () =>
        HttpResponse.json(
          {
            error: { code: 'OTHER_UNAUTHORIZED', message: '未知授权错误', requestId: 'req-error' },
          },
          { status: 401 },
        ),
      true,
    ],
  ] as const)('%s 不是匿名会话证据', async (_name, response, apiReachable) => {
    server.use(http.get(`${API}/auth/me`, () => response()));
    const { manager } = createSession();
    await start(manager);
    expect(manager.getSnapshot()).toMatchObject({ status: 'unavailable', user: null, apiReachable });
    expect(manager.getCsrfToken()).toBeNull();
  });

  it.each([
    ['旧成功', 200, { data: AUTH_DATA }],
    ['旧四零一', 401, UNAUTHENTICATED],
    ['旧四零三', 403, { error: { code: 'CSRF_INVALID', message: '安全令牌无效', requestId: 'req-old' } }],
  ] as const)('%s 的实际 RPC 结果在新登录之前串行完成且不能覆盖新身份', async (_name, status, body) => {
    const entered = deferred<void>();
    const release = deferred<void>();
    const sends: string[] = [];
    server.use(
      http.get(`${API}/auth/me`, async () => {
        sends.push('me');
        entered.resolve(undefined);
        await release.promise;
        return HttpResponse.json(body, { status });
      }),
      http.post(`${API}/auth/login`, () => {
        sends.push('login');
        return HttpResponse.json({ data: ADMIN_DATA });
      }),
    );
    const { manager, onUnauthorized } = createSession();
    manager.start();
    const check = manager.restore();
    await entered.promise;
    const oldEpoch = manager.getSnapshot().epoch;
    const login = manager.login({ username: 'admin', password: '密码' });
    expect(manager.getSnapshot()).toMatchObject({ status: 'signing-in', user: null });
    expect(sends).toEqual(['me']);
    release.resolve(undefined);
    expect(await check).toEqual({ kind: 'stale' });
    expect(await login).toEqual({ kind: 'success' });
    expect(sends).toEqual(['me', 'login']);
    const snapshot = manager.getSnapshot();
    manager.invalidate(oldEpoch);
    expect(manager.getSnapshot()).toBe(snapshot);
    expect(snapshot).toMatchObject({ status: 'authenticated', user: ADMIN_USER });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('登录与退出交错的实际 RPC 不并发，注销流程内部核对不重新展示身份', async () => {
    const entered = deferred<void>();
    const release = deferred<void>();
    let loggedIn = false;
    const sends: string[] = [];
    server.use(
      http.get(`${API}/auth/me`, () => {
        sends.push('me');
        return loggedIn
          ? HttpResponse.json({ data: ADMIN_DATA })
          : HttpResponse.json(UNAUTHENTICATED, { status: 401 });
      }),
      http.post(`${API}/auth/login`, async () => {
        sends.push('login');
        entered.resolve(undefined);
        await release.promise;
        loggedIn = true;
        return HttpResponse.json({ data: ADMIN_DATA });
      }),
      http.post(`${API}/auth/logout`, ({ request }) => {
        sends.push('logout');
        expect(request.headers.get('X-CSRF-Token')).toBe(ADMIN_DATA.csrfToken);
        loggedIn = false;
        return HttpResponse.json({ data: { loggedOut: true } });
      }),
    );
    const { manager } = createSession();
    await start(manager);
    const statuses: SessionSnapshot['status'][] = [];
    manager.subscribe(() => statuses.push(manager.getSnapshot().status));
    const login = manager.login({ username: 'admin', password: '密码' });
    await entered.promise;
    const logout = manager.logout();
    expect(sends).toEqual(['me', 'login']);
    release.resolve(undefined);
    expect(await login).toEqual({ kind: 'stale' });
    expect(await logout).toEqual({ kind: 'success' });
    expect(sends).toEqual(['me', 'login', 'me', 'logout']);
    expect(statuses).toEqual(['signing-in', 'signing-out', 'anonymous']);
    expect(manager.getSnapshot().user).toBeNull();
    expect(loggedIn).toBe(false);
  });

  it('退出五零三保留未确认门禁，不自动 me；显式重试复用私有 CSRF', async () => {
    const sends: string[] = [];
    let logoutAttempts = 0;
    server.use(
      http.get(`${API}/auth/me`, () => {
        sends.push('me');
        return HttpResponse.json({ data: AUTH_DATA });
      }),
      http.post(`${API}/auth/logout`, ({ request }) => {
        sends.push('logout');
        logoutAttempts += 1;
        expect(request.headers.get('X-CSRF-Token')).toBe(AUTH_DATA.csrfToken);
        if (logoutAttempts === 1) {
          return HttpResponse.json(
            {
              error: { code: 'INTERNAL_ERROR', message: '注销暂时不可用', requestId: 'req-logout' },
            },
            { status: 503 },
          );
        }
        return HttpResponse.json({ data: { loggedOut: true } });
      }),
    );
    const { manager } = createSession();
    await start(manager);
    expect(await manager.logout()).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('服务端注销未确认'),
    });
    expect(manager.getSnapshot()).toMatchObject({
      status: 'logout-unconfirmed',
      user: null,
      apiReachable: true,
    });
    expect(await manager.verifyFromSignal()).toEqual({ kind: 'stale' });
    expect(sends).toEqual(['me', 'logout']);
    expect(await manager.logout()).toEqual({ kind: 'success' });
    expect(sends).toEqual(['me', 'logout', 'logout']);
    expect(manager.getSnapshot()).toMatchObject({ status: 'anonymous', user: null });
  });

  it('旧会话绑定请求被切换取消，不触发新身份的全局未认证回调', async () => {
    const entered = deferred<void>();
    const release = deferred<void>();
    const finished = deferred<void>();
    let checks = 0;
    server.use(
      http.get(`${API}/auth/me`, async () => {
        checks += 1;
        if (checks === 1) return HttpResponse.json({ data: AUTH_DATA });
        entered.resolve(undefined);
        await release.promise;
        finished.resolve(undefined);
        return HttpResponse.json(UNAUTHENTICATED, { status: 401 });
      }),
      http.post(`${API}/auth/login`, () => HttpResponse.json({ data: ADMIN_DATA })),
    );
    const { manager, rpc, onUnauthorized } = createSession();
    await start(manager);
    // 复用同一已声明 GET，显式走默认会话绑定管线，验证业务请求与会话取消的接线。
    const oldRequest = rpc.request((client) => client.api.v1.auth.me.$get()).catch((error: unknown) => error);
    await entered.promise;
    expect(await manager.login({ username: 'admin', password: '密码' })).toEqual({ kind: 'success' });
    expect(await oldRequest).toBeInstanceOf(StaleSessionResponseError);
    release.resolve(undefined);
    await finished.promise;
    expect(manager.getSnapshot()).toMatchObject({ status: 'authenticated', user: ADMIN_USER });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('停止中断真实传输，重启可恢复且旧响应不能回写身份', async () => {
    const entered = deferred<void>();
    const release = deferred<void>();
    const finished = deferred<void>();
    let checks = 0;
    server.use(
      http.get(`${API}/auth/me`, async () => {
        checks += 1;
        if (checks !== 1) return HttpResponse.json({ data: ADMIN_DATA });
        entered.resolve(undefined);
        await release.promise;
        finished.resolve(undefined);
        return HttpResponse.json({ data: AUTH_DATA });
      }),
    );
    const { manager } = createSession();
    manager.start();
    const old = manager.restore();
    await entered.promise;
    manager.stop();
    manager.start();
    expect(await old).toEqual({ kind: 'stale' });
    expect(await manager.restore()).toEqual({ kind: 'success' });
    release.resolve(undefined);
    await finished.promise;
    expect(manager.getSnapshot()).toMatchObject({ status: 'authenticated', user: ADMIN_USER });
    expect(checks).toBe(2);
  });
});
