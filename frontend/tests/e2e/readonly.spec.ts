import {
  type APIRequestContext,
  test as base,
  expect,
  type Locator,
  type Page,
  type Request,
  type TestInfo,
} from '@playwright/test';
import { ADMIN_USER, OWNER_USER } from '../msw/auth-fixtures.js';
import { READONLY_IDS } from '../msw/readonly/ids.js';
import {
  ORDER_MARKET_BUY_ID,
  ORDER_MARKET_SELL_ID,
  TASK_MARKET_BUY_ID,
  TASK_MARKET_SELL_ID,
} from '../msw/readonly/orders-tasks.js';
import {
  controlProtocol,
  PROTOCOL_ORIGIN,
  PROTOCOL_PASSWORD,
  readProtocolState,
  type StubIdentity,
  waitForGate,
} from '../protocol/control.js';

interface NativeRead {
  readonly method: string;
  readonly path: string;
  readonly search: string;
}

interface NativeStreamEvidence {
  businessFrames: number;
  marketFrames: number;
  businessCredentials: boolean[];
  marketCredentials: boolean[];
}

declare global {
  interface Window {
    __readonlyNativeStreams: NativeStreamEvidence;
  }
}

const UUID_PATH = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const READ_PATH = new RegExp(
  `^/api/v1/(?:meta|overview|accounts(?:/${UUID_PATH}(?:/exchange/(?:orders|trades))?)?|market/(?:symbols|holdings|quotes|quote-stream)|orders(?:/${UUID_PATH})?|tasks(?:/${UUID_PATH})?|positions|ledger|reconciliations|logs|operations(?:/${UUID_PATH})?|admin/(?:overview|users|accounts|tasks|orders|ledger|audit|system)|events)$`,
  'i',
);
const HISTORY_FROM = '2026-10-01T00:00:00.123456Z';
const HISTORY_TO = '2026-11-11T09:30:00.654321Z';
const OFFICIAL_TRADE_ID = 'official-execution-900719925474099312345';
const FUNDING_AMOUNT = '12345678901234567890.123456789012345678';
const ORIGINAL_ORDER_REASON = 'Mock：成交终态，最终费用仍待核实';

function isBusinessPath(path: string): boolean {
  return path === '/healthz' || (path.startsWith('/api/v1/') && !path.startsWith('/api/v1/auth/'));
}

// 观察真实浏览器请求，不混入独立的 POST 测试控制客户端。
// 虚构 GET 同样失败，不能只以没有写入方法判断只读安全。
const test = base.extend<{ nativeReads: NativeRead[] }>({
  nativeReads: [
    async ({ context, request }, use) => {
      const reads: NativeRead[] = [];
      const renderingErrors: string[] = [];
      const observePage = (page: Page): void => {
        page.on('pageerror', (error) => renderingErrors.push(`${page.url()}: ${error.message}`));
        page.on('console', (message) => {
          // 故障用例允许 HTTP 失败，不允许渲染异常或 React 控制台错误被“页面最终可见”掩盖。
          if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
            renderingErrors.push(`${page.url()}: ${message.text()}`);
        });
      };
      for (const page of context.pages()) observePage(page);
      context.on('page', observePage);
      const observe = (request: Request): void => {
        const url = new URL(request.url());
        if (url.origin === PROTOCOL_ORIGIN && isBusinessPath(url.pathname)) {
          reads.push({ method: request.method(), path: url.pathname, search: url.search });
        }
      };
      context.on('request', observe);
      await use(reads);
      context.off('request', observe);
      context.off('page', observePage);
      expect(
        reads.filter((read) => read.method !== 'GET'),
        '原生业务请求必须全为 GET',
      ).toEqual([]);
      expect(
        reads.filter((read) => read.path !== '/healthz' && !READ_PATH.test(read.path)),
        '不得查询不存在的用户、流水、证券或全局成交详情 API',
      ).toEqual([]);
      const state = await readProtocolState(request);
      expect(state.readonly.forbiddenWrites).toBe(0);
      expect(
        state.history.filter(
          (read) =>
            read.method === 'GET' &&
            isBusinessPath(read.path) &&
            read.path !== '/healthz' &&
            read.path !== '/api/v1/meta' &&
            !read.cookieReceived,
        ),
        '业务 REST 与两类 SSE 均使用原生会话 Cookie',
      ).toEqual([]);
      expect(renderingErrors, '冷启动及业务路由切换不得出现脚本或 React 渲染错误').toEqual([]);
    },
    { auto: true },
  ],
});

function main(page: Page): Locator {
  return page.getByRole('main');
}

function region(page: Page, name: string): Locator {
  return main(page).getByRole('region', { name, exact: true });
}

function definition(scope: Locator, label: string): Locator {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return scope
    .locator('dt')
    .filter({ hasText: new RegExp(`^\\s*${escaped}\\s*$`) })
    .locator('..')
    .locator('dd');
}

function filters(page: Page): Locator {
  return main(page).getByRole('search', { name: '只读查询筛选', exact: true });
}

async function apply(page: Page, values: Readonly<Record<string, string>>): Promise<void> {
  const search = filters(page);
  for (const [name, value] of Object.entries(values)) {
    await search.getByRole('textbox', { name, exact: true }).fill(value);
  }
  await search.getByRole('button', { name: '查询', exact: true }).click();
}

async function decimal(scope: Locator, value: string): Promise<void> {
  const rendered = scope.getByTitle(value, { exact: true });
  await expect(rendered).toBeVisible();
  expect((await rendered.textContent())?.replaceAll(',', '')).toBe(value);
}

async function noBusinessActions(scope: Locator): Promise<void> {
  await expect(
    scope.getByRole('button', {
      name: /^(?:下单|提交订单|撤单|取消订单|创建(?:账户|订单|任务|用户)|启动(?:任务)?|暂停(?:任务)?|恢复(?:任务)?|停止(?:任务)?|保存|修改|删除|授权|重置密码|同步(?:资金|资产|成交)?|主动核对|发起核对|测速|切换节点)$/,
    }),
  ).toHaveCount(0);
}

async function login(page: Page, identity: StubIdentity = 'trader'): Promise<void> {
  await page.goto('/login');
  const form = page.getByRole('form', { name: '平台登录', exact: true });
  await form.getByRole('textbox', { name: /用户名/ }).fill(identity);
  await form.getByLabel(/密码/).fill(PROTOCOL_PASSWORD);
  const response = page.waitForResponse(
    (value) => value.url() === `${PROTOCOL_ORIGIN}/api/v1/auth/login` && value.request().method() === 'POST',
  );
  await form.getByRole('button', { name: '登录', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByTestId('identity-name')).toHaveText(identity);
  await expect(region(page, '角色范围业务概览')).toHaveAttribute('aria-busy', 'false');
  await expect(region(page, '可查看账户范围')).toHaveAttribute('aria-busy', 'false');
  await expect(
    page
      .getByRole('navigation', { name: '应用顶栏', exact: true })
      .getByText('业务通知已连接', { exact: true }),
  ).toBeVisible();
  const cookie = (await page.context().cookies(PROTOCOL_ORIGIN)).find(
    (value) => value.name === 'protocol_session',
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie.includes('protocol_session='))).toBe(false);
  await expect
    .poll(() => page.evaluate(() => window.__readonlyNativeStreams.businessFrames))
    .toBeGreaterThan(0);
}

async function navigate(page: Page, label: string): Promise<void> {
  await page
    .getByRole('navigation', { name: '应用导航', exact: true })
    .getByRole('link', { name: label, exact: true })
    .click();
}

async function notify(page: Page, request: APIRequestContext, resources: readonly string[]): Promise<void> {
  const before = await page.evaluate(() => window.__readonlyNativeStreams.businessFrames);
  await controlProtocol(request, 'refresh', { resources: [...resources] });
  await expect
    .poll(() => page.evaluate(() => window.__readonlyNativeStreams.businessFrames))
    .toBeGreaterThan(before);
}

