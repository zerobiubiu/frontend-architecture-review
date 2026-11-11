import type { ApiClient } from '@project/api-contracts';
import {
  filterSchema,
  operationKinds,
  operationStatuses,
  operationTargetTypes,
} from '@project/api-contracts/validation';
import type { InferRequestType, InferResponseType } from 'hono/client';
import { z } from 'zod';
import { reconciliationDetailsSchema } from '@/features/reconciliations/schemas';
import {
  decimalTextSchema,
  nonnegativeCountSchema,
  nullableDecimalTextSchema,
  pagedSchema,
  rawTimeSchema,
  uuidSchema,
} from '@/lib/read-only/schemas';
import { parseReceipt } from '@/services/api/response';

type OperationListEndpoint = ApiClient['api']['v1']['operations']['$get'];
type OperationDetailEndpoint = ApiClient['api']['v1']['operations'][':id']['$get'];
type EventEndpoint = ApiClient['api']['v1']['logs']['$get'];
export type OperationListRequest = InferRequestType<OperationListEndpoint>;
export type OperationDetailRequest = InferRequestType<OperationDetailEndpoint>;
export type OperationDataDto = InferResponseType<OperationDetailEndpoint>['data'];
export type OperationListDataDto = InferResponseType<OperationListEndpoint>['data'];
export type BusinessEventsRequest = InferRequestType<EventEndpoint>;
export type BusinessEventsDataDto = InferResponseType<EventEndpoint>['data'];

// 这不是原请求、输入或原身份，只保留已公开的附加结果字段。
export const publicOperationResultSchema = z.object({
  status: z.string().max(256).optional(),
  connectionStatus: z.string().max(256).optional(),
  connectionMessage: z.string().max(4_000).nullable().optional(),
  walletSyncError: z.string().max(4_000).nullable().optional(),
  assetMessage: z.string().max(4_000).optional(),
  source: z.string().max(256).optional(),
  assetsAvailable: z.boolean().optional(),
  exchangeAccountId: uuidSchema.optional(),
  symbol: z.string().max(128).optional(),
  side: z.string().max(32).optional(),
  orderType: z.string().max(32).optional(),
  price: nullableDecimalTextSchema.optional(),
  quantity: nullableDecimalTextSchema.optional(),
  notional: nullableDecimalTextSchema.optional(),
  fee: nullableDecimalTextSchema.optional(),
  priceCurrency: z.literal('USD').optional(),
  feeCurrency: z.literal('USD').nullable().optional(),
  filledQuantity: decimalTextSchema.optional(),
  filledNotional: decimalTextSchema.optional(),
  cashBalance: nullableDecimalTextSchema.optional(),
  availableCash: nullableDecimalTextSchema.optional(),
  orderIds: z.array(uuidSchema).optional(),
  taskIds: z.array(uuidSchema).optional(),
  historyTo: rawTimeSchema.optional(),
  details: reconciliationDetailsSchema.optional(),
  emergencyStop: z.boolean().optional(),
  tradingEnabled: z.boolean().optional(),
  canManageAdmins: z.boolean().optional(),
});
export type PublicOperationResult = z.infer<typeof publicOperationResultSchema>;

type OperationViewDto = Omit<OperationDataDto, 'result'> & { result: PublicOperationResult | null };
const operationViewSchema = z
  .object({
    id: uuidSchema,
    actorUserId: uuidSchema,
    kind: z.enum(operationKinds),
    targetType: z.enum(operationTargetTypes),
    targetId: z.string().min(1).max(128),
    status: z.enum(operationStatuses),
    phase: z.string().min(1).max(256),
    outcome: z.string().max(256).nullable(),
    createdAt: rawTimeSchema,
    updatedAt: rawTimeSchema,
    finishedAt: rawTimeSchema.nullable(),
    result: publicOperationResultSchema.nullable(),
    error: z.object({ code: z.string().max(256), message: z.string().max(4_000) }).nullable(),
  })
  .superRefine((receipt, context) => {
    if (
      receipt.targetType === 'PLATFORM'
        ? receipt.targetId !== 'platform'
        : !uuidSchema.safeParse(receipt.targetId).success
    ) {
      context.addIssue({ code: 'custom', path: ['targetId'], message: '目标标识无效' });
    }
  }) satisfies z.ZodType<OperationViewDto>;
export type OperationView = z.infer<typeof operationViewSchema>;
export type OperationRead =
  | { readonly kind: 'absent' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'valid'; readonly receipt: OperationView };

// GET 回执位于 data，而非写信封的顶层 operation；保留三态，
// 不把 parser.raw/reason 或未挑选响应字段放入 Query/UI。
export const operationReadSchema = z.unknown().transform((value): OperationRead => {
  const parsed = parseReceipt(value);
  if (parsed.kind === 'absent') return { kind: 'absent' };
  if (parsed.kind === 'invalid') return { kind: 'invalid' };
  const view = operationViewSchema.safeParse(parsed.receipt);
  return view.success ? { kind: 'valid', receipt: view.data } : { kind: 'invalid' };
});
export const operationListSchema = z.array(operationReadSchema);

export const businessEventsSearchSchema = filterSchema.pick({
  accountId: true,
  ownerUserId: true,
  symbol: true,
  status: true,
  search: true,
  from: true,
  to: true,
  page: true,
  pageSize: true,
});
export type BusinessEventsSearch = z.infer<typeof businessEventsSearchSchema>;

const publicEventDetailsSchema = z.object({
  accountId: uuidSchema.optional(),
  orderId: uuidSchema.optional(),
  symbol: z.string().max(128).optional(),
  code: z.string().max(256).optional(),
  reason: z.string().max(4_000).optional(),
  clientOrderId: z.string().max(256).optional(),
  source: z.string().max(256).optional(),
  reservedCash: decimalTextSchema.optional(),
  reservedQuantity: decimalTextSchema.optional(),
  automatic: z.boolean().optional(),
  autoCancelMode: z.string().max(256).nullable().optional(),
  submitted: z.boolean().optional(),
  submissionStarted: z.boolean().optional(),
  requestNotSent: z.boolean().optional(),
  pendingOrders: nonnegativeCountSchema.optional(),
  checkedTasks: nonnegativeCountSchema.optional(),
});
type BusinessEventViewDto = Omit<BusinessEventsDataDto['items'][number], 'details'> & {
  details: z.infer<typeof publicEventDetailsSchema>;
};
export const businessEventSchema = z.object({
  id: z.string().min(1).max(256),
  ownerUserId: uuidSchema.nullable(),
  resourceType: z.string().min(1).max(128),
  resourceId: uuidSchema.nullable(),
  type: z.string().min(1).max(256),
  message: z.string().max(8_000),
  details: publicEventDetailsSchema,
  createdAt: rawTimeSchema,
}) satisfies z.ZodType<BusinessEventViewDto>;
export const businessEventsDataSchema = pagedSchema(businessEventSchema);
export type BusinessEvent = z.infer<typeof businessEventSchema>;
export type BusinessEventsData = z.infer<typeof businessEventsDataSchema>;
