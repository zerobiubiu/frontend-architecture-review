/**
 * API 协议类型骨架。
 *
 * 只描述后端已公开的响应信封（`data` / `error` / `operation`）与真实回执字段；
 * 不预先编造具体业务 DTO。业务 DTO 等对应接口接入时再按后端契约补充。
 */

export const OPERATION_STATUSES = ['PROCESSING', 'SUCCEEDED', 'REJECTED', 'UNKNOWN', 'CONFLICT'] as const;
export type OperationStatus = (typeof OPERATION_STATUSES)[number];

export const OPERATION_KINDS = [
  'ORDER_CANCEL',
  'TASK_CONTROL',
  'USER_UPDATE',
  'ACCOUNT_RESTRICT',
  'ACCOUNT_CHECK',
  'ACCOUNT_SYNC',
  'ACCOUNT_RECONCILE',
  'PLATFORM_UPDATE',
] as const;
export type OperationKind = (typeof OPERATION_KINDS)[number];

export const OPERATION_TARGET_TYPES = ['ORDER', 'TASK', 'USER', 'ACCOUNT', 'PLATFORM'] as const;
export type OperationTargetType = (typeof OPERATION_TARGET_TYPES)[number];

/**
 * 原操作回执（单一时态形状）。
 *
 * 后端公开回执要求完整的 id / kind / targetType / targetId / status 等字段。
 * 本层为诊断保留不完整回执，解析时目标等缺失字段填 null；“可解析”不等于可采用终态，
 * 原意图结论仍须由 errors.ts 绑定发送前确定的完整原请求身份。
 */
export interface OperationReceipt {
  readonly id: string;
  readonly kind: string;
  readonly status: OperationStatus;
  readonly phase: string | null;
  readonly outcome: string | null;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly actorUserId: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly finishedAt: string | null;
  readonly result: Record<string, unknown> | null;
  readonly error: { readonly code: string; readonly message: string } | null;
  /** 原始回执对象：仅在排查/审计展示时读取，业务判断使用上面的收窄字段。 */
  readonly raw: unknown;
}

/**
 * 回执解析三态：
 * - absent：响应没有携带 operation；
 * - valid：结构可识别并已收窄；
 * - invalid：携带了 operation 但无法识别（未知 status/kind、缺 id 等），必须保留原始值诊断。
 */
export type ReceiptParse =
  | { readonly kind: 'absent' }
  | { readonly kind: 'valid'; readonly receipt: OperationReceipt }
  | { readonly kind: 'invalid'; readonly raw: unknown; readonly reason: string };

/** 后端统一错误体；`operationAccepted: false` 表示当前 HTTP 尝试未被接受。 */
export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  readonly requestId: string | null;
  readonly operationAccepted?: false;
  readonly details?: unknown;
}

export type TransportFailureReason = 'network' | 'timeout' | 'aborted';

/**
 * HTTP 结果信封：HTTP 非 2xx 不抛异常，也不丢弃回执。
 * - `success`：2xx 且含 `data`；
 * - `http-data`：非 2xx 但含可读 `data`（例如 /healthz 503 降级详情），不是业务成功；
 * - `http-error`：非 2xx 且符合公开错误信封；
 * - `transport-error`：没有可用 HTTP 响应；`attempted` 表示请求是否已经发出；
 * - `malformed`：有响应但结构不符合协议，不能断言业务未执行。
 */
export type ApiOutcome<T> =
  | {
      readonly kind: 'success';
      readonly status: number;
      readonly data: T;
      readonly receipt: ReceiptParse;
      readonly requestId: string | null;
      readonly sessionEpoch: number;
    }
  | {
      readonly kind: 'http-data';
      readonly status: number;
      readonly data: T;
      readonly receipt: ReceiptParse;
      readonly requestId: string | null;
      readonly sessionEpoch: number;
    }
  | {
      readonly kind: 'http-error';
      readonly status: number;
      readonly error: ApiErrorBody;
      readonly receipt: ReceiptParse;
      readonly sessionEpoch: number;
    }
  | {
      readonly kind: 'transport-error';
      readonly reason: TransportFailureReason;
      readonly attempted: boolean;
      readonly message: string;
      readonly sessionEpoch: number;
    }
  | {
      readonly kind: 'malformed';
      readonly status: number;
      readonly message: string;
      readonly body: unknown;
      readonly receipt: ReceiptParse;
      readonly sessionEpoch: number;
    };

export interface ApiRequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  /** 会话绑定的 CSRF Token；写请求必须显式提供（由会话模块注入）。 */
  readonly csrfToken?: string | null;
  /** 原操作 UUID；高风险控制操作必须由调用方在发送前持久化同一个值。 */
  readonly idempotencyKey?: string;
  readonly timeoutMs?: number;
  readonly credentials?: RequestCredentials;
}
