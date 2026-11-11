import { parseReadOutcome, ReadContractError } from '@/lib/read-only/response';
import { uuidSchema } from '@/lib/read-only/schemas';
import type { RpcApi } from '@/services/api/rpc';
import { accountFilters } from './query-keys';
import {
  type AccountListSearch,
  type AccountsListView,
  type AccountView,
  accountArraySchema,
  accountPageSchema,
  accountSearchSchema,
  accountViewSchema,
} from './schemas';
import type { AccountDetailInput, AccountsQueryInput, AdminAccountsQueryInput } from './types';

export async function readAccountsList(
  rpc: RpcApi,
  search: AccountListSearch,
  paged: boolean,
  signal?: AbortSignal,
): Promise<AccountsListView> {
  const valid = accountSearchSchema.parse(search);
  if (paged) {
    const query = {
      ...accountFilters(valid),
      page: String(valid.page),
      pageSize: String(valid.pageSize),
    } satisfies AdminAccountsQueryInput;
    const outcome = await rpc.request((client) => client.api.v1.admin.accounts.$get({ query }), { signal });
    return { kind: 'paged', ...parseReadOutcome(outcome, accountPageSchema) };
  }
  // 普通账户接口忽略分页，不发送页码，也不伪造分页结果。
  const query = accountFilters(valid) satisfies AccountsQueryInput;
  const outcome = await rpc.request((client) => client.api.v1.accounts.$get({ query }), { signal });
  return { kind: 'array', items: parseReadOutcome(outcome, accountArraySchema) };
}

export async function readAccountDetail(
  rpc: RpcApi,
  accountId: string,
  signal?: AbortSignal,
): Promise<AccountView> {
  const param = { id: uuidSchema.parse(accountId) } satisfies AccountDetailInput;
  const outcome = await rpc.request((client) => client.api.v1.accounts[':id'].$get({ param }), { signal });
  const account = parseReadOutcome(outcome, accountViewSchema);
  if (account.id.toLowerCase() !== param.id.toLowerCase()) throw new ReadContractError(['id']);
  return account;
}
