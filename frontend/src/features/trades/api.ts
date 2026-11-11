import { parseReadOutcome } from '@/lib/read-only/response';
import type { RpcApi } from '@/services/api/rpc';
import { officialHistoryRequestSchema, officialTradesSchema, type TradeSearch } from './schemas';
import type { OfficialTradesRequest, OfficialTradesResponse } from './types';

export async function readOfficialTrades(
  rpc: RpcApi,
  search: TradeSearch,
  signal: AbortSignal,
): Promise<OfficialTradesResponse> {
  const parsed = officialHistoryRequestSchema.parse(search);
  if (!parsed.accountId || !parsed.from || !parsed.to) {
    throw new Error('官方成交历史需要账户和固定 UTC 查询窗口');
  }
  const input = {
    param: { id: parsed.accountId },
    query: {
      symbol: parsed.symbol,
      from: parsed.from,
      to: parsed.to,
      page: String(parsed.page),
      pageSize: String(parsed.pageSize),
    },
  } satisfies OfficialTradesRequest;
  const outcome = await rpc.request((client) => client.api.v1.accounts[':id'].exchange.trades.$get(input), {
    signal,
  });
  return parseReadOutcome(outcome, officialTradesSchema);
}