async function screenshot(page: Page, info: TestInfo, name: string): Promise<void> {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: false });
  await info.attach(name, { path, contentType: 'image/png' });
}

function businessReadCount(reads: readonly NativeRead[], path: string): number {
  return reads.filter((read) => read.path === path).length;
}

async function cachedTime(surface: Locator): Promise<string> {
  const time = surface.locator('p').filter({ hasText: '最后成功 REST 缓存时间（客户端）' }).locator('time');
  await expect(time).toBeVisible();
  const value = await time.getAttribute('datetime');
  if (!value) throw new Error('成功 REST 结果没有客户端缓存时间');
  expect(Date.parse(value)).toBeGreaterThan(0);
  return value;
}

test.beforeEach(async ({ context, request }) => {
  await controlProtocol(request, 'reset');
  await context.addInitScript(() => {
    // 只观测原生带 Cookie 的 EventSource，不替换传输。
    const NativeEventSource = window.EventSource;
    const observation: NativeStreamEvidence = {
      businessFrames: 0,
      marketFrames: 0,
      businessCredentials: [],
      marketCredentials: [],
    };
    window.__readonlyNativeStreams = observation;
    window.EventSource = class extends NativeEventSource {
      constructor(url: string | URL, options?: EventSourceInit) {
        super(url, options);
        const path = new URL(this.url).pathname;
        const market = path === '/api/v1/market/quote-stream';
        const business = path === '/api/v1/events';
        if (market) observation.marketCredentials.push(this.withCredentials);
        if (business) observation.businessCredentials.push(this.withCredentials);
        this.addEventListener('message', () => {
          if (market) observation.marketFrames += 1;
          if (business) observation.businessFrames += 1;
        });
      }
    };
  });
});

test('工作台用原生身份读取角色范围、名义来源与完整精度，不补造账户资产或盈亏', async ({
  page,
  request,
}, info) => {
  await login(page);
  const overview = region(page, '角色范围业务概览');
  await expect(definition(overview, '活动及未知本地订单')).toHaveText('2');
  await expect(definition(overview, '需要人工恢复的任务')).toHaveText('1');
  const today = region(page, '当日本地成交名义统计');
  await decimal(definition(today, '买入股数'), '1.1234567890');
  await decimal(definition(today, '买入名义额'), '123.456789012345678900');
  await expect(definition(today, '来源')).toContainText('LOCAL_TRADE_NOTIONAL');
  await expect(definition(today, '来源')).toContainText('现金流未核实');
  await expect(definition(today, '账户总资产 / 全账户盈亏')).toContainText('不可用');
  const account = region(page, '默认概览账户');
  await expect(definition(account, '账户').getByRole('link')).toHaveAttribute(
    'href',
    `/accounts/${READONLY_IDS.accountA}`,
  );
  await expect(definition(account, '余额来源')).toHaveText('BINANCE_WALLET');
  await decimal(definition(account, 'Funding 可用资金'), FUNDING_AMOUNT);
  await expect(definition(region(page, '服务端基础信息'), 'Worker 心跳')).toContainText('UNKNOWN');
  await cachedTime(overview);
  await expect(page.getByText('Mock · 本地协议桩', { exact: true })).toBeVisible();
  const state = await readProtocolState(request);
  expect(state.cookieRequests.events).toBeGreaterThan(0);
  expect(state.readonly.requests.overview).toBeGreaterThan(0);
  expect(state.readonly.requests.accounts).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__readonlyNativeStreams.businessCredentials.every(Boolean))).toBe(
    true,
  );
  await noBusinessActions(main(page));
  await screenshot(page, info, 'readonly-dashboard');
});

test('交易员账户数组真实过滤、无伪分页，详情保留未知余额与历史 Funding/Spot 边界', async ({ page }) => {
  await login(page);
  await navigate(page, '账户查询');
  const result = region(page, '账户读取结果');
  const table = result.getByTestId('data-table-shell');
  await expect(table.getByTestId('data-table-total')).toHaveText('已返回 2 条');
  await expect(table.getByRole('button', { name: '转到下一页' })).toHaveCount(0);
  await expect(table.getByRole('link', { name: 'Mock — Other owner account', exact: true })).toHaveCount(0);
  await apply(page, { '账户标签 / Key 尾号': 'B456' });
  await expect(table.getByTestId('data-table-total')).toHaveText('已返回 1 条');
  await expect(table.getByRole('link', { name: 'Mock — Funding account', exact: true })).toHaveCount(0);
  await table.getByRole('link', { name: 'Mock — Historical snapshot only', exact: true }).click();
  const detail = region(page, '账户详情读取结果');
  const funding = detail.getByRole('region', { name: '识别的资金投影与本地预留', exact: true });
  await expect(definition(funding, '识别来源')).toHaveText('UNAVAILABLE');
  await expect(definition(funding, 'Funding availableCash（USDC 快照）')).toHaveText('未知');
  await expect(definition(funding, 'cashBalance（接口未提供）')).toHaveText('未知');
  const wallet = detail.getByRole('region', { name: '已存钱包快照（历史证据）', exact: true });
  await decimal(definition(wallet, '已存 free（历史）'), FUNDING_AMOUNT);
  await decimal(definition(wallet, 'Spot free'), '777.125000000000000000');
  await expect(wallet).toContainText('已有快照不能覆盖同步错误');
  await expect(definition(wallet, 'Spot / Margin 交易权限')).toHaveText('未知');
  await expect(definition(wallet, 'IP 限制')).toHaveText('未知');
  await expect(definition(wallet, '钱包快照接收时间（本地）')).toContainText(
    '2026-11-01T10:11:12.123456789Z',
  );
  await noBusinessActions(main(page));

  await page.goto(`/accounts/${READONLY_IDS.accountA}`);
  const available = region(page, '识别的资金投影与本地预留');
  await decimal(definition(available, 'Funding availableCash（USDC 快照）'), FUNDING_AMOUNT);
  await decimal(definition(available, '本地 reservedCash（不可执行资金）'), '25.000000000000000000');
  await expect(definition(available, '识别来源')).toHaveText('BINANCE_WALLET');
  await expect(definition(available, 'cashBalance（接口未提供）')).toHaveText('未知');
  await page.goto(`/accounts/${READONLY_IDS.otherAccount}`);
  await expect(region(page, '账户详情读取结果').getByText('当前范围不可读取', { exact: true })).toBeVisible();
  await expect(main(page).getByRole('heading', { name: 'Mock — Other owner account' })).toHaveCount(0);
});

