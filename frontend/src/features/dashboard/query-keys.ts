import { type QueryKeyScope, sessionQueryKey } from '@/app/business-sync/query-convergence';

export const dashboardKeys = {
  overview: (scope: QueryKeyScope) => sessionQueryKey(scope, 'accounts', null, 'dashboard', 'overview'),
};
