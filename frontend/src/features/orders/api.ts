import { parseReadOutcome } from '@/lib/read-only/response';
import { uuidSchema } from '@/lib/read-only/schemas';
import type { RpcApi } from '@/services/api/rpc';
import { type OrderListSearch, orderDetailSchema, orderSearchSchema, ordersPageSchema } from './schemas';
import type { OrderDetailRequest, OrdersRequest } from './types';

export function ordersQuery(search: OrderListSearch): OrdersRequest['query'] {
  const valid = orderSearchSchema.parse(search);
  return { ...valid, page: String(valid.page), pageSize: String(valid.pageSize) };
}

export async function readOrders(rpc: RpcApi, search: OrderListSearch, signal: AbortSignal) {
  const query = ordersQuery(search);
  const outcome = await rpc.request((client) => client.api.v1.orders.$get({ query }), { signal });
  return parseReadOutcome(outcome, ordersPageSchema);
}

export async function readOrder(rpc: RpcApi, id: string, signal: AbortSignal) {
  const param: OrderDetailRequest['param'] = { id: uuidSchema.parse(id) };
  const outcome = await rpc.request((client) => client.api.v1.orders[':id'].$get({ param }), { signal });
  return parseReadOutcome(outcome, orderDetailSchema);
}
