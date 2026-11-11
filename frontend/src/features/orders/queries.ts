import { useQueryScope, useResourceQuery } from '@/app/business-sync/use-resource-query';
import { useAppServices } from '@/app/runtime-context';
import { hasCapability } from '@/features/auth/permissions';
import type { AuthUser } from '@/features/auth/types';
import { uuidSchema } from '@/lib/read-only/schemas';
import { readOrder, readOrders } from './api';
import { orderKeys } from './query-keys';
import type { OrderListSearch } from './schemas';

const canReadOrders = (user: AuthUser) => hasCapability(user, 'workspace');
const DETAIL_DEPENDENCIES = ['ledger', 'events'] as const;

export function useOrdersList(search: OrderListSearch, enabled = true) {
  const { rpc } = useAppServices();
  const scope = useQueryScope();
  return useResourceQuery({
    queryKey: orderKeys.list(scope, search),
    resource: 'orders',
    accountId: search.accountId ?? null,
    canRead: canReadOrders,
    enabled,
    queryFn: (signal) => readOrders(rpc, search, signal),
  });
}

export function useOrderDetail(id: string | undefined) {
  const { rpc } = useAppServices();
  const scope = useQueryScope();
  const validId = uuidSchema.safeParse(id);
  const keyId = validId.success ? validId.data : null;
  return useResourceQuery({
    queryKey: orderKeys.detail(scope, keyId),
    resource: 'orders',
    dependencies: DETAIL_DEPENDENCIES,
    accountId: null,
    canRead: canReadOrders,
    enabled: keyId !== null,
    queryFn: (signal) => readOrder(rpc, keyId ?? '', signal),
  });
}
