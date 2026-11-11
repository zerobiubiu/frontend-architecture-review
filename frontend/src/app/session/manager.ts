import type { QueryClient } from '@tanstack/react-query';
import type { AuthApi, AuthSessionData, AuthUser, LoginInput } from '@/features/auth/types';
import type { ApiOutcome } from '@/services/api/types';
import {
  createSessionBroadcast,
  parseSessionBroadcast,
  type SessionBroadcastChannel,
  type SessionBroadcastFactory,
  type SessionBroadcastMessage,
} from './broadcast';

export interface SessionSnapshot {
  readonly status:
    | 'initializing'
    | 'checking'
    | 'authenticated'
    | 'anonymous'
    | 'signing-in'
    | 'signing-out'
    | 'unavailable'
    | 'logout-unconfirmed';
  readonly epoch: number;
  readonly user: AuthUser | null;
  readonly error: string | null;
  readonly apiReachable: boolean | null;
}

export type SessionActionResult =
  | { readonly kind: 'success' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'stale' };

export interface SessionManagerOptions {
  readonly api: AuthApi;
  readonly queryClient: QueryClient;
  readonly broadcastFactory?: SessionBroadcastFactory;
  readonly now?: () => number;
  readonly recheckMinIntervalMs?: number;
}

interface AuthAction {
  readonly epoch: number;
  readonly lifecycle: number;
  readonly signal: AbortSignal;
  readonly cleared: Promise<void>;
}

const SUCCESS = { kind: 'success' } as const;
const STALE = { kind: 'stale' } as const;
const LOGOUT_UNCONFIRMED = '本地已清理，但服务端注销未确认。';

function isUnauthenticated(outcome: ApiOutcome<unknown>): boolean {
  return outcome.kind === 'http-error' && outcome.status === 401 && outcome.error.code === 'UNAUTHENTICATED';
}

function failureMessage(outcome: Exclude<ApiOutcome<unknown>, { kind: 'success' }>): string {
  switch (outcome.kind) {
    case 'http-error':
      return outcome.error.message;
    case 'transport-error':
      if (outcome.reason === 'timeout') return '认证请求超时，暂时无法确认会话';
      if (outcome.reason === 'aborted') return '认证请求已中断，暂时无法确认会话';
      return '网络不可达，暂时无法确认会话';
    case 'malformed':
      return '认证响应异常，无法确认会话';
    case 'http-data':
      return `认证接口返回异常状态（${outcome.status}），无法确认会话`;
  }
}

