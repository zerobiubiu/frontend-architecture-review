import { useQueryScope, useResourceQuery } from '@/app/business-sync/use-resource-query';
import { useAppServices } from '@/app/runtime-context';
import { hasCapability } from '@/features/auth/permissions';
import type { AuthUser } from '@/features/auth/types';
import { readLedger } from './api';
import { ledgerKeys } from './query-keys';
import type { LedgerSearch } from './schemas';

const LEDGER_DEPENDENCIES = ['accounts', 'orders'] as const;
export const canReadLedger = (user: AuthUser): boolean => hasCapability(user, 'workspace');

export function useLedger(search: LedgerSearch, enabled = true) {
  const { rpc } = useAppServices();
  const scope = useQueryScope();
  return useResourceQuery({
    queryKey: ledgerKeys.list(scope, search),
    resource: 'ledger',
    dependencies: LEDGER_DEPENDENCIES,
    accountId: search.accountId ?? null,
    canRead: canReadLedger,
    enabled,
    queryFn: (signal) => readLedger(rpc, search, signal),
  });
}
