import type { ApiClient } from '@project/api-contracts';
import { filterSchema } from '@project/api-contracts/validation';
import type { InferRequestType, InferResponseType } from 'hono/client';
import { z } from 'zod';
import {
  decimalTextSchema,
  nullableDecimalTextSchema,
  pagedSchema,
  rawTimeSchema,
  uuidSchema,
} from '@/lib/read-only/schemas';

type LedgerEndpoint = ApiClient['api']['v1']['ledger']['$get'];
export type LedgerRequest = InferRequestType<LedgerEndpoint>;
export type LedgerDataDto = InferResponseType<LedgerEndpoint>['data'];

export const ledgerSearchSchema = filterSchema.pick({
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
export type LedgerSearch = z.infer<typeof ledgerSearchSchema>;

export const ledgerEntrySchema = z.object({
  id: uuidSchema,
  ownerUserId: uuidSchema,
  exchangeAccountId: uuidSchema,
  tradeId: uuidSchema.nullable(),
  orderId: uuidSchema.nullable(),
  type: z.string().min(1),
  amount: decimalTextSchema,
  currency: z.string().min(1).nullable(),
  balanceAfter: nullableDecimalTextSchema,
  description: z.string(),
  createdAt: rawTimeSchema,
  updatedAt: rawTimeSchema,
}) satisfies z.ZodType<LedgerDataDto['items'][number]>;

export const ledgerDataSchema = pagedSchema(ledgerEntrySchema).extend({
  source: z.literal('LOCAL_LEDGER'),
}) satisfies z.ZodType<LedgerDataDto>;
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
export type LedgerData = z.infer<typeof ledgerDataSchema>;
