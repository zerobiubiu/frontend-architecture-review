import type { OrderDetailDto, OrderDto, OrdersDto } from '../../../src/features/orders/types.js';
import type { TaskDetailDto, TaskDto, TasksDto } from '../../../src/features/tasks/types.js';
import { TRADER_USER } from '../auth-fixtures.js';
import { READONLY_IDS } from './ids.js';

export const HISTORICAL_SCHEDULED_START = '2026-11-10T08:00:00.123456789Z';
export const ORDER_MARKET_BUY_ID = '20000000-0000-4000-8000-000000000002';
export const ORDER_MARKET_SELL_ID = '20000000-0000-4000-8000-000000000003';
export const ORDER_CANCELED_ID = '20000000-0000-4000-8000-000000000004';
export const TASK_MARKET_BUY_ID = '30000000-0000-4000-8000-000000000002';
export const TASK_MARKET_SELL_ID = '30000000-0000-4000-8000-000000000003';

// Mock 夹具保持字段自洽：FILLED 不代表最终费用或本地预留已闭环。
export const ORDER_FIXTURE = {
  id: READONLY_IDS.order,
  ownerUserId: TRADER_USER.id,
  exchangeAccountId: READONLY_IDS.accountA,
  taskId: READONLY_IDS.task,
  clientOrderId: 'mock-client-limit-1',
  exchangeOrderId: 'mock-exchange-order-101',
  idempotencyKey: 'mock-submit-key-1',
  requestHash: 'mock-request-fingerprint-1',
  symbol: 'AAPL',
  side: 'BUY',
  orderType: 'LIMIT',
  price: '100.00',
  quantity: '2.0000000001',
  notional: null,
  filledQuantity: '2.0000000001',
  filledNotional: '200.000000010000000000',
  averagePrice: '100.000000000000000000',
  fee: null,
  feeCurrency: null,
  priceCurrency: 'USD',
  quoteCurrency: 'USD',
  feeFinalized: false,
  feePending: true,
  tradeEvidencePending: false,
  tradingSession: 'RTH',
  timeInForce: 'DAY',
  status: 'FILLED',
  reservedCash: '0.250000000000000000',
  reservedQuantity: '0.0000000000',
  reservationReleased: false,
  sellInventoryBaseline: null,
  sellInventoryVerifiedAt: null,
  submitStartedAt: '2026-11-10T10:00:01.000Z',
  submittedAt: '2026-11-10T10:00:02.000Z',
  cancelStartedAt: null,
  waitDeadlineAt: null,
  reconciledAt: '2026-11-10T10:02:00.000Z',
  reason: 'Mock：成交终态，最终费用仍待核实',
  createdAt: '2026-11-10T10:00:00.000Z',
  updatedAt: '2026-11-10T10:02:00.000Z',
} satisfies OrderDto;

export const MARKET_BUY_ORDER_FIXTURE = {
  ...ORDER_FIXTURE,
  id: ORDER_MARKET_BUY_ID,
  exchangeAccountId: READONLY_IDS.accountB,
  taskId: TASK_MARKET_BUY_ID,
  clientOrderId: 'mock-client-market-buy-2',
  exchangeOrderId: 'mock-exchange-order-102',
  idempotencyKey: 'mock-submit-key-2',
  requestHash: 'mock-request-fingerprint-2',
  symbol: 'MSFT',
  orderType: 'MARKET',
  price: null,
  quantity: null,
  notional: '125.123456789012345678',
  filledQuantity: '0.2500000000',
  filledNotional: '25.000000000000000001',
  averagePrice: '100.000000000000000004',
  fee: '0.010000000000000001',
  feeCurrency: 'USD',
  feePending: true,
  tradingSession: null,
  status: 'PARTIALLY_FILLED',
  reservedCash: '100.500000000000000000',
  reason: 'Mock：市价本金委托，已返回部分累计费，非最终费用',
  createdAt: '2026-11-10T10:20:00.000Z',
  updatedAt: '2026-11-10T10:22:00.000Z',
  submitStartedAt: '2026-11-10T10:20:01.000Z',
  submittedAt: '2026-11-10T10:20:02.000Z',
  reconciledAt: '2026-11-10T10:22:00.000Z',
} satisfies OrderDto;

