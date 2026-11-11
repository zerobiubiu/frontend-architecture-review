import type {
  QuoteStreamEvent,
  QuoteStreamSnapshot,
  QuoteStreamStatus,
} from '@project/api-contracts/validation';
import type { QuoteDto } from '../../../src/features/market/api';
import type { CatalogDto, EquityRuleDto } from '../../../src/features/securities/api';
import { READONLY_IDS } from './ids';

// 明确 Mock 数据；仅数据与纯 factory，供 MSW 和无交易原生协议桩共同使用。
export const MARKET_FIXTURE_TIME = '2026-11-10T12:00:00.000Z';
export const MARKET_FIXTURE_EXPIRES = '2026-11-10T12:05:00.000Z';
export const MARKET_FIXTURE_SYMBOLS = [
  'AAPL',
  'ABBV',
  'ABT',
  'ADBE',
  'AMD',
  'AMZN',
  'AVGO',
  'BAC',
  'BRK.B',
  'COST',
  'CRM',
  'CSCO',
  'CVX',
  'DIS',
  'GOOG',
  'HD',
  'IBM',
  'INTC',
  'JNJ',
  'JPM',
  'KO',
  'META',
  'MSFT',
  'NFLX',
  'NVDA',
  'ORCL',
  'SYPR',
  'TSLA',
];
export function makeEquityRule(symbol = 'AAPL', overrides: Partial<EquityRuleDto> = {}): EquityRuleDto {
  return {
    symbol,
    tradability: 'BUY_SELL',
    extendedSession: true,
    overnightSupported: null,
    fractionable: true,
    fractionableEh: false,
    listingTime: 345427200000,
    delistingTime: null,
    maxNumOrders: null,
    stepSize: '0.0000000001',
    minQuantity: '0.0000000001',
    maxQuantity: '999999999999.1234567890',
    minNotional: '1.000000000000000001',
    maxNotional: null,
    ...overrides,
  };
}
export const MARKET_RULE_FIXTURES = MARKET_FIXTURE_SYMBOLS.map((symbol) =>
  makeEquityRule(
    symbol,
    symbol === 'MSFT' ? { tradability: null, fractionable: null, minNotional: null } : {},
  ),
);

export function makeCatalogPage(
  options: { search?: string; page?: number; pageSize?: number } = {},
): CatalogDto {
  const search = options.search?.trim().toUpperCase() ?? '';
  const matching = MARKET_RULE_FIXTURES.filter((rule) => rule.symbol.toUpperCase().includes(search));
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 25;
  return {
    items: matching.slice((page - 1) * pageSize, page * pageSize),
    total: matching.length,
    page,
    pageSize,
    source: 'BINANCE_STOCKS',
    fetchedAt: MARKET_FIXTURE_TIME,
    expiresAt: MARKET_FIXTURE_EXPIRES,
  };
}

export function makeMarketQuote(symbol = 'AAPL', overrides: Partial<QuoteDto> = {}): QuoteDto {
  return {
    symbol,
    bid: '312.123456789012345678',
    ask: '312.223456789012345678',
    bidSize: '123.1234567890',
    askSize: null,
    timestamp: MARKET_FIXTURE_TIME,
    source: 'BINANCE_STOCKS',
    timestampSource: 'LOCAL_RECEIPT',
    tradingStatus: 'UNKNOWN',
    ...overrides,
  };
}

export function makeQuoteEvent(
  options: {
    accountId?: string;
    symbol?: string;
    receivedAt?: number;
    eventTimestamp?: number | null;
    sourceTimestamp?: number | null;
    transport?: QuoteStreamSnapshot['transport'];
    quote?: Partial<QuoteDto>;
  } = {},
): QuoteStreamEvent {
  const symbol = options.symbol ?? 'AAPL';
  const receivedAt = options.receivedAt ?? Date.parse(MARKET_FIXTURE_TIME);
  const transport = options.transport ?? 'WEBSOCKET';
  return {
    kind: 'quote',
    accountId: options.accountId ?? READONLY_IDS.accountA,
    symbol,
    value: {
      quote: makeMarketQuote(symbol, { timestamp: new Date(receivedAt).toISOString(), ...options.quote }),
      receivedAt,
      transport,
      eventTimestamp:
        options.eventTimestamp !== undefined
          ? options.eventTimestamp
          : transport === 'WEBSOCKET'
            ? receivedAt - 20
            : null,
      sourceTimestamp: options.sourceTimestamp !== undefined ? options.sourceTimestamp : null,
    },
  };
}

export function makeQuoteStatus(
  status: QuoteStreamStatus,
  options: {
    accountId?: string;
    symbol?: string;
    code?: string;
    retryable?: boolean;
  } = {},
): QuoteStreamEvent {
  return {
    kind: 'status',
    accountId: options.accountId ?? READONLY_IDS.accountA,
    symbol: options.symbol ?? 'AAPL',
    status,
    ...(options.code !== undefined ? { code: options.code } : {}),
    ...(options.retryable !== undefined ? { retryable: options.retryable } : {}),
  };
}
