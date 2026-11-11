import type { ApiClient } from '@project/api-contracts';
import type { InferRequestType, InferResponseType } from 'hono/client';

type PositionsEndpoint = ApiClient['api']['v1']['positions']['$get'];
type HoldingsEndpoint = ApiClient['api']['v1']['market']['holdings']['$get'];

export type PositionsRequest = InferRequestType<PositionsEndpoint>;
export type PositionsResponse = InferResponseType<PositionsEndpoint>['data'];
export type PositionRow = PositionsResponse['items'][number];
export type HoldingsRequest = InferRequestType<HoldingsEndpoint>;
export type HoldingsResponse = InferResponseType<HoldingsEndpoint>['data'];
export type HoldingRow = HoldingsResponse['items'][number];