export const MARKET_SELL_ORDER_FIXTURE = {
  ...ORDER_FIXTURE,
  id: ORDER_MARKET_SELL_ID,
  taskId: TASK_MARKET_SELL_ID,
  clientOrderId: 'mock-client-market-sell-3',
  exchangeOrderId: null,
  idempotencyKey: 'mock-submit-key-3',
  requestHash: 'mock-request-fingerprint-3',
  side: 'SELL',
  orderType: 'MARKET',
  price: null,
  quantity: '1.0000000001',
  filledQuantity: '0.0000000000',
  filledNotional: '0.000000000000000000',
  averagePrice: '0.000000000000000000',
  feePending: false,
  tradingSession: null,
  quoteCurrency: null,
  status: 'UNKNOWN',
  reservedCash: '0.000000000000000000',
  reservedQuantity: '1.0000000001',
  sellInventoryBaseline: '5.0000000001',
  submittedAt: null,
  reconciledAt: null,
  reason: 'Mock：已开始发送，结果未知；空官方 ID 不能证明未发送',
  createdAt: '2026-11-10T10:10:00.000Z',
  updatedAt: '2026-11-10T10:12:00.000Z',
  submitStartedAt: '2026-11-10T10:10:01.000Z',
} satisfies OrderDto;

export const CANCELED_ORDER_FIXTURE = {
  ...ORDER_FIXTURE,
  id: ORDER_CANCELED_ID,
  clientOrderId: 'mock-client-canceled-4',
  exchangeOrderId: 'mock-exchange-order-104',
  idempotencyKey: 'mock-submit-key-4',
  requestHash: 'mock-request-fingerprint-4',
  quantity: '3.0000000000',
  filledQuantity: '1.0000000000',
  filledNotional: '100.000000000000000000',
  fee: '0.010000000000000000',
  feeCurrency: 'USD',
  feeFinalized: true,
  feePending: false,
  status: 'CANCELED',
  reservedCash: '0.000000000000000000',
  reservationReleased: true,
  reason: 'Mock：部分成交后取消；仍计入 partialOrders',
  createdAt: '2026-11-10T09:55:00.000Z',
  updatedAt: '2026-11-10T09:59:00.000Z',
  submitStartedAt: '2026-11-10T09:55:01.000Z',
  submittedAt: '2026-11-10T09:55:02.000Z',
  cancelStartedAt: '2026-11-10T09:58:00.000Z',
  reconciledAt: '2026-11-10T09:59:00.000Z',
} satisfies OrderDto;

