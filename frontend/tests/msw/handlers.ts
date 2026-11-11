import { delay, HttpResponse, http } from 'msw';
import {
  ACCOUNT_RECONCILE_REQUEST,
  ACCOUNT_SYNC_REQUEST,
  ORDER_CANCEL_REQUEST,
  receiptJson,
  TASK_CONTROL_REQUEST,
} from './fixtures';

export const API = 'http://localhost/api/v1';

/**
 * Mock API：模拟后端的成功/错误信封与“非 2xx 仍带 operation”的行为。
 * 这里只覆盖协议分支，不冒充真实后端行为。
 */
export const handlers = [
  // 单元/组件测试默认匿名；认证正例由各测试显式覆写，不与真实后端通信。
  http.get(`${API}/auth/me`, () =>
    HttpResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Mock：当前未登录' } }, { status: 401 }),
  ),
  http.get(`${API}/meta`, () =>
    HttpResponse.json({ data: { version: '3.0.0', environment: 'test', capabilities: [] } }),
  ),

  http.get(`${API}/orders`, () =>
    HttpResponse.json({
      data: { items: [], total: 0, page: 1, pageSize: 25 },
    }),
  ),

  http.post(`${API}/orders/:id/cancel`, ({ request, params }) =>
    HttpResponse.json({
      data: { orderId: String(params.id), status: 'CANCELING' },
      operation: receiptJson({
        ...ORDER_CANCEL_REQUEST,
        id: request.headers.get('Idempotency-Key') ?? ORDER_CANCEL_REQUEST.id,
        targetId: String(params.id),
      }),
    }),
  ),

  http.post(`${API}/accounts/:id/assets/sync`, ({ request, params }) =>
    HttpResponse.json(
      {
        error: {
          code: 'WALLET_READ_FAILED',
          message: '钱包读取失败，已保存失败回执',
          requestId: 'req-502',
        },
        operation: receiptJson({
          ...ACCOUNT_SYNC_REQUEST,
          id: request.headers.get('Idempotency-Key') ?? ACCOUNT_SYNC_REQUEST.id,
          targetId: String(params.id),
        }),
      },
      { status: 502 },
    ),
  ),

  http.post(`${API}/tasks/:id/control`, ({ request, params }) =>
    HttpResponse.json(
      {
        error: { code: 'RATE_LIMITED', message: '请求过于频繁', requestId: 'req-429' },
        operation: receiptJson(
          {
            ...TASK_CONTROL_REQUEST,
            id: request.headers.get('Idempotency-Key') ?? TASK_CONTROL_REQUEST.id,
            targetId: String(params.id),
          },
          { status: 'UNKNOWN' },
        ),
      },
      { status: 429 },
    ),
  ),

  http.get(`${API}/accounts`, () =>
    HttpResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: '请先登录', requestId: 'req-401' } },
      { status: 401 },
    ),
  ),

  http.get(`${API}/admin/users`, () =>
    HttpResponse.json(
      { error: { code: 'FORBIDDEN', message: '无权访问', requestId: 'req-403' } },
      { status: 403 },
    ),
  ),

  http.get(`${API}/orders/conflict`, () =>
    HttpResponse.json(
      { error: { code: 'CONFLICT', message: '原操作标识冲突', requestId: 'req-409' } },
      { status: 409 },
    ),
  ),

  // 演示用错误结构：details.fields 不是当前公开契约字段，仅用于前端错误分支测试。
  http.post(`${API}/orders`, () =>
    HttpResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: '请求参数不符合要求',
          requestId: 'req-422',
          details: { fields: [{ path: 'price', message: '限价最多两位小数' }] },
        },
      },
      { status: 422 },
    ),
  ),

  http.get(`${API}/operations/:id`, ({ params }) =>
    HttpResponse.json({
      data: receiptJson({ ...ACCOUNT_RECONCILE_REQUEST, id: String(params.id) }, { status: 'PROCESSING' }),
    }),
  ),

  http.get(`${API}/healthz`, () =>
    HttpResponse.json(
      {
        data: {
          status: 'degraded',
          database: { online: false, environmentValid: false },
          worker: { online: false, lastSeenAt: null, status: 'UNKNOWN' },
        },
      },
      { status: 503 },
    ),
  ),

  http.get(`${API}/orders/bad-operation`, () =>
    HttpResponse.json({
      data: null,
      operation: {
        id: '7f4f7f6e-6a2a-4c1e-9f0f-1a2b3c4d5e6f',
        kind: 'ORDER_CANCEL',
        status: 'UNRECOGNIZED_STATUS',
      },
    }),
  ),

  http.get(`${API}/orders/unknown-kind-operation`, () =>
    HttpResponse.json({
      data: null,
      operation: {
        id: '7f4f7f6e-6a2a-4c1e-9f0f-1a2b3c4d5e6f',
        kind: 'FUTURE_ACTION',
        status: 'SUCCEEDED',
      },
    }),
  ),

  http.get(`${API}/orders/missing-id-operation`, () =>
    HttpResponse.json({
      data: null,
      operation: { kind: 'ORDER_CANCEL', status: 'SUCCEEDED' },
    }),
  ),

  http.get(`${API}/orders/invalid-error-with-operation`, () =>
    HttpResponse.json(
      {
        error: { unexpected: true },
        operation: receiptJson(ORDER_CANCEL_REQUEST),
      },
      { status: 500 },
    ),
  ),

  http.get(`${API}/orders/mismatched-operation`, () =>
    HttpResponse.json({
      data: { ok: true },
      operation: receiptJson(ORDER_CANCEL_REQUEST, {
        id: '00000000-0000-4000-8000-000000000099',
      }),
    }),
  ),

  http.get(`${API}/orders/extension-fields`, () =>
    HttpResponse.json({
      data: { ok: true },
      operation: { ...receiptJson(ORDER_CANCEL_REQUEST), futureField: 'kept' },
    }),
  ),

  http.get(`${API}/malformed`, () => new HttpResponse('<html>not json</html>', { status: 200 })),

  http.get(`${API}/slow`, async () => {
    await delay(50);
    return HttpResponse.json({ data: { ok: true } });
  }),
];
