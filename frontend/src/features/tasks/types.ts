import type { ApiClient } from '@project/api-contracts';
import type { InferRequestType, InferResponseType } from 'hono/client';

type TasksEndpoint = ApiClient['api']['v1']['tasks'];
type TaskEndpoint = TasksEndpoint[':id'];
export type TasksRequest = InferRequestType<TasksEndpoint['$get']>;
export type TasksDto = InferResponseType<TasksEndpoint['$get']>['data'];
export type TaskDetailRequest = InferRequestType<TaskEndpoint['$get']>;
export type TaskDetailDto = InferResponseType<TaskEndpoint['$get']>['data'];
export type TaskDto = TaskDetailDto['task'];
export type TaskInterruptionDto = NonNullable<TaskDetailDto['lastInterruption']>;
