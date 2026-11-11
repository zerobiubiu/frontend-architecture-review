import { filterSchema, orderStatuses } from '@project/api-contracts/validation';
import { z } from 'zod';
import {
  decimalTextSchema,
  nullableDecimalTextSchema,
  pagedSchema,
  rawTimeSchema,
  uuidSchema,
} from '@/lib/read-only/schemas';
import type { LocalTradeDto, OrderDetailDto, OrderDto, OrderEventDto, OrdersDto } from './types';

export const orderSearchSchema = filterSchema.pick({
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
export type OrderListSearch = z.infer<typeof orderSearchSchema>;

/** 存储值按原文读取，创建输入的规范化不得改写历史记录。 */
export const orderViewSchema = z
  .object({
    id: uuidSchema,
    ownerUserId: uuidSchema,
    exchangeAccountId: uuidSchema,
    taskId: uuidSchema.nullable(),
    clientOrderId: z.string().min(1),
    exchangeOrderId: z.string().min(1).nullable(),
    idempotencyKey: z.string().nullable(),
    requestHash: z.string(),
    symbol: z.string().min(1),
    side: z.enum(['BUY', 'SELL']),
    orderType: z.enum(['LIMIT', 'MARKET']),
    price: nullableDecimalTextSchema,
    quantity: nullableDecimalTextSchema,
    notional: nullableDecimalTextSchema,
    filledQuantity: decimalTextSchema,
    filledNotional: decimalTextSchema,
    averagePrice: decimalTextSchema,
    fee: nullableDecimalTextSchema,
    priceCurrency: z.literal('USD'),
    feeCurrency: z.literal('USD').nullable(),
    quoteCurrency: z.string().nullable(),
    feeFinalized: z.boolean(),
    feePending: z.boolean(),
    tradeEvidencePending: z.boolean(),
    tradingSession: z.enum(['RTH', 'EXTENDED', '24H']).nullable(),
    timeInForce: z.enum(['DAY', 'GTC']),
    status: z.enum(orderStatuses),
    reservedCash: decimalTextSchema,
    reservedQuantity: decimalTextSchema,
    reservationReleased: z.boolean(),
    sellInventoryBaseline: nullableDecimalTextSchema,
    sellInventoryVerifiedAt: rawTimeSchema.nullable(),
    submitStartedAt: rawTimeSchema.nullable(),
    submittedAt: rawTimeSchema.nullable(),
    cancelStartedAt: rawTimeSchema.nullable(),
    waitDeadlineAt: rawTimeSchema.nullable(),
    reconciledAt: rawTimeSchema.nullable(),
    reason: z.string().nullable(),
    createdAt: rawTimeSchema,
    updatedAt: rawTimeSchema,
  })
  .superRefine((order, context) => {
    const validIntent =
      order.orderType === 'LIMIT'
        ? order.price !== null &&
          order.quantity !== null &&
          order.notional === null &&
          order.tradingSession !== null
        : order.price === null &&
          order.tradingSession === null &&
          order.timeInForce === 'DAY' &&
          (order.side === 'BUY'
            ? order.quantity === null && order.notional !== null
            : order.quantity !== null && order.notional === null);
    if (!validIntent)
      context.addIssue({ code: 'custom', path: ['orderType'], message: '委托模式字段不一致' });
    if ((order.fee === null) !== (order.feeCurrency === null)) {
      context.addIssue({ code: 'custom', path: ['feeCurrency'], message: '费用及币种证据不一致' });
    }
  }) satisfies z.ZodType<OrderDto>;
export type OrderView = z.infer<typeof orderViewSchema>;

export const localTradeSchema = z.object({
  id: uuidSchema,
  ownerUserId: uuidSchema,
  exchangeAccountId: uuidSchema,
  taskId: uuidSchema.nullable(),
  orderId: uuidSchema,
  exchangeTradeId: z.string().min(1),
  symbol: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  price: decimalTextSchema,
  quantity: decimalTextSchema,
  fee: nullableDecimalTextSchema,
  filledAt: rawTimeSchema,
  createdAt: rawTimeSchema,
  updatedAt: rawTimeSchema,
}) satisfies z.ZodType<LocalTradeDto>;
export type LocalTradeView = z.infer<typeof localTradeSchema>;

export const orderEventSchema = z.object({
  id: uuidSchema,
  ownerUserId: uuidSchema,
  orderId: uuidSchema,
  type: z.string().min(1),
  message: z.string(),
  details: z.record(z.string(), z.json()),
  createdAt: rawTimeSchema,
}) satisfies z.ZodType<OrderEventDto>;
export type OrderEventView = z.infer<typeof orderEventSchema>;

export const ordersPageSchema = pagedSchema(orderViewSchema).extend({
  source: z.literal('LOCAL_LEDGER'),
}) satisfies z.ZodType<OrdersDto>;
export const orderDetailSchema = z.object({
  order: orderViewSchema,
  trades: z.array(localTradeSchema),
  events: z.array(orderEventSchema),
  source: z.literal('LOCAL_LEDGER'),
}) satisfies z.ZodType<OrderDetailDto>;