export class SessionManager {
  private readonly api: AuthApi;
  private readonly queryClient: QueryClient;
  private readonly broadcastFactory: SessionBroadcastFactory;
  private readonly now: () => number;
  private readonly recheckMinIntervalMs: number;
  private readonly listeners = new Set<() => void>();
  private snapshot: SessionSnapshot = Object.freeze({
    status: 'initializing',
    epoch: 0,
    user: null,
    error: null,
    apiReachable: null,
  });
  private csrfToken: string | null = null;
  private logoutCsrfToken: string | null = null;
  private sessionController = new AbortController();
  private lifecycleController = new AbortController();
  private active = false;
  private lifecycle = 0;
  private queue: Promise<void> = Promise.resolve();
  private pendingCheck: { readonly epoch: number; readonly promise: Promise<SessionActionResult> } | null =
    null;
  private lastCheckAt = Number.NEGATIVE_INFINITY;
  private channel: SessionBroadcastChannel | null = null;
  private channelListener: ((event: MessageEvent<unknown>) => void) | null = null;
  private announcedEpoch: number | null = null;
  private remoteChanging = false;
  private remoteCheckPending = false;
  private remoteCheckQueued = false;
  private remoteCheckVersion = 0;
  private remoteTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: SessionManagerOptions) {
    this.api = options.api;
    this.queryClient = options.queryClient;
    this.broadcastFactory = options.broadcastFactory ?? createSessionBroadcast;
    this.now = options.now ?? Date.now;
    this.recheckMinIntervalMs = options.recheckMinIntervalMs ?? 30_000;
    this.sessionController.abort();
  }

  getSnapshot = (): SessionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getCsrfToken = (): string | null => (this.snapshot.status === 'authenticated' ? this.csrfToken : null);

  getSessionSignal = (): AbortSignal => this.sessionController.signal;

  isCurrent = (epoch: number): boolean =>
    this.active && this.snapshot.status === 'authenticated' && this.snapshot.epoch === epoch;

  start(): void {
    if (this.active) return;
    this.active = true;
    this.lifecycle += 1;
    this.lifecycleController = new AbortController();
    const lifecycle = this.lifecycle;
    try {
      this.channel = this.broadcastFactory();
      this.channelListener = (event) => {
        if (!this.active || this.lifecycle !== lifecycle) return;
        const message = parseSessionBroadcast(event.data);
        if (message) this.receiveBroadcast(message);
      };
      this.channel?.addEventListener('message', this.channelListener);
    } catch {
      this.closeChannel();
    }
    // StrictMode 重挂载可以重新恢复，但不能悄悄撤销用户尚未确认的退出意图。
    if (this.snapshot.status !== 'logout-unconfirmed') void this.restore();
  }

  stop(): void {
    if (!this.active) return;
    const keepLogout = this.isLogoutLocked();
    this.active = false;
    this.lifecycle += 1;
    this.lifecycleController.abort();
    this.resetRemoteCheck();
    if (this.announcedEpoch !== null) this.settleBroadcast(this.announcedEpoch);
    this.closeChannel();
    this.isolate(
      keepLogout ? 'logout-unconfirmed' : 'initializing',
      keepLogout ? (this.snapshot.error ?? `${LOGOUT_UNCONFIRMED}请显式重试退出或重新核对。`) : null,
      keepLogout ? this.snapshot.apiReachable : null,
    );
  }

  invalidate = (epoch: number): void => {
    if (!this.isCurrent(epoch)) return;
    this.resetRemoteCheck();
    this.logoutCsrfToken = null;
    const action = this.isolate('anonymous', '会话已失效，请重新登录', true);
    if (!this.owns(action)) return;
    this.announceBroadcast(action.epoch);
    this.settleBroadcast(action.epoch);
  };

  restore(): Promise<SessionActionResult> {
    if (!this.active) return Promise.resolve(STALE);
    if (this.pendingCheck?.epoch === this.snapshot.epoch) return this.pendingCheck.promise;
    this.resetRemoteCheck();
    this.logoutCsrfToken = null;
    return this.beginCheck();
  }

  login(input: LoginInput): Promise<SessionActionResult> {
    if (!this.active) return Promise.resolve(STALE);
    this.resetRemoteCheck();
    this.logoutCsrfToken = null;
    const action = this.isolate('signing-in', null, this.snapshot.apiReachable);
    if (!this.owns(action)) return Promise.resolve(STALE);
    this.announceBroadcast(action.epoch);
    return this.enqueue(action, 'login', async () => {
      const outcome = await this.api.login(input, action.signal);
      if (!this.owns(action)) return STALE;
      if (outcome.kind === 'success') return this.authenticate(outcome.data);
      const message = failureMessage(outcome);
      // LOGIN_FAILED 是真实凭据拒绝；任意 401、403、5xx 或畸形响应不是同一含义。
      const rejected =
        outcome.kind === 'http-error' && outcome.status === 401 && outcome.error.code === 'LOGIN_FAILED';
      this.publish(
        rejected || isUnauthenticated(outcome) ? 'anonymous' : 'unavailable',
        message,
        outcome.kind !== 'transport-error',
      );
      return { kind: 'error', message };
    });
  }

  logout(): Promise<SessionActionResult> {
    if (!this.active) return Promise.resolve(STALE);
    const token = this.csrfToken ?? this.logoutCsrfToken;
    this.resetRemoteCheck();
    this.logoutCsrfToken = token;
    const action = this.isolate('signing-out', null, this.snapshot.apiReachable);
    if (!this.owns(action)) return Promise.resolve(STALE);
    this.announceBroadcast(action.epoch);
    return this.enqueue(action, 'logout', async () => {
      let csrfToken = token;
      // 登录响应可能尚未完成，旧结果不能入 UI；等它结束后只为本次注销读取 CSRF。
      if (!csrfToken) {
        this.lastCheckAt = this.now();
        const session = await this.api.me(action.signal);
        if (!this.owns(action)) return STALE;
        if (isUnauthenticated(session)) return this.confirmAnonymous();
        if (session.kind !== 'success')
          return this.failLogout(failureMessage(session), session.kind !== 'transport-error');
        csrfToken = session.data.csrfToken;
        this.logoutCsrfToken = csrfToken;
      }
      if (!this.owns(action)) return STALE;
      const outcome = await this.api.logout(csrfToken, action.signal);
      if (!this.owns(action)) return STALE;
      if (outcome.kind === 'success' || isUnauthenticated(outcome)) return this.confirmAnonymous();
      // 已明确失效的 CSRF 不反复重用；下次显式退出才能受控 /me，然后发送一次退出。
      if (outcome.kind === 'http-error' && outcome.error.code === 'CSRF_INVALID') this.logoutCsrfToken = null;
      return this.failLogout(failureMessage(outcome), outcome.kind !== 'transport-error');
    });
  }

  verifyFromSignal(epoch = this.snapshot.epoch): Promise<SessionActionResult> {
    if (!this.active || epoch !== this.snapshot.epoch || this.isLogoutLocked()) return Promise.resolve(STALE);
    if (this.pendingCheck?.epoch === epoch) return this.pendingCheck.promise;
    if (this.snapshot.status !== 'authenticated') return Promise.resolve(STALE);
    if (this.now() - this.lastCheckAt < this.recheckMinIntervalMs) return Promise.resolve(STALE);
    return this.beginCheck();
  }

  private beginCheck(): Promise<SessionActionResult> {
    const action = this.isolate('checking', null, this.snapshot.apiReachable);
    if (!this.owns(action)) return Promise.resolve(STALE);
    const promise = this.enqueue(action, 'check', async () => {
      this.lastCheckAt = this.now();
      // /me 只读取既有 Cookie 对应的身份和 CSRF，不轮换令牌，也不重新广播。
      const outcome = await this.api.me(action.signal);
      if (!this.owns(action)) return STALE;
      if (outcome.kind === 'success') return this.authenticate(outcome.data);
      if (isUnauthenticated(outcome)) return this.confirmAnonymous();
      const message = failureMessage(outcome);
      this.publish('unavailable', message, outcome.kind !== 'transport-error');
      return { kind: 'error', message };
    });
    const pending = { epoch: action.epoch, promise };
    this.pendingCheck = pending;
    void promise.then(() => {
      if (this.pendingCheck === pending) this.pendingCheck = null;
    });
    return promise;
  }

  private owns(action: AuthAction): boolean {
    return this.active && this.lifecycle === action.lifecycle && this.snapshot.epoch === action.epoch;
  }

  private enqueue(
    action: AuthAction,
    kind: 'login' | 'logout' | 'check',
    run: () => Promise<SessionActionResult>,
  ): Promise<SessionActionResult> {
    const result = this.queue.then(async (): Promise<SessionActionResult> => {
      try {
        await action.cleared;
        if (!this.owns(action)) return STALE;
        // 新动作只取消业务代次，不中断在途认证；否则迟到 Set-Cookie 会与后发认证交错。
        const outcome = await run();
        return this.owns(action) ? outcome : STALE;
      } catch {
        if (!this.owns(action)) return STALE;
        const message = '认证请求失败，暂时无法确认会话';
        if (kind === 'logout') return this.failLogout(message, false);
        this.publish('unavailable', message, false);
        return { kind: 'error', message };
      } finally {
        this.settleBroadcast(action.epoch);
      }
    });
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private isolate(
    status: SessionSnapshot['status'],
    error: string | null,
    apiReachable: boolean | null,
  ): AuthAction {
    const epoch = this.snapshot.epoch + 1;
    const lifecycle = this.lifecycle;
    const signal = this.lifecycleController.signal;
    this.csrfToken = null;
    this.snapshot = Object.freeze({ status, epoch, user: null, error, apiReachable });
    this.sessionController.abort();
    const cleared = this.queryClient.cancelQueries();
    this.queryClient.clear();
    this.notify();
    return { epoch, lifecycle, signal, cleared };
  }

  private authenticate(data: AuthSessionData): SessionActionResult {
    // 登录成功同样是身份核对的起点，避免初始 users 通知立即触发 /me 与 SSE 重建。
    this.lastCheckAt = this.now();
    this.csrfToken = data.csrfToken;
    this.logoutCsrfToken = null;
    this.sessionController = new AbortController();
    this.snapshot = Object.freeze({
      status: 'authenticated',
      epoch: this.snapshot.epoch,
      user: Object.freeze({ ...data.user }),
      error: null,
      apiReachable: true,
    });
    this.notify();
    return SUCCESS;
  }

  private confirmAnonymous(): SessionActionResult {
    this.csrfToken = null;
    this.logoutCsrfToken = null;
    this.publish('anonymous', null, true);
    return SUCCESS;
  }

  private failLogout(detail: string, apiReachable: boolean): SessionActionResult {
    const message = `${LOGOUT_UNCONFIRMED}${detail}。请显式重试退出或重新核对。`;
    this.publish('logout-unconfirmed', message, apiReachable);
    return { kind: 'error', message };
  }

  private publish(
    status: SessionSnapshot['status'],
    error: string | null,
    apiReachable: boolean | null,
  ): void {
    this.snapshot = Object.freeze({ ...this.snapshot, status, user: null, error, apiReachable });
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private isLogoutLocked(): boolean {
    return this.snapshot.status === 'signing-out' || this.snapshot.status === 'logout-unconfirmed';
  }

  private postBroadcast(message: SessionBroadcastMessage): void {
    try {
      this.channel?.postMessage(message);
    } catch {
      // 跨标签通知是可选能力；失败不能改变当前服务端认证结果。
    }
  }

  private announceBroadcast(epoch: number): void {
    if (this.announcedEpoch === null) this.postBroadcast({ type: 'session-changing' });
    this.announcedEpoch = epoch;
  }

  private settleBroadcast(epoch: number): void {
    if (this.announcedEpoch !== epoch) return;
    this.announcedEpoch = null;
    this.postBroadcast({ type: 'session-settled' });
  }

  private receiveBroadcast(message: SessionBroadcastMessage): void {
    if (message.type === 'session-changing') {
      if (this.remoteChanging) return;
      this.resetRemoteCheck();
      this.remoteChanging = true;
      this.logoutCsrfToken = null;
      const locked = this.isLogoutLocked();
      this.isolate(
        locked ? 'logout-unconfirmed' : 'checking',
        locked
          ? (this.snapshot.error ?? `${LOGOUT_UNCONFIRMED}其他标签页正在变更会话，请显式重新核对。`)
          : null,
        this.snapshot.apiReachable,
      );
      return;
    }
    if (this.isLogoutLocked()) return;
    const alreadyIsolated = this.remoteChanging || this.remoteCheckPending;
    this.remoteChanging = false;
    if (!alreadyIsolated) this.isolate('checking', null, this.snapshot.apiReachable);
    this.remoteCheckPending = true;
    this.scheduleRemoteCheck();
  }

  private scheduleRemoteCheck(): void {
    if (this.remoteCheckQueued || this.remoteTimer !== undefined) return;
    this.remoteCheckQueued = true;
    const lifecycle = this.lifecycle;
    const version = this.remoteCheckVersion;
    queueMicrotask(() => {
      if (!this.active || this.lifecycle !== lifecycle || this.remoteCheckVersion !== version) return;
      this.remoteCheckQueued = false;
      if (!this.remoteCheckPending || this.remoteChanging || this.isLogoutLocked()) return;
      const remaining = this.lastCheckAt + this.recheckMinIntervalMs - this.now();
      if (remaining > 0) {
        this.remoteTimer = setTimeout(() => {
          this.remoteTimer = undefined;
          this.scheduleRemoteCheck();
        }, remaining);
        return;
      }
      this.remoteCheckPending = false;
      void this.beginCheck();
    });
  }

  private resetRemoteCheck(): void {
    clearTimeout(this.remoteTimer);
    this.remoteTimer = undefined;
    this.remoteCheckVersion += 1;
    this.remoteChanging = false;
    this.remoteCheckPending = false;
    this.remoteCheckQueued = false;
  }

  private closeChannel(): void {
    if (this.channel && this.channelListener)
      this.channel.removeEventListener('message', this.channelListener);
    try {
      this.channel?.close();
    } catch {
      // 页面卸载时通道可能已经关闭。
    }
    this.channel = null;
    this.channelListener = null;
  }
}
