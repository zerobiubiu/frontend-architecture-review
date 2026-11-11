import type { ApiOutcome, OperationKind, OperationReceipt, OperationTargetType, ReceiptParse } from './types';

/**
 * 写请求评估拆成两个维度：
 * - attempt：本次 HTTP 尝试是否发出/是否被接受；
 * - intent：原订单/原操作（同一原 ID）是否已经应用。
 *
 * 关键约束：本次尝试被拒（401/403/404/409/422/429、operationAccepted:false）只描述当前请求，
 * 不能证明同一原 ID 以前的一次未知尝试没有执行。原意图结论只能来自与请求 id/kind/target
 * 匹配的可信回执。
 */
export type HttpAttemptClass = 'not-sent' | 'rejected' | 'accepted' | 'unknown';
export type IntentClass = 'applied' | 'not-applied' | 'unknown';

export type AssessmentReason =
  | 'receipt-applied'
  | 'receipt-rejected'
  | 'receipt-pending'
  | 'receipt-absent'
  | 'receipt-invalid'
  | 'receipt-mismatch'
  | 'transport-before-send'
  | 'transport-unknown'
  | 'http-attempt-rejected'
  | 'http-attempt-unknown'
  | 'protocol-malformed'
  | 'local-precheck';

export interface WriteAssessment {
  readonly attempt: HttpAttemptClass;
  readonly intent: IntentClass;
  readonly reason: AssessmentReason;
}

// 与后端受跟踪操作的请求描述符一致；现有八种操作都必须关联目标。
const OPERATION_TARGET_BY_KIND = {
  ORDER_CANCEL: 'ORDER',
  TASK_CONTROL: 'TASK',
  USER_UPDATE: 'USER',
  ACCOUNT_RESTRICT: 'ACCOUNT',
  ACCOUNT_CHECK: 'ACCOUNT',
  ACCOUNT_SYNC: 'ACCOUNT',
  ACCOUNT_RECONCILE: 'ACCOUNT',
  PLATFORM_UPDATE: 'PLATFORM',
} as const satisfies Record<OperationKind, OperationTargetType>;

/** 发送前确定的完整原请求身份；不得从响应回执反向构造后与自身比较。 */
export type OriginalOperationIdentity = {
  [Kind in OperationKind]: {
    readonly id: string;
    readonly kind: Kind;
    readonly targetType: (typeof OPERATION_TARGET_BY_KIND)[Kind];
    readonly targetId: Kind extends 'PLATFORM_UPDATE' ? 'platform' : string;
  };
}[OperationKind];

/** 在发送前被本地规则拦截：确定未发送，但同样不能证明原意图此前未执行。 */
export const LOCAL_PRE_SEND_REJECTION: WriteAssessment = {
  attempt: 'not-sent',
  intent: 'unknown',
  reason: 'local-precheck',
};

/** 只有完整、合法且逐字段匹配的原请求身份，才能采用回执结论。 */
export function receiptMatchesRequest(
  receipt: OperationReceipt,
  expected: OriginalOperationIdentity,
): boolean {
  // 此公共边界也可能由 JavaScript 或绕过类型的调用者进入，不能只依赖静态签名。
  if (
    typeof expected !== 'object' ||
    expected === null ||
    Array.isArray(expected) ||
    typeof expected.id !== 'string' ||
    expected.id.trim().length === 0 ||
    typeof expected.kind !== 'string' ||
    !Object.hasOwn(OPERATION_TARGET_BY_KIND, expected.kind) ||
    typeof expected.targetType !== 'string' ||
    typeof expected.targetId !== 'string' ||
    expected.targetId.trim().length === 0 ||
    OPERATION_TARGET_BY_KIND[expected.kind] !== expected.targetType ||
    (expected.kind === 'PLATFORM_UPDATE' && expected.targetId !== 'platform')
  ) {
    return false;
  }
  return (
    receipt.id === expected.id &&
    receipt.kind === expected.kind &&
    receipt.targetType === expected.targetType &&
    receipt.targetId === expected.targetId
  );
}

const OPERATION_INTENT: Record<OperationReceipt['status'], IntentClass> = {
  SUCCEEDED: 'applied',
  REJECTED: 'not-applied',
  PROCESSING: 'unknown',
  UNKNOWN: 'unknown',
  CONFLICT: 'unknown',
};

