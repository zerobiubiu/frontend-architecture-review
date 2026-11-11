import {
  type QuoteStreamQuery,
  type QuoteStreamSnapshot,
  type QuoteStreamStatus,
  quoteStreamEventSchema,
  quoteStreamQuerySchema,
} from '@project/api-contracts/validation';
import type { SyncSession } from '@/app/business-sync/query-convergence';
import { automaticReconnectDelay, connectionBudget } from './connection-policy';
import type { BusinessEventSource, BusinessEventSourceFactory } from './manager';

/** 客户端展示参考，不是后端交易 TTL，也不证明行情在交易所仍可执行。 */
export const MARKET_DISPLAY_REFERENCE_MS = 15_000;
export type MarketSubscription = QuoteStreamQuery;
export interface MarketQuoteSnapshot {
  readonly epoch: number | null;
  readonly subscription: MarketSubscription | null;
  readonly status: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'degraded' | 'terminal';
  readonly upstreamStatus: QuoteStreamStatus | null;
  readonly code: string | null;
  readonly error: string | null;
  readonly retryAt: number | null;
  readonly quote: QuoteStreamSnapshot | null;
  readonly quoteRevision: number;
  readonly observedAt: number | null;
  readonly stale: boolean;
}
export interface MarketQuoteStoreOptions {
  readonly url: string;
  readonly getSession: () => SyncSession | null;
  readonly onUnauthorized: (epoch: number) => void;
  readonly createEventSource?: BusinessEventSourceFactory;
  readonly now?: () => number;
}

/** 只在中央流模块从已配置 events URL 推导同根端点；不接受凭据或 token 参数。 */
export function marketQuoteStreamUrl(eventsUrl: string, subscription: MarketSubscription): string {
  const endpoint = eventsUrl.replace(/\/events\/?$/, '/market/quote-stream');
  if (endpoint === eventsUrl) throw new Error('报价事件端点配置无效');
  return `${endpoint}?${new URLSearchParams({ accountId: subscription.accountId, symbol: subscription.symbol })}`;
}

function sameSubscription(left: MarketSubscription | null, right: MarketSubscription | null): boolean {
  return left === null || right === null
    ? left === right
    : left.accountId === right.accountId && left.symbol === right.symbol;
}
function sameSession(left: SyncSession | null, right: SyncSession | null): boolean {
  return left === null || right === null
    ? left === right
    : left.epoch === right.epoch && left.user.id === right.user.id;
}

/** 报价状态拥有者；复用业务流的原生接口和纯连接策略，不承担业务失效收敛。 */
export class MarketQuoteStore {
  private readonly options: MarketQuoteStoreOptions;
  private readonly createEventSource: BusinessEventSourceFactory;
  private readonly now: () => number;
  private readonly listeners = new Set<() => void>();
  private snapshot: MarketQuoteSnapshot = {
    epoch: null,
    subscription: null,
    status: 'idle',
    upstreamStatus: null,
    code: null,
    error: null,
    retryAt: null,
    quote: null,
    quoteRevision: 0,
    observedAt: null,
    stale: true,
  };
  private running = false;
  private currentSession: SyncSession | null = null;
  private subscription: MarketSubscription | null = null;
  private source: BusinessEventSource | null = null;
  private generation = 0;
  private reconnectTimer: number | undefined;
  private staleTimer: number | undefined;
  // 与业务源相同：不因 epoch、证券切换、卸载/重挂载遗忘建连预算。
  private readonly attempts: number[] = [];
  private automaticRetries = 0;
  private lastActorId: string | null = null;
  private degraded = false;
  private terminal = false;
  private deniedEpoch: number | null = null;
  private lastEvent = -1;
  private lastSource: number | null = null;
  private lastFingerprint = '';

  constructor(options: MarketQuoteStoreOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
    this.createEventSource = options.createEventSource ?? ((url, init) => new EventSource(url, init));
  }

  readonly getSnapshot = (): MarketQuoteSnapshot => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(): void {
    if (this.running) return;
    this.running = true;
    this.reconcile();
  }

  stop(): void {
    this.running = false;
    this.closeConnection();
    this.clearTimers();
    this.currentSession = null;
    this.subscription = null;
    this.terminal = false;
    this.resetEvidence();
    this.update({ epoch: null, subscription: null, status: 'idle', error: null, retryAt: null });
  }

