import type { QueryKey } from '@tanstack/react-query';
import { type QueryKeyScope, sessionQueryKey } from '@/app/business-sync/query-convergence';
import type { AccountListSearch } from './schemas';

export function accountFilters(search: AccountListSearch) {
  return {
    ownerUserId: search.ownerUserId,
    accountId: search.accountId,
    status: search.status,
    from: search.from,
    to: search.to,
    search: search.search,
  };
}

export const accountQueryKeys = {
  list(scope: QueryKeyScope, search: AccountListSearch): QueryKey {
    const paged = scope.user?.role === 'ADMIN';
    return sessionQueryKey(
      scope,
      'accounts',
      search.accountId ?? null,
      'list',
      paged ? 'admin-paged' : 'trader-array',
      accountFilters(search),
      ...(paged ? [search.page, search.pageSize] : []),
    );
  },
  detail(scope: QueryKeyScope, accountId: string | null): QueryKey {
    return sessionQueryKey(scope, 'accounts', accountId, 'detail');
  },
};
