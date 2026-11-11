import { type QueryKeyScope, sessionQueryKey } from '@/app/business-sync/query-convergence';
import type { MarketSearch } from './schemas';

export const marketKeys = {
  quotes: (scope: QueryKeyScope, search: MarketSearch) =>
    sessionQueryKey(scope, 'accounts', search.accountId ?? null, 'market', 'quotes', search.symbol ?? null),
};
