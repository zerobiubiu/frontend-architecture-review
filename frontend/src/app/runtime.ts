import type { QueryClient } from '@tanstack/react-query';
import { createAuthApi } from '@/features/auth/api';
import type { AuthApi } from '@/features/auth/types';
import { apiBaseUrl } from '@/services/api/client';
import { createRpcApi, type RpcApi } from '@/services/api/rpc';
import { type BusinessEventSourceFactory, BusinessSseManager } from '@/services/realtime/manager';
import { MarketQuoteStore } from '@/services/realtime/market-quotes';
import { QueryConvergence, type SyncSession } from './business-sync/query-convergence';
import { createQueryClient } from './providers/query-client';
import type { SessionBroadcastFactory } from './session/broadcast';
import { SessionManager } from './session/manager';

export interface AppServices {
  readonly queryClient: QueryClient;
  readonly rpc: RpcApi;
  readonly session: SessionManager;
  readonly businessSync: BusinessSseManager;
  readonly market: MarketQuoteStore;
  readonly convergence: QueryConvergence;
  start(): () => void;
}

export interface AppServicesOptions {
  readonly baseUrl?: string;
  readonly queryClient?: QueryClient;
  readonly authApi?: AuthApi;
  readonly createEventSource?: BusinessEventSourceFactory;
  readonly broadcastFactory?: SessionBroadcastFactory;
}

/** 构造纯实例；全应用一个 QueryClient/身份拥有者，副作用只在 React effect 启动。 */
export function createAppServices(options: AppServicesOptions = {}): AppServices {
  const queryClient = options.queryClient ?? createQueryClient();
  let session: SessionManager;
  const rpc = createRpcApi({
    baseUrl: options.baseUrl ?? apiBaseUrl,
    getSessionEpoch: () => session.getSnapshot().epoch,
    getCsrfToken: () => session.getCsrfToken(),
    getSessionSignal: () => session.getSessionSignal(),
    isSessionCurrent: (epoch) => session.isCurrent(epoch),
    onUnauthorized: (epoch) => session.invalidate(epoch),
  });
  session = new SessionManager({
    api: options.authApi ?? createAuthApi(rpc),
    queryClient,
    broadcastFactory: options.broadcastFactory,
  });
  let scope: SyncSession | null = null;
  const convergence = new QueryConvergence({ queryClient, getSession: () => scope });
  const businessSync = new BusinessSseManager({
    url: rpc.eventsUrl,
    getSession: () => scope,
    convergence,
    onUnauthorized: (epoch) => session.invalidate(epoch),
    onIdentityHint: (epoch) => {
      void session.verifyFromSignal(epoch);
    },
    createEventSource: options.createEventSource,
  });
  const market = new MarketQuoteStore({
    url: rpc.eventsUrl,
    getSession: () => scope,
    onUnauthorized: (epoch) => session.invalidate(epoch),
    createEventSource: options.createEventSource,
  });
  return {
    queryClient,
    rpc,
    session,
    businessSync,
    market,
    convergence,
    start: () => {
      const reconcile = () => {
        const snapshot = session.getSnapshot();
        scope =
          snapshot.status === 'authenticated' && snapshot.user
            ? { epoch: snapshot.epoch, user: snapshot.user }
            : null;
        businessSync.reconcile();
        market.reconcile();
      };
      const unsubscribe = session.subscribe(reconcile);
      businessSync.start();
      market.start();
      session.start();
      reconcile();
      return () => {
        unsubscribe();
        scope = null;
        businessSync.stop();
        market.stop();
        session.stop();
      };
    },
  };
}
