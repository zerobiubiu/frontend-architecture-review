import { type APIRequestContext, expect } from '@playwright/test';
import type { QuoteStreamStatus } from '@project/api-contracts/validation';

const developmentPort = process.env.PLAYWRIGHT_PORT ?? '5173';
if (developmentPort !== '5173' && developmentPort !== '5273') {
  throw new Error('协议验收只允许本机 5173 或 5273，与显式来源白名单一致');
}
export const DEVELOPMENT_PORT = Number(developmentPort);
export const DEVELOPMENT_ORIGIN = `http://localhost:${developmentPort}`;

export const PROTOCOL_ORIGIN = 'http://localhost:18770';
export const PREVIEW_ORIGIN = 'http://localhost:4173';
export const PROTOCOL_PASSWORD = 'protocol-only-password';
export type StubIdentity = 'trader' | 'admin' | 'owner';
type AuthEndpoint = 'login' | 'me' | 'logout' | 'events';
export const READONLY_RESOURCES = [
  'overview',
  'accounts',
  'account-detail',
  'securities',
  'quotes',
  'positions',
  'holdings',
  'trades',
  'orders',
  'order-detail',
  'tasks',
  'task-detail',
  'ledger',
  'reconciliations',
  'operations',
  'operation-detail',
  'logs',
  'admin-overview',
  'users',
  'audit',
  'system',
  'health',
] as const;
export type ReadonlyResource = (typeof READONLY_RESOURCES)[number];
export type ReadonlyMode = 'normal' | 'empty' | 'error' | 'malformed' | 'denied';
export type StubEndpoint = AuthEndpoint | `readonly:${ReadonlyResource}`;
export interface ReadonlyControl {
  resource: ReadonlyResource;
  mode?: ReadonlyMode;
  revision?: number;
}
interface MarketSelector {
  accountId?: string;
  symbol?: string;
}
export type MarketControl = MarketSelector &
  (
    | { kind: 'quote'; bid?: string; ask?: string }
    | { kind: 'status'; status: QuoteStreamStatus; code?: string; retryable?: boolean }
    | { kind: 'disconnect' }
  );
type LegacyControlAction =
  | 'reset'
  | 'config'
  | 'gates'
  | 'release'
  | 'identity'
  | 'revoke'
  | 'disconnect'
  | 'refresh';

// 此处仅描述测试控制 DTO，不是正式认证或业务 API 的第二套类型。
export interface ProtocolState {
  mock: true;
  requests: Record<AuthEndpoint | 'preflight' | 'unmatched', number>;
  cookieRequests: Record<'me' | 'logout' | 'events', number>;
  rejectedOrigins: number;
  rejectedCsrf: number;
  streams: {
    active: number;
    opened: number;
    closed: number;
    maxActive: number;
    items: { id: string; sessionId: string }[];
  };
  frames: { refresh: number; unauthorized: number; unavailable: number };
  readonly: {
    revision: number;
    modes: Record<ReadonlyResource, ReadonlyMode>;
    requests: Record<ReadonlyResource, number>;
    forbiddenWrites: number;
    market: { active: number; opened: number; closed: number; maxActive: number };
  };
  sessions: { id: string; username: string; active: boolean }[];
  gates: { id: string; endpoint: StubEndpoint; pending: number }[];
  history: {
    id: number;
    method: string;
    path: string;
    origin: string | null;
    cookieReceived: boolean;
    status: number | null;
  }[];
}

export async function readProtocolState(request: APIRequestContext): Promise<ProtocolState> {
  const response = await request.get(`${PROTOCOL_ORIGIN}/__stub/state`, {
    headers: { 'X-Protocol-Control': '1' },
  });
  expect(response.ok()).toBe(true);
  const state: ProtocolState = await response.json();
  expect(state.mock).toBe(true);
  return state;
}

export function controlProtocol(
  request: APIRequestContext,
  action: 'readonly',
  body: ReadonlyControl,
): Promise<ProtocolState>;
export function controlProtocol(
  request: APIRequestContext,
  action: 'market',
  body: MarketControl,
): Promise<ProtocolState>;
export function controlProtocol(
  request: APIRequestContext,
  action: LegacyControlAction,
  body?: Record<string, unknown>,
): Promise<ProtocolState>;
export async function controlProtocol(
  request: APIRequestContext,
  action: LegacyControlAction | 'readonly' | 'market',
  body: object = {},
): Promise<ProtocolState> {
  const response = await request.post(`${PROTOCOL_ORIGIN}/__stub/${action}`, {
    headers: { 'X-Protocol-Control': '1' },
    data: body,
  });
  expect(response.ok(), `协议桩控制 ${action} 应成功`).toBe(true);
  const state: ProtocolState = await response.json();
  expect(state.mock).toBe(true);
  return state;
}

export async function waitForGate(request: APIRequestContext, id: string): Promise<void> {
  await expect
    .poll(async () => {
      const state = await readProtocolState(request);
      return state.gates.find((gate) => gate.id === id)?.pending ?? 0;
    })
    .toBeGreaterThan(0);
}
