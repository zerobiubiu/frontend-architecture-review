import type {
  AdminAuditDto,
  AdminOverviewView,
  AdminSystemView,
  AdminUsersDto,
  HealthDto,
} from '../../../src/features/administration/types';
import { ADMIN_USER, OWNER_USER, TRADER_USER } from '../auth-fixtures';
import { READONLY_IDS } from './ids';

// 数据 / 纯 factory：MSW 与无交易协议桩共用，不依赖应用运行时或服务器。
export const ADMIN_FIXTURE_TIME = '2026-11-11T08:30:00.123Z';

export const ADMIN_USERS: AdminUsersDto['items'] = [
  { ...OWNER_USER, status: 'ACTIVE', createdAt: ADMIN_FIXTURE_TIME, updatedAt: ADMIN_FIXTURE_TIME },
  { ...ADMIN_USER, status: 'ACTIVE', createdAt: ADMIN_FIXTURE_TIME, updatedAt: ADMIN_FIXTURE_TIME },
  { ...TRADER_USER, status: 'ACTIVE', createdAt: ADMIN_FIXTURE_TIME, updatedAt: ADMIN_FIXTURE_TIME },
  {
    id: READONLY_IDS.otherTrader,
    username: 'disabled-trader',
    role: 'TRADER',
    status: 'DISABLED',
    canManageAdmins: false,
    createdAt: ADMIN_FIXTURE_TIME,
    updatedAt: ADMIN_FIXTURE_TIME,
  },
];

export const ADMIN_SETTINGS: NonNullable<AdminSystemView['settings']> = {
  id: 'platform',
  environment: 'production',
  emergencyStop: true,
  maxOrderQuantity: 10000,
  maxTaskQuantity: 100000,
  maxOrderNotional: '1000000.000000000000000001',
  feeReserveRate: '0.001000000000000001',
  feeReserveMinimum: '0.350000000000000001',
  updatedBy: OWNER_USER.id,
  createdAt: ADMIN_FIXTURE_TIME,
  updatedAt: ADMIN_FIXTURE_TIME,
};

export const ADMIN_EVENTS: AdminSystemView['events'] = [
  {
    id: 91,
    ownerUserId: TRADER_USER.id,
    level: 'WARN',
    type: 'ORDER_UNKNOWN',
    message: 'Mock：订单结果未确认，仍需核实',
    details: { accountId: READONLY_IDS.accountA, orderId: READONLY_IDS.order, status: 'UNKNOWN' },
    createdAt: ADMIN_FIXTURE_TIME,
  },
  {
    id: 90,
    ownerUserId: null,
    level: 'ERROR',
    type: 'WORKER_DEGRADED',
    message: 'Mock：Worker 降级，不代表健康运行',
    details: { status: 'DEGRADED' },
    createdAt: ADMIN_FIXTURE_TIME,
  },
];

export const ADMIN_OVERVIEW: AdminOverviewView = {
  counts: {
    traders: 2,
    admins: 2,
    activeUsers: 3,
    disabledUsers: 1,
    accounts: 3,
    runningTasks: 1,
    openOrders: 1,
    recoveryRequired: 1,
    unknownOrders: 1,
    totalTasks: 6,
    completedTasks: 1,
    failedTasks: 1,
    expiredTasks: 1,
    stoppedTasks: 1,
    unfinishedTasks: 2,
  },
  worker: { online: true, status: 'DEGRADED', lastSeenAt: ADMIN_FIXTURE_TIME },
  settings: ADMIN_SETTINGS,
  recentEvents: ADMIN_EVENTS,
};

export const ADMIN_SYSTEM: AdminSystemView = {
  settings: ADMIN_SETTINGS,
  heartbeats: [
    {
      id: 'worker:production:mock-current',
      instanceId: 'mock-current',
      lastSeenAt: ADMIN_FIXTURE_TIME,
      details: { environment: 'production', status: 'DEGRADED' },
    },
    {
      id: 'worker:production:mock-recovering',
      instanceId: 'mock-recovering',
      lastSeenAt: ADMIN_FIXTURE_TIME,
      details: { environment: 'production', status: 'RECOVERING' },
    },
    {
      id: 'worker:production:mock-old',
      instanceId: 'mock-old',
      lastSeenAt: '2020-01-01T00:00:00.000Z',
      details: { environment: 'production', status: 'RUNNING' },
    },
  ],
  events: ADMIN_EVENTS,
  environment: {
    environment: 'production',
    label: '正式交易',
    tradingReady: true,
    availability: 'AVAILABLE',
    buySupported: true,
    sellSupported: true,
    capabilities: { quotes: true, orders: true, trades: true, assets: true, buy: true, sell: true },
    blockers: [],
    apiVersion: '3.0.0',
  },
  endpoints: {
    results: [
      { endpoint: 'https://mock-primary.invalid', ok: false, latencyMs: 2048, error: 'Mock：该次测量超时' },
      { endpoint: 'https://mock-secondary.invalid', ok: true, latencyMs: 41, error: null },
    ],
    selected: 'https://mock-secondary.invalid',
    measuredAt: ADMIN_FIXTURE_TIME,
  },
};

export const ADMIN_HEALTH_DEGRADED: HealthDto = {
  status: 'degraded',
  database: { online: true, environmentValid: true },
  worker: { online: true, lastSeenAt: ADMIN_FIXTURE_TIME, status: 'DEGRADED' },
  environment: 'production',
  time: ADMIN_FIXTURE_TIME,
};

export const ADMIN_AUDIT: AdminAuditDto['items'] = [
  {
    id: READONLY_IDS.audit,
    actorUserId: OWNER_USER.id,
    actorRole: 'ADMIN',
    action: 'ACCOUNT_CHECK',
    targetType: 'ACCOUNT',
    targetId: READONLY_IDS.accountA,
    result: 'FAILURE',
    details: { symbol: 'aapl', accountId: READONLY_IDS.accountA, note: 'Mock：检查失败' },
    createdAt: ADMIN_FIXTURE_TIME,
  },
  {
    id: '90000000-0000-4000-8000-000000000002',
    actorUserId: TRADER_USER.id,
    actorRole: 'TRADER',
    action: 'TASK_CONTROL',
    targetType: 'TASK',
    targetId: READONLY_IDS.task,
    result: 'SUCCESS',
    details: { symbol: 'AAPL' },
    createdAt: '2026-11-10T08:30:00.123Z',
  },
  {
    id: '90000000-0000-4000-8000-000000000003',
    actorUserId: null,
    actorRole: null,
    action: 'SESSION_EXPIRED',
    targetType: 'SESSION',
    targetId: null,
    result: 'SUCCESS',
    details: {},
    createdAt: '2026-11-09T08:30:00.123Z',
  },
];

export function adminUsersPage(overrides: Partial<AdminUsersDto> = {}): AdminUsersDto {
  return { items: ADMIN_USERS, total: ADMIN_USERS.length, page: 1, pageSize: 25, ...overrides };
}

export function adminAuditPage(overrides: Partial<AdminAuditDto> = {}): AdminAuditDto {
  return { items: ADMIN_AUDIT, total: ADMIN_AUDIT.length, page: 1, pageSize: 25, ...overrides };
}
