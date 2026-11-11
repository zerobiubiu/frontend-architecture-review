import type { ApiClient } from '@project/api-contracts';
import { filterSchema } from '@project/api-contracts/validation';
import type { InferRequestType, InferResponseType } from 'hono/client';
import { z } from 'zod';
import {
  decimalTextSchema,
  nonnegativeCountSchema,
  nullableDecimalTextSchema,
  rawTimeSchema,
  uuidSchema,
} from '@/lib/read-only/schemas';

type ReconciliationEndpoint = ApiClient['api']['v1']['reconciliations']['$get'];
export type ReconciliationRequest = InferRequestType<ReconciliationEndpoint>;
export type ReconciliationDataDto = InferResponseType<ReconciliationEndpoint>['data'];

// 该数组接口没有有效的 symbol/search/page/pageSize 筛选能力。
export const reconciliationSearchSchema = filterSchema.pick({
  accountId: true,
  ownerUserId: true,
  status: true,
  from: true,
  to: true,
});
export type ReconciliationSearch = z.infer<typeof reconciliationSearchSchema>;

const fundingEvidenceSchema = z.object({
  source: z.literal('BINANCE_WALLET'),
  walletType: z.literal('CARD'),
  asset: z.literal('USDC'),
  free: decimalTextSchema,
  locked: decimalTextSchema,
  freeze: nullableDecimalTextSchema,
  withdrawing: nullableDecimalTextSchema,
  receivedAt: rawTimeSchema,
});

// 只保留已记录的公开证据字段，任意 JSON 不作为主要展示模型。
export const reconciliationDetailsSchema = z.object({
  source: z.string().min(1).optional(),
  walletSource: z.string().min(1).optional(),
  assetsAvailable: z.boolean().optional(),
  message: z.string().max(4_000).optional(),
  walletSnapshot: z
    .object({
      source: z.literal('BINANCE_WALLET'),
      receivedAt: rawTimeSchema,
      funding: fundingEvidenceSchema.nullable(),
    })
    .nullable()
    .optional(),
  walletError: z.string().max(4_000).nullable().optional(),
  cashBalance: nullableDecimalTextSchema.optional(),
  unresolvedOrderIds: z.array(uuidSchema).optional(),
  unmanagedExchangeOrderIds: z.array(z.string().min(1).max(256)).optional(),
  exchangeTradeHistoryTotal: nonnegativeCountSchema.nullable().optional(),
  historyError: z.string().max(4_000).nullable().optional(),
  note: z.string().max(4_000).optional(),
});
export type ReconciliationDetails = z.infer<typeof reconciliationDetailsSchema>;

type ReconciliationViewDto = Omit<ReconciliationDataDto[number], 'details'> & {
  details: ReconciliationDetails;
};
export const reconciliationRecordSchema = z.object({
  id: uuidSchema,
  ownerUserId: uuidSchema,
  exchangeAccountId: uuidSchema,
  status: z.string().min(1),
  createdAt: rawTimeSchema,
  details: reconciliationDetailsSchema,
}) satisfies z.ZodType<ReconciliationViewDto>;
export const reconciliationDataSchema = z.array(reconciliationRecordSchema);
export type ReconciliationRecord = z.infer<typeof reconciliationRecordSchema>;
