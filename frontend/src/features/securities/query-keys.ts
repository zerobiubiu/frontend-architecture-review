import { type QueryKeyScope, sessionQueryKey } from '@/app/business-sync/query-convergence';
import type { SecuritiesSearch } from './schemas';

export const securitiesKeys = {
  catalog: (scope: QueryKeyScope, search: SecuritiesSearch) =>
    sessionQueryKey(
      scope,
      'accounts',
      search.accountId ?? null,
      'securities',
      'catalog',
      search.search ?? null,
      search.page,
      search.pageSize,
    ),
};
