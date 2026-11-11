import { type QueryKeyScope, sessionQueryKey } from '@/app/business-sync/query-convergence';
import type { ReconciliationSearch } from './schemas';

export const reconciliationKeys = {
  list: (scope: QueryKeyScope, search: ReconciliationSearch) =>
    sessionQueryKey(scope, 'accounts', search.accountId ?? null, 'reconciliations', 'list', search),
};
