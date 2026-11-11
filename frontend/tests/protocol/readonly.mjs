import {
  equityHoldingsQuerySchema,
  filterSchema,
  quoteStreamEventSchema,
  quoteStreamQuerySchema,
  quoteStreamStatuses,
  symbolSchema,
} from '@project/api-contracts/validation';
import { z } from 'zod';
import { createAccountFixtures } from '../msw/readonly/accounts.ts';
import {
  ADMIN_AUDIT,
  ADMIN_HEALTH_DEGRADED,
  ADMIN_OVERVIEW,
  ADMIN_SYSTEM,
  ADMIN_USERS,
} from '../msw/readonly/administration.ts';
import { dashboardFixture } from '../msw/readonly/dashboard.ts';
import { READONLY_IDS } from '../msw/readonly/ids.ts';
import {
  READONLY_BUSINESS_EVENTS,
  READONLY_LEDGER_ENTRIES,
  READONLY_OPERATIONS,
  READONLY_RECONCILIATIONS,
} from '../msw/readonly/ledger-reconcile-operations.ts';
import { makeCatalogPage, makeMarketQuote, makeQuoteEvent, makeQuoteStatus } from '../msw/readonly/market.ts';
import {
  ORDER_DETAILS,
  READONLY_ORDERS,
  READONLY_TASKS,
  TASK_DETAILS,
} from '../msw/readonly/orders-tasks.ts';
import { holdingsFixture, officialTradeFixture, positionsFixture } from '../msw/readonly/positions-trades.ts';

// 仅测试控制与夹具，不导入后端、SDK、数据库，也不连接官方网络。
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
];
export const READONLY_MODES = ['normal', 'empty', 'error', 'malformed', 'denied'];
const uuidSchema = z.string().uuid();
const quotesQuerySchema = z.object({ accountId: uuidSchema.optional(), symbol: symbolSchema });
const historyQuerySchema = filterSchema
  .pick({ symbol: true, from: true, to: true, page: true, pageSize: true })
  .extend({ symbol: symbolSchema.optional() });
// 证券目录查询 schema 未公开导出；只复现其实际输入规则，不复制后端服务。
const catalogQuerySchema = z.object({
  accountId: uuidSchema,
  search: z.string().trim().max(128).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  refresh: z
    .union([z.enum(['true', 'false']).transform((value) => value === 'true'), z.boolean()])
    .optional(),
});
const marketSelector = { accountId: uuidSchema.optional(), symbol: symbolSchema.optional() };
const marketControlSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('quote'),
      ...marketSelector,
      bid: z.string().optional(),
      ask: z.string().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('status'),
      ...marketSelector,
      status: z.enum(quoteStreamStatuses),
      code: z.string().optional(),
      retryable: z.boolean().optional(),
    })
    .strict(),
  z.object({ kind: z.literal('disconnect'), ...marketSelector }).strict(),
]);

const fixedEndpoints = new Map([
  ['/healthz', { resource: 'health', kind: 'health', public: true }],
  // 静态 meta 共用 system 测试控制键，不创造业务资源名。
  ['/api/v1/meta', { resource: 'system', kind: 'meta', public: true }],
  ['/api/v1/overview', { resource: 'overview', kind: 'overview' }],
  ['/api/v1/accounts', { resource: 'accounts', kind: 'accounts' }],
  ['/api/v1/market/symbols', { resource: 'securities', kind: 'securities' }],
  ['/api/v1/market/quotes', { resource: 'quotes', kind: 'quotes' }],
  ['/api/v1/market/quote-stream', { resource: 'quotes', kind: 'quote-stream' }],
  ['/api/v1/market/holdings', { resource: 'holdings', kind: 'holdings' }],
  ...['orders', 'tasks', 'positions', 'ledger', 'reconciliations', 'operations', 'logs'].map((kind) => [
    `/api/v1/${kind}`,
    { resource: kind, kind },
  ]),
  ['/api/v1/admin/overview', { resource: 'admin-overview', kind: 'admin-overview', admin: true }],
  ...['users', 'audit', 'system', 'accounts', 'orders', 'tasks', 'ledger'].map((kind) => [
    `/api/v1/admin/${kind}`,
    { resource: kind, kind, admin: true },
  ]),
]);

