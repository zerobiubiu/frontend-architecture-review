import type { QueryKey } from '@tanstack/react-query';
import { type QueryKeyScope, sessionQueryKey } from '@/app/business-sync/query-convergence';
import type { AuditSearch, UsersSearch } from './schemas';

export const administrationKeys = {
  overview: (scope: QueryKeyScope): QueryKey =>
    sessionQueryKey(scope, 'users', null, 'administration', 'overview'),
  users: (scope: QueryKeyScope, search: UsersSearch): QueryKey =>
    sessionQueryKey(scope, 'users', null, 'administration', 'users', search),
  audit: (scope: QueryKeyScope, search: AuditSearch): QueryKey =>
    sessionQueryKey(scope, 'audit', null, 'administration', 'audit', search),
  system: (scope: QueryKeyScope): QueryKey =>
    sessionQueryKey(scope, 'settings', null, 'administration', 'system'),
  health: (scope: QueryKeyScope): QueryKey =>
    sessionQueryKey(scope, 'worker', null, 'administration', 'healthz'),
};
