import type { ApiClient } from '@project/api-contracts';
import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseReadOutcome, ReadContractError } from '@/lib/read-only/response';
import type { RpcApi } from '@/services/api/rpc';
import { type CatalogPage, catalogPageSchema, type SecuritiesSearch } from './schemas';

type SymbolsEndpoint = ApiClient['api']['v1']['market']['symbols']['$get'];
export type CatalogRequest = InferRequestType<SymbolsEndpoint>['query'];
export type CatalogDto = InferResponseType<SymbolsEndpoint>['data'];
export type EquityRuleDto = CatalogDto['items'][number];

export async function readSecurities(
  rpc: RpcApi,
  search: SecuritiesSearch,
  signal: AbortSignal,
): Promise<CatalogPage> {
  if (!search.accountId) throw new Error('读取证券目录前请选择账户');
  const query = {
    accountId: search.accountId,
    ...(search.search !== undefined ? { search: search.search } : {}),
    page: String(search.page),
    pageSize: String(search.pageSize),
  } satisfies CatalogRequest;
  const data = parseReadOutcome(
    await rpc.request((client) => client.api.v1.market.symbols.$get({ query }), { signal }),
    catalogPageSchema,
  );
  if (data.page !== search.page || data.pageSize !== search.pageSize) {
    throw new ReadContractError(['page', 'pageSize']);
  }
  return data;
}
