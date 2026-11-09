import { describe, expect, it } from 'vitest';
import {
  ApiOutcomeError,
  classifyWriteOutcome,
  describeApiOutcome,
  isOperationPreserved,
  isRetryableReadFailure,
  requireData,
} from '@/services/api/errors';
import type { ApiOutcome } from '@/services/api/types';
import { receipt } from '../msw/fixtures';

const success = <T>(data: T): ApiOutcome<T> => ({
  kind: 'success',
  status: 200,
  data,
  operation: null,
  requestId: null,
  sessionEpoch: 1,
});

describe('写请求结果分类', () => {
  it('2xx + SUCCEEDED 回执视为已应用', () => {
    const outcome: ApiOutcome<unknown> = {
      kind: 'success',
      status: 200,
      data: { ok: true },
      operation: receipt({ status: 'SUCCEEDED' }),
      requestId: null,
      sessionEpoch: 1,
    };
    expect(classifyWriteOutcome(outcome)).toBe('applied');
  });

  it('502 带 SUCCEEDED 回执仍视为已应用，而不是失败', () => {
    const outcome: ApiOutcome<unknown> = {
      kind: 'http-error',
      status: 502,
      error: { code: 'WALLET_READ_FAILED', message: '钱包读取失败', requestId: 'r1' },
      operation: receipt({ status: 'SUCCEEDED' }),
      sessionEpoch: 0,
    };
    expect(isOperationPreserved(outcome)).toBe(true);
    expect(classifyWriteOutcome(outcome)).toBe('applied');
  });

  it('429 + UNKNOWN 回执视为未知，禁止换 ID 重发', () => {
    const outcome: ApiOutcome<unknown> = {
      kind: 'http-error',
      status: 429,
      error: { code: 'RATE_LIMITED', message: '限流', requestId: 'r2' },
      operation: receipt({ status: 'UNKNOWN' }),
      sessionEpoch: 0,
    };
    expect(classifyWriteOutcome(outcome)).toBe('unknown');
  });

  it('PROCESSING / CONFLICT 回执同样是未知', () => {
    for (const status of ['PROCESSING', 'CONFLICT'] as const) {
      const outcome: ApiOutcome<unknown> = {
        kind: 'http-error',
        status: 409,
        error: { code: 'BUSY', message: '对象忙', requestId: 'r3' },
        operation: receipt({ status }),
        sessionEpoch: 0,
      };
      expect(classifyWriteOutcome(outcome)).toBe('unknown');
    }
  });

  it('无回执的 4xx 视为未应用，5xx 视为未知', () => {
    const unauthenticated: ApiOutcome<unknown> = {
      kind: 'http-error',
      status: 401,
      error: { code: 'UNAUTHENTICATED', message: '请先登录', requestId: 'r4' },
      operation: null,
      sessionEpoch: 0,
    };
    expect(classifyWriteOutcome(unauthenticated)).toBe('rejected');

    const gateway: ApiOutcome<unknown> = {
      kind: 'http-error',
      status: 503,
      error: { code: 'UNAVAILABLE', message: '不可用', requestId: 'r5' },
      operation: null,
      sessionEpoch: 0,
    };
    expect(classifyWriteOutcome(gateway)).toBe('unknown');
  });

  it('超时与结构异常一律是未知结果', () => {
    expect(
      classifyWriteOutcome({
        kind: 'transport-error',
        reason: 'timeout',
        message: 'timeout',
        sessionEpoch: 0,
      }),
    ).toBe('unknown');
    expect(
      classifyWriteOutcome({
        kind: 'malformed',
        status: 200,
        message: 'bad body',
        body: '<html>',
        operation: null,
        sessionEpoch: 0,
      }),
    ).toBe('unknown');
  });
});

describe('只读重试判定', () => {
  it('仅网络/超时与 429/5xx 可重试', () => {
    expect(
      isRetryableReadFailure({
        kind: 'transport-error',
        reason: 'network',
        message: 'net',
        sessionEpoch: 0,
      }),
    ).toBe(true);
    expect(
      isRetryableReadFailure({
        kind: 'transport-error',
        reason: 'aborted',
        message: 'abort',
        sessionEpoch: 0,
      }),
    ).toBe(false);
    expect(
      isRetryableReadFailure({
        kind: 'http-error',
        status: 502,
        error: { code: 'BAD_GATEWAY', message: '502', requestId: null },
        operation: null,
        sessionEpoch: 0,
      }),
    ).toBe(true);
    expect(
      isRetryableReadFailure({
        kind: 'http-error',
        status: 422,
        error: { code: 'VALIDATION_ERROR', message: '422', requestId: null },
        operation: null,
        sessionEpoch: 0,
      }),
    ).toBe(false);
  });
});

describe('requireData 与错误描述', () => {
  it('成功返回 data，失败抛出可分类错误', () => {
    expect(requireData(success({ value: 1 }))).toEqual({ value: 1 });
    const outcome: ApiOutcome<{ value: number }> = {
      kind: 'http-error',
      status: 502,
      error: { code: 'BAD_GATEWAY', message: '网关错误', requestId: 'r6' },
      operation: receipt({ status: 'SUCCEEDED' }),
      sessionEpoch: 0,
    };
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
      message: 'timeout',
      sessionEpoch: 0,
    });
    expect(message).toContain('结果未知');
    expect(message).toContain('不要更换标识');
  });
});
