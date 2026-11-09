/**
 * API 协议类型骨架。
 *
 * 只描述后端已公开的响应信封（`data` / `error` / `operation`）与真实回执字段；
 * 不预先编造具体业务 DTO。业务 DTO 等对应接口接入时再按后端契约补充。
 */

export type OperationStatus = 'PROCESSING' | 'SUCCEEDED' | 'REJECTED' | 'UNKNOWN' | 'CONFLICT';

export type OperationKind =
  | 'ORDER_CANCEL'
  | 'TASK_CONTROL'
  | 'USER_UPDATE'
  | 'ACCOUNT_RESTRICT'
  | 'ACCOUNT_CHECK'
  | 'ACCOUNT_SYNC'
  | 'ACCOUNT_RECONCILE'
  | 'PLATFORM_UPDATE';

export type OperationTargetType = 'ORDER' | 'TASK' | 'USER' | 'ACCOUNT' | 'PLATFORM';

/**
 * 原操作回执（单一时态形状）。
 *
 * 必填的只有识别该次操作所需的 id / kind / status；契约中其余字段在运行时可缺失或为 null，
 * 因此这里统一表达为可空，解析时缺失即填 null，绝不用默认业务值补造。
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

/** 后端统一错误体；`operationAccepted: false` 表示请求未被接受。 */
export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  readonly requestId: string | null;
  readonly operationAccepted?: false;
  readonly details?: unknown;
}

export type TransportFailureReason = 'network' | 'timeout' | 'aborted';

/**
 * HTTP 结果信封：HTTP 非 2xx 不抛异常，也不丢弃 `operation`。
 * - `http-error`：拿到了 HTTP 响应，可能同时带原操作回执；
 * - `transport-error`：没有可用的 HTTP 响应（网络/超时/取消），写请求一律按“未知”处理；
 * - `malformed`：有响应但结构不符合协议，同样不能断言业务未执行。
 */
export type ApiOutcome<T> =
  | {
      readonly kind: 'success';
      readonly status: number;
      readonly data: T;
      readonly operation: OperationReceipt | null;
      readonly requestId: string | null;
      readonly sessionEpoch: number;
    }
  | {
      readonly kind: 'http-error';
      readonly status: number;
      readonly error: ApiErrorBody;
      readonly operation: OperationReceipt | null;
      readonly sessionEpoch: number;
    }
  | {
      readonly kind: 'transport-error';
      readonly reason: TransportFailureReason;
      readonly message: string;
      readonly sessionEpoch: number;
    }
  | {
      readonly kind: 'malformed';
      readonly status: number;
      readonly message: string;
      readonly body: unknown;
      readonly operation: OperationReceipt | null;
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