export function readonlyEndpoint(path) {
  const fixed = fixedEndpoints.get(path);
  if (fixed) return { ...fixed, method: 'GET' };
  const history = /^\/api\/v1\/accounts\/([^/]+)\/exchange\/(orders|trades)$/.exec(path);
  if (history) return { method: 'GET', resource: history[2], kind: `exchange-${history[2]}`, id: history[1] };
  const detail = /^\/api\/v1\/(accounts|orders|tasks|operations)\/([^/]+)$/.exec(path);
  if (!detail) return null;
  const singular = { accounts: 'account', orders: 'order', tasks: 'task', operations: 'operation' }[
    detail[1]
  ];
  return { method: 'GET', resource: `${singular}-detail`, kind: `${singular}-detail`, id: detail[2] };
}

export function createReadonlyState() {
  return {
    revision: 0,
    modes: Object.fromEntries(READONLY_RESOURCES.map((resource) => [resource, 'normal'])),
    requests: Object.fromEntries(READONLY_RESOURCES.map((resource) => [resource, 0])),
    forbiddenWrites: 0,
    market: { active: 0, opened: 0, closed: 0, maxActive: 0 },
  };
}

export function configureReadonly(state, body) {
  if (
    Object.keys(body).some((key) => !['resource', 'mode', 'revision'].includes(key)) ||
    !READONLY_RESOURCES.includes(body.resource) ||
    (body.mode !== undefined && !READONLY_MODES.includes(body.mode)) ||
    (body.revision !== undefined && (!Number.isSafeInteger(body.revision) || body.revision < 0))
  )
    return false;
  if (body.mode !== undefined) state.modes[body.resource] = body.mode;
  if (body.revision !== undefined) state.revision = body.revision;
  return true;
}

export function parseMarketControl(body) {
  const parsed = marketControlSchema.safeParse(body);
  if (!parsed.success) return null;
  if (
    parsed.data.kind === 'quote' &&
    !quoteStreamEventSchema.safeParse(
      marketFrame(parsed.data, {
        accountId: parsed.data.accountId ?? READONLY_IDS.accountA,
        symbol: parsed.data.symbol ?? 'AAPL',
      }),
    ).success
  )
    return null;
  return parsed.data;
}

export function marketFrame(control, subscription, receivedAt = Date.now()) {
  if (control.kind === 'status')
    return makeQuoteStatus(control.status, {
      ...subscription,
      ...(control.code !== undefined ? { code: control.code } : {}),
      ...(control.retryable !== undefined ? { retryable: control.retryable } : {}),
    });
  return makeQuoteEvent({
    ...subscription,
    receivedAt,
    transport: 'WEBSOCKET',
    eventTimestamp: receivedAt,
    sourceTimestamp: null,
    quote: {
      ...(control.bid !== undefined ? { bid: control.bid } : {}),
      ...(control.ask !== undefined ? { ask: control.ask } : {}),
    },
  });
}

class ReadonlyFailure extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
function reject(status, code, message) {
  throw new ReadonlyFailure(status, code, message);
}
function parse(schema, input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) reject(422, 'VALIDATION_ERROR', 'Mock：读取参数不符合真实公开校验规则');
  return parsed.data;
}
function queryInput(params) {
  const input = Object.create(null);
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    input[key] = values.length === 1 ? values[0] : values;
  }
  return input;
}
const revisedText = (text, revision) =>
  revision === 0 ? text : `${text ?? 'Mock'} · Mock revision ${revision}`;
