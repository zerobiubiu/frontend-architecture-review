import { filterSchema, taskStatuses } from '@project/api-contracts/validation';
import { z } from 'zod';
import { localTradeSchema, orderViewSchema } from '@/features/orders/schemas';
import {
  decimalTextSchema,
  nonnegativeCountSchema,
  nullableDecimalTextSchema,
  pagedSchema,
  rawTimeSchema,
  uuidSchema,
} from '@/lib/read-only/schemas';
import type { TaskDetailDto, TaskDto, TaskInterruptionDto, TasksDto } from './types';

export const taskSearchSchema = filterSchema.pick({
  accountId: true,
  ownerUserId: true,
  symbol: true,
  status: true,
  from: true,
  to: true,
  search: true,
  page: true,
  pageSize: true,
});
export type TaskListSearch = z.infer<typeof taskSearchSchema>;

type LimitConfigDto = Extract<TaskDto['config'], { orderType: 'LIMIT' }>;
// 历史 LIMIT 配置可能早于当前公开创建输入的默认字段。
type ReadConfigDto =
  | (Omit<LimitConfigDto, 'priceRounding'> & Partial<Pick<LimitConfigDto, 'priceRounding'>>)
  | Exclude<TaskDto['config'], { orderType: 'LIMIT' }>;
type ReadTaskDto = Omit<TaskDto, 'config'> & { config: ReadConfigDto };
type ReadTasksDto = Omit<TasksDto, 'items'> & {
  items: (ReadTaskDto & Pick<TasksDto['items'][number], 'lastInterruption'>)[];
};
type ReadTaskDetailDto = Omit<TaskDetailDto, 'task'> & { task: ReadTaskDto };

const configFields = {
  accountId: uuidSchema,
  name: z.string().min(1),
  symbol: z.string().min(1),
  executionWindowSeconds: z.number().int().positive(),
  // 权威原时间不套用创建/编辑 schema，也不被 ORM 毫秒列替代。
  scheduledStartAt: rawTimeSchema.nullable().optional(),
  executionMode: z.enum(['SERIAL', 'INTERVAL']),
  globalIntervalSeconds: z.number().positive(),
  intervalMode: z.enum(['FIXED', 'RANDOM']),
  fixedIntervalSeconds: z.number().positive(),
  randomIntervalMin: z.number().positive(),
  randomIntervalMax: z.number().positive(),
  autoCancelMode: z.enum(['KEEP', 'AFTER_TIMEOUT', 'AT_TASK_END']),
  orderTimeoutSeconds: z.number().int().positive(),
  remainderPolicy: z.enum(['EXACT', 'FIXED']),
};
const quantityFields = {
  targetQuantity: decimalTextSchema,
  quantityMode: z.enum(['FIXED', 'RANDOM']),
  fixedQuantity: decimalTextSchema,
  randomQuantityMin: z.number().int().positive(),
  randomQuantityMax: z.number().int().positive(),
};
export const taskConfigSchema = z.union([
  z
    .object({
      ...configFields,
      ...quantityFields,
      orderType: z.literal('LIMIT'),
      side: z.enum(['BUY', 'SELL']),
      priceRule: z.enum(['BID_1', 'ASK_1', 'FIXED']),
      fixedPrice: nullableDecimalTextSchema,
      priceRounding: z.enum(['SIDE_SAFE', 'TRUNCATE', 'HALF_UP', 'CEIL', 'REJECT']).optional(),
      tradingSession: z.enum(['RTH', 'EXTENDED', '24H']),
      timeInForce: z.enum(['DAY', 'GTC']),
    })
    .strict(),
  z
    .object({
      ...configFields,
      ...quantityFields,
      orderType: z.literal('MARKET'),
      side: z.literal('SELL'),
      timeInForce: z.literal('DAY'),
    })
    .strict(),
  z
    .object({
      ...configFields,
      orderType: z.literal('MARKET'),
      side: z.literal('BUY'),
      timeInForce: z.literal('DAY'),
      targetNotional: decimalTextSchema,
      notionalMode: z.enum(['FIXED', 'RANDOM']),
      fixedNotional: decimalTextSchema,
      randomNotionalMin: decimalTextSchema,
      randomNotionalMax: decimalTextSchema,
    })
    .strict(),
]) satisfies z.ZodType<ReadConfigDto>;
export type TaskConfigView = z.infer<typeof taskConfigSchema>;

