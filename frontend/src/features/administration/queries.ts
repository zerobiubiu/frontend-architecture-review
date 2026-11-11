import { useQueryScope, useResourceQuery } from '@/app/business-sync/use-resource-query';
import { useAppServices } from '@/app/runtime-context';
import { hasCapability } from '@/features/auth/permissions';
import type { AuthUser } from '@/features/auth/types';
import type { BusinessResource } from '@/services/realtime/types';
import { readAdminAudit, readAdminHealth, readAdminOverview, readAdminSystem, readAdminUsers } from './api';
import { administrationKeys } from './query-keys';
import type { AuditSearch, UsersSearch } from './schemas';

const OVERVIEW_DEPENDENCIES: readonly BusinessResource[] = [
  'accounts',
  'tasks',
  'orders',
  'settings',
  'events',
  'worker',
];
const SYSTEM_DEPENDENCIES: readonly BusinessResource[] = ['worker', 'events'];

/** ADMIN 读取与 canManageAdmins 专项管理能力独立，且不授予任何写操作。 */
export function canReadAdministration(user: AuthUser): boolean {
  return hasCapability(user, 'administration');
}

export function useAdminOverview() {
  const { rpc } = useAppServices();
  const scope = useQueryScope();
  return useResourceQuery({
    queryKey: administrationKeys.overview(scope),
    resource: 'users',
    dependencies: OVERVIEW_DEPENDENCIES,
    accountId: null,
    canRead: canReadAdministration,
    queryFn: (signal) => readAdminOverview(rpc, signal),
  });
}

export function useAdminUsers(search: UsersSearch, enabled = true) {
  const { rpc } = useAppServices();
  const scope = useQueryScope();
  return useResourceQuery({
    queryKey: administrationKeys.users(scope, search),
    resource: 'users',
    accountId: null,
    canRead: canReadAdministration,
    enabled,
    queryFn: (signal) => readAdminUsers(rpc, search, signal),
  });
}

export function useAdminAudit(search: AuditSearch, enabled = true) {
  const { rpc } = useAppServices();
  const scope = useQueryScope();
  return useResourceQuery({
    queryKey: administrationKeys.audit(scope, search),
    resource: 'audit',
    accountId: null,
    canRead: canReadAdministration,
    enabled,
    queryFn: (signal) => readAdminAudit(rpc, search, signal),
  });
}

export function useAdminSystem() {
  const { rpc } = useAppServices();
  const scope = useQueryScope();
  return useResourceQuery({
    queryKey: administrationKeys.system(scope),
    resource: 'settings',
    dependencies: SYSTEM_DEPENDENCIES,
    accountId: null,
    canRead: canReadAdministration,
    queryFn: (signal) => readAdminSystem(rpc, signal),
  });
}

export function useAdminHealth() {
  const { rpc } = useAppServices();
  const scope = useQueryScope();
  return useResourceQuery({
    queryKey: administrationKeys.health(scope),
    resource: 'worker',
    accountId: null,
    canRead: canReadAdministration,
    queryFn: (signal) => readAdminHealth(rpc, signal),
  });
}
