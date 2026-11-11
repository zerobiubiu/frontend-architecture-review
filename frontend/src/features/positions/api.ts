import { equityHoldingsQuerySchema } from '@project/api-contracts/validation';
import { parseReadOutcome, ReadContractError } from '@/lib/read-only/response';
import type { RpcApi } from '@/services/api/rpc';
import { holdingsSchema, type PositionSearch, positionSearchSchema, positionsSchema } from './schemas';
import type { HoldingsRequest, HoldingsResponse, PositionsRequest, PositionsResponse } from './types';

export async function readPositions(
  rpc: RpcApi,
  search: PositionSearch,
  signal: AbortSignal,
): Promise<PositionsResponse> {
  const parsed = positionSearchSchema.parse(search);
  const query = {
    accountId: parsed.accountId,
    ownerUserId: parsed.ownerUserId,
    symbol: parsed.symbol,
    from: parsed.from,
    to: parsed.to,
    page: String(parsed.page),
    pageSize: String(parsed.pageSize),
  } satisfies PositionsRequest['query'];
  const outcome = await rpc.request((client) => client.api.v1.positions.$get({ query }), { signal });
  const data = parseReadOutcome(outcome, positionsSchema);
  const expectedAccountId = parsed.accountId?.toLowerCase();
  if (
    expectedAccountId &&
    data.items.some((row) => row.exchangeAccountId.toLowerCase() !== expectedAccountId)
  ) {
    throw new ReadContractError(['items.exchangeAccountId']);
  }
  return data;
}

export async function readOfficialHoldings(
  rpc: RpcApi,
  accountId: string,
  signal: AbortSignal,
): Promise<HoldingsResponse> {
  const query = equityHoldingsQuerySchema.parse({ accountId }) satisfies HoldingsRequest['query'];
  const outcome = await rpc.request((client) => client.api.v1.market.holdings.$get({ query }), { signal });
  const data = parseReadOutcome(outcome, holdingsSchema);
  if (data.accountId.toLowerCase() !== accountId.toLowerCase()) throw new ReadContractError(['accountId']);
  return data;
}
