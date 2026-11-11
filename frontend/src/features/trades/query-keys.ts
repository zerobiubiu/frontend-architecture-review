import { type QueryKeyScope, sessionQueryKey } from '@/app/business-sync/query-convergence';
import type { TradeSearch } from './schemas';

export const tradeKeys = {
  official: (scope: QueryKeyScope, search: TradeSearch) =>
    sessionQueryKey(scope, 'accounts', search.accountId ?? null, 'official-trades', {
      symbol: search.symbol,
      from: search.from,
      to: search.to,
      page: search.page,
      pageSize: search.pageSize,
    }),
};
