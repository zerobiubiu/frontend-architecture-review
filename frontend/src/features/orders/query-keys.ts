import { type QueryKeyScope, sessionQueryKey } from '@/app/business-sync/query-convergence';
import type { OrderListSearch } from './schemas';

export const orderKeys = {
  list: (scope: QueryKeyScope, search: OrderListSearch) =>
    sessionQueryKey(scope, 'orders', search.accountId ?? null, 'list', search),
  // UUID 直达路由尚无独立可信账户上下文，取得授权详情前不猜账户。
  detail: (scope: QueryKeyScope, id: string | null) => sessionQueryKey(scope, 'orders', null, 'detail', id),
};