  setSubscription(next: { accountId: string; symbol: string } | null): void {
    const parsed = next === null ? null : quoteStreamQuerySchema.safeParse(next);
    const subscription = parsed?.success ? parsed.data : null;
    if (sameSubscription(subscription, this.subscription)) return;
    this.closeConnection();
    this.clearTimers();
    this.subscription = subscription;
    this.terminal = false;
    this.resetEvidence();
    this.update({ subscription, status: 'idle', error: null, retryAt: null });
    if (this.running) {
      this.reconcile();
      this.connect();
    }
  }

  reconcile(): void {
    if (!this.running) return;
    const session = this.options.getSession();
    if (sameSession(session, this.currentSession)) return;
    this.closeConnection();
    this.clearTimers();
    this.currentSession = session;
    this.terminal = false;
    this.resetEvidence();
    this.update({ epoch: session?.epoch ?? null, status: 'idle', error: null, retryAt: null });
    if (!session) return;
    if (session.user.id !== this.lastActorId) {
      this.lastActorId = session.user.id;
      this.automaticRetries = 0;
      this.degraded = false;
      this.deniedEpoch = null;
    }
    this.connect();
  }

  retry(): void {
    if (!this.running) return;
    this.reconcile();
    if (
      !this.currentSession ||
      this.source ||
      this.terminal ||
      this.deniedEpoch === this.currentSession.epoch
    )
      return;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
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

  private isCurrent(session: SyncSession, generation: number, source: BusinessEventSource): boolean {
    return (
      this.running &&
      generation === this.generation &&
      source === this.source &&
      sameSession(session, this.currentSession) &&
      sameSession(session, this.options.getSession())
    );
  }

  private connect(): void {
    const session = this.currentSession;
    const subscription = this.subscription;
    if (
      !this.running ||
      !session ||
      !subscription ||
      this.source ||
      this.terminal ||
      this.deniedEpoch === session.epoch ||
      !sameSession(session, this.options.getSession())
    )
      return;
    const retryAt = this.budgetRetryAt();
    if (this.degraded || retryAt !== null) {
      this.degraded = true;
      this.update({ status: 'degraded', error: '报价连接已暂停，请在预算允许后显式重试。', retryAt });
      return;
    }
    this.attempts.push(this.now());
    const generation = ++this.generation;
    this.update({
      status: this.automaticRetries > 0 ? 'reconnecting' : 'connecting',
      error: null,
      retryAt: null,
    });
    // 外部订阅者可能在通知中改变选择/会话，创建原生源前再次检查。
    if (!this.running || generation !== this.generation || !sameSession(session, this.options.getSession()))
      return;
    let source: BusinessEventSource;
    try {
      source = this.createEventSource(marketQuoteStreamUrl(this.options.url, subscription), {
        withCredentials: true,
      });
    } catch {
      this.recover('无法创建报价事件流连接。');
      return;
    }
    this.source = source;
    source.onopen = () => {
      if (!this.isCurrent(session, generation, source)) return;
      // open 只证明 HTTP 流建立，不能使无报价或旧报价变成 live。
      this.update({ status: 'open', error: null, retryAt: null });
    };
    source.onmessage = (message) => {
      if (!this.isCurrent(session, generation, source)) return;
      let raw: unknown;
      try {
        raw = JSON.parse(message.data);
      } catch {
        return;
      }
      const parsed = quoteStreamEventSchema.safeParse(raw);
      if (!parsed.success) return;
      const event = parsed.data;
      if (event.accountId !== subscription.accountId || event.symbol !== subscription.symbol) return;
      if (event.kind === 'status') {
        if (event.retryable === false) {
          this.terminal = true;
          this.closeConnection();
          this.clearTimers();
          this.resetEvidence();
          this.update({
            status: 'terminal',
            upstreamStatus: event.status,
            code: event.code ?? null,
            error: '服务端已终止此报价订阅；旧报价已移除。',
            retryAt: null,
          });
          if (event.code === 'UNAUTHENTICATED') {
            this.deniedEpoch = session.epoch;
            this.options.onUnauthorized(session.epoch);
          }
          return;
        }
        // 上游负责官方 WS 恢复；retryable 状态绝不额外创建客户端 EventSource。
        this.update({ upstreamStatus: event.status, code: event.code ?? null });
        return;
      }
      this.acceptQuote(event.value);
    };
    source.onerror = () => {
      if (!this.isCurrent(session, generation, source)) return;
      // 原生 error 不提供可靠 HTTP 状态，不能猜测 401/429 或触发 /me。
      this.closeConnection();
      this.recover('报价传输已中断，正在有限重试；所留报价不是实时行情。');
    };
  }

  private acceptQuote(value: QuoteStreamSnapshot): void {
    const previous = this.snapshot.quote;
    if (
      previous &&
      (value.receivedAt < previous.receivedAt ||
        (value.transport === 'REST' && value.receivedAt === previous.receivedAt))
    )
      return;
    if (value.transport === 'WEBSOCKET') {
      if (
        value.eventTimestamp === null ||
        value.eventTimestamp < this.lastEvent ||
        (value.sourceTimestamp !== null &&
          this.lastSource !== null &&
          value.sourceTimestamp < this.lastSource)
      )
        return;
      const fingerprint = JSON.stringify([
        value.eventTimestamp,
        value.sourceTimestamp,
        value.quote.bid,
        value.quote.ask,
        value.quote.bidSize,
        value.quote.askSize,
      ]);
      if (fingerprint === this.lastFingerprint) return;
      this.lastFingerprint = fingerprint;
      this.lastEvent = value.eventTimestamp;
      if (value.sourceTimestamp !== null) this.lastSource = value.sourceTimestamp;
    }
    window.clearTimeout(this.staleTimer);
    const observedAt = this.now();
    const generation = this.generation;
    this.update({
      quote: value,
      quoteRevision: this.snapshot.quoteRevision + 1,
      observedAt,
      stale: false,
      status: 'open',
      upstreamStatus: value.transport === 'WEBSOCKET' ? 'live' : 'snapshot',
      code: null,
      error: null,
    });
    if (!this.running || generation !== this.generation) return;
    this.staleTimer = window.setTimeout(() => {
      this.staleTimer = undefined;
      if (this.running && generation === this.generation) this.update({ stale: true });
    }, MARKET_DISPLAY_REFERENCE_MS);
  }

  private recover(error: string): void {
    this.clearTimers();
    this.update({ stale: true });
    const session = this.currentSession;
    if (!this.running || !session || !this.subscription || !sameSession(session, this.options.getSession()))
      return;
    const delay = automaticReconnectDelay(this.automaticRetries);
    const retryAt = this.budgetRetryAt();
    if (delay === undefined || retryAt !== null) {
      this.degraded = true;
      this.update({ status: 'degraded', error, retryAt });
      return;
    }
    this.automaticRetries += 1;
    const generation = this.generation;
    this.update({ status: 'reconnecting', upstreamStatus: null, error, retryAt: this.now() + delay });
    if (!this.running || generation !== this.generation) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      if (!this.running || generation !== this.generation || !sameSession(session, this.options.getSession()))
        return;
      this.connect();
    }, delay);
  }

  private budgetRetryAt(): number | null {
    const { expired, retryAt } = connectionBudget(this.attempts, this.now());
    if (expired > 0) this.attempts.splice(0, expired);
    return retryAt;
  }

  private closeConnection(): void {
    const source = this.source;
    this.source = null;
    this.generation += 1;
    if (!source) return;
    source.onopen = null;
    source.onmessage = null;
    source.onerror = null;
    source.close();
  }

  private clearTimers(): void {
    window.clearTimeout(this.reconnectTimer);
    window.clearTimeout(this.staleTimer);
    this.reconnectTimer = undefined;
    this.staleTimer = undefined;
  }

  private resetEvidence(): void {
    this.lastEvent = -1;
    this.lastSource = null;
    this.lastFingerprint = '';
    this.update({ quote: null, observedAt: null, stale: true, upstreamStatus: null, code: null });
  }

  private update(next: Partial<MarketQuoteSnapshot>): void {
    const snapshot = { ...this.snapshot, ...next };
    if (
      Object.keys(next).every((key) => {
        const field = key as keyof MarketQuoteSnapshot;
        return Object.is(this.snapshot[field], snapshot[field]);
      })
    )
      return;
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}
