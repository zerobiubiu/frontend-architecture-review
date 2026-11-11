import { useMemo } from 'react';
import { useQueryScope, useResourceQuery } from '@/app/business-sync/use-resource-query';
import { useAppServices } from '@/app/runtime-context';
import { hasCapability } from '@/features/auth/permissions';
import type { AuthUser } from '@/features/auth/types';
import { readOfficialTrades } from './api';
import { tradeKeys } from './query-keys';
import type { TradeSearch } from './schemas';

const canRead = (user: AuthUser) => hasCapability(user, 'workspace');
const DEPENDENCIES = ['orders', 'ledger'] as const;

export function useOfficialTrades(search: TradeSearch, enabled = true) {
  const { rpc } = useAppServices();
  const scope = useQueryScope();
  const queryKey = useMemo(() => tradeKeys.official(scope, search), [scope, search]);
  return useResourceQuery({
    queryKey,
    resource: 'accounts',
    dependencies: DEPENDENCIES,
    accountId: search.accountId ?? null,
    canRead,
    enabled: enabled && Boolean(search.accountId && search.from && search.to),
    queryFn: (signal) => readOfficialTrades(rpc, search, signal),
  });
}
