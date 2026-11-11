import type { UseQueryResult } from '@tanstack/react-query';
import { useQueryScope, useResourceQuery } from '@/app/business-sync/use-resource-query';
import { useAppServices } from '@/app/runtime-context';
import { hasCapability } from '@/features/auth/permissions';
import type { AuthUser } from '@/features/auth/types';
import { uuidSchema } from '@/lib/read-only/schemas';
import { readAccountDetail, readAccountsList } from './api';
import { accountQueryKeys } from './query-keys';
import type { AccountListSearch, AccountsListView, AccountView } from './schemas';

export type { AccountListSearch } from './schemas';

const canReadAccounts = (user: AuthUser) => hasCapability(user, 'workspace');
const canReadAdminAccounts = (user: AuthUser) => hasCapability(user, 'administration');

/** 账户页与工作台共享查询，保留接口真实的分页/数组分支。 */
export function useAccountsList(
  search: AccountListSearch,
  enabled = true,
): UseQueryResult<AccountsListView, Error> {
  const { rpc } = useAppServices();
  const scope = useQueryScope();
  const paged = scope.user?.role === 'ADMIN';
  return useResourceQuery({
    queryKey: accountQueryKeys.list(scope, search),
    resource: 'accounts',
    accountId: search.accountId ?? null,
    canRead: paged ? canReadAdminAccounts : canReadAccounts,
    enabled,
    queryFn: (signal) => readAccountsList(rpc, search, paged, signal),
  });
}

export function useAccountDetail(accountId: string | undefined): UseQueryResult<AccountView, Error> {
  const { rpc } = useAppServices();
  const scope = useQueryScope();
  const parsed = uuidSchema.safeParse(accountId);
  const validId = parsed.success ? parsed.data : null;
  return useResourceQuery({
    queryKey: accountQueryKeys.detail(scope, validId),
    resource: 'accounts',
    accountId: validId,
    canRead: canReadAccounts,
    enabled: validId !== null,
    queryFn: (signal) => {
      if (validId === null) throw new Error('账户 ID 无效');
      return readAccountDetail(rpc, validId, signal);
    },
  });
}