export const TASK_FIXTURE = {
  id: READONLY_IDS.task,
  ownerUserId: TRADER_USER.id,
  exchangeAccountId: READONLY_IDS.accountA,
  name: 'Mock：到期的限价分批买入',
  symbol: 'AAPL',
  side: 'BUY',
  orderType: 'LIMIT',
  targetQuantity: '5.0000000001',
  targetNotional: null,
  config: {
    accountId: READONLY_IDS.accountA,
    name: 'Mock：到期的限价分批买入',
    symbol: 'AAPL',
    side: 'BUY',
    orderType: 'LIMIT',
    targetQuantity: '5.0000000001',
    quantityMode: 'FIXED',
    fixedQuantity: '3.0000000000',
    randomQuantityMin: 1,
    randomQuantityMax: 3,
    executionWindowSeconds: 10800,
    scheduledStartAt: HISTORICAL_SCHEDULED_START,
    executionMode: 'SERIAL',
    globalIntervalSeconds: 0.1,
    intervalMode: 'RANDOM',
    fixedIntervalSeconds: 5,
    randomIntervalMin: 0.125,
    randomIntervalMax: 1.5,
    autoCancelMode: 'KEEP',
    orderTimeoutSeconds: 30,
    remainderPolicy: 'EXACT',
    priceRule: 'FIXED',
    fixedPrice: '100.00',
    priceRounding: 'REJECT',
    tradingSession: 'RTH',
    timeInForce: 'DAY',
  },
  status: 'EXPIRED',
  filledQuantity: '3.0000000001',
  filledNotional: '300.000000010000000000',
  reservedCash: '0.250000000000000000',
  reservedQuantity: '0.0000000000',
  scheduledStartAt: '2026-11-10T08:00:00.123Z',
  startedAt: '2026-11-10T08:00:00.124Z',
  deadlineAt: '2026-11-10T11:00:00.124Z',
  endedAt: '2026-11-10T11:00:00.124Z',
  lastFilledAt: '2026-11-10T10:01:00.000Z',
  nextRunAt: null,
  stopReason: 'WINDOW_EXPIRED',
  reason: 'Mock：执行窗口已到期；历史暂停说明不覆盖当前状态',
  leaseOwner: null,
  leaseUntil: null,
  createdAt: '2026-11-10T07:00:00.000Z',
  updatedAt: '2026-11-10T11:00:00.124Z',
} satisfies TaskDto;

const COMMON_MARKET_CONFIG = {
  accountId: READONLY_IDS.accountB,
  name: 'Mock：市价本金分批买入',
  symbol: 'MSFT',
  orderType: 'MARKET',
  timeInForce: 'DAY',
  executionWindowSeconds: 3600,
  scheduledStartAt: null,
  executionMode: 'INTERVAL',
  globalIntervalSeconds: 1,
  intervalMode: 'FIXED',
  fixedIntervalSeconds: 5,
  randomIntervalMin: 3,
  randomIntervalMax: 10,
  autoCancelMode: 'AFTER_TIMEOUT',
  orderTimeoutSeconds: 30,
  remainderPolicy: 'EXACT',
} as const;
export const MARKET_BUY_TASK_FIXTURE = {
  ...TASK_FIXTURE,
  id: TASK_MARKET_BUY_ID,
  exchangeAccountId: READONLY_IDS.accountB,
  name: COMMON_MARKET_CONFIG.name,
  symbol: 'MSFT',
  orderType: 'MARKET',
  targetQuantity: null,
  targetNotional: '500.123456789012345678',
  config: {
    ...COMMON_MARKET_CONFIG,
    side: 'BUY',
    targetNotional: '500.123456789012345678',
    notionalMode: 'FIXED',
    fixedNotional: '125.123456789012345678',
    randomNotionalMin: '1.000000000000000001',
    randomNotionalMax: '125.123456789012345678',
  },
  status: 'RUNNING',
  filledQuantity: MARKET_BUY_ORDER_FIXTURE.filledQuantity,
  filledNotional: MARKET_BUY_ORDER_FIXTURE.filledNotional,
  reservedCash: MARKET_BUY_ORDER_FIXTURE.reservedCash,
  scheduledStartAt: null,
  startedAt: '2026-11-10T10:20:00.000Z',
  deadlineAt: '2026-11-10T11:20:00.000Z',
  endedAt: null,
  lastFilledAt: '2026-11-10T10:21:00.000Z',
  nextRunAt: '2026-11-10T10:25:00.000Z',
  stopReason: null,
  reason: null,
  createdAt: '2026-11-10T07:20:00.000Z',
  updatedAt: '2026-11-10T10:22:00.000Z',
} satisfies TaskDto;
export const MARKET_SELL_TASK_FIXTURE = {
  ...TASK_FIXTURE,
  id: TASK_MARKET_SELL_ID,
  name: 'Mock：市价股数卖出待核对',
  side: 'SELL',
  orderType: 'MARKET',
  targetQuantity: '2.0000000001',
  config: {
    ...COMMON_MARKET_CONFIG,
    accountId: READONLY_IDS.accountA,
    name: 'Mock：市价股数卖出待核对',
    symbol: 'AAPL',
    side: 'SELL',
    targetQuantity: '2.0000000001',
    quantityMode: 'FIXED',
    fixedQuantity: '1.0000000001',
    randomQuantityMin: 1,
    randomQuantityMax: 2,
  },
  status: 'RECOVERY_REQUIRED',
  filledQuantity: '0.0000000000',
  filledNotional: '0.000000000000000000',
  reservedCash: '0.000000000000000000',
  reservedQuantity: '1.0000000001',
  scheduledStartAt: null,
  startedAt: '2026-11-10T10:10:00.000Z',
  deadlineAt: '2026-11-10T11:10:00.000Z',
  endedAt: null,
  lastFilledAt: null,
  nextRunAt: null,
  stopReason: 'EVIDENCE_PENDING',
  reason: 'Mock：原市价卖出提交结果待核对',
  createdAt: '2026-11-10T07:10:00.000Z',
  updatedAt: '2026-11-10T10:12:00.000Z',
} satisfies TaskDto;

