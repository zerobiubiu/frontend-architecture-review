import { filterSchema, symbolSchema } from '@project/api-contracts/validation';
import { z } from 'zod';
import { decimalTextSchema, nullableDecimalTextSchema, rawTimeSchema } from '@/lib/read-only/schemas';
import type { QuoteDto, QuotesDto } from './api';

export const marketSearchSchema = filterSchema.pick({ accountId: true }).extend({
  symbol: symbolSchema.optional(),
});
export type MarketSearch = z.infer<typeof marketSearchSchema>;

// REST 的 Quote 不是 SSE snapshot；不凭空补 event/source 时间或套用其推送价格约束。
export const quoteSchema: z.ZodType<QuoteDto> = z.object({
  symbol: z.string().min(1),
  bid: decimalTextSchema,
  ask: decimalTextSchema,
  bidSize: nullableDecimalTextSchema,
  askSize: nullableDecimalTextSchema,
  timestamp: rawTimeSchema,
  source: z.literal('BINANCE_STOCKS'),
  timestampSource: z.literal('LOCAL_RECEIPT'),
  tradingStatus: z.enum(['TRADING', 'HALTED', 'UNKNOWN']),
});
export const quotesSchema: z.ZodType<QuotesDto> = z.array(quoteSchema).length(1);
