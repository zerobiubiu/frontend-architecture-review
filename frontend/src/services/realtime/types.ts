/**
 * 业务 SSE（`GET /api/v1/events`）的帧类型。
 *
 * 该通道只发送“资源已变化”的提示，不含业务对象；收到 `error` 帧必须立即关闭连接，
 * 不能让 EventSource 自动重连刷配额。本阶段只做协议解析，不建立真实连接。
 *
 * `resources` 在后端公开 schema 中是可选的：缺省表示“在授权范围内做一次全量收敛”，
 * 明确空数组表示“本次没有资源变化”，两者不能合并成同一个信号。
 */
export const BUSINESS_RESOURCES = [
  'orders',
  'tasks',
  'accounts',
  'ledger',
  'events',
  'settings',
  'users',
  'audit',
  'worker',
] as const;

export type BusinessResource = (typeof BUSINESS_RESOURCES)[number];

export interface BusinessRefreshFrame {
  readonly kind: 'refresh';
  /** declared：服务端给出了明确资源列表；all：缺省 resources，需要一次有界全量收敛。 */
  readonly scope: 'declared' | 'all';
  /** 已知资源（all 时为全部已知资源）；空数组表示明确无变化。 */
  readonly resources: readonly BusinessResource[];
  /** 服务端返回但当前版本不认识的资源名，保留用于诊断，不当作已知资源失效。 */
  readonly unknownResources: readonly string[];
  readonly at: string | null;
  readonly requestId: string | null;
}

export interface BusinessErrorFrame {
  readonly kind: 'error';
  readonly code: string;
  readonly message: string;
  readonly requestId: string | null;
}

/** 无法识别的帧：调用方应忽略本帧（不做全站刷新），并记录诊断信息。 */
export interface BusinessInvalidFrame {
  readonly kind: 'invalid';
  readonly reason: string;
  readonly raw: string;
}

export type BusinessFrame = BusinessRefreshFrame | BusinessErrorFrame | BusinessInvalidFrame;
