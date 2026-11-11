// 此文件由后端公开契约导出命令生成，请勿手工修改。
import { z } from 'zod';

export const roles = ['TRADER', 'ADMIN'] as const;
export type Role = (typeof roles)[number];
export interface Actor {
    id: string;
    username: string;
    role: Role;
    canManageAdmins: boolean;
}
export const eventResources = [
    'orders',
    'tasks',
    'accounts',
    'ledger',
    'events',
    'settings',
    'users',
    'audit',
    'worker',
] as const;
export type EventResource = (typeof eventResources)[number];
export const eventRefreshSchema = z.object({
    kind: z.literal('refresh'),
    resources: z.array(z.enum(eventResources)).optional(),
    at: z.string().optional(),
    requestId: z.string().optional(),
});
export type EventRefresh = z.infer<typeof eventRefreshSchema>;
export const taskStatuses = [
    'CREATED',
    'VALIDATING',
    'READY',
    'SCHEDULED',
    'RUNNING',
    'PAUSED',
    'RECONCILING',
    'RECOVERY_REQUIRED',
    'COMPLETED',
    'EXPIRED',
    'STOPPING',
    'STOPPED',
    'FAILED',
] as const;
export const orderStatuses = [
    'PLANNED',
    'SUBMITTING',
    'ACCEPTED',
    'PARTIALLY_FILLED',
    'FILLED',
    'CANCELING',
    'CANCELED',
    'REJECTED',
    'EXPIRED',
    'UNKNOWN',
] as const;
export type TaskStatus = (typeof taskStatuses)[number];
export type OrderStatus = (typeof orderStatuses)[number];
export const sideSchema = z.enum(['BUY', 'SELL']);
export const symbolSchema = z
    .string()
    .trim()
    .min(1, '请输入证券代码')
    .max(128)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), '证券代码不能包含控制字符')
    .transform((value) => value.toUpperCase());
export type Symbol = z.infer<typeof symbolSchema>;
export const decimalSchema = z.string().regex(/^\d{1,12}(\.\d{1,10})?$/, '请输入非负十进制数字');

export const quantitySchema = z
    .string()
    .regex(/^\d{1,7}(\.\d{1,10})?$/, '数量须为最多10位小数的正十进制字符串')
    .refine((value) => /[1-9]/.test(value), '数量必须大于零')
    .refine((value) => {
        if (!/^\d{1,7}(\.\d{1,10})?$/.test(value)) return false;
        const [whole = '', fraction = ''] = value.split('.');
        const integer = BigInt(whole);
        return integer < 1000000n || (integer === 1000000n && !/[1-9]/.test(fraction));
    }, '数量不能超过1000000')
    .transform((value) => {
        const [whole = '0', fraction = ''] = value.split('.');
        const decimals = fraction.replace(/0+$/, '');
        return `${BigInt(whole)}${decimals ? `.${decimals}` : ''}`;
    });
export const priceSchema = z
    .string()
    .regex(/^[1-9]\d{0,8}(\.\d{1,2})?$|^0\.\d{1,2}$/, '价格必须大于零且最多两位小数')
    .refine((v) => Number(v) > 0, '价格必须大于零');
export const notionalSchema = z
    .string()
    .regex(/^\d{1,12}(?:\.\d{1,18})?$/, '本金须为最多12位整数、18位小数的十进制字符串')
    .refine((value) => /[1-9]/.test(value), '本金必须大于零')
    .transform((value) =>
        value
            .replace(/^0+(?=\d)/, '')
            .replace(/(\.\d*?)0+$/, '$1')
            .replace(/\.$/, ''),
    );
export const orderTypeSchema = z.enum(['LIMIT', 'MARKET']);
export type OrderType = z.infer<typeof orderTypeSchema>;
export const quotePriceRoundingSchema = z.enum(['SIDE_SAFE', 'TRUNCATE', 'HALF_UP', 'CEIL', 'REJECT']);
export type QuotePriceRounding = z.infer<typeof quotePriceRoundingSchema>;

