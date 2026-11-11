import { useMemo } from 'react';
import { useQueryScope, useResourceQuery } from '@/app/business-sync/use-resource-query';
import { useAppServices } from '@/app/runtime-context';
import { hasCapability } from '@/features/auth/permissions';
import type { AuthUser } from '@/features/auth/types';
import { readOfficialHoldings, readPositions } from './api';
import { positionKeys } from './query-keys';
import type { PositionSearch } from './schemas';

const canRead = (user: AuthUser) => hasCapability(user, 'workspace');
const LOCAL_DEPENDENCIES = ['orders', 'accounts'] as const;
const HOLDING_DEPENDENCIES = ['orders', 'ledger'] as const;

export function usePositions(search: PositionSearch, enabled = true) {
  const { rpc } = useAppServices();
  const scope = useQueryScope();
  const queryKey = useMemo(() => positionKeys.local(scope, search), [scope, search]);
  return useResourceQuery({
    queryKey,
    resource: 'ledger',
    dependencies: LOCAL_DEPENDENCIES,
    accountId: search.accountId ?? null,
    canRead,
    enabled,
    queryFn: (signal) => readPositions(rpc, search, signal),
  });
}

export function useOfficialHoldings(accountId: string | undefined, enabled = true) {
  const { rpc } = useAppServices();
  const scope = useQueryScope();
  const queryKey = useMemo(() => positionKeys.holdings(scope, accountId), [scope, accountId]);
  return useResourceQuery({
    queryKey,
    resource: 'accounts',
    dependencies: HOLDING_DEPENDENCIES,
    accountId: accountId ?? null,
    canRead,
    enabled: enabled && accountId !== undefined,
    queryFn: (signal) => {
      if (accountId === undefined) throw new Error('官方持仓需要明确选择账户');
      return readOfficialHoldings(rpc, accountId, signal);
    },
  });
}
