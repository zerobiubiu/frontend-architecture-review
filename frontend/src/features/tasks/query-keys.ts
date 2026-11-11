import { type QueryKeyScope, sessionQueryKey } from '@/app/business-sync/query-convergence';
import type { TaskListSearch } from './schemas';

export const taskKeys = {
  list: (scope: QueryKeyScope, search: TaskListSearch) =>
    sessionQueryKey(scope, 'tasks', search.accountId ?? null, 'list', search),
  detail: (scope: QueryKeyScope, id: string | null) => sessionQueryKey(scope, 'tasks', null, 'detail', id),
};