// 仅将盘口报价转换为委托限价；不修改原始行情、数量、成交或账本金额。
export function quoteLimitPrice(
    value: string,
    side: z.infer<typeof sideSchema>,
    rounding: QuotePriceRounding = 'REJECT',
): string | null {
    if (!/^\d{1,20}(?:\.\d{1,18})?$/.test(value)) return null;
    const [whole = '0', fraction = ''] = value.split('.');
    const discarded = fraction.slice(2);
    const hasRemainder = /[1-9]/.test(discarded);
    if (rounding === 'REJECT' && hasRemainder) return null;
    let cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
    if (
        hasRemainder &&
        (rounding === 'CEIL' ||
            (rounding === 'SIDE_SAFE' && side === 'SELL') ||
            (rounding === 'HALF_UP' && discarded[0]! >= '5'))
    )
        cents += 1n;
    const price = `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
    return priceSchema.safeParse(price).success ? price : null;
}

export const loginSchema = z.object({
    username: z.string().min(1).max(64),
    password: z.string().min(1).max(128),
});
export const userCreateSchema = z.object({
    username: z.string().regex(/^[A-Za-z0-9_.-]{3,64}$/, '账号需为3–64位字母、数字或_.-'),
    password: z.string().min(10).max(128),
    role: z.enum(roles),
    canManageAdmins: z.boolean().default(false),
});
export const userUpdateSchema = z.object({
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
    canManageAdmins: z.boolean().optional(),
});
export const passwordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(10).max(128),
});
export const accountCreateSchema = z.object({
    label: z.string().trim().min(1).max(80),
    apiKey: z.string().trim().min(1, '请输入 API Key').max(256),
    apiSecret: z.string().trim().min(1, '请输入 API Secret').max(512),
});
export const accountUpdateSchema = accountCreateSchema.partial().extend({
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
    tradingEnabled: z.boolean().optional(),
});
export const adminAccountUpdateSchema = z.object({
    adminTradingBlocked: z.boolean(),
    adminBlockReason: z.string().trim().max(200).nullable().optional(),
});
const orderFields = {
    accountId: z.string().uuid(),
    symbol: symbolSchema,
};
export const orderInputSchemas = {
    LIMIT: z
        .object({
            ...orderFields,
            orderType: z.literal('LIMIT').default('LIMIT'),
            side: sideSchema,
            price: priceSchema,
            quantity: quantitySchema,
            notional: z.never().optional(),
            tradingSession: z.enum(['RTH', 'EXTENDED', '24H']).default('RTH'),
            timeInForce: z.enum(['DAY', 'GTC']).default('DAY'),
        })
        .strict(),
    MARKET_BUY: z
        .object({
            ...orderFields,
            orderType: z.literal('MARKET'),
            side: z.literal('BUY'),
            notional: notionalSchema,
            price: z.never().optional(),
            quantity: z.never().optional(),
            tradingSession: z.never().optional(),
            timeInForce: z.literal('DAY').default('DAY'),
        })
        .strict(),
    MARKET_SELL: z
        .object({
            ...orderFields,
            orderType: z.literal('MARKET'),
            side: z.literal('SELL'),
            quantity: quantitySchema,
            notional: z.never().optional(),
            price: z.never().optional(),
            tradingSession: z.never().optional(),
            timeInForce: z.literal('DAY').default('DAY'),
        })
        .strict(),
};
export const orderCreateSchema = z.union([
    orderInputSchemas.LIMIT,
    orderInputSchemas.MARKET_BUY,
    orderInputSchemas.MARKET_SELL,
]);
export type OrderInput = z.infer<typeof orderCreateSchema>;
const intervalSecondsSchema = z
    .number()
    .min(0.1)
    .max(86400)
    .refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7, '间隔最多支持3位小数秒');
const taskFields = {
    accountId: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    symbol: symbolSchema,
    executionWindowSeconds: z.number().int().min(1).max(604800),
    scheduledStartAt: z.string().datetime().nullable().optional(),
    executionMode: z.enum(['SERIAL', 'INTERVAL']).default('SERIAL'),
    globalIntervalSeconds: intervalSecondsSchema.default(5),
    intervalMode: z.enum(['FIXED', 'RANDOM']).default('FIXED'),
    fixedIntervalSeconds: intervalSecondsSchema.default(5),
    randomIntervalMin: intervalSecondsSchema.default(3),
    randomIntervalMax: intervalSecondsSchema.default(10),
    autoCancelMode: z.enum(['KEEP', 'AFTER_TIMEOUT', 'AT_TASK_END']).default('KEEP'),
    orderTimeoutSeconds: z.number().int().min(1).max(3600).default(30),
    remainderPolicy: z.enum(['EXACT', 'FIXED']).default('EXACT'),
};
const taskQuantityFields = {
    targetQuantity: quantitySchema,
    quantityMode: z.enum(['FIXED', 'RANDOM']).default('FIXED'),
    fixedQuantity: quantitySchema.default('10'),
    randomQuantityMin: z.number().int().min(1).max(1000000).default(1),
    randomQuantityMax: z.number().int().min(1).max(1000000).default(10),
    targetNotional: z.never().optional(),
    notionalMode: z.never().optional(),
    fixedNotional: z.never().optional(),
    randomNotionalMin: z.never().optional(),
    randomNotionalMax: z.never().optional(),
};
const marketTaskFields = {
    orderType: z.literal('MARKET'),
    priceRule: z.never().optional(),
    fixedPrice: z.never().optional(),
    priceRounding: z.never().optional(),
    tradingSession: z.never().optional(),
    timeInForce: z.literal('DAY').default('DAY'),
};
export const taskInputSchemas = {
    LIMIT: z
        .object({
            ...taskFields,
            ...taskQuantityFields,
            orderType: z.literal('LIMIT').default('LIMIT'),
            side: sideSchema,
            priceRule: z.enum(['BID_1', 'ASK_1', 'FIXED']).default('ASK_1'),
            fixedPrice: priceSchema.nullable().default(null),
            priceRounding: quotePriceRoundingSchema.default('REJECT'),
            tradingSession: z.enum(['RTH', 'EXTENDED', '24H']).default('RTH'),
            timeInForce: z.enum(['DAY', 'GTC']).default('DAY'),
        })
        .strict(),
    MARKET_SELL: z
        .object({
            ...taskFields,
            ...taskQuantityFields,
            ...marketTaskFields,
            side: z.literal('SELL'),
        })
        .strict(),
    MARKET_BUY: z
        .object({
            ...taskFields,
            ...marketTaskFields,
            side: z.literal('BUY'),
            targetNotional: notionalSchema,
            notionalMode: z.enum(['FIXED', 'RANDOM']).default('FIXED'),
            fixedNotional: notionalSchema.default('100'),
            randomNotionalMin: notionalSchema.default('1'),
            randomNotionalMax: notionalSchema.default('100'),
            targetQuantity: z.never().optional(),
            quantityMode: z.never().optional(),
            fixedQuantity: z.never().optional(),
            randomQuantityMin: z.never().optional(),
            randomQuantityMax: z.never().optional(),
        })
        .strict(),
};
export const taskCreateSchema = z
    .union([taskInputSchemas.LIMIT, taskInputSchemas.MARKET_SELL, taskInputSchemas.MARKET_BUY])
    .superRefine((v, ctx) => {
        if (v.orderType === 'LIMIT' && v.priceRule === 'FIXED' && v.fixedPrice === null)
            ctx.addIssue({ code: 'custom', message: '固定限价必须填写有效价格', path: ['fixedPrice'] });
        if (v.quantityMode === 'RANDOM' && v.randomQuantityMin > v.randomQuantityMax)
            ctx.addIssue({
                code: 'custom',
                message: '随机股数下限不能大于上限',
                path: ['randomQuantityMin'],
            });
        if (v.notionalMode === 'RANDOM') {
            const scaled = (value: string) => {
                const [integer, fraction = ''] = value.split('.');
                return BigInt(integer!) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
            };
            if (scaled(v.randomNotionalMin) > scaled(v.randomNotionalMax))
                ctx.addIssue({
                    code: 'custom',
                    message: '随机本金下限不能大于上限',
                    path: ['randomNotionalMin'],
                });
        }
        if (v.intervalMode === 'RANDOM' && v.randomIntervalMin > v.randomIntervalMax)
            ctx.addIssue({
                code: 'custom',
                message: '随机间隔下限不能大于上限',
                path: ['randomIntervalMin'],
            });
    });
export type TaskInput = z.infer<typeof taskCreateSchema>;
export const taskActions = ['start', 'pause', 'resume', 'stop', 'reconcile'] as const;
export type TaskAction = (typeof taskActions)[number];
export const taskControlSchema = z.object({ action: z.enum(taskActions) });
export const platformUpdateSchema = z.object({
    emergencyStop: z.boolean().optional(),
    maxOrderQuantity: z.number().int().min(1).max(1000000).optional(),
    maxTaskQuantity: z.number().int().min(1).max(1000000).optional(),
    maxOrderNotional: priceSchema.optional(),
    feeReserveRate: decimalSchema
        .refine((v) => Number(v) > 0 && Number(v) <= 1, '费用预留比例必须大于零且不超过1')
        .optional(),
    feeReserveMinimum: priceSchema.optional(),
});
export const filterSchema = z.object({
    symbol: z.string().optional(),
    status: z.string().optional(),
    ownerUserId: z.string().uuid().optional(),
    accountId: z.string().uuid().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    search: z.string().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export interface Quote {
    symbol: Symbol;
    bid: string;
    ask: string;
    bidSize: string | null;
    askSize: string | null;
    timestamp: string;
    source: 'BINANCE_STOCKS';
    timestampSource: 'LOCAL_RECEIPT';
    tradingStatus: 'TRADING' | 'HALTED' | 'UNKNOWN';
}
const quoteStreamTimeSchema = z.number().int().min(0).max(8640000000000000);
const quoteStreamDecimalSchema = z.string().regex(/^\d{1,20}(?:\.\d{1,18})?$/);
export const quoteStreamSnapshotSchema = z
    .object({
        quote: z.object({
            symbol: symbolSchema,
            bid: quoteStreamDecimalSchema,
            ask: quoteStreamDecimalSchema,
            bidSize: z
                .string()
                .regex(/^\d{1,20}(?:\.\d{1,10})?$/)
                .nullable(),
            askSize: z
                .string()
                .regex(/^\d{1,20}(?:\.\d{1,10})?$/)
                .nullable(),
            timestamp: z.string().datetime(),
            source: z.literal('BINANCE_STOCKS'),
            timestampSource: z.literal('LOCAL_RECEIPT'),
            tradingStatus: z.enum(['TRADING', 'HALTED', 'UNKNOWN']),
        }),
        receivedAt: quoteStreamTimeSchema,
        eventTimestamp: quoteStreamTimeSchema.nullable(),
        sourceTimestamp: quoteStreamTimeSchema.nullable(),
        transport: z.enum(['REST', 'WEBSOCKET']),
    })
    .refine((value) => Date.parse(value.quote.timestamp) === value.receivedAt, '报价本地接收时间不一致')
    .refine(
        (value) =>
            value.transport !== 'REST' || (value.eventTimestamp === null && value.sourceTimestamp === null),
        'REST快照不能伪造行情事件时间',
    )
    .refine(
        (value) => value.transport !== 'WEBSOCKET' || value.eventTimestamp !== null,
        '推送报价缺少官方事件时间',
    )
    .refine((value) => {
        const fixed = (raw: string): bigint | null => {
            if (!/^\d{1,20}(?:\.\d{1,18})?$/.test(raw) || !/[1-9]/.test(raw)) return null;
            const [whole, fraction = ''] = raw.split('.');
            return BigInt(`${whole}${fraction.padEnd(18, '0')}`);
        };
        const bid = fixed(value.quote.bid);
        const ask = fixed(value.quote.ask);
        return bid !== null && ask !== null && bid <= ask;
    }, '报价价格必须为正数且买价不高于卖价');
export type QuoteStreamSnapshot = z.infer<typeof quoteStreamSnapshotSchema>;
export const quoteStreamStatuses = [
    'connecting',
    'waiting',
    'live',
    'snapshot',
    'reconnecting',
    'unavailable',
] as const;
export type QuoteStreamStatus = (typeof quoteStreamStatuses)[number];
export const quoteStreamQuerySchema = z.object({ accountId: z.string().uuid(), symbol: symbolSchema });
export type QuoteStreamQuery = z.infer<typeof quoteStreamQuerySchema>;
export const quoteStreamEventSchema = z
    .discriminatedUnion('kind', [
        z.object({
            kind: z.literal('quote'),
            accountId: z.string().uuid(),
            symbol: symbolSchema,
            value: quoteStreamSnapshotSchema,
        }),
        z.object({
            kind: z.literal('status'),
            accountId: z.string().uuid(),
            symbol: symbolSchema,
            status: z.enum(quoteStreamStatuses),
            code: z.string().optional(),
            retryable: z.boolean().optional(),
        }),
    ])
    .refine(
        (value) => value.kind !== 'quote' || value.symbol === value.value.quote.symbol,
        '报价证券与订阅范围不一致',
    );
export type QuoteStreamEvent = z.infer<typeof quoteStreamEventSchema>;
export interface PreflightResult {
    ok: boolean;
    checks: { label: string; ok: boolean; message: string }[];
    estimatedNotional: string;
    estimatedFee: string;
    estimatedTotal: string;
    availableCash: string | null;
    availableQuantity: string | null;
    sellInventory: {
        source: 'BINANCE_FUNDING_WALLET';
        symbol: string;
        assetCode: string;
        requestedAt: string;
        receivedAt: string;
        availableQuantity: string;
        localPendingQuantity: string;
    } | null;
    quote: Quote | null;
    side: 'BUY' | 'SELL';
    quoteCurrency: 'USD';
    settlementCurrency: 'USDC';
    walletType: 'CARD';
    feeEstimateSource: 'RESERVE_POLICY';
    fundsReceivedAt: string | null;
    localPendingCash: string;
}
export const statusLabels: Record<string, string> = {
    CREATED: '已创建',
    VALIDATING: '预检中',
    READY: '待启动',
    SCHEDULED: '等待计划开始',
    RUNNING: '执行中',
    PAUSED: '已暂停',
    RECONCILING: '核对中',
    RECOVERY_REQUIRED: '待人工处理',
    COMPLETED: '目标完成',
    EXPIRED: '窗口结束，目标未完成',
    STOPPING: '正在停止',
    STOPPED: '已停止',
    FAILED: '失败',
    PLANNED: '已计划',
    SUBMITTING: '提交中',
    ACCEPTED: '已接受',
    PARTIALLY_FILLED: '部分成交',
    FILLED: '全部成交',
    CANCELING: '撤单处理中',
    CANCELED: '已撤销',
    REJECTED: '已拒绝',
    UNKNOWN: '状态未知',
    ACTIVE: '启用',
    DISABLED: '禁用',
    BUY: '买入',
    SELL: '卖出',
};
export interface PageResult<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
}

export interface ExchangeHistoryQuery {
    symbol?: Symbol;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
}
export interface ExchangeOrder {
    exchangeOrderId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    orderType: string;
    price: string | null;
    priceCurrency: 'USD';
    quantity: string | null;
    filledQuantity: string;
    averagePrice: string | null;
    notional: string | null;
    filledTotal: string | null;
    notionalCurrency: null;
    fee: string | null;
    feeCurrency: 'USD' | null;
    quoteCurrency: string | null;
    tradingSession: string | null;
    status: string;
    createdAt: string | null;
    updatedAt: string | null;
}
export interface ExchangeTrade {
    exchangeTradeId: string;
    exchangeOrderId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    price: string;
    priceCurrency: 'USD';
    quantity: string;
    notional: string | null;
    notionalCurrency: 'USD';
    fee: null;
    quoteCurrency: string | null;
    filledAt: string;
    updatedAt: string | null;
}
export interface EndpointResult {
    endpoint: string;
    ok: boolean;
    latencyMs: number;
    error: string | null;
}

export const SELL_UNAVAILABLE_MESSAGE =
    '未取得本证券当次有效的官方可卖股数，请核对账户与资产映射；缺失、冲突或过期证据不能提交卖出。';

export interface FundingSnapshot {
    source: 'BINANCE_WALLET';
    walletType: 'CARD';
    asset: 'USDC';
    free: string;
    locked: string;
    freeze: string | null;
    withdrawing: string | null;
    receivedAt: string;
}

export interface WalletAssetBalance {
    asset: string;
    free: string;
    locked: string;
    freeze: string | null;
    withdrawing: string | null;
}

export interface AccountAssets {
    source: 'BINANCE_WALLET';
    receivedAt: string;
    funding: FundingSnapshot | null;
    spotUsdc: WalletAssetBalance | null;
    permissions: {
        reading: boolean | null;
        spotAndMarginTrading: boolean | null;
        withdrawals: boolean | null;
        ipRestricted: boolean | null;
    };
}

export interface EquityRule {
    symbol: string;
    tradability: string | null;
    extendedSession: boolean | null;
    overnightSupported: boolean | null;
    fractionable: boolean | null;
    fractionableEh: boolean | null;
    listingTime: number | null;
    delistingTime: number | null;
    maxNumOrders: number | null;
    stepSize: string | null;
    minQuantity: string | null;
    maxQuantity: string | null;
    minNotional: string | null;
    maxNotional: string | null;
}

export interface SymbolPage {
    items: EquityRule[];
    total: number;
    page: number;
    pageSize: number;
    source: 'BINANCE_STOCKS';
    fetchedAt: string;
    expiresAt: string;
}

export interface MarketCatalogQuery {
    accountId: string;
    search?: string;
    page: number;
    pageSize: number;
    refresh?: boolean;
}

const holdingQuantitySchema = z.string().regex(/^\d{1,20}(?:\.\d{1,10})?$/);
// 官方证据不沿用输入框的修剪与大写转换，来源标识异常必须显式拒绝。
const holdingSymbolSchema = z.string().regex(/^[A-Z][A-Z0-9._-]{0,127}$/);
export const equityHoldingSchema = z
    .object({
        symbol: holdingSymbolSchema,
        assetCode: z.string(),
        stockTicker: holdingSymbolSchema,
        fundingFreeQuantity: holdingQuantitySchema,
        lockedQuantity: holdingQuantitySchema,
        freezeQuantity: holdingQuantitySchema.nullable(),
        withdrawingQuantity: holdingQuantitySchema.nullable(),
    })
    .refine(
        (value) =>
            !value.symbol.startsWith('EQ_') &&
            value.stockTicker === value.symbol &&
            value.assetCode === `EQ_${value.symbol}`,
        '官方股票持仓身份不一致',
    )
    .refine(
        (value) =>
            [
                value.fundingFreeQuantity,
                value.lockedQuantity,
                value.freezeQuantity,
                value.withdrawingQuantity,
            ].some((quantity) => quantity !== null && /[1-9]/.test(quantity)),
        '股票候选缺少可核实的非零持仓',
    );
export const equityHoldingsSchema = z
    .object({
        accountId: z.uuid(),
        source: z.literal('BINANCE_FUNDING_WALLET'),
        requestedAt: z.string().datetime(),
        receivedAt: z.string().datetime(),
        sourceUpdatedAt: z.null(),
        items: z.array(equityHoldingSchema).max(10000),
    })
    .refine(
        (value) => Date.parse(value.requestedAt) <= Date.parse(value.receivedAt),
        '官方持仓请求时间顺序无效',
    )
    .superRefine((value, ctx) => {
        const symbols = new Set<string>();
        for (const item of value.items) {
            if (symbols.has(item.symbol))
                ctx.addIssue({ code: 'custom', message: '官方股票持仓存在重复证券', path: ['items'] });
            symbols.add(item.symbol);
        }
    });
export const equityHoldingsQuerySchema = z.object({ accountId: z.uuid() });
export type EquityHoldingsQuery = z.infer<typeof equityHoldingsQuerySchema>;
export type EquityHolding = z.infer<typeof equityHoldingSchema>;
export type EquityHoldingsSnapshot = z.infer<typeof equityHoldingsSchema>;

// 仅供读取界面追溯最近未恢复的暂停／核对原因，不参与任务执行判断。
export interface TaskInterruption {
    eventId: string;
    status: 'PAUSED' | 'RECOVERY_REQUIRED' | 'RECONCILING';
    reason: string;
    stopReason: string | null;
    occurredAt: string;
}

export const operationKinds = [
    'ORDER_CANCEL',
    'TASK_CONTROL',
    'USER_UPDATE',
    'ACCOUNT_RESTRICT',
    'ACCOUNT_CHECK',
    'ACCOUNT_SYNC',
    'ACCOUNT_RECONCILE',
    'PLATFORM_UPDATE',
] as const;
export type OperationKind = (typeof operationKinds)[number];
export const operationTargetTypes = ['ORDER', 'TASK', 'USER', 'ACCOUNT', 'PLATFORM'] as const;
export type OperationTargetType = (typeof operationTargetTypes)[number];
export const operationStatuses = ['PROCESSING', 'SUCCEEDED', 'REJECTED', 'UNKNOWN', 'CONFLICT'] as const;
export type OperationStatus = (typeof operationStatuses)[number];
export const operationReceiptSchema = z.object({
    id: z.uuid(),
    actorUserId: z.uuid(),
    kind: z.enum(operationKinds),
    targetType: z.enum(operationTargetTypes),
    targetId: z.string().min(1),
    status: z.enum(operationStatuses),
    phase: z.string(),
    outcome: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    finishedAt: z.string().datetime().nullable(),
    result: z.record(z.string(), z.unknown()).nullable(),
    error: z.object({ code: z.string(), message: z.string() }).nullable(),
});
export type OperationReceipt = z.infer<typeof operationReceiptSchema>;
