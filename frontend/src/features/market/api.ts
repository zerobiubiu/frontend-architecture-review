import type { ApiClient } from '@project/api-contracts';
import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseReadOutcome, ReadContractError } from '@/lib/read-only/response';
import type { RpcApi } from '@/services/api/rpc';
import { type MarketSearch, quotesSchema } from './schemas';

type QuotesEndpoint = ApiClient['api']['v1']['market']['quotes']['$get'];
export type QuoteRequest = InferRequestType<QuotesEndpoint>['query'];
export type QuotesDto = InferResponseType<QuotesEndpoint>['data'];
export type QuoteDto = QuotesDto[number];

export async function readQuotes(rpc: RpcApi, search: MarketSearch, signal: AbortSignal): Promise<QuotesDto> {
  // 后端允许省略账户并选择最老 ACTIVE 账户；此页始终显式选账户，避免隐含跨账户来源。
  if (!search.accountId || !search.symbol) throw new Error('请选择账户并输入证券代码');
  const query = { accountId: search.accountId, symbol: search.symbol } satisfies QuoteRequest;
  const data = parseReadOutcome(
    await rpc.request((client) => client.api.v1.market.quotes.$get({ query }), { signal }),
    quotesSchema,
  );
  if (data[0]?.symbol !== search.symbol) throw new ReadContractError(['0.symbol']);
  return data;
}
