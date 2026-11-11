import { parseReadOutcome } from '@/lib/read-only/response';
import type { RpcApi } from '@/services/api/rpc';
import { type LedgerData, type LedgerRequest, type LedgerSearch, ledgerDataSchema } from './schemas';

export async function readLedger(
  rpc: RpcApi,
  search: LedgerSearch,
  signal: AbortSignal,
): Promise<LedgerData> {
  const query = {
    ...search,
    page: String(search.page),
    pageSize: String(search.pageSize),
  } satisfies LedgerRequest['query'];
  return parseReadOutcome(
    await rpc.request((client) => client.api.v1.ledger.$get({ query }), { signal }),
    ledgerDataSchema,
  );
}
