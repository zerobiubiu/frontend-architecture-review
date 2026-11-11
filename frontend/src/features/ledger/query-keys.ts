import { type QueryKeyScope, sessionQueryKey } from '@/app/business-sync/query-convergence';
import type { LedgerSearch } from './schemas';

export const ledgerKeys = {
  list: (scope: QueryKeyScope, search: LedgerSearch) =>
    sessionQueryKey(scope, 'ledger', search.accountId ?? null, 'ledger', 'list', search),
};
