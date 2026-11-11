import { useQueryScope, useResourceQuery } from '@/app/business-sync/use-resource-query';
import { useAppServices } from '@/app/runtime-context';
import { hasCapability } from '@/features/auth/permissions';
import type { AuthUser } from '@/features/auth/types';
import { readBusinessEvents, readOperation, readUnresolvedOperations } from './api';
import { operationKeys } from './query-keys';
import type { BusinessEventsSearch } from './schemas';

// 目标写入可能伴随回执变化，但回执没有独立 SSE 版本。
const RECEIPT_DEPENDENCIES = ['accounts', 'orders', 'tasks', 'users', 'settings'] as const;
// 日志合并任务/订单/系统事件；events 资源本身仅跟踪系统事件版本。
const EVENT_DEPENDENCIES = ['orders', 'tasks', 'accounts'] as const;
export const canReadOperations = (user: AuthUser): boolean => hasCapability(user, 'workspace');

export function useUnresolvedOperations() {
  const { rpc } = useAppServices();
  const scope = useQueryScope();
  return useResourceQuery({
    queryKey: operationKeys.unresolved(scope),
    resource: 'events',
    dependencies: RECEIPT_DEPENDENCIES,
    accountId: null,
    canRead: canReadOperations,
    queryFn: (signal) => readUnresolvedOperations(rpc, signal),
  });
}

export function useOperation(id: string, enabled: boolean) {
  const { rpc } = useAppServices();
  const scope = useQueryScope();
  return useResourceQuery({
    queryKey: operationKeys.detail(scope, id),
    resource: 'events',
    dependencies: RECEIPT_DEPENDENCIES,
    accountId: null,
    canRead: canReadOperations,
    enabled,
    queryFn: (signal) => readOperation(rpc, id, signal),
  });
}

export function useBusinessEvents(search: BusinessEventsSearch, enabled = true) {
  const { rpc } = useAppServices();
  const scope = useQueryScope();
  return useResourceQuery({
    queryKey: operationKeys.businessEvents(scope, search),
    resource: 'events',
    dependencies: EVENT_DEPENDENCIES,
    accountId: search.accountId ?? null,
    canRead: canReadOperations,
    enabled,
    queryFn: (signal) => readBusinessEvents(rpc, search, signal),
  });
}
