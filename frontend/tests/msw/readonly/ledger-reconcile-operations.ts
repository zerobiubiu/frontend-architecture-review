import type { LedgerDataDto } from '../../../src/features/ledger/schemas';
import type { BusinessEventsDataDto, OperationDataDto } from '../../../src/features/operations/schemas';
import type { ReconciliationDataDto } from '../../../src/features/reconciliations/schemas';
import { ADMIN_USER, TRADER_USER } from '../auth-fixtures';
import { READONLY_IDS } from './ids';

export const LEDGER_RECONCILE_OPERATION_TIME = '2026-11-09T12:34:56.123456789Z';

export function makeLedgerEntry(
  overrides: Partial<LedgerDataDto['items'][number]> = {},
): LedgerDataDto['items'][number] {
  return {
    id: READONLY_IDS.ledger,
    ownerUserId: TRADER_USER.id,
    exchangeAccountId: READONLY_IDS.accountA,
    tradeId: READONLY_IDS.trade,
    orderId: READONLY_IDS.order,
    type: 'TRADE_BUY',
    amount: '-9007199254740993.123456789012345678',
    currency: 'USD',
    balanceAfter: null,
    description: 'Mock · 已确认成交的本地 USD 名义流量，非完整现金结算',
    createdAt: LEDGER_RECONCILE_OPERATION_TIME,
    updatedAt: LEDGER_RECONCILE_OPERATION_TIME,
    ...overrides,
  };
}

export const READONLY_LEDGER_ENTRIES: LedgerDataDto['items'] = [
  makeLedgerEntry(),
  makeLedgerEntry({
    id: '60000000-0000-4000-8000-000000000002',
    type: 'RESERVATION',
    amount: '-25.000000000000000001',
    currency: 'USDC',
    tradeId: null,
    description: 'Mock · 本地买入预留政策，不是官方费率',
  }),
  makeLedgerEntry({
    id: '60000000-0000-4000-8000-000000000003',
    type: 'RELEASE',
    amount: '2.0000000000',
    currency: null,
    tradeId: null,
    description: 'Mock · 本地卖出预占释放，未提供现金币种',
  }),
  ...Array.from({ length: 8 }, (_, index) =>
    makeLedgerEntry({
      id: `60000000-0000-4000-8000-${String(index + 4).padStart(12, '0')}`,
      type: 'ORDER_FEE',
      amount: '-0.000000000000000001',
      description: `Mock · 已确认费用增量 ${index + 1}`,
    }),
  ),
];

export function readonlyLedgerPage(page = 1, pageSize = 10): LedgerDataDto {
  return {
    items: READONLY_LEDGER_ENTRIES.slice((page - 1) * pageSize, page * pageSize),
    total: READONLY_LEDGER_ENTRIES.length,
    page,
    pageSize,
    source: 'LOCAL_LEDGER',
  };
}

export function makeReconciliationRecord(
  overrides: Partial<ReconciliationDataDto[number]> = {},
): ReconciliationDataDto[number] {
  return {
    id: READONLY_IDS.reconciliation,
    ownerUserId: TRADER_USER.id,
    exchangeAccountId: READONLY_IDS.accountA,
    status: 'PARTIAL',
    createdAt: LEDGER_RECONCILE_OPERATION_TIME,
    details: {
      source: 'BINANCE_STOCKS',
      walletSource: 'BINANCE_WALLET',
      assetsAvailable: true,
      message: 'Mock · 仅核对本系统范围与钱包，不是全量一致',
      walletSnapshot: {
        source: 'BINANCE_WALLET',
        receivedAt: '2026-11-09T12:34:55.123Z',
        funding: {
          source: 'BINANCE_WALLET',
          walletType: 'CARD',
          asset: 'USDC',
          free: '42.123456789012345678',
          locked: '1.000000000000000001',
          freeze: null,
          withdrawing: null,
          receivedAt: '2026-11-09T12:34:55.123Z',
        },
        spotUsdc: null,
        permissions: { reading: true, spotAndMarginTrading: null, withdrawals: null, ipRestricted: null },
      },
      walletError: null,
      cashBalance: null,
      officialPositions: null,
      unresolvedOrderIds: [],
      unmanagedExchangeOrderIds: [],
      exchangeTradeHistoryTotal: 7,
      historyError: null,
      note: 'Mock · 证券总持仓与完整现金结算尚未核实',
    },
    ...overrides,
  };
}

