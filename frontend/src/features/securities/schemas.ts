import { filterSchema } from '@project/api-contracts/validation';
import { z } from 'zod';
import { nullableDecimalTextSchema, pagedSchema, rawTimeSchema } from '@/lib/read-only/schemas';
import type { CatalogDto, EquityRuleDto } from './api';

// 目录使用专有 search（trim、128），不是公共 F 的原串/100 字符规则。
export const securitiesSearchSchema = filterSchema
  .pick({ accountId: true, page: true, pageSize: true })
  .extend({ search: z.string().trim().max(128).optional() });
export type SecuritiesSearch = z.infer<typeof securitiesSearchSchema>;

const nullableEpochMilliseconds = z
  .number()
  .int()
  .safe()
  .min(-8640000000000000)
  .max(8640000000000000)
  .nullable();
export const equityRuleSchema: z.ZodType<EquityRuleDto> = z.object({
  symbol: z.string().min(1),
  tradability: z.string().nullable(),
  extendedSession: z.boolean().nullable(),
  overnightSupported: z.boolean().nullable(),
  fractionable: z.boolean().nullable(),
  fractionableEh: z.boolean().nullable(),
  listingTime: nullableEpochMilliseconds,
  delistingTime: nullableEpochMilliseconds,
  maxNumOrders: z.number().int().nonnegative().safe().nullable(),
  stepSize: nullableDecimalTextSchema,
  minQuantity: nullableDecimalTextSchema,
  maxQuantity: nullableDecimalTextSchema,
  minNotional: nullableDecimalTextSchema,
  maxNotional: nullableDecimalTextSchema,
});
export const catalogPageSchema: z.ZodType<CatalogDto> = pagedSchema(equityRuleSchema).extend({
  source: z.literal('BINANCE_STOCKS'),
  fetchedAt: rawTimeSchema,
  expiresAt: rawTimeSchema,
});
export type EquityRule = z.infer<typeof equityRuleSchema>;
export type CatalogPage = z.infer<typeof catalogPageSchema>;
