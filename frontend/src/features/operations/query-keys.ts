import { type QueryKeyScope, sessionQueryKey } from '@/app/business-sync/query-convergence';
import type { BusinessEventsSearch } from './schemas';

export const operationKeys = {
  unresolved: (scope: QueryKeyScope) => sessionQueryKey(scope, 'events', null, 'operations', 'unresolved'),
  detail: (scope: QueryKeyScope, id: string) =>
    sessionQueryKey(scope, 'events', null, 'operations', 'detail', id),
  businessEvents: (scope: QueryKeyScope, search: BusinessEventsSearch) =>
    sessionQueryKey(scope, 'events', search.accountId ?? null, 'business-events', 'list', search),
};
