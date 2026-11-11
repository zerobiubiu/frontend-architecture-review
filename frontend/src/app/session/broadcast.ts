export type SessionBroadcastMessage = {
  readonly type: 'session-changing' | 'session-settled';
};

export interface SessionBroadcastChannel {
  postMessage(message: SessionBroadcastMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  close(): void;
}

export type SessionBroadcastFactory = () => SessionBroadcastChannel | null;

export function createSessionBroadcast(): SessionBroadcastChannel | null {
  // 只使用真实窗口的能力，避免 SSR/jsdom 意外创建 Node 的全局 BroadcastChannel。
  if (
    typeof window === 'undefined' ||
    window !== globalThis ||
    window.document.defaultView !== window ||
    typeof window.BroadcastChannel !== 'function' ||
    !(window.BroadcastChannel.prototype instanceof window.EventTarget)
  ) {
    return null;
  }
  return new window.BroadcastChannel('binance-stocks-session');
}

export function parseSessionBroadcast(value: unknown): SessionBroadcastMessage | null {
  if (typeof value !== 'object' || value === null || !('type' in value)) return null;
  if (value.type !== 'session-changing' && value.type !== 'session-settled') return null;
  // 附加身份、代次与令牌一律不读取；通知只允许触发本页重新向服务端核对。
  return { type: value.type };
}
