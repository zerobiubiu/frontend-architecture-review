import type { ApiClient } from '@project/api-contracts';
import { orderStatuses, orderTypeSchema, sideSchema, taskStatuses } from '@project/api-contracts/validation';
import type { InferResponseType } from 'hono/client';
import { z } from 'zod';
import {
  decimalTextSchema,
  nonnegativeCountSchema,
  nullableDecimalTextSchema,
  rawTimeSchema,
  uuidSchema,
} from '@/lib/read-only/schemas';

export type OverviewDto = InferResponseType<ApiClient['api']['v1']['overview']['$get'], 200>['data'];
type Account = NonNullable<OverviewDto['account']>;
type Order = OverviewDto['recentOrders'][number];
type Issue = OverviewDto['issues'][number];
type Worker = Omit<OverviewDto['worker'], 'lastSeenAt'> & { lastSeenAt: string | null };
type Today = Omit<OverviewDto['today'], 'buyAmount' | 'sellAmount' | 'quoteCurrency'> & {
  buyAmount: string | null;
  sellAmount: string | null;
  quoteCurrency: string | null;
};

const accountSchema = z.object({
  id: uuidSchema,
  label: z.string(),
  connectionStatus: z.string(),
  availableCash: nullableDecimalTextSchema,
  reservedCash: decimalTextSchema,
  source: z.enum(['BINANCE_WALLET', 'UNAVAILABLE']),
  assetsAvailable: z.boolean(),
  assetMessage: z.string(),
  walletSyncError: z.string().nullable(),
  lastSyncAt: rawTimeSchema.nullable(),
  updatedAt: rawTimeSchema,
}) satisfies z.ZodType<
  Pick<
    Account,
    | 'id'
    | 'label'
    | 'connectionStatus'
    | 'availableCash'
    | 'reservedCash'
    | 'source'
    | 'assetsAvailable'
    | 'assetMessage'
    | 'walletSyncError'
    | 'lastSyncAt'
    | 'updatedAt'
  >
>;

export const recentOrderSchema = z.object({
  id: uuidSchema,
  symbol: z.string(),
  side: sideSchema,
  orderType: orderTypeSchema,
  status: z.enum(orderStatuses),
  filledQuantity: decimalTextSchema,
  feeFinalized: z.boolean(),
  reservationReleased: z.boolean(),
  updatedAt: rawTimeSchema,
}) satisfies z.ZodType<
  Pick<
    Order,
    | 'id'
    | 'symbol'
    | 'side'
    | 'orderType'
    | 'status'
    | 'filledQuantity'
    | 'feeFinalized'
    | 'reservationReleased'
    | 'updatedAt'
  >
>;
export const issueSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  symbol: z.string(),
  status: z.enum(taskStatuses),
  reason: z.string().nullable(),
  stopReason: z.string().nullable(),
  updatedAt: rawTimeSchema,
}) satisfies z.ZodType<
  Pick<Issue, 'id' | 'name' | 'symbol' | 'status' | 'reason' | 'stopReason' | 'updatedAt'>
>;

export const overviewSchema = z.object({
  account: accountSchema.nullable(),
  recordSource: z.literal('LOCAL_LEDGER'),
  assetsAvailable: z.boolean(),
  assetMessage: z.string(),
  counts: z.object({
    runningTasks: nonnegativeCountSchema,
    openOrders: nonnegativeCountSchema,
    positions: nonnegativeCountSchema,
    recoveryRequired: nonnegativeCountSchema,
  }) satisfies z.ZodType<OverviewDto['counts']>,
  today: z.object({
    buyQuantity: decimalTextSchema,
    sellQuantity: decimalTextSchema,
    buyAmount: nullableDecimalTextSchema,
    sellAmount: nullableDecimalTextSchema,
    quoteCurrency: z.string().nullable(),
    source: z.literal('LOCAL_TRADE_NOTIONAL'),
    cashFlowVerified: z.literal(false),
  }) satisfies z.ZodType<Today>,
  recentOrders: z.array(recentOrderSchema),
  issues: z.array(issueSchema),
  worker: z.object({
    online: z.boolean(),
    lastSeenAt: rawTimeSchema.nullable(),
    status: z.string(),
  }) satisfies z.ZodType<Worker>,
  environment: z.object({
    environment: z.literal('production'),
    label: z.string(),
    apiVersion: z.string(),
  }) satisfies z.ZodType<Pick<OverviewDto['environment'], 'environment' | 'label' | 'apiVersion'>>,
});

export type OverviewView = z.infer<typeof overviewSchema>;
export type RecentOrderView = z.infer<typeof recentOrderSchema>;
export type IssueView = z.infer<typeof issueSchema>;
