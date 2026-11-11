import { useQueryScope, useResourceQuery } from '@/app/business-sync/use-resource-query';
import { useAppServices } from '@/app/runtime-context';
import { hasCapability } from '@/features/auth/permissions';
import type { AuthUser } from '@/features/auth/types';
import type { BusinessResource } from '@/services/realtime/types';
import { readOverview } from './api';
import { dashboardKeys } from './query-keys';

const dependencies: readonly BusinessResource[] = ['orders', 'tasks', 'ledger', 'worker'];
const canRead = (user: AuthUser) => hasCapability(user, 'workspace');

export function useOverview() {
  const { rpc } = useAppServices();
  const scope = useQueryScope();
  return useResourceQuery({
    queryKey: dashboardKeys.overview(scope),
    resource: 'accounts',
    dependencies,
    accountId: null,
    canRead,
    queryFn: (signal) => readOverview(rpc, signal),
  });
}
