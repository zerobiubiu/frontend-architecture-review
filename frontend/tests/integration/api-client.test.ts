import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '@/services/api/client';
import { classifyWriteOutcome, isOperationPreserved } from '@/services/api/errors';
import {
  ACCOUNT_RECONCILE_REQUEST,
  ACCOUNT_SYNC_REQUEST,
  ORDER_CANCEL_REQUEST,
  type ReceiptOverrides,
  receiptJson,
  TASK_CONTROL_REQUEST,
} from '../msw/fixtures';
import { API } from '../msw/handlers';
import { server } from '../msw/server';

const client = createApiClient({
  baseUrl: API,
  getCsrfToken: () => 'csrf-test-token',
  getSessionEpoch: () => 7,
});

// 普通读取信封的分类只验证既定测试原意图仍为未知，不把 GET 当作写入确认。
describe('API Client 协议分支（MSW）', () => {
  it('2xx 成功信封返回 data 并携带会话纪元，未携带回执时明确为 absent', async () => {
    const outcome = await client.get<{ version: string }>('/meta');
    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') {
      expect(outcome.data.version).toBe('3.0.0');
      expect(outcome.sessionEpoch).toBe(7);
      expect(outcome.receipt).toEqual({ kind: 'absent' });
      expect(classifyWriteOutcome(outcome, ORDER_CANCEL_REQUEST).intent).toBe('unknown');
    }
  });

  it('写请求携带 CSRF 与幂等键，成功时保留有效回执', async () => {
    const captured: { csrf?: string | null; idem?: string | null } = {};
    server.use(
      http.post(`${API}/orders/:id/cancel`, ({ request }) => {
        captured.csrf = request.headers.get('X-CSRF-Token');
        captured.idem = request.headers.get('Idempotency-Key');
        return HttpResponse.json({
          data: { orderId: 'order-1' },
          operation: receiptJson(ORDER_CANCEL_REQUEST),
        });
      }),
    );
    const outcome = await client.post(
      '/orders/order-1/cancel',
      {},
      {
        idempotencyKey: ORDER_CANCEL_REQUEST.id,
      },
    );
    expect(outcome.kind).toBe('success');
    expect(captured.csrf).toBe('csrf-test-token');
    expect(captured.idem).toBe(ORDER_CANCEL_REQUEST.id);
    if (outcome.kind === 'success') {
      expect(outcome.receipt.kind).toBe('valid');
      if (outcome.receipt.kind === 'valid') expect(outcome.receipt.receipt.status).toBe('SUCCEEDED');
    }
    expect(classifyWriteOutcome(outcome, ORDER_CANCEL_REQUEST)).toMatchObject({
      attempt: 'accepted',
      intent: 'applied',
    });
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
    const outcome = await client.post(
      '/accounts/account-1/assets/sync',
      {},
      {
        idempotencyKey: ACCOUNT_SYNC_REQUEST.id,
      },
    );
    expect(outcome.kind).toBe('http-error');
    if (outcome.kind === 'http-error') {
      expect(outcome.status).toBe(502);
      expect(outcome.error.code).toBe('WALLET_READ_FAILED');
      expect(outcome.receipt.kind).toBe('valid');
      if (outcome.receipt.kind === 'valid') {
        expect(outcome.receipt.receipt).toMatchObject(ACCOUNT_SYNC_REQUEST);
      }
    }
    expect(isOperationPreserved(outcome)).toBe(true);
    expect(classifyWriteOutcome(outcome, ACCOUNT_SYNC_REQUEST)).toMatchObject({
      attempt: 'unknown',
      intent: 'applied',
    });
  });

  it('429 + UNKNOWN 回执归为未知，不当作失败', async () => {
    const outcome = await client.post(
      '/tasks/task-1/control',
      { action: 'START' },
      { idempotencyKey: TASK_CONTROL_REQUEST.id },
    );
    expect(outcome.kind).toBe('http-error');
    expect(classifyWriteOutcome(outcome, TASK_CONTROL_REQUEST)).toMatchObject({
      attempt: 'rejected',
      intent: 'unknown',
    });
  });

  it('401 / 403 / 409 / 422 的结构化错误只说明本次尝试被拒，不解除原意图未知', async () => {
    const unauthenticated = await client.get('/accounts');
    const forbidden = await client.get('/admin/users');
    const conflict = await client.get('/orders/conflict');
    const validation = await client.post('/orders', { price: '1.234' });

    for (const outcome of [unauthenticated, forbidden, conflict, validation]) {
      expect(outcome.kind).toBe('http-error');
      const assessment = classifyWriteOutcome(outcome, ORDER_CANCEL_REQUEST);
      expect(assessment.attempt).toBe('rejected');
      expect(assessment.intent).toBe('unknown');
    }
    if (unauthenticated.kind === 'http-error') {
      expect(unauthenticated.receipt).toEqual({ kind: 'absent' });
    }
    if (validation.kind === 'http-error') {
      expect(validation.status).toBe(422);
      expect(validation.error.details).toMatchObject({ fields: [{ path: 'price' }] });
    }
  });

  it('200 + 未知 status 的回执是 invalid，不能当作 applied', async () => {
    const outcome = await client.get('/orders/bad-operation');
    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') {
      expect(outcome.receipt.kind).toBe('invalid');
    }
    expect(classifyWriteOutcome(outcome, ORDER_CANCEL_REQUEST)).toMatchObject({
      attempt: 'accepted',
      intent: 'unknown',
      reason: 'receipt-invalid',
    });
  });

  it('未知 kind 的回执不能被 SUCCEEDED 提升为业务成功', async () => {
    const outcome = await client.get('/orders/unknown-kind-operation');
    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') expect(outcome.receipt.kind).toBe('invalid');
    expect(classifyWriteOutcome(outcome, ORDER_CANCEL_REQUEST)).toMatchObject({
      intent: 'unknown',
      reason: 'receipt-invalid',
    });
  });

  it('缺 id 的回执是 invalid，仍保留原始诊断值', async () => {
    const outcome = await client.get('/orders/missing-id-operation');
    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') {
      expect(outcome.receipt.kind).toBe('invalid');
      if (outcome.receipt.kind === 'invalid') {
        expect(outcome.receipt.raw).toMatchObject({ kind: 'ORDER_CANCEL', status: 'SUCCEEDED' });
      }
    }
    expect(classifyWriteOutcome(outcome, ORDER_CANCEL_REQUEST).intent).toBe('unknown');
  });

  it('错误信封畸形但 operation 有效时，保留回执而不是抹成 absent', async () => {
    const outcome = await client.get('/orders/invalid-error-with-operation');
    expect(outcome.kind).toBe('malformed');
    if (outcome.kind === 'malformed') {
      expect(outcome.receipt.kind).toBe('valid');
    }
  });

  it('回执 ID 与请求不一致时不采纳其结论', async () => {
    const outcome = await client.get('/orders/mismatched-operation');
    expect(classifyWriteOutcome(outcome, ORDER_CANCEL_REQUEST)).toMatchObject({
      intent: 'unknown',
      reason: 'receipt-mismatch',
    });
  });

  it('允许后端扩展字段，不影响有效回执解析', async () => {
    const outcome = await client.get('/orders/extension-fields');
    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') {
      expect(outcome.receipt.kind).toBe('valid');
      if (outcome.receipt.kind === 'valid') {
        expect(outcome.receipt.receipt.id).toBe(ORDER_CANCEL_REQUEST.id);
      }
    }
  });

  it('未知结果回执可被读取（PROCESSING 不会被解释成完成）', async () => {
    const outcome = await client.get<{ status: string }>(`/operations/${ACCOUNT_RECONCILE_REQUEST.id}`);
    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') {
      expect(outcome.data.status).toBe('PROCESSING');
    }
  });

  it('/healthz 503 的 data 可读取，但不是 success，也不丢失降级详情', async () => {
    const outcome = await client.get<{ status: string }>('/healthz');
    expect(outcome.kind).toBe('http-data');
    if (outcome.kind === 'http-data') {
      expect(outcome.status).toBe(503);
      expect(outcome.data.status).toBe('degraded');
      expect(outcome.receipt).toEqual({ kind: 'absent' });
    }
    expect(classifyWriteOutcome(outcome, ORDER_CANCEL_REQUEST)).toMatchObject({
      attempt: 'unknown',
      intent: 'unknown',
    });
  });

  it('响应不是 JSON 时返回 malformed，而不是断言成功或失败', async () => {
    const outcome = await client.get('/malformed');
    expect(outcome.kind).toBe('malformed');
    if (outcome.kind === 'malformed') {
      expect(outcome.status).toBe(200);
      expect(outcome.receipt).toEqual({ kind: 'absent' });
    }
    expect(classifyWriteOutcome(outcome, ORDER_CANCEL_REQUEST).intent).toBe('unknown');
  });

  it('超时是 transport-error(timeout) 且已发出，不是业务失败', async () => {
    const outcome = await client.get('/slow', { timeoutMs: 10 });
    expect(outcome.kind).toBe('transport-error');
    if (outcome.kind === 'transport-error') {
      expect(outcome.reason).toBe('timeout');
      expect(outcome.attempted).toBe(true);
    }
    expect(classifyWriteOutcome(outcome, ORDER_CANCEL_REQUEST)).toMatchObject({
      attempt: 'unknown',
      intent: 'unknown',
    });
  });

  it('发送前取消是 not-sent；不误报为已发送', async () => {
    const controller = new AbortController();
    controller.abort();
    const outcome = await client.get('/slow', { signal: controller.signal });
    expect(outcome.kind).toBe('transport-error');
    if (outcome.kind === 'transport-error') {
      expect(outcome.reason).toBe('aborted');
      expect(outcome.attempted).toBe(false);
    }
    expect(classifyWriteOutcome(outcome, ORDER_CANCEL_REQUEST)).toMatchObject({
      attempt: 'not-sent',
      intent: 'unknown',
    });
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

describe.each([
  {
    status: 'SUCCEEDED',
    intent: 'applied',
    reason: 'receipt-applied',
    httpStatus: 502,
    attempt: 'unknown',
  },
  {
    status: 'REJECTED',
    intent: 'not-applied',
    reason: 'receipt-rejected',
    httpStatus: 409,
    attempt: 'rejected',
  },
] as const)('R2-01 · $status 回执必须关联原请求（MSW）', (terminal) => {
  it('非 2xx 的匹配回执仍可确认该种操作的结论，不等同于目标业务完成', async () => {
    server.use(
      http.post(`${API}/accounts/:id/assets/sync`, () =>
        HttpResponse.json(
          {
            error: { code: 'UPSTREAM', message: '响应携带原操作回执', requestId: 'req-terminal' },
            operation: receiptJson(ACCOUNT_SYNC_REQUEST, { status: terminal.status }),
          },
          { status: terminal.httpStatus },
        ),
      ),
    );

    const outcome = await client.post(
      '/accounts/account-1/assets/sync',
      {},
      { idempotencyKey: ACCOUNT_SYNC_REQUEST.id },
    );

    expect(outcome).toMatchObject({
      kind: 'http-error',
      status: terminal.httpStatus,
      receipt: {
        kind: 'valid',
        receipt: { ...ACCOUNT_SYNC_REQUEST, status: terminal.status },
      },
    });
    expect(isOperationPreserved(outcome)).toBe(true);
    expect(classifyWriteOutcome(outcome, ACCOUNT_SYNC_REQUEST)).toEqual({
      attempt: terminal.attempt,
      intent: terminal.intent,
      reason: terminal.reason,
    });
  });

  it('畸形错误信封仍保留完整匹配回执，并允许采用该种操作的终态', async () => {
    server.use(
      http.post(`${API}/tasks/:id/control`, () =>
        HttpResponse.json(
          {
            error: { unexpected: true },
            operation: receiptJson(TASK_CONTROL_REQUEST, { status: terminal.status }),
          },
          { status: 500 },
        ),
      ),
    );

    const outcome = await client.post(
      '/tasks/task-1/control',
      { action: 'START' },
      { idempotencyKey: TASK_CONTROL_REQUEST.id },
    );

    expect(outcome).toMatchObject({
      kind: 'malformed',
      receipt: {
        kind: 'valid',
        receipt: { ...TASK_CONTROL_REQUEST, status: terminal.status },
      },
    });
    expect(classifyWriteOutcome(outcome, TASK_CONTROL_REQUEST)).toEqual({
      attempt: 'unknown',
      intent: terminal.intent,
      reason: terminal.reason,
    });
  });

  it.each([
    { name: '省略原身份', identityArguments: [] },
    { name: '未定义原身份', identityArguments: [undefined] },
    { name: '空值原身份', identityArguments: [null] },
    { name: '空对象原身份', identityArguments: [{}] },
    { name: '字符串原身份', identityArguments: ['非请求身份'] },
    { name: '数字原身份', identityArguments: [17] },
    { name: '数组原身份', identityArguments: [[]] },
    { name: '仅有原 ID', identityArguments: [{ id: TASK_CONTROL_REQUEST.id }] },
    {
      name: '仅有原 ID 和种类',
      identityArguments: [{ id: TASK_CONTROL_REQUEST.id, kind: TASK_CONTROL_REQUEST.kind }],
    },
    {
      name: '缺少原目标类型',
      identityArguments: [
        {
          id: TASK_CONTROL_REQUEST.id,
          kind: TASK_CONTROL_REQUEST.kind,
          targetId: TASK_CONTROL_REQUEST.targetId,
        },
      ],
    },
    {
      name: '缺少原目标 ID',
      identityArguments: [
        {
          id: TASK_CONTROL_REQUEST.id,
          kind: TASK_CONTROL_REQUEST.kind,
          targetType: TASK_CONTROL_REQUEST.targetType,
        },
      ],
    },
    {
      name: '原 ID 不符',
      identityArguments: [{ ...TASK_CONTROL_REQUEST, id: 'other-original-id' }],
    },
    {
      name: '原种类和目标不符',
      identityArguments: [ORDER_CANCEL_REQUEST],
    },
    {
      name: '原目标类型不符',
      identityArguments: [{ ...TASK_CONTROL_REQUEST, targetType: 'ORDER' }],
    },
    {
      name: '原目标 ID 不符',
      identityArguments: [{ ...TASK_CONTROL_REQUEST, targetId: 'other-task' }],
    },
  ])('畸形错误保留回执，但 $name 时不得确认终态', async ({ identityArguments }) => {
    server.use(
      http.post(`${API}/tasks/:id/control`, () =>
        HttpResponse.json(
          {
            error: { unexpected: true },
            operation: receiptJson(TASK_CONTROL_REQUEST, { status: terminal.status }),
          },
          { status: 500 },
        ),
      ),
    );

    const outcome = await client.post(
      '/tasks/task-1/control',
      { action: 'START' },
      { idempotencyKey: TASK_CONTROL_REQUEST.id },
    );

    expect(outcome).toMatchObject({
      kind: 'malformed',
      receipt: {
        kind: 'valid',
        receipt: { ...TASK_CONTROL_REQUEST, status: terminal.status },
      },
    });
    // 仅在测试边界绕过静态签名，模拟缺失、不完整或不可信的调用方输入。
    expect(Reflect.apply(classifyWriteOutcome, undefined, [outcome, ...identityArguments])).toEqual({
      attempt: 'unknown',
      intent: 'unknown',
      reason: 'receipt-mismatch',
    });
  });

  it.each([
    { name: '原 ID', overrides: { id: 'other-operation-id' } },
    { name: '操作种类', overrides: { kind: 'ORDER_CANCEL' } },
    { name: '目标类型', overrides: { targetType: 'ORDER' } },
    { name: '目标 ID', overrides: { targetId: 'other-task' } },
  ] satisfies readonly { name: string; overrides: ReceiptOverrides }[])(
    '写响应的 $name 错配时保留回执，但不采纳其终态',
    async ({ overrides }) => {
      server.use(
        http.post(`${API}/tasks/:id/control`, () =>
          HttpResponse.json({
            data: { ok: true },
            operation: receiptJson(TASK_CONTROL_REQUEST, { status: terminal.status, ...overrides }),
          }),
        ),
      );

      const outcome = await client.post(
        '/tasks/task-1/control',
        { action: 'START' },
        { idempotencyKey: TASK_CONTROL_REQUEST.id },
      );

      expect(outcome).toMatchObject({
        kind: 'success',
        receipt: { kind: 'valid', receipt: { status: terminal.status, ...overrides } },
      });
      expect(classifyWriteOutcome(outcome, TASK_CONTROL_REQUEST)).toEqual({
        attempt: 'accepted',
        intent: 'unknown',
        reason: 'receipt-mismatch',
      });
    },
  );

  it('调用方与回执共用错误的种类和目标配对也不能确认终态', async () => {
    const invalidRequest = { ...TASK_CONTROL_REQUEST, targetType: 'ORDER' };
    server.use(
      http.post(`${API}/tasks/:id/control`, () =>
        HttpResponse.json({
          data: { ok: true },
          operation: receiptJson(TASK_CONTROL_REQUEST, {
            status: terminal.status,
            targetType: 'ORDER',
          }),
        }),
      ),
    );

    const outcome = await client.post(
      '/tasks/task-1/control',
      { action: 'START' },
      { idempotencyKey: TASK_CONTROL_REQUEST.id },
    );

    expect(outcome).toMatchObject({
      kind: 'success',
      receipt: {
        kind: 'valid',
        receipt: { kind: 'TASK_CONTROL', targetType: 'ORDER', status: terminal.status },
      },
    });
    expect(Reflect.apply(classifyWriteOutcome, undefined, [outcome, invalidRequest])).toEqual({
      attempt: 'accepted',
      intent: 'unknown',
      reason: 'receipt-mismatch',
    });
  });

  it.each(['targetType', 'targetId'] as const)(
    '回执缺少 %s 时解析仍保留诊断字段，但完整原身份不能确认终态',
    async (field) => {
      const operation = receiptJson(TASK_CONTROL_REQUEST, { status: terminal.status });
      delete operation[field];
      server.use(
        http.post(`${API}/tasks/:id/control`, () => HttpResponse.json({ data: { ok: true }, operation })),
      );

      const outcome = await client.post(
        '/tasks/task-1/control',
        { action: 'START' },
        { idempotencyKey: TASK_CONTROL_REQUEST.id },
      );

      expect(outcome).toMatchObject({
        kind: 'success',
        receipt: { kind: 'valid', receipt: { status: terminal.status, [field]: null } },
      });
      expect(classifyWriteOutcome(outcome, TASK_CONTROL_REQUEST)).toEqual({
        attempt: 'accepted',
        intent: 'unknown',
        reason: 'receipt-mismatch',
      });
    },
  );
});

describe('R2-01 · 首次响应丢失后的原意图保护（MSW）', () => {
  it.each([
    { status: 401, name: '未标注接收状态', operationAccepted: undefined },
    { status: 409, name: '未标注接收状态', operationAccepted: undefined },
    { status: 429, name: '未标注接收状态', operationAccepted: undefined },
    { status: 401, name: '显式未接收本次尝试', operationAccepted: false },
    { status: 409, name: '显式未接收本次尝试', operationAccepted: false },
    { status: 429, name: '显式未接收本次尝试', operationAccepted: false },
  ])('手动沿用原 ID 后收到 $status、$name 且无回执，原意图仍未知', async (response) => {
    const capturedKeys: (string | null)[] = [];
    const handler = vi.fn((request: Request) => {
      capturedKeys.push(request.headers.get('Idempotency-Key'));
      if (capturedKeys.length === 1) return HttpResponse.error();
      return HttpResponse.json(
        {
          error: {
            code: 'ATTEMPT_REJECTED',
            message: '仅拒绝本次尝试，无法确认原 ID 的历史结果',
            requestId: 'req-after-lost-response',
            operationAccepted: response.operationAccepted,
          },
        },
        { status: response.status },
      );
    });
    server.use(http.post(`${API}/orders/:id/cancel`, ({ request }) => handler(request)));

    const first = await client.post(
      '/orders/order-1/cancel',
      {},
      { idempotencyKey: ORDER_CANCEL_REQUEST.id },
    );

    expect(first).toMatchObject({ kind: 'transport-error', reason: 'network', attempted: true });
    expect(classifyWriteOutcome(first, ORDER_CANCEL_REQUEST)).toEqual({
      attempt: 'unknown',
      intent: 'unknown',
      reason: 'transport-unknown',
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(capturedKeys).toEqual([ORDER_CANCEL_REQUEST.id]);

    // 由测试调用方显式手动重试同一原 ID，不新增恢复系统或自动发送逻辑。
    const manualRetry = await client.post(
      '/orders/order-1/cancel',
      {},
      { idempotencyKey: ORDER_CANCEL_REQUEST.id },
    );

    expect(manualRetry).toMatchObject({
      kind: 'http-error',
      status: response.status,
      receipt: { kind: 'absent' },
    });
    if (manualRetry.kind === 'http-error' && response.operationAccepted === false) {
      expect(manualRetry.error.operationAccepted).toBe(false);
    }
    expect(classifyWriteOutcome(manualRetry, ORDER_CANCEL_REQUEST)).toEqual({
      attempt: 'rejected',
      intent: 'unknown',
      reason: 'receipt-absent',
    });
    expect(handler).toHaveBeenCalledTimes(2);
    expect(capturedKeys).toEqual([ORDER_CANCEL_REQUEST.id, ORDER_CANCEL_REQUEST.id]);

    const controller = new AbortController();
    controller.abort();
    const notSent = await client.post(
      '/orders/order-1/cancel',
      {},
      { idempotencyKey: ORDER_CANCEL_REQUEST.id, signal: controller.signal },
    );

    expect(notSent).toMatchObject({ kind: 'transport-error', reason: 'aborted', attempted: false });
    expect(classifyWriteOutcome(notSent, ORDER_CANCEL_REQUEST)).toEqual({
      attempt: 'not-sent',
      intent: 'unknown',
      reason: 'transport-before-send',
    });
    expect(handler).toHaveBeenCalledTimes(2);
    expect(capturedKeys).toEqual([ORDER_CANCEL_REQUEST.id, ORDER_CANCEL_REQUEST.id]);
  });
});
