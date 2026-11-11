import { filterSchema, roles } from '@project/api-contracts/validation';
import { z } from 'zod';
import {
  decimalTextSchema,
  nonnegativeCountSchema,
  pagedSchema,
  rawTimeSchema,
  uuidSchema,
} from '@/lib/read-only/schemas';
import type {
  AdminAuditView,
  AdminOverviewView,
  AdminSystemView,
  AdminUserView,
  EndpointView,
  HealthDto,
  HeartbeatView,
  SettingsView,
  SystemEventView,
  WorkerView,
} from './types';

const publicDetailsSchema = z.record(z.string(), z.json());
const textSchema = z.string().min(1);

export const adminUserSchema = z
  .object({
    id: uuidSchema,
    username: textSchema,
    role: z.enum(roles),
    status: textSchema,
    canManageAdmins: z.boolean(),
    createdAt: rawTimeSchema,
    updatedAt: rawTimeSchema,
  })
  .refine((user) => user.role === 'ADMIN' || !user.canManageAdmins, {
    path: ['canManageAdmins'],
    message: '交易员不得持有管理员专项权限',
  }) satisfies z.ZodType<AdminUserView>;

export const adminUsersSchema = pagedSchema(adminUserSchema);

export const auditRowSchema = z.object({
  id: uuidSchema,
  actorUserId: uuidSchema.nullable(),
  actorRole: textSchema.nullable(),
  action: textSchema,
  targetType: textSchema,
  // targetId 是公开文本，不限于账户或用户 UUID。
  targetId: z.string().nullable(),
  result: textSchema,
  details: publicDetailsSchema,
  createdAt: rawTimeSchema,
}) satisfies z.ZodType<AdminAuditView>;
export const adminAuditSchema = pagedSchema(auditRowSchema);

export const settingsSchema = z.object({
  id: textSchema,
  environment: z.literal('production'),
  emergencyStop: z.boolean(),
  maxOrderQuantity: nonnegativeCountSchema,
  maxTaskQuantity: nonnegativeCountSchema,
  maxOrderNotional: decimalTextSchema,
  feeReserveRate: decimalTextSchema,
  feeReserveMinimum: decimalTextSchema,
  updatedBy: uuidSchema.nullable(),
  createdAt: rawTimeSchema,
  updatedAt: rawTimeSchema,
}) satisfies z.ZodType<SettingsView>;

export const workerSchema = z.object({
  online: z.boolean(),
  lastSeenAt: rawTimeSchema.nullable(),
  status: textSchema,
}) satisfies z.ZodType<WorkerView>;

export const systemEventSchema = z.object({
  id: nonnegativeCountSchema,
  ownerUserId: uuidSchema.nullable(),
  level: textSchema,
  type: textSchema,
  message: z.string(),
  details: publicDetailsSchema,
  createdAt: rawTimeSchema,
}) satisfies z.ZodType<SystemEventView>;

export const heartbeatSchema = z.object({
  id: textSchema,
  instanceId: textSchema,
  lastSeenAt: rawTimeSchema,
  details: publicDetailsSchema,
}) satisfies z.ZodType<HeartbeatView>;

export const endpointSchema = z.object({
  endpoint: textSchema,
  ok: z.boolean(),
  latencyMs: z.number().finite().nonnegative(),
  error: z.string().nullable(),
}) satisfies z.ZodType<EndpointView>;

const environmentSchema = z.object({
  environment: z.literal('production'),
  label: textSchema,
  tradingReady: z.boolean(),
  availability: z.enum(['AVAILABLE', 'PARTIAL']),
  buySupported: z.boolean(),
  sellSupported: z.boolean(),
  capabilities: z.object({
    quotes: z.boolean(),
    orders: z.boolean(),
    trades: z.boolean(),
    assets: z.boolean(),
    buy: z.boolean(),
    sell: z.boolean(),
  }),
  blockers: z.array(z.string()),
  apiVersion: textSchema,
});

export const adminOverviewSchema = z.object({
  counts: z.object({
    traders: nonnegativeCountSchema,
    admins: nonnegativeCountSchema,
    activeUsers: nonnegativeCountSchema,
    disabledUsers: nonnegativeCountSchema,
    accounts: nonnegativeCountSchema,
    runningTasks: nonnegativeCountSchema,
    openOrders: nonnegativeCountSchema,
    recoveryRequired: nonnegativeCountSchema,
    unknownOrders: nonnegativeCountSchema,
    totalTasks: nonnegativeCountSchema,
    completedTasks: nonnegativeCountSchema,
    failedTasks: nonnegativeCountSchema,
    expiredTasks: nonnegativeCountSchema,
    stoppedTasks: nonnegativeCountSchema,
    unfinishedTasks: nonnegativeCountSchema,
  }),
  worker: workerSchema,
  settings: settingsSchema.nullable(),
  recentEvents: z.array(systemEventSchema),
}) satisfies z.ZodType<AdminOverviewView>;

export const adminSystemSchema = z.object({
  settings: settingsSchema.nullable(),
  heartbeats: z.array(heartbeatSchema),
  events: z.array(systemEventSchema),
  environment: environmentSchema,
  endpoints: z
    .object({
      results: z.array(endpointSchema),
      selected: z.string().nullable(),
      measuredAt: rawTimeSchema,
    })
    .nullable(),
}) satisfies z.ZodType<AdminSystemView>;

export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.object({ online: z.boolean(), environmentValid: z.boolean() }),
  worker: workerSchema,
  environment: textSchema,
  time: rawTimeSchema,
}) satisfies z.ZodType<HealthDto>;

// 只暴露对应 handler 实际使用的公共 F 字段，不制造 role/level/sort 过滤。
export const usersSearchSchema = filterSchema
  .pick({ ownerUserId: true, status: true, from: true, to: true, search: true, page: true, pageSize: true })
  .refine((search) => !search.from || !search.to || Date.parse(search.from) <= Date.parse(search.to), {
    path: ['to'],
    message: '创建起始时间不能晚于结束时间',
  });
export type UsersSearch = z.infer<typeof usersSearchSchema>;

export const auditSearchSchema = filterSchema
  .pick({
    ownerUserId: true,
    accountId: true,
    symbol: true,
    status: true,
    from: true,
    to: true,
    search: true,
    page: true,
    pageSize: true,
  })
  .refine((search) => !search.from || !search.to || Date.parse(search.from) <= Date.parse(search.to), {
    path: ['to'],
    message: '创建起始时间不能晚于结束时间',
  });
export type AuditSearch = z.infer<typeof auditSearchSchema>;
