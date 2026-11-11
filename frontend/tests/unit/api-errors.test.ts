import { describe, expect, it } from 'vitest';
import {
  ApiOutcomeError,
  classifyWriteOutcome,
  describeApiOutcome,
  isOperationPreserved,
  isRetryableReadFailure,
  LOCAL_PRE_SEND_REJECTION,
  receiptMatchesRequest,
  requireData,
  type WriteAssessment,
} from '@/services/api/errors';
import type { ApiOutcome, ReceiptParse } from '@/services/api/types';
import { ORDER_CANCEL_REQUEST, type ReceiptOverrides, receipt } from '../msw/fixtures';

const validReceipt = (overrides: ReceiptOverrides = {}): ReceiptParse => ({
  kind: 'valid',
  receipt: receipt(ORDER_CANCEL_REQUEST, overrides),
});

const success = <T>(data: T, parsed: ReceiptParse = { kind: 'absent' }): ApiOutcome<T> => ({
  kind: 'success',
  status: 200,
  data,
  receipt: parsed,
  requestId: null,
  sessionEpoch: 1,
});

const httpError = (
  status: number,
  parsed: ReceiptParse = { kind: 'absent' },
  operationAccepted = false,
): ApiOutcome<unknown> => ({
  kind: 'http-error',
  status,
  error: {
    code: 'SOME_CODE',
    message: '请求失败',
    requestId: 'req-1',
    ...(operationAccepted ? { operationAccepted: false as const } : {}),
  },
  receipt: parsed,
  sessionEpoch: 0,
});

describe('写请求：HTTP 尝试与原意图结果必须分开', () => {
  it('无回执的 401/403/404/409/422/429 只能说明本次 HTTP 尝试被拒，不能证明原意图未执行', () => {
    for (const status of [401, 403, 404, 409, 422, 429]) {
      const assessment = classifyWriteOutcome(httpError(status), ORDER_CANCEL_REQUEST);
      expect(assessment.attempt, String(status)).toBe('rejected');
      expect(assessment.intent, String(status)).toBe('unknown');
      expect(assessment.intent, String(status)).not.toBe('not-applied');
    }
  });

  it('operationAccepted:false 只描述当前尝试，不改变原意图的未知状态', () => {
    const assessment = classifyWriteOutcome(httpError(409, { kind: 'absent' }, true), ORDER_CANCEL_REQUEST);
    expect(assessment.attempt).toBe('rejected');
    expect(assessment.intent).toBe('unknown');
  });

  it('5xx 无回执时本次尝试与原意图都无法确认', () => {
    const assessment = classifyWriteOutcome(httpError(502), ORDER_CANCEL_REQUEST);
    expect(assessment.attempt).toBe('unknown');
    expect(assessment.intent).toBe('unknown');
  });

  it('无效回执永远不能变成 applied', () => {
    const assessment = classifyWriteOutcome(
      httpError(502, { kind: 'invalid', raw: { status: 'SUCCEEDED' }, reason: 'unknown-status' }),
      ORDER_CANCEL_REQUEST,
    );
    expect(assessment.intent).toBe('unknown');
    expect(assessment.reason).toBe('receipt-invalid');
  });

  it('2xx 无回执不代表交易意图完成', () => {
    const assessment = classifyWriteOutcome(success({ ok: true }), ORDER_CANCEL_REQUEST);
    expect(assessment.attempt).toBe('accepted');
    expect(assessment.intent).toBe('unknown');
    expect(assessment.reason).toBe('receipt-absent');
  });

  it('超时/断网仍按未知处理；发送前取消才是 not-sent', () => {
    const timeout: ApiOutcome<unknown> = {
      kind: 'transport-error',
      reason: 'timeout',
      attempted: true,
      message: 'timeout',
      sessionEpoch: 0,
    };
    expect(classifyWriteOutcome(timeout, ORDER_CANCEL_REQUEST)).toEqual({
      attempt: 'unknown',
      intent: 'unknown',
      reason: 'transport-unknown',
    });

    const preAborted: ApiOutcome<unknown> = {
      kind: 'transport-error',
      reason: 'aborted',
      attempted: false,
      message: 'aborted',
      sessionEpoch: 0,
    };
    expect(classifyWriteOutcome(preAborted, ORDER_CANCEL_REQUEST)).toEqual({
      attempt: 'not-sent',
      intent: 'unknown',
      reason: 'transport-before-send',
    });
  });

  it('本地预检拒绝是 not-sent，但同样不证明原意图未执行', () => {
    expect(LOCAL_PRE_SEND_REJECTION).toEqual({
      attempt: 'not-sent',
      intent: 'unknown',
      reason: 'local-precheck',
    });
  });
});

