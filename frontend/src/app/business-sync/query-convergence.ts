import {
  hashKey,
  type Query,
  type QueryCacheNotifyEvent,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type { AuthUser } from '@/features/auth/types';
import { BUSINESS_RESOURCES, type BusinessResource } from '@/services/realtime/types';

export interface QueryKeyScope {
  readonly epoch: number;
  readonly user: AuthUser | null;
}

export interface SyncSession extends QueryKeyScope {
  readonly user: AuthUser;
}

export interface ResourceQueryRegistration {
  readonly resource: BusinessResource;
  readonly queryKey: QueryKey;
  readonly accountId: string | null;
  readonly canRead: (user: AuthUser) => boolean;
  /** 聚合视图的有限次级依赖；key 的 canonical resource 仍是 resource。 */
  readonly dependencies?: readonly BusinessResource[];
  /** 页面离开后只保留缓存元数据，缓存移除或会话结束即清理。 */
  readonly retainWhileCached?: boolean;
}

interface CachedRegistration extends ResourceQueryRegistration {
  readonly queryHash: string;
  detached: boolean;
}

interface QueryConvergenceOptions {
  readonly queryClient: QueryClient;
  readonly getSession: () => SyncSession | null;
  readonly mergeWindowMs?: number;
  readonly supplementalIntervalMs?: number;
}

interface PendingRead {
  wanted: number;
  atStart: number;
  fetching: boolean;
}

export function sessionQueryKey(
  session: QueryKeyScope,
  resource: BusinessResource,
  accountId: string | null,
  ...parts: unknown[]
): QueryKey {
  return ['session', session.epoch, session.user?.id ?? null, accountId, resource, ...parts];
}

export function matchesScope(
  queryKey: QueryKey,
  session: SyncSession,
  registration: ResourceQueryRegistration,
): boolean {
  return (
    queryKey[0] === 'session' &&
    queryKey[1] === session.epoch &&
    queryKey[2] === session.user.id &&
    queryKey[3] === registration.accountId &&
    queryKey[4] === registration.resource
  );
}

/** 通知只操作已存在的精确缓存，不负责创建查询或推导 REST 地址。 */
export class QueryConvergence {
  private readonly queryClient: QueryClient;
  private readonly getSession: () => SyncSession | null;
  private readonly mergeWindowMs: number;
  private readonly supplementalIntervalMs: number;
  private readonly registrations = new Map<symbol, CachedRegistration>();
  private readonly pending = new Map<Query, PendingRead>();
  private running = false;
  private currentEpoch: number | null = null;
  private currentUserId: string | null = null;
  private unsubscribeCache: (() => void) | null = null;
  private mergeTimer: number | undefined;
  private supplementalTimer: number | undefined;

  constructor(options: QueryConvergenceOptions) {
    this.queryClient = options.queryClient;
    this.getSession = options.getSession;
    this.mergeWindowMs = Math.max(0, options.mergeWindowMs ?? 25);
    this.supplementalIntervalMs = Math.max(0, options.supplementalIntervalMs ?? 60_000);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.synchronizeSession();
  }

  stop(): void {
    this.running = false;
    this.clearSessionWork();
  }

  reset(): void {
    this.clearSessionWork();
    this.synchronizeSession();
  }

  register(registration: ResourceQueryRegistration): () => void {
    const queryHash = hashKey(registration.queryKey);
    // 同一缓存重访时替换脱离页面的旧元数据，不积累重复登记。
    for (const [previousToken, previous] of this.registrations) {
      if (previous.detached && previous.queryHash === queryHash) this.registrations.delete(previousToken);
    }
    const token = Symbol();
    const entry = { ...registration, queryHash, detached: false };
    this.registrations.set(token, entry);
    return () => {
      const session = this.getSession();
      let retain = Boolean(
        entry.retainWhileCached &&
          session &&
          matchesScope(entry.queryKey, session, entry) &&
          this.queryClient.getQueryCache().find({ queryKey: entry.queryKey, exact: true }),
      );
      if (retain) {
        for (const other of this.registrations.values()) {
          if (other !== entry && !other.detached && other.queryHash === queryHash) {
            retain = false;
            break;
          }
        }
      }
      if (retain) entry.detached = true;
      else this.registrations.delete(token);
      for (const query of this.pending.keys()) {
        if (!session || !this.isRegistered(query, session)) this.pending.delete(query);
      }
    };
  }

  refresh(resources: readonly BusinessResource[]): void {
    this.requestRefresh(resources, false);
  }

  converge(): void {
    this.requestRefresh(BUSINESS_RESOURCES, false);
  }

  private clearSessionWork(): void {
    window.clearTimeout(this.mergeTimer);
    window.clearTimeout(this.supplementalTimer);
    this.mergeTimer = undefined;
    this.supplementalTimer = undefined;
    this.unsubscribeCache?.();
    this.unsubscribeCache = null;
    this.pending.clear();
    for (const [token, registration] of this.registrations) {
      if (registration.detached) this.registrations.delete(token);
    }
    this.currentEpoch = null;
    this.currentUserId = null;
  }

  private synchronizeSession(): SyncSession | null {
    if (!this.running) return null;
    const session = this.getSession();
    if (!session || session.epoch !== this.currentEpoch || session.user.id !== this.currentUserId) {
      this.clearSessionWork();
      if (!session) return null;
      this.currentEpoch = session.epoch;
      this.currentUserId = session.user.id;
    }
    if (!this.unsubscribeCache) {
      this.unsubscribeCache = this.queryClient.getQueryCache().subscribe(this.onCacheEvent);
      this.scheduleSupplemental();
    }
    return session;
  }

  private scheduleSupplemental(): void {
    if (this.supplementalIntervalMs === 0 || this.supplementalTimer !== undefined) return;
    this.supplementalTimer = window.setTimeout(() => {
      this.supplementalTimer = undefined;
      if (!this.synchronizeSession()) return;
      this.requestRefresh(BUSINESS_RESOURCES, true);
      this.scheduleSupplemental();
    }, this.supplementalIntervalMs);
  }

  private isRegistered(query: Query, session: SyncSession): boolean {
    for (const registration of this.registrations.values()) {
      if (
        matchesScope(registration.queryKey, session, registration) &&
        matchesScope(query.queryKey, session, registration) &&
        registration.canRead(session.user) &&
        this.queryClient.getQueryCache().find({ queryKey: registration.queryKey, exact: true }) === query
      ) {
        return true;
      }
    }
    return false;
  }

  private requestRefresh(resources: readonly BusinessResource[], activeOnly: boolean): void {
    const session = this.synchronizeSession();
    if (!session || resources.length === 0) return;
    const requested = new Set(resources);
    const seen = new Set<Query>();
    for (const registration of this.registrations.values()) {
      if (
        (!requested.has(registration.resource) &&
          !registration.dependencies?.some((resource) => requested.has(resource))) ||
        !matchesScope(registration.queryKey, session, registration) ||
        !registration.canRead(session.user)
      ) {
        continue;
      }
      const query = this.queryClient.getQueryCache().find({ queryKey: registration.queryKey, exact: true });
      if (
        !query ||
        seen.has(query) ||
        !matchesScope(query.queryKey, session, registration) ||
        (activeOnly && !query.isActive())
      ) {
        continue;
      }
      seen.add(query);
      let read = this.pending.get(query);
      if (!read) {
        read = { wanted: 0, atStart: 0, fetching: query.state.fetchStatus !== 'idle' };
        this.pending.set(query, read);
      }
      // 先记录版本，再失效：在途 GET 完成时清除 isInvalidated 也不会吞掉这次通知。
      read.wanted += 1;
      query.invalidate();
    }
    if (seen.size > 0) this.scheduleMerge();
  }

  private scheduleMerge(): void {
    if (!this.running || this.mergeTimer !== undefined) return;
    this.mergeTimer = window.setTimeout(() => {
      this.mergeTimer = undefined;
      this.flush();
    }, this.mergeWindowMs);
  }

  private readonly onCacheEvent = (event: QueryCacheNotifyEvent): void => {
    if (event.type === 'removed') {
      const queryHash = hashKey(event.query.queryKey);
      for (const [token, registration] of this.registrations) {
        if (registration.detached && registration.queryHash === queryHash) this.registrations.delete(token);
      }
    }
    const session = this.synchronizeSession();
    if (!session) return;
    const query = event.query;
    const read = this.pending.get(query);
    if (!read) return;
    if (event.type === 'removed' || !this.isRegistered(query, session)) {
      this.pending.delete(query);
      return;
    }
    if (query.state.fetchStatus !== 'idle') {
      if (!read.fetching || (event.type === 'updated' && event.action.type === 'fetch')) {
        read.atStart = read.wanted;
      }
      read.fetching = true;
      return;
    }
    if (read.fetching) {
      read.fetching = false;
      if (read.wanted <= read.atStart) {
        // 失败同样消费本次读取版本；只有后续新信号才会产生下一次读取。
        this.pending.delete(query);
        return;
      }
      query.invalidate();
      this.scheduleMerge();
      return;
    }
    if (
      event.type === 'observerAdded' ||
      event.type === 'observerRemoved' ||
      event.type === 'observerOptionsUpdated'
    ) {
      this.scheduleMerge();
    }
  };

  private flush(): void {
    const session = this.synchronizeSession();
    if (!session) return;
    for (const [query, read] of this.pending) {
      if (!this.isRegistered(query, session)) {
        this.pending.delete(query);
        continue;
      }
      if (query.state.fetchStatus !== 'idle') continue;
      if (!query.isActive() || query.isStatic()) {
        this.pending.delete(query);
        continue;
      }
      // 与 Query 自己的 focus、reconnect、retry 共用 GET，绝不取消并重启在途读取。
      void this.queryClient.refetchQueries(
        { type: 'active', predicate: (candidate) => candidate === query },
        { cancelRefetch: false },
      );
      if (query.state.fetchStatus === 'idle' && this.pending.get(query) === read) {
        this.pending.delete(query);
      }
    }
  }
}
