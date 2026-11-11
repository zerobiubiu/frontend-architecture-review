import type {
  HoldingRow,
  HoldingsResponse,
  PositionRow,
  PositionsResponse,
} from '../../../src/features/positions/types';
import type { OfficialTradeRow, OfficialTradesResponse } from '../../../src/features/trades/types';
import { TRADER_USER } from '../auth-fixtures';
import { READONLY_IDS } from './ids';

// 仅运行时测试数据/工厂，供 MSW 与无交易能力的本地原生协议桩复用。
export const OFFICIAL_TRADE_WINDOW = {
  from: '2026-10-01T00:00:00.123456Z',
  to: '2026-11-11T09:30:00.654321Z',
} as const;

export function positionFixture(overrides: Partial<PositionRow> = {}): PositionRow {
  return {
    id: READONLY_IDS.position,
    ownerUserId: TRADER_USER.id,
    exchangeAccountId: READONLY_IDS.accountA,
    symbol: 'SYPR',
    quantity: '12.0000000001',
    reservedQuantity: '2.0000000000',
    localAvailableQuantity: '10.0000000001',
    averageCost: '102.123456789012345678',
    notionalCost: '12345678901234567890.123456789012345678',
    realizedPnl: '0.000000000000000000',
    createdAt: '2026-10-30T01:02:03.123456789Z',
    updatedAt: '2026-11-11T09:30:00.123456789Z',
    source: 'LOCAL_LEDGER',
    assetsAvailable: false,
    availableQuantity: null,
    exchangeQuantity: null,
    exchangeReservedQuantity: null,
    markPrice: null,
    unrealizedPnl: null,
    quoteTimestamp: null,
    quoteCurrency: 'USD',
    settlementCurrency: 'USDC',
    valuationEstimated: false,
    ...overrides,
  };
}

export function positionsFixture(overrides: Partial<PositionsResponse> = {}): PositionsResponse {
  return {
    items: [positionFixture()],
    total: 1,
    page: 1,
    pageSize: 25,
    source: 'LOCAL_LEDGER',
    assetsAvailable: false,
    unavailableReason: 'Mock：本地名义持仓不证明官方可卖股数或完整资产。',
    ...overrides,
  };
}

export function holdingFixture(overrides: Partial<HoldingRow> = {}): HoldingRow {
  return {
    symbol: 'AAPL',
    stockTicker: 'AAPL',
    assetCode: 'EQ_AAPL',
    fundingFreeQuantity: '0',
    lockedQuantity: '3.2500000000',
    freezeQuantity: null,
    withdrawingQuantity: '0',
    ...overrides,
  };
}

export function holdingsFixture(overrides: Partial<HoldingsResponse> = {}): HoldingsResponse {
  return {
    accountId: READONLY_IDS.accountA,
    source: 'BINANCE_FUNDING_WALLET',
    requestedAt: '2026-11-11T09:30:01.100Z',
    receivedAt: '2026-11-11T09:30:02.300Z',
    sourceUpdatedAt: null,
    items: [holdingFixture()],
    ...overrides,
  };
}

export function officialTradeFixture(overrides: Partial<OfficialTradeRow> = {}): OfficialTradeRow {
  return {
    exchangeTradeId: 'official-execution-900719925474099312345',
    exchangeOrderId: 'official-order-900719925474099398765',
    symbol: 'SYPR',
    side: 'BUY',
    price: '102.123456789012345678',
    priceCurrency: 'USD',
    quantity: '2.0000000001',
    notional: null,
    notionalCurrency: 'USD',
    fee: null,
    quoteCurrency: null,
    filledAt: '2026-11-11T09:00:00.123456789Z',
    updatedAt: null,
    ...overrides,
  };
}

export function officialTradesFixture(
  overrides: Partial<OfficialTradesResponse> = {},
): OfficialTradesResponse {
  return { items: [officialTradeFixture()], total: 1, page: 1, pageSize: 25, ...overrides };
}
