import { equityHoldingsSchema, filterSchema } from '@project/api-contracts/validation';
import { z } from 'zod';
import { decimalTextSchema, pagedSchema, rawTimeSchema, uuidSchema } from '@/lib/read-only/schemas';
import type { HoldingsResponse, PositionRow, PositionsResponse } from './types';

// 持仓接口忽略 status/search，不展示或发送这些无效筛选。
export const positionSearchSchema = filterSchema
  .pick({
    accountId: true,
    ownerUserId: true,
    symbol: true,
    from: true,
    to: true,
    page: true,
    pageSize: true,
  })
  .refine((value) => !value.from || !value.to || Date.parse(value.from) <= Date.parse(value.to), {
    path: ['to'],
    message: '创建时间起点不得晚于终点',
  });
export type PositionSearch = z.infer<typeof positionSearchSchema>;

export const positionSchema = z.object({
  id: uuidSchema,
  ownerUserId: uuidSchema,
  exchangeAccountId: uuidSchema,
  symbol: z.string().min(1),
  quantity: decimalTextSchema,
  reservedQuantity: decimalTextSchema,
  localAvailableQuantity: decimalTextSchema,
  averageCost: decimalTextSchema,
  notionalCost: decimalTextSchema,
  realizedPnl: decimalTextSchema,
  createdAt: rawTimeSchema,
  updatedAt: rawTimeSchema,
  source: z.literal('LOCAL_LEDGER'),
  assetsAvailable: z.literal(false),
  availableQuantity: z.null(),
  exchangeQuantity: z.null(),
  exchangeReservedQuantity: z.null(),
  markPrice: z.null(),
  unrealizedPnl: z.null(),
  quoteTimestamp: z.null(),
  quoteCurrency: z.literal('USD'),
  settlementCurrency: z.literal('USDC'),
  valuationEstimated: z.literal(false),
}) satisfies z.ZodType<PositionRow>;

export const positionsSchema = pagedSchema(positionSchema).extend({
  source: z.literal('LOCAL_LEDGER'),
  assetsAvailable: z.literal(false),
  unavailableReason: z.string().min(1),
}) satisfies z.ZodType<PositionsResponse>;

// 公开 schema 校验 stockTicker/EQ_ 精确身份、非零证据、唯一性、
// 数量精度及本地请求/接收时钟顺序。
export const holdingsSchema = equityHoldingsSchema satisfies z.ZodType<HoldingsResponse>;