function assessReceipt(
  receipt: ReceiptParse,
  expected: OriginalOperationIdentity,
): { readonly intent: IntentClass; readonly reason: AssessmentReason } {
  if (receipt.kind === 'absent') return { intent: 'unknown', reason: 'receipt-absent' };
  if (receipt.kind === 'invalid') return { intent: 'unknown', reason: 'receipt-invalid' };
  if (!receiptMatchesRequest(receipt.receipt, expected)) {
    return { intent: 'unknown', reason: 'receipt-mismatch' };
  }
  const intent = OPERATION_INTENT[receipt.receipt.status];
  if (intent === 'applied') return { intent, reason: 'receipt-applied' };
  if (intent === 'not-applied') return { intent, reason: 'receipt-rejected' };
  return { intent, reason: 'receipt-pending' };
}

/**
 * 评估一次写请求结果；完整身份必须来自发送前保存的原请求上下文。
 * 身份缺失、不完整或错配统一保留 unknown / receipt-mismatch。
 * applied 仅表示该种操作的匹配回执结论，不等于订单成交、任务完成或同步成功。
 */
export function classifyWriteOutcome(
  outcome: ApiOutcome<unknown>,
  expected: OriginalOperationIdentity,
): WriteAssessment {
  switch (outcome.kind) {
    case 'success': {
      const receipt = assessReceipt(outcome.receipt, expected);
      return { attempt: 'accepted', intent: receipt.intent, reason: receipt.reason };
    }
    case 'http-data': {
      const attempt: HttpAttemptClass = outcome.status < 500 ? 'rejected' : 'unknown';
      return { attempt, ...assessReceipt(outcome.receipt, expected) };
    }
    case 'http-error': {
      const attempt: HttpAttemptClass = outcome.status < 500 ? 'rejected' : 'unknown';
      return { attempt, ...assessReceipt(outcome.receipt, expected) };
    }
    case 'transport-error':
      return outcome.attempted
        ? { attempt: 'unknown', intent: 'unknown', reason: 'transport-unknown' }
        : { attempt: 'not-sent', intent: 'unknown', reason: 'transport-before-send' };
    case 'malformed': {
      const receipt = assessReceipt(outcome.receipt, expected);
      return { attempt: 'unknown', intent: receipt.intent, reason: receipt.reason };
    }
  }
}

/** 非 2xx / 畸形响应是否仍带回了可用的原操作回执。 */
export function isOperationPreserved(outcome: ApiOutcome<unknown>): outcome is Extract<
  ApiOutcome<unknown>,
  { kind: 'http-error' }
> & {
  receipt: { kind: 'valid'; receipt: OperationReceipt };
} {
  return outcome.kind === 'http-error' && outcome.receipt.kind === 'valid';
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
  if (outcome.kind === 'http-error' || outcome.kind === 'http-data') {
    return RETRYABLE_READ_STATUSES[outcome.status] === true;
  }
  return false;
}

export function describeApiOutcome(outcome: ApiOutcome<unknown>): string {
  switch (outcome.kind) {
    case 'success':
      return outcome.receipt.kind === 'valid'
        ? `请求已完成（回执 ${outcome.receipt.receipt.status}）`
        : '请求已完成，但未携带可识别的原操作回执';
    case 'http-data':
      return `服务器返回 ${outcome.status}，仅可读取降级/诊断数据，不代表业务成功`;
    case 'http-error':
      return outcome.receipt.kind === 'valid'
        ? `${outcome.error.message}（原操作回执：${outcome.receipt.receipt.status}）`
        : outcome.error.message;
    case 'transport-error':
      return outcome.reason === 'timeout'
        ? '请求超时，结果未知；请按原操作标识核对，不要更换标识重发'
        : outcome.reason === 'aborted'
          ? outcome.attempted
            ? '请求已发出后取消，结果未知'
            : '请求已取消（尚未发送）'
          : '网络异常，结果未知；请按原操作标识核对';
    case 'malformed':
      return `${outcome.message}；请按原操作标识核对`;
  }
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

/** 提交前生成的 UUID v4 原操作标识；创建后必须持久化，恢复时使用同一个值。 */
export function createOperationId(cryptoImpl: Crypto = globalThis.crypto): string {
  return cryptoImpl.randomUUID();
}

/** 读取有效回执；invalid/absent 返回 null，调用方不得把 null 当作“未执行”。 */
export function validReceiptOf(outcome: ApiOutcome<unknown>): OperationReceipt | null {
  if (outcome.kind === 'transport-error') return null;
  return outcome.receipt.kind === 'valid' ? outcome.receipt.receipt : null;
}