describe('R2-01 原请求身份终态门禁', () => {
  const terminalStatuses = ['SUCCEEDED', 'REJECTED'] as const;
  const identityFields = ['id', 'kind', 'targetType', 'targetId'] as const;
  const invalidFieldValues = [
    { name: '空字符串', value: '' },
    { name: '纯空白字符串', value: '   ' },
    { name: '未定义值', value: undefined },
    { name: '空值', value: null },
    { name: '数值', value: 7 },
    { name: '布尔值', value: true },
  ] as const;
  const invalidPairings = [
    {
      name: '撤单错误指向账户',
      identity: { ...ORDER_CANCEL_REQUEST, targetType: 'ACCOUNT', targetId: 'account-1' },
    },
    {
      name: '任务控制错误指向订单',
      identity: { ...ORDER_CANCEL_REQUEST, kind: 'TASK_CONTROL' },
    },
    {
      name: '用户更新错误指向订单',
      identity: { ...ORDER_CANCEL_REQUEST, kind: 'USER_UPDATE' },
    },
    {
      name: '账户限制错误指向订单',
      identity: { ...ORDER_CANCEL_REQUEST, kind: 'ACCOUNT_RESTRICT' },
    },
    {
      name: '账户检查错误指向订单',
      identity: { ...ORDER_CANCEL_REQUEST, kind: 'ACCOUNT_CHECK' },
    },
    {
      name: '账户同步错误指向订单',
      identity: { ...ORDER_CANCEL_REQUEST, kind: 'ACCOUNT_SYNC' },
    },
    {
      name: '账户核对错误指向订单',
      identity: { ...ORDER_CANCEL_REQUEST, kind: 'ACCOUNT_RECONCILE' },
    },
    {
      name: '平台更新错误指向订单',
      identity: { ...ORDER_CANCEL_REQUEST, kind: 'PLATFORM_UPDATE' },
    },
    {
      name: '平台更新使用非固定目标标识',
      identity: {
        ...ORDER_CANCEL_REQUEST,
        kind: 'PLATFORM_UPDATE',
        targetType: 'PLATFORM',
        targetId: 'other-platform',
      },
    },
  ];
  const unsafeIdentityCases: {
    readonly name: string;
    readonly expectedArguments: readonly unknown[];
    readonly receiptFields?: Readonly<Record<string, unknown>>;
  }[] = [
    { name: '省略原请求身份', expectedArguments: [] },
    { name: '原请求身份为未定义值', expectedArguments: [undefined] },
    { name: '原请求身份为空值', expectedArguments: [null] },
    { name: '原请求身份为空对象', expectedArguments: [{}] },
    { name: '原请求身份为字符串', expectedArguments: ['original-id'] },
    { name: '原请求身份为数值', expectedArguments: [0] },
    { name: '原请求身份为布尔值', expectedArguments: [false] },
    { name: '原请求身份为大整数', expectedArguments: [1n] },
    { name: '原请求身份为符号', expectedArguments: [Symbol('原请求身份')] },
    { name: '原请求身份为数组', expectedArguments: [[]] },
    { name: '仅提供原操作标识', expectedArguments: [{ id: ORDER_CANCEL_REQUEST.id }] },
    {
      name: '仅提供原操作标识与种类',
      expectedArguments: [{ id: ORDER_CANCEL_REQUEST.id, kind: ORDER_CANCEL_REQUEST.kind }],
    },
    {
      name: '原请求身份缺少目标类型',
      expectedArguments: [
        {
          id: ORDER_CANCEL_REQUEST.id,
          kind: ORDER_CANCEL_REQUEST.kind,
          targetId: ORDER_CANCEL_REQUEST.targetId,
        },
      ],
    },
    {
      name: '原请求身份缺少目标标识',
      expectedArguments: [
        {
          id: ORDER_CANCEL_REQUEST.id,
          kind: ORDER_CANCEL_REQUEST.kind,
          targetType: ORDER_CANCEL_REQUEST.targetType,
        },
      ],
    },
    {
      name: '原请求与回执均使用未知操作种类',
      expectedArguments: [{ ...ORDER_CANCEL_REQUEST, kind: 'FUTURE_KIND' }],
      receiptFields: { kind: 'FUTURE_KIND' },
    },
    ...identityFields.flatMap((field) =>
      invalidFieldValues.map(({ name, value }) => ({
        name: `必填字段 ${field} 为${name}`,
        expectedArguments: [{ ...ORDER_CANCEL_REQUEST, [field]: value }],
        receiptFields: { [field]: value },
      })),
    ),
    ...invalidPairings.map(({ name, identity }) => ({
      name,
      expectedArguments: [identity],
      receiptFields: identity,
    })),
    ...[
      { name: '回执操作标识不匹配', receiptFields: { id: 'another-id' } },
      { name: '回执操作种类不匹配', receiptFields: { kind: 'TASK_CONTROL' } },
      { name: '回执操作种类未知', receiptFields: { kind: 'FUTURE_KIND' } },
      { name: '回执目标类型不匹配', receiptFields: { targetType: 'ACCOUNT' } },
      { name: '回执目标标识不匹配', receiptFields: { targetId: 'other-order' } },
    ].map(({ name, receiptFields }) => ({
      name,
      expectedArguments: [ORDER_CANCEL_REQUEST],
      receiptFields,
    })),
  ];

  it.each(
    terminalStatuses.flatMap((status) =>
      unsafeIdentityCases.map((identityCase) => ({ status, ...identityCase })),
    ),
  )(
    '$status 回执遇到 $name 时不能确认终态，公开匹配接口也必须拒绝',
    ({ status, expectedArguments, receiptFields }) => {
      // 让回执与非法身份具有相同字段，避免把逐字段相等误当成可信身份有效。
      const operation = { ...receipt(ORDER_CANCEL_REQUEST, { status }), ...receiptFields };
      const outcome = {
        ...httpError(409),
        receipt: { kind: 'valid', receipt: operation },
      };
      const assessment: WriteAssessment = Reflect.apply(classifyWriteOutcome, undefined, [
        outcome,
        ...expectedArguments,
      ]);

      expect(assessment.intent).toBe('unknown');
      expect(assessment.reason).toBe('receipt-mismatch');
      expect(Reflect.apply(receiptMatchesRequest, undefined, [operation, ...expectedArguments])).toBe(false);
    },
  );

  it.each(terminalStatuses.flatMap((status) => identityFields.map((field) => ({ status, field }))))(
    '$status 回执缺少 $field 时不能确认终态，公开匹配接口也必须拒绝',
    ({ status, field }) => {
      const operation: Record<string, unknown> = { ...receipt(ORDER_CANCEL_REQUEST, { status }) };
      delete operation[field];
      const outcome = {
        ...httpError(409),
        receipt: { kind: 'valid', receipt: operation },
      };
      const assessment: WriteAssessment = Reflect.apply(classifyWriteOutcome, undefined, [
        outcome,
        ORDER_CANCEL_REQUEST,
      ]);

      expect(assessment.intent).toBe('unknown');
      expect(assessment.reason).toBe('receipt-mismatch');
      expect(Reflect.apply(receiptMatchesRequest, undefined, [operation, ORDER_CANCEL_REQUEST])).toBe(false);
    },
  );

  it.each([
    { status: 'SUCCEEDED', intent: 'applied' },
    { status: 'REJECTED', intent: 'not-applied' },
    { status: 'PROCESSING', intent: 'unknown' },
    { status: 'UNKNOWN', intent: 'unknown' },
    { status: 'CONFLICT', intent: 'unknown' },
  ] as const)('完整身份匹配 $status 时仅采用该操作回执的 $intent 结论', ({ status, intent }) => {
    const operation = receipt(ORDER_CANCEL_REQUEST, { status });
    const assessment = classifyWriteOutcome(
      success({ ok: true }, { kind: 'valid', receipt: operation }),
      ORDER_CANCEL_REQUEST,
    );

    expect(assessment.attempt).toBe('accepted');
    expect(assessment.intent).toBe(intent);
    expect(receiptMatchesRequest(operation, ORDER_CANCEL_REQUEST)).toBe(true);
  });

  it.each([
    { status: 'SUCCEEDED', intent: 'applied' },
    { status: 'REJECTED', intent: 'not-applied' },
  ] as const)('非成功响应保留完整匹配的 $status 回执及 $intent 结论', ({ status, intent }) => {
    const outcome = httpError(502, validReceipt({ status }));
    const assessment = classifyWriteOutcome(outcome, ORDER_CANCEL_REQUEST);

    expect(assessment.attempt).toBe('unknown');
    expect(assessment.intent).toBe(intent);
    expect(isOperationPreserved(outcome)).toBe(true);
  });
});

