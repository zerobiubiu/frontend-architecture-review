import { useQueryScope, useResourceQuery } from '@/app/business-sync/use-resource-query';
import { useAppServices } from '@/app/runtime-context';
import { hasCapability } from '@/features/auth/permissions';
import type { AuthUser } from '@/features/auth/types';
import { readReconciliations } from './api';
import { reconciliationKeys } from './query-keys';
import type { ReconciliationSearch } from './schemas';

export const canReadReconciliations = (user: AuthUser): boolean => hasCapability(user, 'workspace');

export function useReconciliations(search: ReconciliationSearch, enabled = true) {
  const { rpc } = useAppServices();
  const scope = useQueryScope();
  return useResourceQuery({
    queryKey: reconciliationKeys.list(scope, search),
    // 已完成核对同时保存账户及记录，没有独立核对记录 SSE 资源。
    resource: 'accounts',
    accountId: search.accountId ?? null,
    canRead: canReadReconciliations,
    enabled,
    queryFn: (signal) => readReconciliations(rpc, search, signal),
  });
}
