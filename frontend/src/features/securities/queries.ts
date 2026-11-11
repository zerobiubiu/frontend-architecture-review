import { useMemo } from 'react';
import { useQueryScope, useResourceQuery } from '@/app/business-sync/use-resource-query';
import { useAppServices } from '@/app/runtime-context';
import { hasCapability } from '@/features/auth/permissions';
import type { AuthUser } from '@/features/auth/types';
import { readSecurities } from './api';
import { securitiesKeys } from './query-keys';
import type { SecuritiesSearch } from './schemas';

export const canReadSecurities = (user: AuthUser): boolean => hasCapability(user, 'workspace');

export function useSecuritiesCatalog(search: SecuritiesSearch, enabled = true) {
  const { rpc } = useAppServices();
  const scope = useQueryScope();
  const queryKey = useMemo(() => securitiesKeys.catalog(scope, search), [scope, search]);
  return useResourceQuery({
    queryKey,
    resource: 'accounts',
    accountId: search.accountId ?? null,
    canRead: canReadSecurities,
    enabled: enabled && search.accountId !== undefined,
    queryFn: (signal) => readSecurities(rpc, search, signal),
  });
}
