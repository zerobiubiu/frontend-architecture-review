import type { ApiClient } from '@project/api-contracts';
import type { InferResponseType } from 'hono/client';
import { TRADER_USER } from '../auth-fixtures';
import { READONLY_IDS } from './ids';

export type AccountFixtureDto = InferResponseType<ApiClient['api']['v1']['accounts'][':id']['$get']>['data'];

export const ACCOUNT_SNAPSHOT_RAW_TIME = '2026-11-01T10:11:12.123456789Z';
export const ACCOUNT_FUNDING_RAW = '12345678901234567890.123456789012345678';

export const READY_ACCOUNT = {
  id: READONLY_IDS.accountA,
  ownerUserId: TRADER_USER.id,
  exchange: 'BINANCE',
  label: 'Mock — Funding account',
  status: 'ACTIVE',
  connectionStatus: 'CONNECTED',
  connectionMessage: 'Mock: 已保存官方只读连接结果',
  hasCredentials: true,
  apiKeyLast4: 'A123',
  tradingEnabled: true,
  adminTradingBlocked: false,
  adminBlockReason: null,
  tradingRevision: 3,
  cashBalance: null,
  availableCash: ACCOUNT_FUNDING_RAW,
  reservedCash: '25.000000000000000000',
  source: 'BINANCE_WALLET',
  assetsAvailable: true,
  assetMessage: 'Mock: 已取得官方资金钱包 USDC 快照；仍需当次资金与证券库存预检',
  buyReady: true,
  sellReady: true,
  tradingReady: true,
  quoteCurrency: 'USD',
  settlementCurrency: 'USDC',
  walletSyncError: null,
  lastSyncAt: '2026-11-01T10:11:12.123Z',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-11T09:00:00.000Z',
  localSnapshot: {
    cashBalance: null,
    reservedCash: '25.000000000000000000',
    availableCash: null,
  },
  externalSnapshot: {
    source: 'BINANCE_WALLET',
    receivedAt: ACCOUNT_SNAPSHOT_RAW_TIME,
    cashBalance: null,
    availableCash: ACCOUNT_FUNDING_RAW,
    positions: null,
  },
  walletSnapshot: {
    source: 'BINANCE_WALLET',
    receivedAt: ACCOUNT_SNAPSHOT_RAW_TIME,
    funding: {
      source: 'BINANCE_WALLET',
      walletType: 'CARD',
      asset: 'USDC',
      free: ACCOUNT_FUNDING_RAW,
      locked: '10.000000000000000000',
      freeze: null,
      withdrawing: null,
      receivedAt: ACCOUNT_SNAPSHOT_RAW_TIME,
    },
    spotUsdc: {
      asset: 'USDC',
      free: '777.125000000000000000',
      locked: '0.000000000000000000',
      freeze: null,
      withdrawing: '0.000000000000000000',
    },
    permissions: {
      reading: true,
      spotAndMarginTrading: null,
      withdrawals: false,
      ipRestricted: null,
    },
  },
} satisfies AccountFixtureDto;

export const UNAVAILABLE_ACCOUNT = {
  ...READY_ACCOUNT,
  id: READONLY_IDS.accountB,
  label: 'Mock — Historical snapshot only',
  status: 'DISABLED',
  connectionStatus: 'ERROR',
  connectionMessage: 'Mock: 官方读取失败；旧快照保留',
  apiKeyLast4: 'B456',
  tradingEnabled: false,
  adminTradingBlocked: true,
  adminBlockReason: 'Mock: 账户只读限制说明',
  tradingRevision: 4,
  availableCash: null,
  source: 'UNAVAILABLE',
  assetsAvailable: false,
  assetMessage: 'Mock: 官方资金读取失败，不能采用旧 Funding 作为当前可用资金',
  buyReady: false,
  sellReady: false,
  tradingReady: false,
  walletSyncError: 'Mock: 官方资金读取失败',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-11-11T10:00:00.000Z',
  externalSnapshot: {
    source: 'UNAVAILABLE',
    receivedAt: ACCOUNT_SNAPSHOT_RAW_TIME,
    cashBalance: null,
    availableCash: null,
    positions: null,
  },
} satisfies AccountFixtureDto;

export const OTHER_OWNER_ACCOUNT = {
  ...READY_ACCOUNT,
  id: READONLY_IDS.otherAccount,
  ownerUserId: READONLY_IDS.otherTrader,
  label: 'Mock — Other owner account',
  hasCredentials: false,
  apiKeyLast4: null,
  connectionStatus: 'UNVERIFIED',
  connectionMessage: null,
  tradingEnabled: false,
  availableCash: null,
  source: 'UNAVAILABLE',
  assetsAvailable: false,
  assetMessage: 'Mock: 尚无可用的官方资金钱包 USDC 明细',
  buyReady: false,
  sellReady: false,
  tradingReady: false,
  lastSyncAt: null,
  walletSnapshot: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  externalSnapshot: {
    source: 'UNAVAILABLE',
    receivedAt: null,
    cashBalance: null,
    availableCash: null,
    positions: null,
  },
} satisfies AccountFixtureDto;

export const READONLY_ACCOUNTS: readonly AccountFixtureDto[] = [
  READY_ACCOUNT,
  UNAVAILABLE_ACCOUNT,
  OTHER_OWNER_ACCOUNT,
];

/** Each MSW scenario receives independent, generated-DTO-shaped account records. */
export function createAccountFixtures(): AccountFixtureDto[] {
  return structuredClone([...READONLY_ACCOUNTS]);
}
