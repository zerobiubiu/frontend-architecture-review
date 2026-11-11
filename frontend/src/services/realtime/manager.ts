import type { QueryConvergence, SyncSession } from '@/app/business-sync/query-convergence';
import { automaticReconnectDelay, connectionBudget } from './connection-policy';
import { parseBusinessFrame } from './parse';

export interface BusinessSyncSnapshot {
  readonly status: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'degraded';
  readonly error: string | null;
  readonly retryAt: number | null;
}

export interface BusinessEventSource {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: Event) => void) | null;
  close(): void;
}

export type BusinessEventSourceFactory = (
  url: string,
  options: { readonly withCredentials: true },
) => BusinessEventSource;

interface BusinessSseOptions {
  readonly url: string;
  readonly getSession: () => SyncSession | null;
  readonly convergence: Pick<QueryConvergence, 'start' | 'stop' | 'reset' | 'refresh' | 'converge'>;
  readonly onUnauthorized: (epoch: number) => void;
  readonly onIdentityHint: (epoch: number) => void;
  readonly createEventSource?: BusinessEventSourceFactory;
  readonly now?: () => number;
}

const WINDOW_CONVERGENCE_MIN_MS = 1_000;

/** 原生自动重连被主动 close；所有后续建连统一经过本地预算和一个退避定时器。 */
export class BusinessSseManager {
  private readonly options: BusinessSseOptions;
  private readonly createEventSource: BusinessEventSourceFactory;
  private readonly now: () => number;
  private readonly listeners = new Set<() => void>();
  private snapshot: BusinessSyncSnapshot = { status: 'idle', error: null, retryAt: null };
  private running = false;
  private currentSession: SyncSession | null = null;
  private source: BusinessEventSource | null = null;
  private sourceGeneration = 0;
  private reconnectTimer: number | undefined;
  private listening = false;
  private lastWindowConvergenceAt = Number.NEGATIVE_INFINITY;
  // 预算与恢复上限不随 /me、epoch 或 StrictMode 重挂载清零。
  private readonly connectionAttempts: number[] = [];
  private lastActorId: string | null = null;
  private automaticRetries = 0;
  private degraded = false;
  private deniedEpoch: number | null = null;

  constructor(options: BusinessSseOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
    this.createEventSource = options.createEventSource ?? ((url, init) => new EventSource(url, init));
  }

  readonly getSnapshot = (): BusinessSyncSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(): void {
    if (this.running) return;
    this.running = true;
    this.options.convergence.start();
    this.reconcile();
  }

  stop(): void {
    this.running = false;
    this.closeConnection();
    this.clearReconnect();
    this.removeWindowListeners();
    this.currentSession = null;
    this.options.convergence.stop();
    this.update({ status: 'idle', error: null, retryAt: null });
  }

  reconcile(): void {
    if (!this.running) return;
    const session = this.options.getSession();
    if (this.sameSession(session, this.currentSession)) return;
    this.closeConnection();
    this.clearReconnect();
    this.removeWindowListeners();
    this.currentSession = session;
    this.options.convergence.reset();
    if (!session) {
      this.update({ status: 'idle', error: null, retryAt: null });
      return;
    }
    if (session.user.id !== this.lastActorId) {
      this.lastActorId = session.user.id;
      this.automaticRetries = 0;
      this.degraded = false;
      this.deniedEpoch = null;
    }
    this.addWindowListeners();
    if (this.deniedEpoch === session.epoch) {
      this.update({ status: 'idle', error: '业务会话已失效，请重新登录。', retryAt: null });
      return;
    }
    if (this.degraded) {
      this.update({
        status: 'degraded',
        error: '业务事件流已暂停，请显式重试。',
        retryAt: this.budgetRetryAt(),
      });
      return;
    }
    this.connect();
  }

  retry(): void {
    if (!this.running) return;
    this.reconcile();
    const session = this.currentSession;
    if (!session || this.source || this.deniedEpoch === session.epoch) return;
    this.clearReconnect();
    const retryAt = this.budgetRetryAt();
    if (retryAt !== null) {
      this.degraded = true;
      this.update({ status: 'degraded', error: '本地建连预算已用尽，请稍后显式重试。', retryAt });
      return;
    }
    this.degraded = false;
    this.automaticRetries = 0;
    this.connect();
  }

  private sameSession(left: SyncSession | null, right: SyncSession | null): boolean {
    return left === null || right === null
      ? left === right
      : left.epoch === right.epoch && left.user.id === right.user.id;
  }

  private isCurrent(session: SyncSession, generation: number, source: BusinessEventSource): boolean {
    return (
      this.running &&
      generation === this.sourceGeneration &&
      source === this.source &&
      this.sameSession(session, this.currentSession) &&
      this.sameSession(session, this.options.getSession())
    );
  }

  private budgetRetryAt(): number | null {
    const { expired, retryAt } = connectionBudget(this.connectionAttempts, this.now());
    if (expired > 0) this.connectionAttempts.splice(0, expired);
    return retryAt;
  }

