import type { ApiOutcome, OperationReceipt } from './types';

/**
 * 写请求结果分类（用于决定“刷新/重试/核对”，而不是直接报失败）：
 * - applied：已有证据表明操作被应用（含非 2xx + SUCCEEDED 回执）；
 * - rejected：已有证据表明本次未应用；
 * - unknown：没有可信终态，必须保留原标识核对，禁止换 ID 重发。
 */
export type WriteOutcomeClass = 'applied' | 'rejected' | 'unknown';

const OPERATION_CLASS: Record<OperationReceipt['status'], WriteOutcomeClass> = {
  SUCCEEDED: 'applied',
  REJECTED: 'rejected',
  PROCESSING: 'unknown',
  UNKNOWN: 'unknown',
  CONFLICT: 'unknown',
};

function classifyOperation(receipt: OperationReceipt): WriteOutcomeClass {
  return OPERATION_CLASS[receipt.status];
}

export function classifyWriteOutcome(outcome: ApiOutcome<unknown>): WriteOutcomeClass {
  switch (outcome.kind) {
    case 'success':
      return outcome.operation ? classifyOperation(outcome.operation) : 'applied';
    case 'http-error':
      if (outcome.operation) return classifyOperation(outcome.operation);
      // 4xx 尚未进入业务回调：已认证前置拒绝会带 operationAccepted:false；
      // 5xx 与无法识别的响应一律按未知处理，不自动重试。
      return outcome.status >= 400 && outcome.status < 500 ? 'rejected' : 'unknown';
    case 'transport-error':
    case 'malformed':
      return 'unknown';
  }
}

/** 非 2xx 是否仍带回了可用的原操作回执。 */
export function isOperationPreserved(
  outcome: ApiOutcome<unknown>,
): outcome is Extract<ApiOutcome<unknown>, { kind: 'http-error' }> & { operation: OperationReceipt } {
  return outcome.kind === 'http-error' && outcome.operation !== null;
}

const RETRYABLE_READ_STATUSES: Record<number, true> = {
  429: true,
  500: true,
  502: true,
  503: true,
  504: true,
};

/** 仅用于只读查询的重试判定；写请求永不自动重试。 */
export function isRetryableReadFailure(outcome: ApiOutcome<unknown>): boolean {
  if (outcome.kind === 'transport-error') return outcome.reason === 'network' || outcome.reason === 'timeout';
  if (outcome.kind === 'http-error') return RETRYABLE_READ_STATUSES[outcome.status] === true;
  return false;
}

export function describeApiOutcome(outcome: ApiOutcome<unknown>): string {
  switch (outcome.kind) {
    case 'success':
      return outcome.operation ? `请求已完成（回执 ${outcome.operation.status}）` : '请求已完成';
    case 'http-error':
      return outcome.operation
        ? `${outcome.error.message}（原操作回执：${outcome.operation.status}）`
        : outcome.error.message;
    case 'transport-error':
      return outcome.reason === 'timeout'
        ? '请求超时，结果未知；请按原操作标识核对，不要更换标识重发'
        : outcome.reason === 'aborted'
          ? '请求已取消'
          : '网络异常，结果未知；请按原操作标识核对';
    case 'malformed':
      return `${outcome.message}；请按原操作标识核对`;
  }
}

/** 提交前生成的 UUID v4 原操作标识；创建后必须持久化，恢复时使用同一个值。 */
export function createOperationId(cryptoImpl: Crypto = globalThis.crypto): string {
  return cryptoImpl.randomUUID();
}

/**
 * 查询层唯一允许抛出的错误类型：保留完整 outcome 供重试判定与恢复展示。
 * 只在明确“读取失败”的查询里使用；写请求仍应消费 outcome 本身。
 */
export class ApiOutcomeError extends Error {
  readonly outcome: ApiOutcome<unknown>;

  constructor(outcome: ApiOutcome<unknown>) {
    super(describeApiOutcome(outcome));
    this.name = 'ApiOutcomeError';
    this.outcome = outcome;
  }
}

/** 成功时返回 data；否则抛 ApiOutcomeError，绝不返回 undefined 冒充成功。 */
export function requireData<T>(outcome: ApiOutcome<T>): T {
  if (outcome.kind === 'success') return outcome.data;
  throw new ApiOutcomeError(outcome);
}
