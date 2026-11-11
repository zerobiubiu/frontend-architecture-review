import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { createAuthApi } from '@/features/auth/api';
import { classifyWriteOutcome } from '@/services/api/errors';
import { StaleSessionResponseError } from '@/services/api/request';
import { createRpcApi } from '@/services/api/rpc';
import { AUTH_DATA } from '../msw/auth-fixtures';
import { ACCOUNT_SYNC_REQUEST, receiptJson } from '../msw/fixtures';
import { API } from '../msw/handlers';
import { server } from '../msw/server';

describe('生成 Hono RPC → 同一原生传输 → 安全解析', () => {
  it.each(['http://localhost', API])('base=%s 不重复 api/v1，健康检查仍在根级', async (baseUrl) => {
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ data: AUTH_DATA })));
    const rpc = createRpcApi({ baseUrl, getSessionEpoch: () => 7 });
    const auth = createAuthApi(rpc);
    const outcome = await auth.me();
    expect(outcome).toMatchObject({ kind: 'success', data: AUTH_DATA, sessionEpoch: 7 });
    expect(rpc.eventsUrl).toBe(`${API}/events`);
    server.use(
      http.get('http://localhost/healthz', () =>
        HttpResponse.json({ data: { status: 'degraded' } }, { status: 503 }),
      ),
    );
    expect(await rpc.request((client) => client.healthz.$get())).toMatchObject({
      kind: 'http-data',
      status: 503,
      data: { status: 'degraded' },
      receipt: { kind: 'absent' },
    });
  });

  it('认证实际走 RPC，密码不 trim，Cookie/CSRF 在发送时读取且认证不虚构回执', async () => {
    const nativeFetch = vi.spyOn(globalThis, 'fetch');
    const received: { path: string; csrf: string | null; body?: unknown }[] = [];
    const handler = async ({ request }: { request: Request }) => {
      received.push({
        path: new URL(request.url).pathname,
        csrf: request.headers.get('X-CSRF-Token'),
        body:
          request.method === 'POST' && request.headers.has('content-type') ? await request.json() : undefined,
      });
      return HttpResponse.json({ data: request.url.endsWith('/logout') ? { loggedOut: true } : AUTH_DATA });
    };
    server.use(
      http.post(`${API}/auth/login`, handler),
      http.get(`${API}/auth/me`, handler),
      http.post(`${API}/auth/logout`, handler),
    );
    let csrf = 'a'.repeat(43);
    const auth = createAuthApi(createRpcApi({ baseUrl: API, getCsrfToken: () => csrf }));
    await auth.login({ username: 'trader', password: ' password ' });
    await auth.me();
    csrf = 'b'.repeat(43);
    expect(await auth.logout(csrf)).toMatchObject({ kind: 'success', data: { loggedOut: true } });
    expect(received).toEqual([
      { path: '/api/v1/auth/login', csrf: null, body: { username: 'trader', password: ' password ' } },
      { path: '/api/v1/auth/me', csrf: null, body: undefined },
      { path: '/api/v1/auth/logout', csrf, body: undefined },
    ]);
    // 在真实 Fetch 入口检查凭据选项；浏览器 Cookie 接收/恢复另由本地协议桩 E2E 验证。
    expect(nativeFetch).toHaveBeenCalledTimes(3);
    for (const [, init] of nativeFetch.mock.calls) expect(init?.credentials).toBe('include');
  });

  it('RPC 非 2xx 仍保留回执，完整匹配可采用终态，错身份不能采用', async () => {
    server.use(
      http.post(`${API}/accounts/:id/assets/sync`, () =>
        HttpResponse.json(
          {
            error: { code: 'WALLET_READ_FAILED', message: 'Mock：失败事实已保存' },
            operation: receiptJson(ACCOUNT_SYNC_REQUEST),
          },
          { status: 502 },
        ),
      ),
    );
    const rpc = createRpcApi({ baseUrl: API });
    const result = await rpc.request(
      (client) =>
        client.api.v1.accounts[':id'].assets.sync.$post({ param: { id: ACCOUNT_SYNC_REQUEST.targetId } }),
      { idempotencyKey: ACCOUNT_SYNC_REQUEST.id },
    );
    expect(result).toMatchObject({
      kind: 'http-error',
      receipt: { kind: 'valid', receipt: ACCOUNT_SYNC_REQUEST },
    });
    expect(classifyWriteOutcome(result, ACCOUNT_SYNC_REQUEST).intent).toBe('applied');
    expect(classifyWriteOutcome(result, { ...ACCOUNT_SYNC_REQUEST, id: 'other-id' }).intent).toBe('unknown');
  });

  it('共享传输只调用一次 Fetch、消费一次原生响应，截止时间覆盖 body', async () => {
    const response = new Response(JSON.stringify({ data: AUTH_DATA }));
    const read = vi.spyOn(response, 'text');
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
    const rpc = createRpcApi({ baseUrl: API });
    expect(await createAuthApi(rpc).me()).toMatchObject({ kind: 'success', data: AUTH_DATA });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
    expect(response.bodyUsed).toBe(true);
    vi.useFakeTimers();
    const stream: { controller?: ReadableStreamDefaultController<Uint8Array> } = {};
    fetch.mockImplementationOnce(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              stream.controller = controller;
            },
          }),
        ),
    );
    try {
      const pending = rpc.request((client) => client.healthz.$get(), { timeoutMs: 5 });
      const assertion = expect(pending).resolves.toMatchObject({
        kind: 'transport-error',
        reason: 'timeout',
        attempted: true,
      });
      await vi.advanceTimersByTimeAsync(5);
      await assertion;
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      stream.controller?.close();
      vi.useRealTimers();
    }
  });

  it('旧 401 不触发新会话失效，原结果仍绑定发起 epoch', async () => {
    let epoch = 1;
    const unauthorized = vi.fn();
    const delayed: { resolve?: (response: Response) => void } = {};
    const response = new Promise<Response>((resolve) => {
      delayed.resolve = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(response);
    const rpc = createRpcApi({
      baseUrl: API,
      getSessionEpoch: () => epoch,
      isSessionCurrent: (value) => value === epoch,
      onUnauthorized: unauthorized,
    });
    const pending = rpc.request((client) => client.api.v1.auth.me.$get());
    epoch = 2;
    delayed.resolve?.(
      new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: '旧代 Mock' } }), {
        status: 401,
      }),
    );
    await expect(pending).rejects.toBeInstanceOf(StaleSessionResponseError);
    await expect(pending).rejects.toMatchObject({
      outcome: { kind: 'http-error', status: 401, sessionEpoch: 1 },
    });
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it.each([
    { ...AUTH_DATA, user: { id: AUTH_DATA.user.id, username: 'trader', role: 'TRADER' } },
    { ...AUTH_DATA, user: { ...AUTH_DATA.user, role: 'ROOT' } },
    { ...AUTH_DATA, user: { ...AUTH_DATA.user, canManageAdmins: true } },
    { ...AUTH_DATA, csrfToken: 'fake' },
  ])('身份/权限/CSRF 畸形时拒绝信任而不是补造字段', async (data) => {
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ data })));
    expect(await createAuthApi(createRpcApi({ baseUrl: API })).me()).toMatchObject({ kind: 'malformed' });
  });
});
