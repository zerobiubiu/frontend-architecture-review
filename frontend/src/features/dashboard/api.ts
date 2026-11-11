import { parseReadOutcome } from '@/lib/read-only/response';
import type { RpcApi } from '@/services/api/rpc';
import { type OverviewView, overviewSchema } from './schemas';

export async function readOverview(rpc: RpcApi, signal: AbortSignal): Promise<OverviewView> {
  return parseReadOutcome(
    await rpc.request((client) => client.api.v1.overview.$get(), { signal }),
    overviewSchema,
  );
}
