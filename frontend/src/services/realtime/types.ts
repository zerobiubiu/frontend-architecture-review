/**
 * 业务 SSE（`GET /api/v1/events`）的帧类型。
 *
 * 该通道只发送“资源已变化”的提示，不含业务对象；收到 `error` 帧必须立即关闭连接，
 * 不能让 EventSource 自动重连刷配额。本阶段只做协议解析，不建立真实连接。
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
  readonly resources: readonly BusinessResource[];
  readonly at: string | null;
  readonly requestId: string | null;
}

export interface BusinessErrorFrame {
  readonly kind: 'error';
  readonly code: string;
  readonly message: string;
  readonly requestId: string | null;
}

export type BusinessFrame = BusinessRefreshFrame | BusinessErrorFrame;
