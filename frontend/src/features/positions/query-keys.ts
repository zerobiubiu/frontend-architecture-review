import { type QueryKeyScope, sessionQueryKey } from '@/app/business-sync/query-convergence';
import type { PositionSearch } from './schemas';

export const positionKeys = {
  local: (scope: QueryKeyScope, search: PositionSearch) =>
    sessionQueryKey(scope, 'ledger', search.accountId ?? null, 'positions', {
      ownerUserId: search.ownerUserId,
      symbol: search.symbol,
      from: search.from,
      to: search.to,
      page: search.page,
      pageSize: search.pageSize,
    }),
  holdings: (scope: QueryKeyScope, accountId: string | undefined) =>
    sessionQueryKey(scope, 'accounts', accountId ?? null, 'official-funding-holdings'),
};