  private connect(): void {
    const session = this.currentSession;
    if (
      !this.running ||
      !session ||
      this.source ||
      !this.sameSession(session, this.options.getSession()) ||
      this.degraded ||
      this.deniedEpoch === session.epoch
    ) {
      return;
    }
    const retryAt = this.budgetRetryAt();
    if (retryAt !== null) {
      this.degraded = true;
      this.update({ status: 'degraded', error: '本地建连预算已用尽，请稍后显式重试。', retryAt });
      return;
    }
    this.connectionAttempts.push(this.now());
    const generation = ++this.sourceGeneration;
    this.update({
      status: this.automaticRetries > 0 ? 'reconnecting' : 'connecting',
      error: null,
      retryAt: null,
    });
    if (
      !this.running ||
      generation !== this.sourceGeneration ||
      !this.sameSession(session, this.options.getSession())
    ) {
      return;
    }
    let source: BusinessEventSource;
    try {
      source = this.createEventSource(this.options.url, { withCredentials: true });
    } catch {
      this.recover('无法创建业务事件流连接。');
      return;
    }
    this.source = source;
    source.onopen = () => {
      if (!this.isCurrent(session, generation, source)) return;
      this.update({ status: 'open', error: null, retryAt: null });
      this.options.convergence.converge();
    };
    let hasBaseline = false;
    source.onmessage = (event) => {
      if (!this.isCurrent(session, generation, source)) return;
      const frame = parseBusinessFrame(event.data);
      if (frame.kind === 'invalid') return;
      if (frame.kind === 'refresh') {
        const isBaseline = !hasBaseline;
        hasBaseline = true;
        this.options.convergence.refresh(frame.resources);
        // 每连接首帧是收敛基线，不代表身份变更，避免 /me → 新 epoch → 首帧回环。
        if (!isBaseline && frame.scope === 'declared' && frame.resources.includes('users')) {
          this.options.onIdentityHint(session.epoch);
        }
        return;
      }
      this.closeConnection();
      if (frame.code === 'UNAUTHENTICATED') {
        this.clearReconnect();
        this.deniedEpoch = session.epoch;
        this.removeWindowListeners();
        this.update({ status: 'idle', error: frame.message, retryAt: null });
        this.options.onUnauthorized(session.epoch);
        return;
      }
      if (frame.code === 'EVENT_STREAM_UNAVAILABLE') {
        this.recover(frame.message);
        return;
      }
      this.clearReconnect();
      this.degraded = true;
      this.update({ status: 'degraded', error: frame.message, retryAt: null });
    };
    source.onerror = () => {
      if (!this.isCurrent(session, generation, source)) return;
      // error 事件没有可靠的 HTTP 状态；不可猜测 401/429，也不因此请求 /me。
      this.closeConnection();
      this.recover('业务事件流传输中断，正在有限重试。');
    };
  }

  private recover(error: string): void {
    this.clearReconnect();
    const session = this.currentSession;
    if (!session || !this.sameSession(session, this.options.getSession()) || !this.running) return;
    const delay = automaticReconnectDelay(this.automaticRetries);
    const budgetAt = this.budgetRetryAt();
    if (delay === undefined || budgetAt !== null) {
      this.degraded = true;
      this.update({ status: 'degraded', error, retryAt: budgetAt });
      return;
    }
    this.automaticRetries += 1;
    const generation = this.sourceGeneration;
    this.update({ status: 'reconnecting', error, retryAt: this.now() + delay });
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      if (
        !this.running ||
        generation !== this.sourceGeneration ||
        !this.sameSession(session, this.currentSession) ||
        !this.sameSession(session, this.options.getSession())
      ) {
        return;
      }
      this.connect();
    }, delay);
  }

  private closeConnection(): void {
    const source = this.source;
    this.source = null;
    this.sourceGeneration += 1;
    if (!source) return;
    source.onopen = null;
    source.onmessage = null;
    source.onerror = null;
    source.close();
  }

  private clearReconnect(): void {
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private addWindowListeners(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('focus', this.onWindowRecovery);
    window.addEventListener('online', this.onWindowRecovery);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private removeWindowListeners(): void {
    if (!this.listening) return;
    this.listening = false;
    window.removeEventListener('focus', this.onWindowRecovery);
    window.removeEventListener('online', this.onWindowRecovery);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') this.onWindowRecovery();
  };

  private readonly onWindowRecovery = (): void => {
    if (!this.running) return;
    this.reconcile();
    if (!this.currentSession || this.deniedEpoch === this.currentSession.epoch) return;
    const now = this.now();
    if (now - this.lastWindowConvergenceAt < WINDOW_CONVERGENCE_MIN_MS) return;
    this.lastWindowConvergenceAt = now;
    this.options.convergence.converge();
  };

  private update(next: BusinessSyncSnapshot): void {
    if (
      this.snapshot.status === next.status &&
      this.snapshot.error === next.error &&
      this.snapshot.retryAt === next.retryAt
    ) {
      return;
    }
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}
