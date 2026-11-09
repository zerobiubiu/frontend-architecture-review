import { delay, HttpResponse, http } from 'msw';
import { receiptJson } from './fixtures';

export const API = 'http://localhost/api/v1';

/**
 * Mock API：模拟后端的成功/错误信封与“非 2xx 仍带 operation”的行为。
 * 这里只覆盖协议分支，不冒充真实后端行为。
 */
export const handlers = [
  http.get(`${API}/meta`, () =>
    HttpResponse.json({ data: { version: '3.0.0', environment: 'test', capabilities: [] } }),
  ),

  http.get(`${API}/orders`, () =>
    HttpResponse.json({
      data: { items: [], total: 0, page: 1, pageSize: 25 },
    }),
  ),

  http.post(`${API}/orders/:id/cancel`, () =>
    HttpResponse.json({
      data: { orderId: 'order-1', status: 'CANCELING' },
      operation: receiptJson({ kind: 'ORDER_CANCEL', status: 'SUCCEEDED' }),
    }),
  ),

  http.post(`${API}/accounts/:id/assets/sync`, () =>
    HttpResponse.json(
      {
        error: {
          code: 'WALLET_READ_FAILED',
          message: '钱包读取失败，已保存失败回执',
          requestId: 'req-502',
        },
        operation: receiptJson({ kind: 'ACCOUNT_SYNC', status: 'SUCCEEDED' }),
      },
      { status: 502 },
    ),
  ),

  http.post(`${API}/tasks/:id/control`, () =>
    HttpResponse.json(
      {
        error: { code: 'RATE_LIMITED', message: '请求过于频繁', requestId: 'req-429' },
        operation: receiptJson({ kind: 'TASK_CONTROL', status: 'UNKNOWN' }),
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
      data: receiptJson({
        id: String(params.id),
        kind: 'ACCOUNT_RECONCILE',
        status: 'PROCESSING',
      }),
    }),
  ),

  http.get(`${API}/malformed`, () => new HttpResponse('<html>not json</html>', { status: 200 })),

  http.get(`${API}/slow`, async () => {
    await delay(50);
    return HttpResponse.json({ data: { ok: true } });
  }),
];