export const LAST_INTERRUPTION_FIXTURE = {
  eventId: 'a0000000-0000-4000-8000-000000000001',
  status: 'PAUSED',
  reason: 'Mock：此前因资金来源不可用暂停',
  stopReason: 'FUNDING_UNAVAILABLE',
  occurredAt: '2026-11-10T10:03:00.000Z',
} satisfies NonNullable<TaskDetailDto['lastInterruption']>;
export const LOCAL_TRADE_FIXTURE = {
  id: READONLY_IDS.trade,
  ownerUserId: TRADER_USER.id,
  exchangeAccountId: READONLY_IDS.accountA,
  taskId: READONLY_IDS.task,
  orderId: READONLY_IDS.order,
  exchangeTradeId: 'mock-execution-201',
  symbol: 'AAPL',
  side: 'BUY',
  price: '100.000000000000000000',
  quantity: '2.0000000001',
  fee: null,
  filledAt: '2026-11-10T10:01:00.000Z',
  createdAt: '2026-11-10T10:02:00.000Z',
  updatedAt: '2026-11-10T10:02:00.000Z',
} satisfies OrderDetailDto['trades'][number];
export const ORDER_DETAIL_FIXTURE = {
  order: ORDER_FIXTURE,
  trades: [LOCAL_TRADE_FIXTURE],
  events: [
    {
      id: 'b0000000-0000-4000-8000-000000000001',
      orderId: READONLY_IDS.order,
      ownerUserId: TRADER_USER.id,
      type: 'STATE',
      message: 'Mock：订单已成交，最终费用待核实',
      details: { from: 'PARTIALLY_FILLED', to: 'FILLED', feePending: true },
      createdAt: '2026-11-10T10:02:00.000Z',
    },
  ],
  source: 'LOCAL_LEDGER',
} satisfies OrderDetailDto;
export const TASK_DETAIL_FIXTURE = {
  task: TASK_FIXTURE,
  lastInterruption: LAST_INTERRUPTION_FIXTURE,
  source: 'LOCAL_LEDGER',
  orders: [ORDER_FIXTURE, CANCELED_ORDER_FIXTURE],
  trades: [
    {
      ...LOCAL_TRADE_FIXTURE,
      id: '50000000-0000-4000-8000-000000000002',
      orderId: ORDER_CANCELED_ID,
      exchangeTradeId: 'mock-execution-202',
      quantity: '1.0000000000',
      filledAt: '2026-11-10T09:57:00.000Z',
      createdAt: '2026-11-10T09:57:00.000Z',
      updatedAt: '2026-11-10T09:57:00.000Z',
    },
    LOCAL_TRADE_FIXTURE,
  ],
  events: [
    {
      id: LAST_INTERRUPTION_FIXTURE.eventId,
      taskId: READONLY_IDS.task,
      ownerUserId: TRADER_USER.id,
      type: 'STATE',
      message: LAST_INTERRUPTION_FIXTURE.reason,
      details: { to: 'PAUSED', stopReason: 'FUNDING_UNAVAILABLE' },
      createdAt: LAST_INTERRUPTION_FIXTURE.occurredAt,
    },
    {
      id: 'a0000000-0000-4000-8000-000000000002',
      taskId: READONLY_IDS.task,
      ownerUserId: TRADER_USER.id,
      type: 'STATE',
      message: 'Mock：执行窗口到期',
      details: { to: 'EXPIRED', stopReason: 'WINDOW_EXPIRED' },
      createdAt: '2026-11-10T11:00:00.124Z',
    },
  ],
  summary: {
    targetQuantity: TASK_FIXTURE.targetQuantity,
    filledQuantity: TASK_FIXTURE.filledQuantity,
    remainingQuantity: '2.0000000000',
    targetNotional: null,
    filledNotional: TASK_FIXTURE.filledNotional,
    remainingNotional: null,
    submittedOrders: 2,
    filledOrders: 1,
    partialOrders: 1,
    canceledOrders: 1,
    rejectedOrders: 0,
  },
} satisfies TaskDetailDto;

