import type { ApiClient } from '@project/api-contracts';
import type { InferRequestType, InferResponseType } from 'hono/client';

type TradesEndpoint = ApiClient['api']['v1']['accounts'][':id']['exchange']['trades']['$get'];
export type OfficialTradesRequest = InferRequestType<TradesEndpoint>;
export type OfficialTradesResponse = InferResponseType<TradesEndpoint>['data'];
export type OfficialTradeRow = OfficialTradesResponse['items'][number];