export const taskViewSchema = z.object({
  id: uuidSchema,
  ownerUserId: uuidSchema,
  exchangeAccountId: uuidSchema,
  name: z.string().min(1),
  symbol: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  orderType: z.enum(['LIMIT', 'MARKET']),
  targetQuantity: nullableDecimalTextSchema,
  targetNotional: nullableDecimalTextSchema,
  config: taskConfigSchema,
  status: z.enum(taskStatuses),
  filledQuantity: decimalTextSchema,
  filledNotional: decimalTextSchema,
  reservedCash: decimalTextSchema,
  reservedQuantity: decimalTextSchema,
  scheduledStartAt: rawTimeSchema.nullable(),
  startedAt: rawTimeSchema.nullable(),
  deadlineAt: rawTimeSchema.nullable(),
  endedAt: rawTimeSchema.nullable(),
  lastFilledAt: rawTimeSchema.nullable(),
  nextRunAt: rawTimeSchema.nullable(),
  stopReason: z.string().nullable(),
  reason: z.string().nullable(),
  leaseOwner: z.string().nullable(),
  leaseUntil: rawTimeSchema.nullable(),
  createdAt: rawTimeSchema,
  updatedAt: rawTimeSchema,
}) satisfies z.ZodType<ReadTaskDto>;
export type TaskView = z.infer<typeof taskViewSchema>;

export const taskInterruptionSchema = z.object({
  eventId: uuidSchema,
  status: z.enum(['PAUSED', 'RECOVERY_REQUIRED', 'RECONCILING']),
  reason: z.string(),
  stopReason: z.string().nullable(),
  occurredAt: rawTimeSchema,
}) satisfies z.ZodType<TaskInterruptionDto>;
export type TaskInterruptionView = z.infer<typeof taskInterruptionSchema>;

export const taskSummarySchema = z.object({
  targetQuantity: nullableDecimalTextSchema,
  filledQuantity: decimalTextSchema,
  remainingQuantity: nullableDecimalTextSchema,
  targetNotional: nullableDecimalTextSchema,
  filledNotional: decimalTextSchema,
  remainingNotional: nullableDecimalTextSchema,
  submittedOrders: nonnegativeCountSchema,
  filledOrders: nonnegativeCountSchema,
  partialOrders: nonnegativeCountSchema,
  canceledOrders: nonnegativeCountSchema,
  rejectedOrders: nonnegativeCountSchema,
}) satisfies z.ZodType<TaskDetailDto['summary']>;
export type TaskSummaryView = z.infer<typeof taskSummarySchema>;

export const taskEventSchema = z.object({
  id: uuidSchema,
  ownerUserId: uuidSchema,
  taskId: uuidSchema,
  type: z.string().min(1),
  message: z.string(),
  details: z.record(z.string(), z.json()),
  createdAt: rawTimeSchema,
}) satisfies z.ZodType<TaskDetailDto['events'][number]>;

export const tasksPageSchema = pagedSchema(
  taskViewSchema.extend({
    lastInterruption: taskInterruptionSchema.nullable(),
  }),
).extend({ source: z.literal('LOCAL_LEDGER') }) satisfies z.ZodType<ReadTasksDto>;
export type TaskListView = z.infer<typeof tasksPageSchema>['items'][number];
export const taskDetailSchema = z.object({
  task: taskViewSchema,
  lastInterruption: taskInterruptionSchema.nullable(),
  source: z.literal('LOCAL_LEDGER'),
  orders: z.array(orderViewSchema),
  trades: z.array(localTradeSchema),
  events: z.array(taskEventSchema),
  summary: taskSummarySchema,
}) satisfies z.ZodType<ReadTaskDetailDto>;