function revisionTime(time, revision) {
  // 仅有界调整真实展示时钟，不添加 DTO 修订字段或不可表示的 Date。
  return new Date(Date.parse(time) + (revision % 86_400_000)).toISOString();
}
function dataset(revision) {
  const accounts = createAccountFixtures();
  for (const row of accounts) row.label = revisedText(row.label, revision);
  const data = structuredClone({
    orders: READONLY_ORDERS,
    tasks: READONLY_TASKS,
    orderDetails: ORDER_DETAILS,
    taskDetails: TASK_DETAILS,
    positions: positionsFixture(),
    ledger: READONLY_LEDGER_ENTRIES,
    reconciliations: READONLY_RECONCILIATIONS,
    operations: READONLY_OPERATIONS,
    logs: READONLY_BUSINESS_EVENTS,
    users: ADMIN_USERS,
    audit: ADMIN_AUDIT,
    adminOverview: ADMIN_OVERVIEW,
    system: ADMIN_SYSTEM,
    health: ADMIN_HEALTH_DEGRADED,
  });
  // structuredClone 保留列表及其内嵌详情之间的对象引用。
  const revised = new Set();
  const reviseReason = (row) => {
    if (revised.has(row)) return;
    revised.add(row);
    row.reason = revisedText(row.reason, revision);
  };
  for (const row of data.orders) reviseReason(row);
  for (const row of data.tasks) reviseReason(row);
  for (const detail of Object.values(data.orderDetails)) reviseReason(detail.order);
  for (const detail of Object.values(data.taskDetails)) {
    reviseReason(detail.task);
    for (const row of detail.orders) reviseReason(row);
  }
  for (const row of data.ledger) row.description = revisedText(row.description, revision);
  for (const row of data.reconciliations) {
    if (typeof row.details.message === 'string')
      row.details.message = revisedText(row.details.message, revision);
  }
  for (const row of data.operations) row.updatedAt = revisionTime(row.updatedAt, revision);
  for (const row of data.logs) row.message = revisedText(row.message, revision);
  for (const row of new Set([...data.system.events, ...data.adminOverview.recentEvents]))
    row.message = revisedText(row.message, revision);
  for (const settings of new Set([data.system.settings, data.adminOverview.settings])) {
    if (settings) settings.updatedAt = revisionTime(settings.updatedAt, revision);
  }
  data.health.time = revisionTime(data.health.time, revision);
  return { ...data, accounts };
}
function canRead(actor, row, ownerKey = 'ownerUserId') {
  return actor.role === 'ADMIN' || row[ownerKey] === actor.id;
}
function owned(rows, actor, id, code = 'NOT_FOUND', ownerKey = 'ownerUserId') {
  const row = rows.find((item) => item.id.toLowerCase() === id.toLowerCase());
  if (!row || !canRead(actor, row, ownerKey)) reject(404, code, 'Mock：记录不存在或无权访问');
  return row;
}
function scoped(rows, actor, filters, columns) {
  if (
    columns.owner &&
    actor.role === 'TRADER' &&
    filters.ownerUserId &&
    filters.ownerUserId.toLowerCase() !== actor.id
  ) {
    reject(403, 'FORBIDDEN', 'Mock：无权查询其他用户数据');
  }
  if (filters.from && filters.to && Date.parse(filters.from) > Date.parse(filters.to)) {
    reject(422, 'DATE_RANGE_INVALID', 'Mock：起始时间不能晚于结束时间');
  }
  return rows.filter((row) => {
    if (columns.owner && !canRead(actor, row, columns.owner)) return false;
    if (
      filters.ownerUserId &&
      columns.owner &&
      row[columns.owner]?.toLowerCase() !== filters.ownerUserId.toLowerCase()
    )
      return false;
    if (
      filters.accountId &&
      columns.account &&
      row[columns.account]?.toLowerCase() !== filters.accountId.toLowerCase()
    )
      return false;
    if (filters.symbol && columns.symbol && columns.symbol(row) !== filters.symbol) return false;
    if (filters.status && columns.status && row[columns.status] !== filters.status) return false;
    if (filters.from && columns.createdAt && Date.parse(row[columns.createdAt]) < Date.parse(filters.from))
      return false;
    if (filters.to && columns.createdAt && Date.parse(row[columns.createdAt]) > Date.parse(filters.to))
      return false;
    return (
      !filters.search ||
      !columns.search?.length ||
      columns.search.some((key) =>
        String(row[key] ?? '')
          .toLowerCase()
          .includes(filters.search.toLowerCase()),
      )
    );
  });
}
function newest(rows, tieBreak = true) {
  return [...rows].sort(
    (left, right) =>
      Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
      (tieBreak ? String(right.id).localeCompare(String(left.id)) : 0),
  );
}
function page(items, filters, extra = {}) {
  return {
    items: items.slice((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize),
    total: items.length,
    page: filters.page,
    pageSize: filters.pageSize,
    ...extra,
  };
}
function prepareAccount(data, actor, accountId) {
  return owned(data.accounts, actor, accountId, 'ACCOUNT_NOT_FOUND');
}
function requireCredentials(account) {
  if (!account.hasCredentials) reject(409, 'CREDENTIALS_REQUIRED', 'Mock：尚未保存官方读取凭据');
}
function requireActive(account, code = 'ACCOUNT_INACTIVE') {
  if (account.status !== 'ACTIVE') reject(409, code, 'Mock：账户已停用，不能读取此官方来源');
}
function receiptVisible(row, actor, data) {
  if (actor.role === 'ADMIN' || row.actorUserId === actor.id) return true;
  const rows = { ACCOUNT: data.accounts, ORDER: data.orders, TASK: data.tasks }[row.targetType];
  return Boolean(rows?.some((target) => target.id === row.targetId && target.ownerUserId === actor.id));
}
function officialHistory(endpoint, raw, actor, data, now) {
  const id = parse(uuidSchema, endpoint.id).toLowerCase();
  const query = parse(historyQuerySchema, raw);
  const account = prepareAccount(data, actor, id);
  requireCredentials(account);
  const end = query.to ? Date.parse(query.to) : now;
  const start = query.from ? Date.parse(query.from) : end - 7 * 86_400_000;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end) {
    reject(400, 'HISTORY_QUERY_INVALID', 'Mock：官方历史查询时间或分页参数无效');
  }
  // 两条独立真实形状记录而非虚构总数，pageSize=1/page=2 确实切出第二条。
  const first = officialTradeFixture();
  const second = officialTradeFixture({
    exchangeTradeId: 'official-execution-900719925474099312346',
    exchangeOrderId: 'official-order-900719925474099398766',
    side: 'SELL',
    quantity: '1.0000000000',
    filledAt: '2026-11-11T08:00:00.123456789Z',
  });
  const trades = id === READONLY_IDS.accountA ? [first, second] : [];
  const rows =
    endpoint.kind === 'exchange-trades'
      ? trades
      : trades.map((trade) => ({
          exchangeOrderId: trade.exchangeOrderId,
          symbol: trade.symbol,
          side: trade.side,
          orderType: 'LIMIT',
          price: trade.price,
          priceCurrency: 'USD',
          quantity: trade.quantity,
          filledQuantity: trade.quantity,
          averagePrice: trade.price,
          notional: null,
          filledTotal: null,
          notionalCurrency: null,
          fee: null,
          feeCurrency: null,
          quoteCurrency: null,
          tradingSession: 'RTH',
          status: 'FILLED',
          createdAt: trade.filledAt,
          updatedAt: null,
        }));
  return page(
    rows.filter(
      (row) =>
        (!query.symbol || row.symbol === query.symbol) &&
        Date.parse(row.filledAt ?? row.createdAt) >= start &&
        Date.parse(row.filledAt ?? row.createdAt) <= end,
    ),
    query,
  );
}
function normalData(endpoint, raw, actor, data, now) {
  const kind = endpoint.kind;
  if (kind === 'health') return data.health;
  if (kind === 'meta') return data.system.environment;
  if (kind === 'admin-overview') return data.adminOverview;
  if (kind === 'system') return data.system;
  if (kind === 'overview') {
    const overview = dashboardFixture();
    const accounts = newest(
      data.accounts.filter((row) => canRead(actor, row)),
      false,
    );
    overview.account = accounts.find((row) => row.status === 'ACTIVE') ?? accounts[0] ?? null;
    overview.assetsAvailable = overview.account?.assetsAvailable ?? false;
    overview.assetMessage = overview.account?.assetMessage ?? overview.assetMessage;
    overview.recentOrders = newest(data.orders.filter((row) => canRead(actor, row))).slice(0, 10);
    overview.issues = data.tasks.filter(
      (row) => canRead(actor, row) && ['RECOVERY_REQUIRED', 'FAILED', 'STOPPING'].includes(row.status),
    );
    return overview;
  }
  if (kind.startsWith('exchange-')) return officialHistory(endpoint, raw, actor, data, now);
  if (kind === 'account-detail') return prepareAccount(data, actor, parse(uuidSchema, endpoint.id));
  if (kind === 'order-detail' || kind === 'task-detail') {
    const id = parse(uuidSchema, endpoint.id).toLowerCase();
    const orders = kind === 'order-detail';
    owned(orders ? data.orders : data.tasks, actor, id, orders ? 'ORDER_NOT_FOUND' : 'TASK_NOT_FOUND');
    return (orders ? data.orderDetails : data.taskDetails)[id];
  }
  if (kind === 'operations' || kind === 'operation-detail') {
    if (kind === 'operations')
      return data.operations.filter(
        (row) =>
          ['PROCESSING', 'UNKNOWN', 'CONFLICT'].includes(row.status) && receiptVisible(row, actor, data),
      );
    const id = parse(uuidSchema, endpoint.id).toLowerCase();
    const receipt = data.operations.find((row) => row.id === id && receiptVisible(row, actor, data));
    if (!receipt) reject(404, 'OPERATION_NOT_FOUND', 'Mock：尚未找到原操作，不能据此判定未执行');
    return receipt;
  }
  if (kind === 'securities') {
    const query = parse(catalogQuerySchema, raw);
    const account = prepareAccount(data, actor, query.accountId);
    requireActive(account);
    requireCredentials(account);
    return makeCatalogPage(query);
  }
  if (kind === 'holdings') {
    const query = parse(equityHoldingsQuerySchema, raw);
    const account = prepareAccount(data, actor, query.accountId);
    requireActive(account);
    requireCredentials(account);
    return holdingsFixture({ accountId: account.id });
  }
  if (kind === 'quotes' || kind === 'quote-stream') {
    const query = parse(kind === 'quotes' ? quotesQuerySchema : quoteStreamQuerySchema, raw);
    const account = query.accountId
      ? prepareAccount(data, actor, query.accountId)
      : [...data.accounts]
          .filter((row) => canRead(actor, row) && row.status === 'ACTIVE')
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0];
    if (!account) reject(409, 'ACCOUNT_REQUIRED', 'Mock：没有可查询的账户');
    if (kind === 'quote-stream') requireActive(account, 'ACCOUNT_UNAVAILABLE');
    requireCredentials(account);
    if (kind === 'quote-stream') return { accountId: account.id, symbol: query.symbol };
    return [makeMarketQuote(query.symbol, { timestamp: new Date(now).toISOString() })];
  }
  const filters = parse(filterSchema, raw);
  const ordinary = { owner: 'ownerUserId', account: 'exchangeAccountId', createdAt: 'createdAt' };
  if (kind === 'accounts') {
    const rows = scoped(data.accounts, actor, filters, {
      ...ordinary,
      account: 'id',
      status: 'status',
      search: ['label', 'apiKeyLast4'],
    });
    return endpoint.admin ? page(newest(rows), filters) : newest(rows, false);
  }
  if (kind === 'users')
    return page(
      newest(
        scoped(data.users, actor, filters, {
          owner: 'id',
          status: 'status',
          createdAt: 'createdAt',
          search: ['username', 'role'],
        }),
      ),
      filters,
    );
  if (kind === 'audit')
    return page(
      newest(
        scoped(data.audit, actor, filters, {
          owner: 'actorUserId',
          account: 'targetId',
          symbol: (row) => row.details.symbol,
          status: 'result',
          createdAt: 'createdAt',
          search: ['action', 'targetType', 'targetId'],
        }),
      ),
      filters,
    );
  if (filters.accountId) prepareAccount(data, actor, filters.accountId);
  if (kind === 'orders' || kind === 'tasks') {
    const rows = scoped(data[kind], actor, filters, {
      ...ordinary,
      symbol: (row) => row.symbol,
      status: 'status',
      search:
        kind === 'orders'
          ? ['clientOrderId', 'idempotencyKey', 'symbol', 'reason']
          : ['name', 'symbol', 'reason'],
    });
    return page(newest(rows), filters, { source: 'LOCAL_LEDGER' });
  }
  if (kind === 'positions') {
    const rows = scoped(data.positions.items, actor, filters, {
      ...ordinary,
      symbol: (row) => row.symbol,
    }).sort((a, b) => a.symbol.localeCompare(b.symbol) || a.id.localeCompare(b.id));
    return { ...data.positions, ...page(rows, filters) };
  }
  if (kind === 'ledger')
    return page(
      newest(
        scoped(data.ledger, actor, filters, {
          ...ordinary,
          status: 'type',
          search: ['type', 'description'],
          symbol: (row) => data.orders.find((order) => order.id === row.orderId)?.symbol,
        }),
      ),
      filters,
      { source: 'LOCAL_LEDGER' },
    );
  if (kind === 'reconciliations')
    return newest(scoped(data.reconciliations, actor, filters, { ...ordinary, status: 'status' }), false);
  if (kind === 'logs') {
    const rows = scoped(data.logs, actor, filters, {
      owner: 'ownerUserId',
      createdAt: 'createdAt',
      status: 'type',
      search: ['message', 'type'],
    });
    const related = (row) =>
      row.resourceType === 'ORDER'
        ? data.orders.find((item) => item.id === row.resourceId)
        : row.resourceType === 'TASK'
          ? data.tasks.find((item) => item.id === row.resourceId)
          : null;
    return page(
      newest(
        rows.filter(
          (row) =>
            (!filters.accountId ||
              (related(row)?.exchangeAccountId ?? row.details.accountId) ===
                filters.accountId.toLowerCase()) &&
            (!filters.symbol || (related(row)?.symbol ?? row.details.symbol) === filters.symbol),
        ),
      ),
      filters,
    );
  }
  reject(404, 'NOT_FOUND', 'Mock：不存在此只读接口');
}
function emptyData(kind, data) {
  if (kind.endsWith('-detail')) reject(404, 'NOT_FOUND', 'Mock：尚未取得记录，不能据此判定未执行');
  if (Array.isArray(data)) return [];
  if (Array.isArray(data.items))
    return { ...data, items: [], ...(typeof data.total === 'number' ? { total: 0 } : {}) };
  if (kind === 'overview')
    return {
      ...data,
      account: null,
      assetsAvailable: false,
      assetMessage: 'Mock：尚无当前官方资金快照',
      counts: Object.fromEntries(Object.keys(data.counts).map((key) => [key, 0])),
      recentOrders: [],
      issues: [],
      today: { ...data.today, buyQuantity: '0', sellQuantity: '0', buyAmount: '0', sellAmount: '0' },
    };
  if (kind === 'admin-overview')
    return {
      ...data,
      counts: Object.fromEntries(Object.keys(data.counts).map((key) => [key, 0])),
      worker: { online: false, lastSeenAt: null, status: 'UNKNOWN' },
      settings: null,
      recentEvents: [],
    };
  if (kind === 'system') return { ...data, settings: null, heartbeats: [], events: [], endpoints: null };
  // Health/meta 是标量契约，不能虚构空数组结果。
  return data;
}
function malformedData(kind, data) {
  if (kind === 'operation-detail') return { ...data, id: false };
  if (kind === 'operations') return [{ ...data[0], id: false }];
  if (Array.isArray(data)) {
    const field = kind === 'quotes' ? 'bid' : kind === 'reconciliations' ? 'status' : 'id';
    return [{ ...(data[0] ?? {}), [field]: false }];
  }
  if (Array.isArray(data.items)) {
    const field =
      kind === 'securities' || kind === 'holdings'
        ? 'symbol'
        : kind === 'exchange-trades'
          ? 'exchangeTradeId'
          : kind === 'exchange-orders'
            ? 'exchangeOrderId'
            : 'id';
    return { ...data, items: [{ ...(data.items[0] ?? {}), [field]: false }] };
  }
  if (kind === 'account-detail') return { ...data, availableCash: 123 };
  if (kind === 'order-detail') return { ...data, order: { ...data.order, quantity: 123 } };
  if (kind === 'task-detail') return { ...data, task: { ...data.task, config: null } };
  if (kind === 'overview' || kind === 'admin-overview') return { ...data, counts: false };
  if (kind === 'health') return { ...data, database: { ...data.database, online: 'invalid' } };
  return { ...data, environment: false };
}

