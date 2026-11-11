import { filterSchema, symbolSchema } from '@project/api-contracts/validation';
import { z } from 'zod';
import {
  decimalTextSchema,
  nullableDecimalTextSchema,
  pagedSchema,
  rawTimeSchema,
} from '@/lib/read-only/schemas';
import type { OfficialTradeRow, OfficialTradesResponse } from './types';

// 与公共 F.symbol 不同，官方历史使用公开的规范化证券代码 schema。
const historyFields = filterSchema
  .pick({ accountId: true, from: true, to: true, page: true, pageSize: true })
  .extend({ symbol: symbolSchema.optional() });

export const tradeSearchSchema = historyFields.superRefine((value, context) => {
  if (value.from && Date.parse(value.from) < 0) {
    context.addIssue({ code: 'custom', path: ['from'], message: '官方历史起点不能早于 Unix epoch' });
  }
  if (value.from && value.to && Date.parse(value.from) > Date.parse(value.to)) {
    context.addIssue({ code: 'custom', path: ['to'], message: 'UTC 起点不得晚于终点' });
  }
});
export type TradeSearch = z.infer<typeof tradeSearchSchema>;

// 请求和翻页前均需明确起止时间，不使用随时钟漂移的服务端默认窗口。
export const officialHistoryRequestSchema = tradeSearchSchema.refine(
  (value) => value.accountId !== undefined && value.from !== undefined && value.to !== undefined,
  { message: '请选择账户并填写固定的 UTC 起止筛选时间' },
);

export const officialTradeSchema = z.object({
  exchangeTradeId: z.string().min(1),
  exchangeOrderId: z.string().min(1),
  symbol: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  price: decimalTextSchema,
  priceCurrency: z.literal('USD'),
  quantity: decimalTextSchema,
  notional: nullableDecimalTextSchema,
  notionalCurrency: z.literal('USD'),
  fee: z.null(),
  quoteCurrency: z.string().min(1).nullable(),
  filledAt: rawTimeSchema,
  updatedAt: rawTimeSchema.nullable(),
}) satisfies z.ZodType<OfficialTradeRow>;
export const officialTradesSchema = pagedSchema(
  officialTradeSchema,
) satisfies z.ZodType<OfficialTradesResponse>;