export const READONLY_ORDERS: OrderDto[] = [
  MARKET_BUY_ORDER_FIXTURE,
  MARKET_SELL_ORDER_FIXTURE,
  ORDER_FIXTURE,
  CANCELED_ORDER_FIXTURE,
];
export const READONLY_TASKS: TasksDto['items'] = [
  { ...MARKET_BUY_TASK_FIXTURE, lastInterruption: null },
  { ...MARKET_SELL_TASK_FIXTURE, lastInterruption: null },
  { ...TASK_FIXTURE, lastInterruption: LAST_INTERRUPTION_FIXTURE },
];
export const MARKET_BUY_TRADE_FIXTURE: OrderDetailDto['trades'][number] = {
  ...LOCAL_TRADE_FIXTURE,
  id: '50000000-0000-4000-8000-000000000003',
  exchangeAccountId: READONLY_IDS.accountB,
  taskId: TASK_MARKET_BUY_ID,
  orderId: ORDER_MARKET_BUY_ID,
  exchangeTradeId: 'mock-execution-203',
  symbol: 'MSFT',
  price: MARKET_BUY_ORDER_FIXTURE.averagePrice,
  quantity: MARKET_BUY_ORDER_FIXTURE.filledQuantity,
  filledAt: '2026-11-10T10:21:00.000Z',
  createdAt: '2026-11-10T10:22:00.000Z',
  updatedAt: '2026-11-10T10:22:00.000Z',
};
export const ORDER_DETAILS: Record<string, OrderDetailDto> = {
  [READONLY_IDS.order]: ORDER_DETAIL_FIXTURE,
  [ORDER_CANCELED_ID]: {
    ...ORDER_DETAIL_FIXTURE,
    order: CANCELED_ORDER_FIXTURE,
    trades: TASK_DETAIL_FIXTURE.trades.slice(0, 1),
    events: [],
  },
  [ORDER_MARKET_BUY_ID]: {
    source: 'LOCAL_LEDGER',
    order: MARKET_BUY_ORDER_FIXTURE,
    trades: [MARKET_BUY_TRADE_FIXTURE],
    events: [],
  },
  [ORDER_MARKET_SELL_ID]: {
    source: 'LOCAL_LEDGER',
    order: MARKET_SELL_ORDER_FIXTURE,
    trades: [],
    events: [],
  },
};
export const TASK_DETAILS: Record<string, TaskDetailDto> = {
  [READONLY_IDS.task]: TASK_DETAIL_FIXTURE,
  [TASK_MARKET_BUY_ID]: {
    source: 'LOCAL_LEDGER',
    task: MARKET_BUY_TASK_FIXTURE,
    lastInterruption: null,
    orders: [MARKET_BUY_ORDER_FIXTURE],
    trades: [MARKET_BUY_TRADE_FIXTURE],
    events: [],
    summary: {
      targetQuantity: null,
      filledQuantity: MARKET_BUY_TASK_FIXTURE.filledQuantity,
      remainingQuantity: null,
      targetNotional: MARKET_BUY_TASK_FIXTURE.targetNotional,
      filledNotional: MARKET_BUY_TASK_FIXTURE.filledNotional,
      remainingNotional: '475.123456789012345677',
      submittedOrders: 1,
      filledOrders: 0,
      partialOrders: 1,
      canceledOrders: 0,
      rejectedOrders: 0,
    },
  },
  [TASK_MARKET_SELL_ID]: {
    source: 'LOCAL_LEDGER',
    task: MARKET_SELL_TASK_FIXTURE,
    lastInterruption: null,
    orders: [MARKET_SELL_ORDER_FIXTURE],
    trades: [],
    events: [],
    summary: {
      targetQuantity: MARKET_SELL_TASK_FIXTURE.targetQuantity,
      filledQuantity: MARKET_SELL_TASK_FIXTURE.filledQuantity,
      remainingQuantity: MARKET_SELL_TASK_FIXTURE.targetQuantity,
      targetNotional: null,
      filledNotional: MARKET_SELL_TASK_FIXTURE.filledNotional,
      remainingNotional: null,
      submittedOrders: 0,
      filledOrders: 0,
      partialOrders: 0,
      canceledOrders: 0,
      rejectedOrders: 0,
    },
  },
};

