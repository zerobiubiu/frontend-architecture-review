import type { ApiClient } from '@project/api-contracts';
import type { InferRequestType, InferResponseType } from 'hono/client';

type AdminClient = ApiClient['api']['v1']['admin'];

export type AdminOverviewDto = InferResponseType<AdminClient['overview']['$get']>['data'];
export type AdminUsersRequest = InferRequestType<AdminClient['users']['$get']>['query'];
export type AdminUsersDto = InferResponseType<AdminClient['users']['$get']>['data'];
export type AdminUserView = AdminUsersDto['items'][number];
export type AdminAuditRequest = InferRequestType<AdminClient['audit']['$get']>['query'];
export type AdminAuditDto = InferResponseType<AdminClient['audit']['$get']>['data'];
export type AdminAuditView = AdminAuditDto['items'][number];
export type AdminSystemDto = InferResponseType<AdminClient['system']['$get']>['data'];
export type SettingsView = AdminSystemDto['settings'];
export type SystemEventView = AdminSystemDto['events'][number];
export type HeartbeatView = AdminSystemDto['heartbeats'][number];
export type EndpointView = NonNullable<AdminSystemDto['endpoints']>['results'][number];
export type HealthDto = InferResponseType<ApiClient['healthz']['$get']>['data'];

// 源码已核实的生成声明差异：queries.workerState 无心跳返回 null；
// admin overview/system 在 platform settings 行缺失时返回 null，而不是默认配置。
export type WorkerView = Omit<AdminOverviewDto['worker'], 'lastSeenAt'> & {
  lastSeenAt: string | null;
};
export type AdminOverviewView = Omit<AdminOverviewDto, 'worker' | 'settings'> & {
  worker: WorkerView;
  settings: SettingsView | null;
};
export type AdminSystemView = Omit<AdminSystemDto, 'settings'> & {
  settings: SettingsView | null;
};

/** 仅 /healthz 的公开 503 数据协议；不作为任何业务请求的成功适配。 */
export interface HealthRead {
  readonly httpStatus: 200 | 503;
  readonly health: HealthDto;
}