test('证券目录按服务端分页与子串筛选，已加载规则展开不发虚构详情请求', async ({ page, nativeReads }) => {
  await login(page);
  await navigate(page, '证券与规则');
  expect(businessReadCount(nativeReads, '/api/v1/market/symbols')).toBe(0);
  await apply(page, { '账户 ID': READONLY_IDS.accountA });
  const result = region(page, '证券目录查询结果');
  const table = result.getByTestId('data-table-shell');
  await expect(table.getByTestId('data-table-total')).toHaveText('共 28 条');
  await expect(table.getByRole('button', { name: 'TSLA', exact: true })).toHaveCount(0);
  await table.getByRole('button', { name: '转到下一页', exact: true }).click();
  await expect(table.getByRole('button', { name: 'TSLA', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/[?&]page=2(?:&|$)/);
  await apply(page, { 证券代码包含: '  ms  ' });
  await expect(table.getByRole('button', { name: 'MSFT', exact: true })).toBeVisible();
  await expect(table.getByTestId('data-table-total')).toHaveText('共 1 条');
  expect(new URL(page.url()).searchParams.get('page')).toBe('1');
  expect(new URL(page.url()).searchParams.get('search')).toBe('ms');
  await expect(definition(result, '目录来源')).toHaveText('BINANCE_STOCKS');
  const before = nativeReads.length;
  await table.getByRole('button', { name: 'MSFT', exact: true }).click();
  const rule = region(page, 'MSFT 已返回交易规则');
  await expect(definition(rule, '可交易方向 · tradability')).toHaveText('未知');
  await expect(definition(rule, '碎股 · fractionable')).toContainText('未知');
  await expect(definition(rule, '最小名义金额 · minNotional')).toHaveText('未知');
  await decimal(definition(rule, '股数步长 · stepSize'), '0.0000000001');
  await decimal(definition(rule, '最大股数 · maxQuantity'), '999999999999.1234567890');
  expect(nativeReads.length).toBe(before);
  await expect(table.getByRole('columnheader').getByRole('button')).toHaveCount(0);
  await noBusinessActions(main(page));
});

test('真实报价流更新页面，晚到 REST 不覆盖推送，EOF 旧报价不再 live，证券切换清旧值', async ({
  page,
  request,
}, info) => {
  await page.clock.install();
  await login(page);
  await navigate(page, '行情报价');
  await controlProtocol(request, 'gates', { id: 'quote-rest-held', endpoint: 'readonly:quotes' });
  await apply(page, { '账户 ID': READONLY_IDS.accountA, 证券代码: 'aapl' });
  await waitForGate(request, 'quote-rest-held');
  await expect.poll(async () => (await readProtocolState(request)).readonly.market.active).toBe(1);
  const initial = await readProtocolState(request);
  await controlProtocol(request, 'market', {
    kind: 'quote',
    accountId: READONLY_IDS.accountA,
    symbol: 'AAPL',
    bid: '320.123456789012345678',
    ask: '320.223456789012345678',
  });
  const book = region(page, '当前选择的报价');
  await decimal(book, '320.123456789012345678');
  await expect(book.getByText('近期已接收推送 · 仅展示参考', { exact: true })).toBeVisible();
  await expect(definition(book, '当前显示的传输来源')).toHaveText('WEBSOCKET');
  await expect(definition(book, '时间来源')).toHaveText('LOCAL_RECEIPT');
  await expect(book.getByRole('cell', { name: 'UNKNOWN', exact: true })).toBeVisible();
  await expect(book.getByRole('cell', { name: '未知', exact: true })).toBeVisible();
  await controlProtocol(request, 'release', { id: 'quote-rest-held' });
  await expect(region(page, '独立 REST 报价读取')).toHaveAttribute('aria-busy', 'false');
  await decimal(book, '320.123456789012345678');
  await expect(book.getByTitle('312.123456789012345678', { exact: true })).toHaveCount(0);
  await controlProtocol(request, 'market', {
    kind: 'status',
    accountId: READONLY_IDS.accountA,
    symbol: 'AAPL',
    status: 'unavailable',
    retryable: true,
  });
  await expect(definition(region(page, '独立报价流状态'), '后端上游状态（不是报价时间）')).toHaveText(
    'unavailable',
  );
  await expect(book.getByText('非实时 · 最后取得的报价', { exact: true })).toBeVisible();
  expect((await readProtocolState(request)).readonly.market.opened).toBe(initial.readonly.market.opened);
  await controlProtocol(request, 'market', {
    kind: 'disconnect',
    accountId: READONLY_IDS.accountA,
    symbol: 'AAPL',
  });
  await expect(definition(region(page, '独立报价流状态'), '客户端报价连接')).toHaveText('reconnecting');
  await expect(book.getByText('近期已接收推送 · 仅展示参考', { exact: true })).toHaveCount(0);
  await page.clock.runFor(3_100);
  await expect.poll(async () => (await readProtocolState(request)).readonly.market.active).toBe(1);
  await expect(book.getByText('近期已接收推送 · 仅展示参考', { exact: true })).toHaveCount(0);
  expect((await readProtocolState(request)).readonly.market.opened).toBe(initial.readonly.market.opened + 1);
  await apply(page, { '账户 ID': READONLY_IDS.accountA, 证券代码: 'MSFT' });
  await expect(definition(region(page, '独立报价流状态'), '订阅账户 / 证券')).toHaveText(
    `${READONLY_IDS.accountA} / MSFT`,
  );
  await expect(book.getByTitle('320.123456789012345678', { exact: true })).toHaveCount(0);
  await expect(book.getByRole('cell', { name: 'MSFT', exact: true })).toBeVisible();
  await expect(book.getByText('非实时 · 最后取得的报价', { exact: true })).toBeVisible();
  await controlProtocol(request, 'market', {
    kind: 'status',
    accountId: READONLY_IDS.accountA,
    symbol: 'MSFT',
    status: 'unavailable',
    code: 'SOURCE_UNAVAILABLE',
    retryable: false,
  });
  await expect(definition(region(page, '独立报价流状态'), '客户端报价连接')).toHaveText('terminal');
  await expect(book).toHaveCount(0);
  const terminal = await readProtocolState(request);
  await page.clock.runFor(15_000);
  expect((await readProtocolState(request)).readonly.market.opened).toBe(terminal.readonly.market.opened);
  expect((await readProtocolState(request)).requests.me).toBe(initial.requests.me);
  expect((await readProtocolState(request)).readonly.market.maxActive).toBe(1);
  expect(await page.evaluate(() => window.__readonlyNativeStreams.marketCredentials.every(Boolean))).toBe(
    true,
  );
  await screenshot(page, info, 'readonly-quote-terminal');
  await navigate(page, '订单查询');
  await expect.poll(async () => (await readProtocolState(request)).readonly.market.active).toBe(0);
});

test('订单原串过滤与本金/股数分支有效，FILLED、未知费用、逐笔成交和原回执分别表达', async ({ page }) => {
  await login(page);
  await navigate(page, '订单查询');
  await apply(page, { '账户 ID': READONLY_IDS.accountA, '证券代码（精确）': 'aapl' });
  const result = region(page, '订单查询结果');
  await expect(result.getByText('没有匹配当前筛选的本地订单', { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('symbol')).toBe('aapl');
  await apply(page, { '证券代码（精确）': 'AAPL', '订单状态（精确）': 'FILLED' });
  await expect(result.getByTestId('data-table-total')).toHaveText('共 1 条');
  await result.getByRole('link', { name: READONLY_IDS.order, exact: true }).click();
  const detail = region(page, '订单详情查询结果');
  const evidence = detail.getByRole('region', { name: '成交、费用与核对证据', exact: true });
  await expect(detail).toContainText('LOCAL_LEDGER');
  await expect(definition(evidence, '当前订单状态')).toHaveText('FILLED');
  await decimal(definition(evidence, '确认成交股数'), '2.0000000001');
  await expect(definition(evidence, '累计费用')).toContainText('未知费用');
  await expect(definition(evidence, 'feeFinalized')).toContainText('false');
  await expect(definition(evidence, 'feePending')).toContainText('true');
  await expect(definition(evidence, 'reservationReleased')).toContainText('false');
  await decimal(definition(evidence, '本地现金预留（非可用余额）'), '0.250000000000000000');
  const trades = detail.getByRole('region', { name: '本地逐笔成交', exact: true });
  await expect(trades.getByRole('cell', { name: 'mock-execution-201', exact: true })).toBeVisible();
  await expect(trades.getByRole('cell', { name: '未知；未分摊订单累计费用', exact: true })).toBeVisible();
  await expect(detail.getByRole('region', { name: '操作历史完整性', exact: true })).toContainText(
    '订单详情没有回执数组',
  );
  await expect(
    detail
      .getByRole('region', { name: '业务事件', exact: true })
      .getByRole('cell', { name: 'STATE', exact: true }),
  ).toBeVisible();
  await noBusinessActions(main(page));

  await page.goto(`/orders/${ORDER_MARKET_BUY_ID}`);
  const buy = region(page, '订单身份与有效委托');
  await expect(definition(buy, '委托股数')).toContainText('仅按本金');
  await expect(definition(buy, '有效限价')).toContainText('MARKET 无限价');
  await decimal(definition(buy, '委托本金'), '125.123456789012345678');
  await decimal(definition(region(page, '成交、费用与核对证据'), '累计费用'), '0.010000000000000001');
  await expect(definition(region(page, '成交、费用与核对证据'), 'feeFinalized')).toContainText('false');

  await page.goto(`/orders/${ORDER_MARKET_SELL_ID}`);
  const sell = region(page, '订单身份与有效委托');
  await decimal(definition(sell, '委托股数'), '1.0000000001');
  await expect(definition(sell, '官方订单 ID（exchangeOrderId）')).toContainText('不证明尚未发送');
  await expect(definition(sell, '名义额币种（quoteCurrency）')).toContainText('未知');
  await expect(definition(region(page, '成交、费用与核对证据'), '当前订单状态')).toHaveText('UNKNOWN');
  await expect(definition(region(page, '订单时钟'), '确认受理')).toHaveText('未知');
  await noBusinessActions(main(page));
});

test('任务详情九位原计划不被 ORM 毫秒覆盖，历史受阻不覆盖终态，进度和订单费用不互相冒充', async ({
  page,
}) => {
  await login(page);
  await navigate(page, '批量任务查询');
  await apply(page, { '任务状态（精确）': 'EXPIRED', '证券代码（精确）': 'AAPL' });
  const result = region(page, '任务查询结果');
  await expect(result.getByTestId('data-table-total')).toHaveText('共 1 条');
  await result.getByRole('link', { name: 'Mock：到期的限价分批买入', exact: true }).click();
  const state = region(page, '当前任务与历史受阻');
  await expect(definition(state, '当前任务状态')).toHaveText('EXPIRED');
  await expect(definition(state, '当前 stopReason')).toHaveText('WINDOW_EXPIRED');
  await expect(definition(state, '历史受阻状态')).toHaveText('PAUSED');
  await expect(definition(state, '历史 stopReason')).toHaveText('FUNDING_UNAVAILABLE');
  const config = region(page, '当前公开配置');
  await expect(definition(config, '原计划时间（权威 config.scheduledStartAt）')).toContainText(
    '2026-11-10T08:00:00.123456789Z',
  );
  await expect(
    definition(region(page, '服务端执行时钟与租约'), '顶层 scheduledStartAt（ORM Date 辅助值）').locator(
      'time',
    ),
  ).toHaveAttribute('datetime', '2026-11-10T08:00:00.123Z');
  await decimal(definition(config, '保存的固定每批股数'), '3.0000000000');
  await expect(definition(config, '报价转限价舍入')).toHaveText('REJECT');
  const progress = region(page, '服务端进度汇总');
  await decimal(definition(progress, '已成交股数'), '3.0000000001');
  await decimal(definition(progress, '剩余目标股数（非预算）'), '2.0000000000');
  await expect(definition(progress, '部分成交订单数（可与终态重叠）')).toHaveText('1');
  await expect(definition(progress, 'CANCELED 状态订单数')).toHaveText('1');
  await expect(progress.getByRole('progressbar')).toHaveCount(0);
  const order = region(page, '关联本地订单').getByRole('row').filter({ hasText: READONLY_IDS.order });
  await expect(order.getByRole('cell', { name: /最终费用未确认/ })).toBeVisible();
  await expect(region(page, '本地逐笔成交').getByRole('row')).toHaveCount(3);
  await expect(region(page, '操作历史完整性')).toContainText('详情业务事件不是操作回执');
  await noBusinessActions(main(page));
});

for (const scenario of [
  { name: '市价本金买入', id: TASK_MARKET_BUY_ID, status: 'RUNNING', principal: true },
  { name: '市价股数卖出', id: TASK_MARKET_SELL_ID, status: 'RECOVERY_REQUIRED', principal: false },
]) {
  test(`任务${scenario.name}仅显示有效配置，服务端剩余目标不被当成可追加预算`, async ({ page }) => {
    await login(page);
    await page.goto(`/tasks/${scenario.id}`);
    await expect(definition(region(page, '当前任务与历史受阻'), '当前任务状态')).toHaveText(scenario.status);
    const config = region(page, '当前公开配置');
    const progress = region(page, '服务端进度汇总');
    await expect(definition(config, '原计划时间（权威 config.scheduledStartAt）')).toContainText(
      '配置未记录计划时间',
    );
    await expect(config.getByText('限价规则', { exact: true })).toHaveCount(0);
    if (scenario.principal) {
      await decimal(definition(config, '目标本金'), '500.123456789012345678');
      await decimal(definition(config, '保存的固定每批本金'), '125.123456789012345678');
      await decimal(definition(progress, '剩余目标本金（非预算）'), '475.123456789012345677');
      await expect(definition(progress, '目标股数')).toContainText('不适用');
    } else {
      await decimal(definition(config, '目标股数'), '2.0000000001');
      await decimal(definition(config, '保存的固定每批股数'), '1.0000000001');
      await expect(definition(progress, '已有 submittedAt 的订单数')).toHaveText('0');
      await expect(definition(progress, '目标本金')).toContainText('不适用');
    }
    await expect(progress).toContainText('剩余目标不是可新增委托预算');
    await noBusinessActions(main(page));
  });
}

test('本地名义持仓和官方 Funding 候选独立，真实零 free、未知 freeze 和不可用盈亏不混合', async ({
  page,
  nativeReads,
}) => {
  await login(page);
  await navigate(page, '持仓来源');
  const local = region(page, '本地名义持仓查询');
  await expect(local.getByRole('cell', { name: 'SYPR', exact: true })).toBeVisible();
  expect(businessReadCount(nativeReads, '/api/v1/market/holdings')).toBe(0);
  await apply(page, { '账户 UUID（两种来源共用）': READONLY_IDS.accountA });
  const official = region(page, '官方 Funding 候选查询');
  await expect(official.getByRole('cell', { name: 'EQ_AAPL', exact: true })).toBeVisible();
  await expect(definition(official, '来源')).toHaveText('BINANCE_FUNDING_WALLET');
  await expect(official.getByRole('button', { name: '转到下一页' })).toHaveCount(0);
  const before = nativeReads.length;
  await local.getByRole('button', { name: '查看 SYPR 名义记录', exact: true }).click();
  const nominal = region(page, '已加载名义持仓详情');
  await decimal(definition(nominal, '名义总股数 quantity'), '12.0000000001');
  await decimal(definition(nominal, '本地未预留股数 localAvailableQuantity'), '10.0000000001');
  await decimal(definition(nominal, '名义成本 notionalCost'), FUNDING_AMOUNT);
  await expect(definition(nominal, '官方可用股数 availableQuantity')).toContainText('不可用');
  await expect(definition(nominal, '未实现盈亏 unrealizedPnl')).toHaveText('不可用');
  await expect(definition(nominal, '来源')).toHaveText('LOCAL_LEDGER');
  await official.getByRole('button', { name: '查看 AAPL 官方候选', exact: true }).click();
  const candidate = region(page, '已加载官方候选详情');
  await decimal(definition(candidate, 'Funding free 股数'), '0');
  await decimal(definition(candidate, 'locked 股数'), '3.2500000000');
  await expect(definition(candidate, 'freeze 股数')).toHaveText('未知');
  await expect(definition(candidate, '上游更新时间')).toContainText('未知');
  expect(nativeReads.length).toBe(before);
  await apply(page, { '本地证券代码（原样匹配）': 'NO_MATCH' });
  await expect(local.getByText('当前筛选没有名义持仓记录', { exact: true })).toBeVisible();
  await expect(official.getByRole('cell', { name: 'EQ_AAPL', exact: true })).toBeVisible();
  expect(businessReadCount(nativeReads, '/api/v1/market/holdings')).toBe(1);
  await noBusinessActions(main(page));
});

test('官方成交固定显式微秒 UTC 窗口跨页不漂移，原始官方 ID、未知金额/费用和本地详情不混用', async ({
  page,
  nativeReads,
}) => {
  await login(page);
  await navigate(page, '成交历史');
  expect(nativeReads.some((read) => read.path.endsWith('/exchange/trades'))).toBe(false);
  await page.goto(
    `/trades?${new URLSearchParams({ accountId: READONLY_IDS.accountA, from: HISTORY_FROM, to: HISTORY_TO, pageSize: '1', page: '1' })}`,
  );
  const result = region(page, '官方成交历史查询');
  await expect(result.getByRole('cell', { name: OFFICIAL_TRADE_ID, exact: true })).toBeVisible();
  await expect(result.getByTestId('data-table-total')).toHaveText('共 2 条');
  const before = nativeReads.length;
  await result.getByRole('button', { name: `查看成交 ${OFFICIAL_TRADE_ID}`, exact: true }).click();
  const detail = region(page, '已加载官方成交详情');
  await decimal(definition(detail, '成交价格 price'), '102.123456789012345678');
  await decimal(definition(detail, '成交股数 quantity'), '2.0000000001');
  await expect(definition(detail, '官方名义金额 notional')).toHaveText('未知');
  await expect(definition(detail, '逐笔费用 fee')).toContainText('null');
  await expect(definition(detail, '官方 quoteCurrency')).toContainText('未知');
  await expect(definition(detail, '成交时间 filledAt UTC')).toContainText('2026-11-11T09:00:00.123456789Z');
  await expect(detail.getByRole('link')).toHaveCount(0);
  expect(nativeReads.length).toBe(before);
  const paginationReadStart = nativeReads.length;
  await result.getByRole('button', { name: '转到下一页', exact: true }).click();
  await expect(page).toHaveURL(/[?&]page=2(?:&|$)/);
  await expect(result).toHaveAttribute('aria-busy', 'false');
  await expect(result.getByRole('cell', { name: OFFICIAL_TRADE_ID, exact: true })).toHaveCount(0);
  await expect(result.getByRole('table').getByRole('row')).toHaveCount(2);
  const requests = nativeReads.filter(
    (read) => read.path === `/api/v1/accounts/${READONLY_IDS.accountA}/exchange/trades`,
  );
  const paginationRequests = nativeReads
    .slice(paginationReadStart)
    .filter((read) => read.path === `/api/v1/accounts/${READONLY_IDS.accountA}/exchange/trades`);
  expect(paginationRequests.map((read) => new URLSearchParams(read.search).get('page'))).toEqual(['2']);
  for (const read of requests) {
    const query = new URLSearchParams(read.search);
    expect(query.get('from')).toBe(HISTORY_FROM);
    expect(query.get('to')).toBe(HISTORY_TO);
    expect(query.get('pageSize')).toBe('1');
  }
  expect(new URL(page.url()).searchParams.get('from')).toBe(HISTORY_FROM);
  expect(new URL(page.url()).searchParams.get('to')).toBe(HISTORY_TO);
  await noBusinessActions(main(page));
});

test('资金流水真实分页与类型过滤，符号和超安全整数精度保留，已加载详情不查询 ledger/:id', async ({
  page,
  nativeReads,
}) => {
  await login(page);
  await page.goto('/ledger?page=2&pageSize=10');
  const result = region(page, '资金流水查询结果');
  await expect(result.getByTestId('data-table-total')).toHaveText('共 11 条');
  await result.getByRole('button', { name: `查看流水 ${READONLY_IDS.ledger}`, exact: true }).click();
  const detail = region(page, '已加载流水详情');
  await expect(definition(detail, '金额原文（含服务端符号）')).toHaveText(
    '-9007199254740993.123456789012345678',
  );
  await decimal(definition(detail, '金额与币种'), '-9007199254740993.123456789012345678');
  await expect(definition(detail, 'balanceAfter')).toContainText('未知');
  await expect(definition(detail, '币种')).toHaveText('USD');
  await expect(definition(detail, '来源')).toContainText('LOCAL_LEDGER');
  const before = businessReadCount(nativeReads, '/api/v1/ledger');
  await result.getByRole('button', { name: '转到上一页', exact: true }).click();
  await expect(result).toHaveAttribute('aria-busy', 'false');
  await expect(result.getByRole('table').getByRole('row')).toHaveCount(11);
  await expect(detail).toHaveCount(0);
  expect(businessReadCount(nativeReads, '/api/v1/ledger')).toBe(before + 1);
  await apply(page, { '流水类型（status 参数）': 'RESERVATION', '账户 UUID': READONLY_IDS.accountA });
  await expect(result.getByTestId('data-table-total')).toHaveText('共 1 条');
  await decimal(result, '-25.000000000000000001');
  await expect(result.getByRole('cell', { name: 'USDC', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('page')).toBe('1');
  await noBusinessActions(main(page));
});

test('核对数组三类真实状态均非全量一致，历史 Funding 和缺失原截止时间不补造', async ({
  page,
  nativeReads,
}) => {
  await login(page);
  await navigate(page, '核对记录');
  const result = region(page, '核对记录查询结果');
  for (const status of ['PARTIAL', 'UNAVAILABLE', 'DIFFERENCE']) {
    await expect(result.getByRole('cell', { name: status, exact: true })).toBeVisible();
  }
  await expect(result.getByTestId('data-table-total')).toHaveText('已返回 3 条');
  await expect(result.getByRole('button', { name: '转到下一页' })).toHaveCount(0);
  const before = nativeReads.length;
  await result
    .getByRole('button', { name: `查看核对记录 ${READONLY_IDS.reconciliation}`, exact: true })
    .click();
  const detail = region(page, '已加载核对记录详情');
  await expect(definition(detail, '服务端状态')).toHaveText('PARTIAL');
  await expect(definition(detail, '完整现金余额')).toContainText('未知');
  await expect(definition(detail, '原历史截止时间')).toContainText('记录未保存 historyTo');
  await expect(definition(detail, '官方成交历史总数')).toHaveText('7');
  await decimal(definition(detail, 'free'), '42.123456789012345678');
  await expect(definition(detail, 'freeze')).toHaveText('未知');
  expect(nativeReads.length).toBe(before);
  await result
    .getByRole('button', { name: '查看核对记录 70000000-0000-4000-8000-000000000003', exact: true })
    .click();
  await expect(definition(detail, '服务端状态')).toHaveText('DIFFERENCE');
  await expect(detail.getByRole('link', { name: READONLY_IDS.order, exact: true })).toHaveAttribute(
    'href',
    `/orders/${READONLY_IDS.order}`,
  );
  await expect(detail.getByText('EXTERNAL-ORDER-17', { exact: true })).toBeVisible();
  await expect(detail.getByRole('link', { name: 'EXTERNAL-ORDER-17' })).toHaveCount(0);
  await noBusinessActions(main(page));
});

test('操作 SUCCEEDED 只代表服务端报告，原意图仍未知；业务事件独立查询和分页', async ({
  page,
  nativeReads,
}) => {
  await login(page);
  await page.goto('/operations?page=1&pageSize=10');
  const receipts = region(page, '操作回执列表查询结果');
  await expect(receipts.getByRole('cell', { name: 'UNKNOWN', exact: true })).toBeVisible();
  await expect(receipts.getByRole('cell', { name: 'SUCCEEDED', exact: true })).toHaveCount(0);
  await expect(receipts.getByRole('cell', { name: '未知（未关联独立原身份）', exact: true })).toHaveCount(1);
  await expect(receipts.getByRole('button', { name: '转到下一页' })).toHaveCount(0);
  const events = region(page, '业务事件查询结果');
  const receiptCount = businessReadCount(nativeReads, '/api/v1/operations');
  await expect(events.getByTestId('data-table-total')).toHaveText('共 11 条');
  await events.getByRole('button', { name: '转到下一页', exact: true }).click();
  await expect(
    events.getByRole('cell', { name: 'Mock · 订单证据未知，未重发或释放预留', exact: true }),
  ).toBeVisible();
  await expect(events.getByRole('table').getByRole('row')).toHaveCount(2);
  expect(businessReadCount(nativeReads, '/api/v1/operations')).toBe(receiptCount);
  const eventFilters = region(page, '业务事件分页查询').getByRole('search');
  await eventFilters.getByRole('textbox', { name: '事件类型（status 参数）', exact: true }).fill('UNKNOWN');
  await eventFilters.getByRole('button', { name: '查询', exact: true }).click();
  await expect(events.getByTestId('data-table-total')).toHaveText('共 1 条');
  expect(businessReadCount(nativeReads, '/api/v1/operations')).toBe(receiptCount);
  const lookup = main(page).getByRole('form', { name: '按已知操作 UUID 读取', exact: true });
  await lookup
    .getByRole('textbox', { name: '已知操作 UUID', exact: true })
    .fill('80000000-0000-4000-8000-000000000002');
  await lookup.getByRole('button', { name: '读取此 UUID 的服务端回执', exact: true }).click();
  const report = region(page, '服务端操作回执');
  await expect(definition(report, '服务端报告状态')).toHaveText('SUCCEEDED');
  await expect(definition(report, '服务端 outcome')).toHaveText('CONTROL_APPLIED');
  await expect(definition(report, 'outcome 含义')).toContainText('不等于挂单已撤或任务完成');
  await expect(report.getByText('本客户端原意图：未知（未关联）', { exact: true })).toBeVisible();
  await expect(definition(region(page, '服务端结果投影'), '结果内业务状态')).toHaveText('STOPPING');
  await noBusinessActions(main(page));
  await page.goto(`/operations/${READONLY_IDS.operation}`);
  await expect(definition(region(page, '服务端操作回执'), '服务端报告状态')).toHaveText('UNKNOWN');
  await expect(
    region(page, '服务端操作回执').getByText('本客户端原意图：未知（未关联）', { exact: true }),
  ).toBeVisible();
});

for (const role of [
  { identity: 'admin', user: ADMIN_USER, flag: 'false（不持有专项权限）' },
  { identity: 'owner', user: OWNER_USER, flag: 'true（持有专项权限）' },
] as const) {
  test(`${role.identity} 管理读取不受专项标志阻挡，用户/账户/审计/系统与普通业务均只读`, async ({
    page,
    nativeReads,
  }, info) => {
    test.setTimeout(60_000);
    await login(page, role.identity);
    await navigate(page, '管理概览');
    const overview = region(page, '管理概览');
    await expect(main(page)).toContainText(role.flag);
    await expect(definition(region(page, '平台计数（全部用户范围）'), '全部任务')).toHaveText('6');
    await expect(definition(region(page, 'Worker 服务端状态'), '报告状态')).toHaveText('DEGRADED');
    await expect(definition(region(page, '平台设置与预留政策'), '全局急停（存储值）')).toHaveText('已开启');
    await decimal(definition(overview, '费用预留比例 feeReserveRate'), '0.001000000000000001');
    await navigate(page, '用户查询');
    const users = region(page, '用户列表');
    await expect(users.getByRole('link', { name: 'owner', exact: true })).toBeVisible();
    await expect(users.getByRole('link', { name: 'admin', exact: true })).toBeVisible();
    await apply(page, { '用户名 / 角色关键词': 'ADMIN' });
    await expect(users.getByTestId('data-table-total')).toHaveText('共 2 条');
    await expect(users.getByRole('link', { name: 'trader', exact: true })).toHaveCount(0);
    await users.getByRole('link', { name: role.identity, exact: true }).click();
    const user = region(page, '用户精确查询');
    await expect(definition(user, '用户名')).toHaveText(role.identity);
    await expect(definition(user, 'canManageAdmins 专项权限')).toContainText(
      role.user.canManageAdmins ? 'true' : 'false',
    );
    const lookup = nativeReads.filter((read) => read.path === '/api/v1/admin/users').at(-1);
    expect(lookup).toBeDefined();
    const lookupQuery = new URLSearchParams(lookup?.search);
    expect(lookupQuery.get('ownerUserId')).toBe(role.user.id);
    expect(lookupQuery.get('pageSize')).toBe('1');
    await noBusinessActions(main(page));
    await navigate(page, '管理账户');
    const accounts = region(page, '账户读取结果');
    await expect(accounts.getByTestId('data-table-total')).toHaveText('共 3 条');
    await expect(
      accounts.getByRole('link', { name: 'Mock — Other owner account', exact: true }),
    ).toBeVisible();
    await apply(page, { '所有者 ID': READONLY_IDS.otherTrader });
    await expect(accounts.getByTestId('data-table-total')).toHaveText('共 1 条');
    await expect(
      accounts.getByRole('link', { name: 'Mock — Other owner account', exact: true }),
    ).toBeVisible();
    await navigate(page, '审计记录');
    await apply(page, {
      '附加字段证券（精确）': 'aapl',
      '审计结果（精确）': 'FAILURE',
      '目标 ID（UUID）': READONLY_IDS.accountA,
    });
    const audit = region(page, '管理审计');
    await expect(audit.getByTestId('data-table-total')).toHaveText('共 1 条');
    await expect(audit.getByRole('cell', { name: 'ACCOUNT_CHECK', exact: true })).toBeVisible();
    await expect(audit.getByRole('cell', { name: 'FAILURE', exact: true })).toBeVisible();
    await navigate(page, '系统与 Worker');
    const health = region(page, '健康快照');
    await expect(definition(health, '健康 HTTP / 状态')).toContainText('503');
    await expect(definition(health, '健康 HTTP / 状态')).toContainText('degraded');
    await expect(definition(health, '报告状态')).toHaveText('DEGRADED');
    const system = region(page, '系统状态');
    await expect(system.getByRole('cell', { name: 'RECOVERING', exact: true })).toBeVisible();
    await expect(system.getByRole('cell', { name: 'RUNNING', exact: true })).toBeVisible();
    await expect(definition(system, '缓存选中节点')).toHaveText('https://mock-secondary.invalid');
    await expect(system.getByRole('cell', { name: '该次测量失败', exact: true })).toBeVisible();
    await decimal(definition(system, '费用最低预留 feeReserveMinimum'), '0.350000000000000001');
    await noBusinessActions(main(page));
    await screenshot(page, info, `readonly-system-${role.identity}`);
    await navigate(page, '订单查询');
    await expect(
      region(page, '订单查询结果').getByRole('link', { name: READONLY_IDS.order, exact: true }),
    ).toBeVisible();
    await navigate(page, '批量任务查询');
    await expect(
      region(page, '任务查询结果').getByRole('link', { name: 'Mock：到期的限价分批买入', exact: true }),
    ).toBeVisible();
    await navigate(page, '持仓来源');
    await expect(
      region(page, '本地名义持仓查询').getByRole('cell', { name: 'SYPR', exact: true }),
    ).toBeVisible();
    await noBusinessActions(main(page));
  });
}

test('交易员的所有管理直接路由被拒绝且不发管理或健康 GET，非本人对象不泄漏旧结果', async ({
  page,
  nativeReads,
}) => {
  await login(page);
  await expect(
    page
      .getByRole('navigation', { name: '应用导航', exact: true })
      .getByRole('link', { name: '用户查询', exact: true }),
  ).toHaveCount(0);
  for (const path of [
    '/administration',
    '/administration/users',
    `/administration/users/${ADMIN_USER.id}`,
    '/administration/accounts',
    '/administration/audit',
    '/administration/system',
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: '无权访问', exact: true })).toBeVisible();
  }
  expect(
    nativeReads.filter((read) => read.path.startsWith('/api/v1/admin/') || read.path === '/healthz'),
  ).toEqual([]);
  await page.goto(`/accounts/${READONLY_IDS.accountA}`);
  await expect(
    region(page, '账户详情读取结果').getByRole('heading', { name: 'Mock — Funding account', exact: true }),
  ).toBeVisible();
  await page.goto(`/accounts/${READONLY_IDS.otherAccount}`);
  await expect(region(page, '账户详情读取结果').getByText('当前范围不可读取', { exact: true })).toBeVisible();
  await expect(main(page).getByRole('heading', { name: 'Mock — Funding account', exact: true })).toHaveCount(
    0,
  );
});

for (const mode of ['empty', 'error', 'malformed', 'denied'] as const) {
  test(`订单 ${mode} 读取与最后成功缓存时间语义分离，不将失败或拒绝当空结果`, async ({
    page,
    request,
  }, info) => {
    await page.clock.install();
    await login(page);
    await navigate(page, '订单查询');
    const result = region(page, '订单查询结果');
    const order = result.getByRole('link', { name: READONLY_IDS.order, exact: true });
    await expect(order).toBeVisible();
    const timestamp = await cachedTime(result);
    await page.clock.runFor(1_000);
    await controlProtocol(request, 'readonly', { resource: 'orders', mode });
    await result.getByRole('button', { name: '重新读取', exact: true }).click();
    if (mode === 'error' || mode === 'malformed') {
      await expect(result.getByText('最新读取失败，保留上次成功结果', { exact: true })).toBeVisible();
      await expect(order).toBeVisible();
      expect(await cachedTime(result)).toBe(timestamp);
      await expect(result.getByText('没有匹配当前筛选的本地订单', { exact: true })).toHaveCount(0);
      await expect(result).toContainText('数据可能已过期');
      await screenshot(page, info, `readonly-cached-${mode}`);
      await controlProtocol(request, 'readonly', { resource: 'orders', mode: 'normal' });
      await result.getByRole('button', { name: '重新读取', exact: true }).click();
      await expect(result.getByText('最新读取失败，保留上次成功结果', { exact: true })).toHaveCount(0);
      await expect(order).toBeVisible();
      expect(await cachedTime(result)).not.toBe(timestamp);
    } else if (mode === 'denied') {
      await expect(result.getByText('当前范围不可读取', { exact: true })).toBeVisible();
      await expect(order).toHaveCount(0);
      await expect(result.locator('time')).toHaveCount(0);
      await expect(result.getByText('没有匹配当前筛选的本地订单', { exact: true })).toHaveCount(0);
      const denied = await readProtocolState(request);
      await notify(page, request, ['orders']);
      await page.clock.runFor(500);
      expect((await readProtocolState(request)).readonly.requests.orders).toBe(
        denied.readonly.requests.orders,
      );
      await controlProtocol(request, 'readonly', { resource: 'orders', mode: 'normal' });
      await result.getByRole('button', { name: '重新核对访问权限', exact: true }).click();
      await expect(order).toBeVisible();
    } else {
      await expect(result.getByText('没有匹配当前筛选的本地订单', { exact: true })).toBeVisible();
      await expect(order).toHaveCount(0);
      await expect(result.getByText('最新读取失败，保留上次成功结果', { exact: true })).toHaveCount(0);
      expect(await cachedTime(result)).not.toBe(timestamp);
    }
  });
}

test('成功缓存被403封存后，显式核对503仍不能复活旧行或自动读取，跨卸载保留直到明确成功', async ({
  page,
  request,
}) => {
  await page.clock.install();
  await login(page);
  await navigate(page, '订单查询');
  const result = region(page, '订单查询结果');
  const order = result.getByRole('link', { name: READONLY_IDS.order, exact: true });
  await expect(order).toBeVisible();
  const oldTime = await cachedTime(result);
  await controlProtocol(request, 'readonly', { resource: 'orders', mode: 'denied' });
  await result.getByRole('button', { name: '重新读取', exact: true }).click();
  const retry = result.getByRole('button', { name: '重新核对访问权限', exact: true });
  await expect(retry).toBeEnabled();
  await expect(order).toHaveCount(0);
  await expect(result.locator('time')).toHaveCount(0);
  await controlProtocol(request, 'readonly', { resource: 'orders', mode: 'error' });
  const failure = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/orders' && response.status() === 503,
  );
  await retry.click();
  expect((await failure).status()).toBe(503);
  await page.clock.runFor(3_500);
  await expect(retry).toBeEnabled();
  await expect(result.getByText('当前范围不可读取', { exact: true })).toBeVisible();
  await expect(order).toHaveCount(0);
  await expect(result.locator('time')).toHaveCount(0);
  await expect(result.getByText('最新读取失败，保留上次成功结果', { exact: true })).toHaveCount(0);
  const failedRecheck = await readProtocolState(request);
  await navigate(page, '账户查询');
  await expect(region(page, '账户读取结果').getByTestId('data-table-total')).toHaveText('已返回 2 条');
  await navigate(page, '订单查询');
  await expect(retry).toBeEnabled();
  await expect(order).toHaveCount(0);
  await notify(page, request, ['users', 'audit']);
  await notify(page, request, ['orders']);
  await page.clock.runFor(1_000);
  expect((await readProtocolState(request)).readonly.requests.orders).toBe(
    failedRecheck.readonly.requests.orders,
  );
  await controlProtocol(request, 'readonly', { resource: 'orders', mode: 'normal' });
  await retry.click();
  await expect(order).toBeVisible();
  await expect(retry).toHaveCount(0);
  expect(await cachedTime(result)).not.toBe(oldTime);
  expect((await readProtocolState(request)).readonly.requests.orders).toBe(
    failedRecheck.readonly.requests.orders + 1,
  );
});

for (const mode of ['error', 'malformed', 'denied'] as const) {
  test(`首次任务 ${mode} 没有成功缓存时不伪造表格、零进度或成功时间`, async ({ page, request }) => {
    await login(page);
    await controlProtocol(request, 'readonly', { resource: 'task-detail', mode });
    await page.goto(`/tasks/${READONLY_IDS.task}`);
    const result = region(page, '任务详情查询结果');
    await expect(
      result.getByText(mode === 'denied' ? '当前范围不可读取' : '读取失败', { exact: true }),
    ).toBeVisible();
    await expect(result.getByRole('table')).toHaveCount(0);
    await expect(region(page, '服务端进度汇总')).toHaveCount(0);
    await expect(result.locator('time')).toHaveCount(0);
    await expect(result.getByText('最新读取失败，保留上次成功结果', { exact: true })).toHaveCount(0);
  });
}

test('真实业务 SSE 只重读相关活动 Feature；无关和已卸载缓存不触发 GET，草稿不被刷新抹掉', async ({
  page,
  request,
}) => {
  await page.clock.install();
  await login(page);
  await navigate(page, '账本记录');
  await expect(region(page, '资金流水查询结果').getByTestId('data-table-total')).toContainText('11');
  await navigate(page, '订单查询');
  const orders = region(page, '订单查询结果');
  await expect(orders.getByRole('link', { name: READONLY_IDS.order, exact: true })).toBeVisible();
  await page.clock.runFor(150);
  const draft = filters(page).getByRole('textbox', { name: '订单关键词', exact: true });
  await draft.fill('尚未应用的原串草稿');
  const before = await readProtocolState(request);
  await notify(page, request, ['users', 'audit', 'settings']);
  await page.clock.runFor(500);
  expect((await readProtocolState(request)).readonly.requests).toEqual(before.readonly.requests);
  await notify(page, request, ['orders']);
  await page.clock.runFor(150);
  await expect
    .poll(async () => (await readProtocolState(request)).readonly.requests.orders)
    .toBe(before.readonly.requests.orders + 1);
  await expect(orders).toHaveAttribute('aria-busy', 'false');
  await expect(draft).toHaveValue('尚未应用的原串草稿');
  const after = await readProtocolState(request);
  expect(after.readonly.requests.ledger).toBe(before.readonly.requests.ledger);
  expect(after.readonly.requests.overview).toBe(before.readonly.requests.overview);
  expect(after.readonly.requests.accounts).toBe(before.readonly.requests.accounts);
  await page.clock.runFor(1_000);
  expect((await readProtocolState(request)).readonly.requests).toEqual(after.readonly.requests);
  expect(after.streams.active).toBe(1);
  expect(after.streams.maxActive).toBe(1);
});

test('详情 GET 在途收到修订通知不取消重启，旧快照完成后恰好尾随一次新 REST 并更新实际原因', async ({
  page,
  request,
}, info) => {
  await page.clock.install();
  await login(page);
  await navigate(page, '订单查询');
  await region(page, '订单查询结果').getByRole('link', { name: READONLY_IDS.order, exact: true }).click();
  const detail = region(page, '订单详情查询结果');
  const reason = definition(region(page, '成交、费用与核对证据'), '服务端原因');
  await expect(reason).toHaveText(ORIGINAL_ORDER_REASON);
  await page.clock.runFor(150);
  const before = await readProtocolState(request);
  const timestamp = await cachedTime(detail);
  await controlProtocol(request, 'gates', {
    id: 'order-detail-in-flight',
    endpoint: 'readonly:order-detail',
  });
  await detail.getByRole('button', { name: '重新读取', exact: true }).click();
  await waitForGate(request, 'order-detail-in-flight');
  await controlProtocol(request, 'readonly', { resource: 'order-detail', revision: 2 });
  await notify(page, request, ['orders']);
  await notify(page, request, ['orders']);
  await page.clock.runFor(500);
  const held = await readProtocolState(request);
  expect(held.readonly.requests['order-detail']).toBe(before.readonly.requests['order-detail'] + 1);
  expect(held.gates.find((gate) => gate.id === 'order-detail-in-flight')?.pending).toBe(1);
  await expect(reason).toHaveText(ORIGINAL_ORDER_REASON);
  expect(await cachedTime(detail)).toBe(timestamp);
  await controlProtocol(request, 'release', { id: 'order-detail-in-flight' });
  await page.clock.runFor(150);
  await expect
    .poll(async () => (await readProtocolState(request)).readonly.requests['order-detail'])
    .toBe(before.readonly.requests['order-detail'] + 2);
  await expect(reason).not.toHaveText(ORIGINAL_ORDER_REASON);
  await expect(reason).toContainText('Mock');
  await expect(detail).toHaveAttribute('aria-busy', 'false');
  const after = await readProtocolState(request);
  expect(after.readonly.requests.orders).toBe(before.readonly.requests.orders);
  expect(after.readonly.requests.accounts).toBe(before.readonly.requests.accounts);
  await page.clock.runFor(1_000);
  expect((await readProtocolState(request)).readonly.requests['order-detail']).toBe(
    after.readonly.requests['order-detail'],
  );
  await screenshot(page, info, 'readonly-sse-revision-tail');
});

test('切换账户时旧在途名义持仓不污染新账户，也不以旧官方候选作占位', async ({ page, request }) => {
  await login(page);
  await page.goto(`/positions?accountId=${READONLY_IDS.accountA}`);
  const local = region(page, '本地名义持仓查询');
  const official = region(page, '官方 Funding 候选查询');
  await expect(local.getByRole('cell', { name: 'SYPR', exact: true })).toBeVisible();
  await expect(definition(official, '官方候选账户 UUID')).toHaveText(READONLY_IDS.accountA);
  await controlProtocol(request, 'gates', { id: 'old-position-scope', endpoint: 'readonly:positions' });
  await local.getByRole('button', { name: '重新读取', exact: true }).click();
  await waitForGate(request, 'old-position-scope');
  await apply(page, { '账户 UUID（两种来源共用）': READONLY_IDS.accountB });
  await expect(page).toHaveURL(new RegExp(`accountId=${READONLY_IDS.accountB}`));
  await controlProtocol(request, 'release', { id: 'old-position-scope' });
  await expect(local.getByText('当前筛选没有名义持仓记录', { exact: true })).toBeVisible();
  await expect(local.getByRole('cell', { name: 'SYPR', exact: true })).toHaveCount(0);
  await expect(official.getByText('读取失败', { exact: true })).toBeVisible();
  await expect(definition(official, '官方候选账户 UUID')).toHaveCount(0);
  await expect(official.getByRole('cell', { name: 'EQ_AAPL', exact: true })).toHaveCount(0);
  await expect(official).toHaveAttribute('aria-busy', 'false');
  await expect(local).toHaveAttribute('aria-busy', 'false');
  await expect(main(page).getByText('当前范围不可读取', { exact: true })).toHaveCount(0);
});

async function themeColors(
  page: Page,
): Promise<{ shell: string; input: string; inputBorder: string; tableText: string }> {
  return page.evaluate(() => {
    const shell = document.querySelector('[data-testid="application-shell"]');
    const scope = shell?.querySelector('[role="main"], main');
    const input = scope?.querySelector('input');
    const cell = scope?.querySelector('th');
    if (!shell || !input || !cell) throw new Error('只读页面缺少实际主题取证元素');
    return {
      shell: getComputedStyle(shell).backgroundColor,
      input: getComputedStyle(input).color,
      inputBorder: getComputedStyle(input).borderColor,
      tableText: getComputedStyle(cell).color,
    };
  });
}

test('真实只读表格和筛选输入 Light/Dark 计算样式改变，显式主题覆盖相反系统偏好', async ({ page }, info) => {
  await login(page);
  await navigate(page, '订单查询');
  await expect(region(page, '订单查询结果').getByRole('table')).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark' });
  await main(page).getByRole('radio', { name: '浅色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const light = await themeColors(page);
  expect(light.shell).not.toBe('rgba(0, 0, 0, 0)');
  await screenshot(page, info, 'readonly-orders-light');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => themeColors(page)).toEqual(light);
  await main(page).getByRole('radio', { name: '深色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(async () => (await themeColors(page)).shell).not.toBe(light.shell);
  const dark = await themeColors(page);
  expect(dark.input).not.toBe(light.input);
  expect(dark.tableText).not.toBe(light.tableText);
  expect(dark.inputBorder).not.toBe(light.inputBorder);
  await screenshot(page, info, 'readonly-orders-dark');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => themeColors(page)).toEqual(dark);
  await main(page).getByRole('radio', { name: '跟随系统', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => themeColors(page)).toEqual(light);
});

for (const width of [390, 320]) {
  test(`${width}px 真实业务移动导航含键盘焦点，密集订单表能横向键盘访问而页面不溢出`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await login(page);
    const trigger = page.getByRole('button', { name: '打开导航', exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect
      .poll(() => drawer.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
    await page.keyboard.press('Shift+Tab');
    await expect
      .poll(() => drawer.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Enter');
    await drawer.getByRole('link', { name: '订单查询', exact: true }).click();
    await expect(drawer).toBeHidden();
    const result = region(page, '订单查询结果');
    await expect(result.getByRole('link', { name: READONLY_IDS.order, exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true);
    const scroll = result.getByRole('group', { name: /横向滚动区域/ });
    await scroll.scrollIntoViewIfNeeded();
    expect(await scroll.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await scroll.focus();
    await expect(scroll).toBeFocused();
    for (let index = 0; index < 8; index += 1) await page.keyboard.press('ArrowRight');
    await expect.poll(() => scroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    const lastHeader = scroll.getByRole('columnheader', { name: '创建时间（UTC）', exact: true });
    await lastHeader.scrollIntoViewIfNeeded();
    const visibleRightColumn = await lastHeader.evaluate((element) => {
      const viewport = element.closest('[role="group"]');
      if (!viewport) return false;
      const cell = element.getBoundingClientRect();
      const clip = viewport.getBoundingClientRect();
      return cell.right > clip.left && cell.left < clip.right;
    });
    expect(visibleRightColumn).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true);
    await screenshot(page, info, `readonly-orders-mobile-${width}`);
    await trigger.click();
    await drawer.getByRole('link', { name: '批量任务查询', exact: true }).click();
    await expect(drawer).toBeHidden();
    await expect(
      region(page, '任务查询结果').getByRole('link', { name: 'Mock：到期的限价分批买入', exact: true }),
    ).toBeVisible();
    await noBusinessActions(main(page));
  });
}