describe('只读重试判定', () => {
  it('仅网络/超时与 429/5xx 可重试', () => {
    expect(
      isRetryableReadFailure({
        kind: 'transport-error',
        reason: 'network',
        attempted: true,
        message: 'net',
        sessionEpoch: 0,
      }),
    ).toBe(true);
    expect(
      isRetryableReadFailure({
        kind: 'transport-error',
        reason: 'aborted',
        attempted: false,
        message: 'abort',
        sessionEpoch: 0,
      }),
    ).toBe(false);
    expect(isRetryableReadFailure(httpError(502))).toBe(true);
    expect(isRetryableReadFailure(httpError(422))).toBe(false);
  });
});

describe('requireData 与错误描述', () => {
  it('成功返回 data，失败抛出可分类错误', () => {
    expect(requireData(success({ value: 1 }))).toEqual({ value: 1 });
    const outcome = httpError(502, validReceipt());
    expect(() => requireData(outcome)).toThrow(ApiOutcomeError);
    try {
      requireData(outcome);
    } catch (error) {
      expect(error).toBeInstanceOf(ApiOutcomeError);
      expect((error as ApiOutcomeError).outcome).toBe(outcome);
      expect(describeApiOutcome(outcome)).toContain('SUCCEEDED');
    }
  });

  it('超时提示不把结果说成失败', () => {
    const message = describeApiOutcome({
      kind: 'transport-error',
      reason: 'timeout',
      attempted: true,
      message: 'timeout',
      sessionEpoch: 0,
    });
    expect(message).toContain('结果未知');
    expect(message).toContain('不要更换标识');
  });

  it('非 2xx 但带可读 data（healthz 503）不被当作成功，也不丢失 data', () => {
    const outcome: ApiOutcome<{ status: string }> = {
      kind: 'http-data',
      status: 503,
      data: { status: 'degraded' },
      receipt: { kind: 'absent' },
      requestId: null,
      sessionEpoch: 0,
    };
    expect(classifyWriteOutcome(outcome, ORDER_CANCEL_REQUEST)).toMatchObject({
      attempt: 'unknown',
      intent: 'unknown',
    });
    expect(describeApiOutcome(outcome)).toContain('降级');
  });

  it('isOperationPreserved 只在有效回执时为真', () => {
    expect(isOperationPreserved(httpError(502, validReceipt()))).toBe(true);
    expect(isOperationPreserved(httpError(502, { kind: 'invalid', raw: {}, reason: 'unknown-status' }))).toBe(
      false,
    );
  });
});