function matchesPublicFilter(
  row: OrderDto | TasksDto['items'][number],
  params: URLSearchParams,
  searchFields: string[],
): boolean {
  if (params.get('accountId') && row.exchangeAccountId !== params.get('accountId')) return false;
  if (params.get('ownerUserId') && row.ownerUserId !== params.get('ownerUserId')) return false;
  if (params.get('symbol') && row.symbol !== params.get('symbol')) return false;
  if (params.get('status') && row.status !== params.get('status')) return false;
  const from = params.get('from');
  const to = params.get('to');
  if (from && Date.parse(row.createdAt) < Date.parse(from)) return false;
  if (to && Date.parse(row.createdAt) > Date.parse(to)) return false;
  const search = params.get('search');
  return !search || searchFields.some((text) => text.toLowerCase().includes(search.toLowerCase()));
}

export function ordersPageFixture(params = new URLSearchParams(), rows = READONLY_ORDERS): OrdersDto {
  const matching = rows.filter((row) =>
    matchesPublicFilter(row, params, [
      row.clientOrderId,
      row.idempotencyKey ?? '',
      row.symbol,
      row.reason ?? '',
    ]),
  );
  const page = Number(params.get('page') ?? 1);
  const pageSize = Number(params.get('pageSize') ?? 25);
  return {
    source: 'LOCAL_LEDGER',
    items: matching.slice((page - 1) * pageSize, page * pageSize),
    total: matching.length,
    page,
    pageSize,
  };
}

export function tasksPageFixture(params = new URLSearchParams(), rows = READONLY_TASKS): TasksDto {
  const matching = rows.filter((row) =>
    matchesPublicFilter(row, params, [row.name, row.symbol, row.reason ?? '']),
  );
  const page = Number(params.get('page') ?? 1);
  const pageSize = Number(params.get('pageSize') ?? 25);
  return {
    source: 'LOCAL_LEDGER',
    items: matching.slice((page - 1) * pageSize, page * pageSize),
    total: matching.length,
    page,
    pageSize,
  };
}
