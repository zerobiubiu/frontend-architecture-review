import { filterSchema } from '@project/api-contracts/validation';
import { z } from 'zod';
import {
  decimalTextSchema,
  nullableDecimalTextSchema,
  pagedSchema,
  rawTimeSchema,
  uuidSchema,
} from '@/lib/read-only/schemas';
import type { AccountDto } from './types';

/** 仅保留账户查询实际支持的筛选，不宣称支持证券或任意排序。 */
export const accountSearchSchema = filterSchema
  .pick({
    ownerUserId: true,
    accountId: true,
    status: true,
    from: true,
    to: true,
    search: true,
    page: true,
    pageSize: true,
  })
  .refine((value) => !value.from || !value.to || Date.parse(value.from) <= Date.parse(value.to), {
    path: ['to'],
    message: '创建时间范围的起点不能晚于终点',
  });

export type AccountListSearch = z.infer<typeof accountSearchSchema>;

const walletBalanceSchema = z.object({
  asset: z.string().min(1),
  free: decimalTextSchema,
  locked: decimalTextSchema,
  freeze: nullableDecimalTextSchema,
  withdrawing: nullableDecimalTextSchema,
});

const fundingSnapshotSchema = walletBalanceSchema.extend({
  source: z.literal('BINANCE_WALLET'),
  walletType: z.literal('CARD'),
  asset: z.literal('USDC'),
  receivedAt: rawTimeSchema,
});

const sourceSchema = z.enum(['BINANCE_WALLET', 'UNAVAILABLE']);

/** 对照生成详情 DTO 校验展示投影，不手写第二套正式 DTO。 */
export const accountViewSchema = z.object({
  id: uuidSchema,
  ownerUserId: uuidSchema,
  exchange: z.string().min(1),
  label: z.string(),
  status: z.string().min(1),
  connectionStatus: z.string().min(1),
  connectionMessage: z.string().nullable(),
  hasCredentials: z.boolean(),
  apiKeyLast4: z.string().nullable(),
  tradingEnabled: z.boolean(),
  adminTradingBlocked: z.boolean(),
  adminBlockReason: z.string().nullable(),
  tradingRevision: z.number().int().nonnegative().safe(),
  cashBalance: z.null(),
  availableCash: nullableDecimalTextSchema,
  reservedCash: decimalTextSchema,
  source: sourceSchema,
  assetsAvailable: z.boolean(),
  assetMessage: z.string(),
  buyReady: z.boolean(),
  sellReady: z.boolean(),
  tradingReady: z.boolean(),
  quoteCurrency: z.literal('USD'),
  settlementCurrency: z.literal('USDC'),
  walletSyncError: z.string().nullable(),
  lastSyncAt: rawTimeSchema.nullable(),
  createdAt: rawTimeSchema,
  updatedAt: rawTimeSchema,
  localSnapshot: z.object({
    cashBalance: z.null(),
    reservedCash: decimalTextSchema,
    availableCash: z.null(),
  }),
  externalSnapshot: z.object({
    source: sourceSchema,
    receivedAt: rawTimeSchema.nullable(),
    cashBalance: z.null(),
    availableCash: nullableDecimalTextSchema,
    positions: z.null(),
  }),
  walletSnapshot: z
    .object({
      source: z.literal('BINANCE_WALLET'),
      receivedAt: rawTimeSchema,
      funding: fundingSnapshotSchema.nullable(),
      spotUsdc: walletBalanceSchema.nullable(),
      permissions: z.object({
        reading: z.boolean().nullable(),
        spotAndMarginTrading: z.boolean().nullable(),
        withdrawals: z.boolean().nullable(),
        ipRestricted: z.boolean().nullable(),
      }),
    })
    .nullable(),
}) satisfies z.ZodType<AccountDto>;

export type AccountView = z.infer<typeof accountViewSchema>;
export const accountArraySchema = z.array(accountViewSchema);
export const accountPageSchema = pagedSchema(accountViewSchema);

export type AccountsListView =
  | ({ kind: 'paged' } & z.infer<typeof accountPageSchema>)
  | { kind: 'array'; items: AccountView[] };
