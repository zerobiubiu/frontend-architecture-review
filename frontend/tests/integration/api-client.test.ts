import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '@/services/api/client';
import { classifyWriteOutcome, isOperationPreserved } from '@/services/api/errors';
import { API } from '../msw/handlers';
import { server } from '../msw/server';

const client = createApiClient({
  baseUrl: API,
  getCsrfToken: () => 'csrf-test-token',
  getSessionEpoch: () => 7,
});

describe('API Client 协议分支（MSW）', () => {
  it('2xx 成功信封返回 data 并携带会话纪元', async () => {
    const outcome = await client.get<{ version: string }>('/meta');
    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') {
      expect(outcome.data.version).toBe('3.0.0');
      expect(outcome.sessionEpoch).toBe(7);
      expect(outcome.operation).toBeNull();
    }
  });

  it('写请求携带 CSRF 与幂等键，且成功时保留 operation', async () => {
    const captured: { csrf?: string | null; idem?: string | null } = {};
    server.use(
      http.post(`${API}/orders/:id/cancel`, ({ request }) => {
        captured.csrf = request.headers.get('X-CSRF-Token');
        captured.idem = request.headers.get('Idempotency-Key');
        return HttpResponse.json({
          data: { orderId: 'order-1' },
          operation: {
            id: '7f4f7f6e-6a2a-4c1e-9f0f-1a2b3c4d5e6f',
            kind: 'ORDER_CANCEL',
            status: 'SUCCEEDED',
          },
        });
      }),
    );
    const outcome = await client.post(
      '/orders/order-1/cancel',
      {},
      {
        idempotencyKey: '7f4f7f6e-6a2a-4c1e-9f0f-1a2b3c4d5e6f',
      },
    );
    expect(outcome.kind).toBe('success');
    expect(captured.csrf).toBe('csrf-test-token');
    expect(captured.idem).toBe('7f4f7f6e-6a2a-4c1e-9f0f-1a2b3c4d5e6f');
    if (outcome.kind === 'success') expect(outcome.operation?.status).toBe('SUCCEEDED');
  });

  it('GET 不携带 CSRF', async () => {
    const captured: { csrf?: string | null } = {};
    server.use(
      http.get(`${API}/meta`, ({ request }) => {
        captured.csrf = request.headers.get('X-CSRF-Token');
        return HttpResponse.json({ data: { ok: true } });
      }),
    );
    await client.get('/meta');
    expect(captured.csrf).toBeNull();
  });

  it('502 响应保留 SUCCEEDED 回执，并按已应用分类', async () => {
    const outcome = await client.post('/accounts/account-1/assets/sync', {}, { idempotencyKey: 'op-1' });
    expect(outcome.kind).toBe('http-error');
    if (outcome.kind === 'http-error') {
      expect(outcome.status).toBe(502);
      expect(outcome.error.code).toBe('WALLET_READ_FAILED');
      expect(outcome.operation?.kind).toBe('ACCOUNT_SYNC');
    }
    expect(isOperationPreserved(outcome)).toBe(true);
    expect(classifyWriteOutcome(outcome)).toBe('applied');
  });

  it('429 + UNKNOWN 回执归为未知，不当作失败', async () => {
    const outcome = await client.post('/tasks/task-1/control', { action: 'START' });
    expect(outcome.kind).toBe('http-error');
    expect(classifyWriteOutcome(outcome)).toBe('unknown');
  });

  it('401 / 403 / 409 / 422 解析为结构化错误', async () => {
    const unauthenticated = await client.get('/accounts');
    const forbidden = await client.get('/admin/users');
    const conflict = await client.get('/orders/conflict');
    const validation = await client.post('/orders', { price: '1.234' });

    expect(unauthenticated.kind).toBe('http-error');
    if (unauthenticated.kind === 'http-error') {
      expect(unauthenticated.status).toBe(401);
      expect(unauthenticated.operation).toBeNull();
      expect(classifyWriteOutcome(unauthenticated)).toBe('rejected');
    }
    if (forbidden.kind === 'http-error') expect(forbidden.status).toBe(403);
    if (conflict.kind === 'http-error') {
      expect(conflict.status).toBe(409);
      expect(conflict.error.requestId).toBe('req-409');
    }
    if (validation.kind === 'http-error') {
      expect(validation.status).toBe(422);
      expect(validation.error.details).toMatchObject({ fields: [{ path: 'price' }] });
    }
  });

  it('未知结果回执可被读取（PROCESSING 不会被解释成完成）', async () => {
    const outcome = await client.get<{ status: string }>('/operations/op-1');
    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') {
      expect(outcome.data.status).toBe('PROCESSING');
    }
  });

  it('响应不是 JSON 时返回 malformed，而不是断言成功或失败', async () => {
    const outcome = await client.get('/malformed');
    expect(outcome.kind).toBe('malformed');
    if (outcome.kind === 'malformed') {
      expect(outcome.status).toBe(200);
      expect(outcome.operation).toBeNull();
    }
    expect(classifyWriteOutcome(outcome)).toBe('unknown');
  });

  it('超时是 transport-error(timeout)，不是业务失败', async () => {
    const outcome = await client.get('/slow', { timeoutMs: 10 });
    expect(outcome.kind).toBe('transport-error');
    if (outcome.kind === 'transport-error') expect(outcome.reason).toBe('timeout');
    expect(classifyWriteOutcome(outcome)).toBe('unknown');
  });

  it('外部取消归类为 aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const outcome = await client.get('/slow', { signal: controller.signal });
    expect(outcome.kind).toBe('transport-error');
    if (outcome.kind === 'transport-error') expect(outcome.reason).toBe('aborted');
  });

  it('写请求不自动重试：一次调用只发一次请求', async () => {
    const handler = vi.fn(() =>
      HttpResponse.json(
        { error: { code: 'UPSTREAM', message: '上游失败', requestId: 'req-retry' } },
        { status: 502 },
      ),
    );
    server.use(http.post(`${API}/orders`, handler));
    const outcome = await client.post('/orders', {});
    expect(outcome.kind).toBe('http-error');
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
