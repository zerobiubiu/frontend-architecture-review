import { parseReadOutcome } from '@/lib/read-only/response';
import type { RpcApi } from '@/services/api/rpc';
import {
  type ReconciliationRecord,
  type ReconciliationRequest,
  type ReconciliationSearch,
  reconciliationDataSchema,
} from './schemas';

export async function readReconciliations(
  rpc: RpcApi,
  search: ReconciliationSearch,
  signal: AbortSignal,
): Promise<ReconciliationRecord[]> {
  const query = search satisfies ReconciliationRequest['query'];
  return parseReadOutcome(
    await rpc.request((client) => client.api.v1.reconciliations.$get({ query }), { signal }),
    reconciliationDataSchema,
  );
}
