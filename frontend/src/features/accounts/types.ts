import type { ApiClient } from '@project/api-contracts';
import type { InferRequestType, InferResponseType } from 'hono/client';

type AccountClient = ApiClient['api']['v1']['accounts'];
type AdminAccountClient = ApiClient['api']['v1']['admin']['accounts'];

export type AccountDto = InferResponseType<AccountClient[':id']['$get']>['data'];
export type AccountsArrayDto = InferResponseType<AccountClient['$get']>['data'];
export type AccountsPageDto = InferResponseType<AdminAccountClient['$get']>['data'];
export type AccountsQueryInput = InferRequestType<AccountClient['$get']>['query'];
export type AdminAccountsQueryInput = InferRequestType<AdminAccountClient['$get']>['query'];
export type AccountDetailInput = InferRequestType<AccountClient[':id']['$get']>['param'];