export const READONLY_RECONCILIATIONS: ReconciliationDataDto = [
  makeReconciliationRecord(),
  makeReconciliationRecord({
    id: '70000000-0000-4000-8000-000000000002',
    exchangeAccountId: READONLY_IDS.accountB,
    status: 'UNAVAILABLE',
    details: {
      source: 'BINANCE_STOCKS',
      walletSource: 'BINANCE_WALLET',
      assetsAvailable: false,
      walletSnapshot: null,
      walletError: 'Mock · Funding 读取失败',
      historyError: 'Mock · 官方历史第一页失败',
      cashBalance: null,
      officialPositions: null,
      unresolvedOrderIds: [],
      unmanagedExchangeOrderIds: [],
      exchangeTradeHistoryTotal: null,
    },
  }),
  makeReconciliationRecord({
    id: '70000000-0000-4000-8000-000000000003',
    status: 'DIFFERENCE',
    details: {
      source: 'BINANCE_STOCKS',
      walletSource: 'BINANCE_WALLET',
      assetsAvailable: false,
      walletSnapshot: null,
      walletError: 'Mock · 钱包不可用',
      historyError: null,
      unresolvedOrderIds: [READONLY_IDS.order],
      unmanagedExchangeOrderIds: ['EXTERNAL-ORDER-17'],
      exchangeTradeHistoryTotal: 9,
    },
  }),
];

export function makeOperationReceipt(overrides: Partial<OperationDataDto> = {}): OperationDataDto {
  return {
    id: READONLY_IDS.operation,
    actorUserId: ADMIN_USER.id,
    kind: 'ACCOUNT_RECONCILE',
    targetType: 'ACCOUNT',
    targetId: READONLY_IDS.accountA,
    status: 'SUCCEEDED',
    phase: 'LOCAL_APPLIED',
    outcome: 'RECONCILIATION_COMPLETED',
    createdAt: '2026-11-09T12:30:00.000Z',
    updatedAt: '2026-11-09T12:34:56.123Z',
    finishedAt: '2026-11-09T12:34:56.123Z',
    result: { status: 'PARTIAL', details: makeReconciliationRecord().details },
    error: null,
    ...overrides,
  };
}

export const READONLY_OPERATIONS: OperationDataDto[] = [
  makeOperationReceipt({
    status: 'UNKNOWN',
    phase: 'RECONCILE_STARTED',
    outcome: null,
    finishedAt: null,
    result: {
      exchangeAccountId: READONLY_IDS.accountA,
      orderIds: [READONLY_IDS.order],
      taskIds: [READONLY_IDS.task],
      historyTo: '2026-11-09T12:30:00.000Z',
    },
  }),
  makeOperationReceipt({
    id: '80000000-0000-4000-8000-000000000002',
    kind: 'TASK_CONTROL',
    targetType: 'TASK',
    targetId: READONLY_IDS.task,
    outcome: 'CONTROL_APPLIED',
    result: { status: 'STOPPING' },
  }),
];

export function makeBusinessEvent(
  overrides: Partial<BusinessEventsDataDto['items'][number]> = {},
): BusinessEventsDataDto['items'][number] {
  return {
    id: '21000000-0000-4000-8000-000000000001',
    ownerUserId: TRADER_USER.id,
    resourceType: 'ORDER',
    resourceId: READONLY_IDS.order,
    type: 'UNKNOWN',
    message: 'Mock · 订单证据未知，未重发或释放预留',
    details: {
      clientOrderId: 'mock-original-client-id',
      reservedCash: '10.000000000000000001',
      reservedQuantity: '0.0000000000',
    },
    createdAt: LEDGER_RECONCILE_OPERATION_TIME,
    ...overrides,
  };
}

export const READONLY_BUSINESS_EVENTS: BusinessEventsDataDto['items'] = [
  makeBusinessEvent(),
  ...Array.from({ length: 10 }, (_, index) =>
    makeBusinessEvent({
      id: `21000000-0000-4000-8000-${String(index + 2).padStart(12, '0')}`,
      resourceType: 'TASK',
      resourceId: READONLY_IDS.task,
      type: 'STATE',
      message: `Mock · 任务历史业务事件 ${index + 1}`,
      details: {},
    }),
  ),
];

export function readonlyBusinessEventsPage(page = 1, pageSize = 10): BusinessEventsDataDto {
  return {
    items: READONLY_BUSINESS_EVENTS.slice((page - 1) * pageSize, page * pageSize),
    total: READONLY_BUSINESS_EVENTS.length,
    page,
    pageSize,
  };
}
