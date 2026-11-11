import type { ApiClient } from '@project/api-contracts';
import type { InferRequestType, InferResponseType } from 'hono/client';

type OrdersEndpoint = ApiClient['api']['v1']['orders'];
type OrderEndpoint = OrdersEndpoint[':id'];
export type OrdersRequest = InferRequestType<OrdersEndpoint['$get']>;
export type OrdersDto = InferResponseType<OrdersEndpoint['$get']>['data'];
export type OrderDetailRequest = InferRequestType<OrderEndpoint['$get']>;
export type OrderDetailDto = InferResponseType<OrderEndpoint['$get']>['data'];
export type OrderDto = OrdersDto['items'][number];
export type LocalTradeDto = OrderDetailDto['trades'][number];
export type OrderEventDto = OrderDetailDto['events'][number];
