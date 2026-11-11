import { parseReadOutcome } from '@/lib/read-only/response';
import type { RpcApi } from '@/services/api/rpc';
import {
  type BusinessEventsData,
  type BusinessEventsRequest,
  type BusinessEventsSearch,
  businessEventsDataSchema,
  type OperationDetailRequest,
  type OperationRead,
  operationListSchema,
  operationReadSchema,
} from './schemas';

export async function readUnresolvedOperations(rpc: RpcApi, signal: AbortSignal): Promise<OperationRead[]> {
  return parseReadOutcome(
    await rpc.request((client) => client.api.v1.operations.$get(), { signal }),
    operationListSchema,
  );
}

export async function readOperation(rpc: RpcApi, id: string, signal: AbortSignal): Promise<OperationRead> {
  const param = { id } satisfies OperationDetailRequest['param'];
  const result = parseReadOutcome(
    await rpc.request((client) => client.api.v1.operations[':id'].$get({ param }), { signal }),
    operationReadSchema,
  );
  // 这里只核对响应与查询 URL，不从回执反构原请求身份。
  return result.kind === 'valid' && result.receipt.id.toLowerCase() !== id.toLowerCase()
    ? { kind: 'invalid' }
    : result;
}

export async function readBusinessEvents(
  rpc: RpcApi,
  search: BusinessEventsSearch,
  signal: AbortSignal,
): Promise<BusinessEventsData> {
  const query = {
    ...search,
    page: String(search.page),
    pageSize: String(search.pageSize),
  } satisfies BusinessEventsRequest['query'];
  return parseReadOutcome(
    await rpc.request((client) => client.api.v1.logs.$get({ query }), { signal }),
    businessEventsDataSchema,
  );
}