/** 闸门等待前完成解析、授权、校验、筛选和复制，服务端只序列化这一份读取计划。 */
export function prepareReadonly(endpoint, url, session, state, now = Date.now()) {
  try {
    if (!endpoint.public && !session?.active) reject(401, 'UNAUTHENTICATED', 'Mock：需要有效会话');
    const actor = session?.user;
    if (endpoint.admin && actor.role !== 'ADMIN') reject(403, 'ADMIN_REQUIRED', 'Mock：仅管理员可读取');
    const mode = state.modes[endpoint.resource];
    const data = normalData(endpoint, queryInput(url.searchParams), actor, dataset(state.revision), now);
    if (mode === 'error') reject(503, 'SERVICE_UNAVAILABLE', 'Mock：此只读来源暂不可用');
    if (mode === 'denied') reject(403, 'FORBIDDEN', 'Mock：此只读来源拒绝访问');
    if (endpoint.kind === 'quote-stream') return { status: 200, stream: data, mode };
    return {
      status: endpoint.kind === 'health' ? 503 : 200,
      data:
        mode === 'empty'
          ? emptyData(endpoint.kind, data)
          : mode === 'malformed'
            ? malformedData(endpoint.kind, data)
            : data,
    };
  } catch (error) {
    if (!(error instanceof ReadonlyFailure)) throw error;
    return { status: error.status, error: { code: error.code, message: error.message } };
  }
}
