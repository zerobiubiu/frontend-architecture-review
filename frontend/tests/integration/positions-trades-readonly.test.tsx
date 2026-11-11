import { QueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  type RouterHistory,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw/http';
import type { FunctionComponent } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { type AppServices, createAppServices } from '@/app/runtime';
import type { AuthUser } from '@/features/auth/types';
import { readOfficialHoldings, readPositions } from '@/features/positions/api';
import { PositionsPage } from '@/features/positions/page';
import {
  holdingsSchema,
  positionSchema,
  positionSearchSchema,
  positionsSchema,
} from '@/features/positions/schemas';
import { readOfficialTrades } from '@/features/trades/api';
import { TradesPage } from '@/features/trades/page';
import { officialTradeSchema, officialTradesSchema, tradeSearchSchema } from '@/features/trades/schemas';
import { createRpcApi } from '@/services/api/rpc';
import type { BusinessEventSource } from '@/services/realtime/manager';
import { ADMIN_USER, AUTH_DATA, TRADER_USER } from '../msw/auth-fixtures';
import { API } from '../msw/handlers';
import { READONLY_IDS } from '../msw/readonly/ids';
import {
  holdingFixture,
  holdingsFixture,
  OFFICIAL_TRADE_WINDOW,
  officialTradeFixture,
  officialTradesFixture,
  positionFixture,
  positionsFixture,
} from '../msw/readonly/positions-trades';
import { server } from '../msw/server';

const histories: RouterHistory[] = [];
const runtimes: AppServices[] = [];
const reads: URL[] = [];
const unexpectedRequests: string[] = [];
let actor: AuthUser = TRADER_USER;

class BusinessSource implements BusinessEventSource {
  onopen: BusinessEventSource['onopen'] = null;
  onmessage: BusinessEventSource['onmessage'] = null;
  onerror: BusinessEventSource['onerror'] = null;
  closed = false;
  close() {
    this.closed = true;
  }
}

function failure(status: number, code: string) {
  return HttpResponse.json(
    { error: { code, message: `Mock：${code}`, requestId: 'mock-positions-trades' } },
    { status },
  );
}

function deferred() {
  let release: (() => void) | undefined;
  // 仓库的 ES2023 声明尚未包含 Promise.withResolvers。
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    promise,
    resolve() {
      if (!release) throw new Error('受控 Promise 尚未初始化');
      release();
    },
  };
}

beforeEach(() => {
  actor = TRADER_USER;
  reads.length = 0;
  unexpectedRequests.length = 0;
  server.use(
    http.get(`${API}/auth/me`, () => HttpResponse.json({ data: { ...AUTH_DATA, user: actor } })),
    http.get(`${API}/positions`, ({ request }) => {
      const url = new URL(request.url);
      reads.push(url);
      const accountId = url.searchParams.get('accountId') ?? READONLY_IDS.accountA;
      if (accountId === READONLY_IDS.otherAccount && actor.role !== 'ADMIN') return failure(404, 'NOT_FOUND');
      return HttpResponse.json({
        data: positionsFixture({
          items: [positionFixture({ exchangeAccountId: accountId })],
          page: Number(url.searchParams.get('page') ?? 1),
          pageSize: Number(url.searchParams.get('pageSize') ?? 25),
        }),
      });
    }),
    http.get(`${API}/market/holdings`, ({ request }) => {
      const url = new URL(request.url);
      reads.push(url);
      const accountId = url.searchParams.get('accountId') ?? '';
      if (accountId === READONLY_IDS.otherAccount && actor.role !== 'ADMIN') return failure(404, 'NOT_FOUND');
      return HttpResponse.json({ data: holdingsFixture({ accountId }) });
    }),
    http.get(`${API}/accounts/:id/exchange/trades`, ({ request, params }) => {
      const url = new URL(request.url);
      reads.push(url);
      if (params.id === READONLY_IDS.otherAccount && actor.role !== 'ADMIN') return failure(404, 'NOT_FOUND');
      const page = Number(url.searchParams.get('page') ?? 1);
      return HttpResponse.json({
        data: officialTradesFixture({
          items: [officialTradeFixture({ exchangeTradeId: `official-execution-page-${page}` })],
          total: 51,
          page,
          pageSize: Number(url.searchParams.get('pageSize') ?? 25),
        }),
      });
    }),
    http.all(`${API}/*`, ({ request }) => {
      unexpectedRequests.push(`${request.method} ${new URL(request.url).pathname}`);
      return failure(400, 'UNEXPECTED_MOCK_REQUEST');
    }),
  );
});

afterEach(() => {
  cleanup();
  for (const runtime of runtimes.splice(0)) {
    runtime.businessSync.stop();
    runtime.session.stop();
    runtime.queryClient.clear();
  }
  for (const history of histories.splice(0)) history.destroy();
  expect(unexpectedRequests).toEqual([]);
});

async function mount(Page: FunctionComponent, search: Record<string, string> = {}) {
  const history = createMemoryHistory({ initialEntries: [`/?${new URLSearchParams(search)}`] });
  histories.push(history);
  const root = createRootRoute({ component: Page });
  const router = createRouter({ routeTree: root, history, defaultPendingMs: 0, defaultPendingMinMs: 0 });
  const runtime = createAppServices({
    baseUrl: API,
    queryClient: new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Infinity,
          gcTime: Infinity,
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
        },
      },
    }),
    broadcastFactory: () => null,
    createEventSource: () => new BusinessSource(),
  });
  runtimes.push(runtime);
  await router.load();
  render(
    <AppProviders services={runtime}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { history, runtime };
}

const completeTradeSearch = { accountId: READONLY_IDS.accountA, ...OFFICIAL_TRADE_WINDOW };

describe('名义持仓 / 官方候选 / 官方成交的消费边界', () => {
  it('保留金额和历史 UTC 原文，拒绝金融 number 与伪官方资产值', () => {
    const row = positionFixture();
    expect(positionSchema.parse(row).notionalCost).toBe('12345678901234567890.123456789012345678');
    expect(positionSchema.parse(row).updatedAt).toBe('2026-11-11T09:30:00.123456789Z');
    expect(positionSchema.safeParse({ ...row, quantity: 12 }).success).toBe(false);
    expect(positionSchema.safeParse({ ...row, markPrice: '100' }).success).toBe(false);
    expect(positionsSchema.safeParse({ ...positionsFixture(), total: '1' }).success).toBe(false);
    expect(positionsSchema.safeParse({ ...positionsFixture(), assetsAvailable: true }).success).toBe(false);
  });

  it('复用公开候选 schema：允许 free=0 的锁定候选和未知 freeze，拒绝身份冲突、重复、全零及超精度', () => {
    const row = holdingFixture();
    const data = holdingsSchema.parse(holdingsFixture());
    expect(data.items[0]?.fundingFreeQuantity).toBe('0');
    expect(data.items[0]?.freezeQuantity).toBeNull();
    for (const invalid of [
      holdingFixture({ stockTicker: 'MSFT' }),
      holdingFixture({ assetCode: 'EQ_MSFT' }),
      holdingFixture({ fundingFreeQuantity: '0.00000000001' }),
      holdingFixture({ lockedQuantity: '0', freezeQuantity: '0', withdrawingQuantity: '0' }),
      { ...row, fundingFreeQuantity: 0 },
    ]) {
      expect(holdingsSchema.safeParse({ ...holdingsFixture(), items: [invalid] }).success).toBe(false);
    }
    expect(holdingsSchema.safeParse(holdingsFixture({ items: [row, row] })).success).toBe(false);
    expect(
      holdingsSchema.safeParse({ ...holdingsFixture(), sourceUpdatedAt: '2026-11-11T09:00:00Z' }).success,
    ).toBe(false);
    expect(holdingsSchema.parse(holdingsFixture({ items: [] })).items).toEqual([]);
  });

  it('官方成交保留非 UUID 的官方 ID、未知金额和 fee=null，不接受 number 或费用分摊', () => {
    const row = officialTradeFixture();
    const parsed = officialTradeSchema.parse(row);
    expect(parsed.exchangeOrderId).toBe('official-order-900719925474099398765');
    expect(parsed.notional).toBeNull();
    expect(parsed.fee).toBeNull();
    expect(parsed.updatedAt).toBeNull();
    expect(parsed.filledAt).toBe('2026-11-11T09:00:00.123456789Z');
    expect(officialTradeSchema.safeParse({ ...row, price: 102 }).success).toBe(false);
    expect(officialTradeSchema.safeParse({ ...row, fee: '0' }).success).toBe(false);
    expect(officialTradeSchema.safeParse({ ...row, exchangeTradeId: 123 }).success).toBe(false);
    expect(officialTradesSchema.safeParse({ items: [row], page: 1, pageSize: 25 }).success).toBe(false);
  });

  it('本地公共 symbol 不规范化且只传有效筛选，官方候选只传同一账户', async () => {
    const rpc = createRpcApi({ baseUrl: API });
    const search = positionSearchSchema.parse({
      accountId: READONLY_IDS.accountA,
      symbol: ' sypr ',
      status: 'IGNORED',
      search: 'IGNORED',
      page: 3,
      pageSize: 10,
    });
    await readPositions(rpc, search, new AbortController().signal);
    await readOfficialHoldings(rpc, READONLY_IDS.accountA, new AbortController().signal);
    const local = reads.find((url) => url.pathname.endsWith('/positions'));
    expect(local?.searchParams.get('symbol')).toBe(' sypr ');
    expect(local?.searchParams.get('page')).toBe('3');
    expect(local?.searchParams.has('status')).toBe(false);
    expect(local?.searchParams.has('search')).toBe(false);
    const holdings = reads.find((url) => url.pathname.endsWith('/holdings'));
    expect([...(holdings?.searchParams.keys() ?? [])]).toEqual(['accountId']);
    expect(holdings?.searchParams.get('accountId')).toBe(READONLY_IDS.accountA);
  });

  it('大写账户 UUID 接受同一数据库标识的名义持仓和官方候选', async () => {
    const canonicalId = 'a1b2c3d4-1111-4111-8111-abcdef123456';
    server.use(
      http.get(`${API}/positions`, () =>
        HttpResponse.json({
          data: positionsFixture({ items: [positionFixture({ exchangeAccountId: canonicalId })] }),
        }),
      ),
      http.get(`${API}/market/holdings`, () =>
        HttpResponse.json({
          data: holdingsFixture({ accountId: canonicalId }),
        }),
      ),
    );
    const rpc = createRpcApi({ baseUrl: API });
    const signal = new AbortController().signal;
    const [positions, holdings] = await Promise.all([
      readPositions(rpc, positionSearchSchema.parse({ accountId: canonicalId.toUpperCase() }), signal),
      readOfficialHoldings(rpc, canonicalId.toUpperCase(), signal),
    ]);
    expect(positions.items[0]?.exchangeAccountId).toBe(canonicalId);
    expect(holdings.accountId).toBe(canonicalId);
    expect(holdings.items[0]?.lockedQuantity).toBe(holdingFixture().lockedQuantity);
  });

  it('官方候选或本地行返回别的账户时拒绝，不混入当前账户范围', async () => {
    server.use(
      http.get(`${API}/positions`, () =>
        HttpResponse.json({
          data: positionsFixture({ items: [positionFixture({ exchangeAccountId: READONLY_IDS.accountB })] }),
        }),
      ),
      http.get(`${API}/market/holdings`, () =>
        HttpResponse.json({ data: holdingsFixture({ accountId: READONLY_IDS.accountB }) }),
      ),
    );
    const rpc = createRpcApi({ baseUrl: API });
    await expect(
      readPositions(
        rpc,
        positionSearchSchema.parse({ accountId: READONLY_IDS.accountA }),
        new AbortController().signal,
      ),
    ).rejects.toThrow('items.exchangeAccountId');
    await expect(
      readOfficialHoldings(rpc, READONLY_IDS.accountA, new AbortController().signal),
    ).rejects.toThrow('accountId');
  });

  it('官方历史只用真实账户路径和专用参数，显式长窗口无七天上限，缺窗口不发送', async () => {
    const rpc = createRpcApi({ baseUrl: API });
    const search = tradeSearchSchema.parse({
      ...completeTradeSearch,
      symbol: ' sypr ',
      page: 2,
      pageSize: 10,
      ownerUserId: TRADER_USER.id,
      side: 'BUY',
    });
    const result = await readOfficialTrades(rpc, search, new AbortController().signal);
    expect(result.total).toBe(51);
    expect(reads[0]?.pathname).toBe(`/api/v1/accounts/${READONLY_IDS.accountA}/exchange/trades`);
    expect(Object.fromEntries(reads[0]?.searchParams ?? [])).toEqual({
      symbol: 'SYPR',
      ...OFFICIAL_TRADE_WINDOW,
      page: '2',
      pageSize: '10',
    });
    await expect(
      readOfficialTrades(
        rpc,
        tradeSearchSchema.parse({ accountId: READONLY_IDS.accountA }),
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(reads).toHaveLength(1);
    expect(
      tradeSearchSchema.safeParse({ from: '1969-12-31T23:59:59Z', to: OFFICIAL_TRADE_WINDOW.to }).success,
    ).toBe(false);
    expect(
      tradeSearchSchema.safeParse({ from: OFFICIAL_TRADE_WINDOW.to, to: OFFICIAL_TRADE_WINDOW.from }).success,
    ).toBe(false);
  });
});

describe('持仓页的真实来源、字段与账户状态', () => {
  it('两源独立表格与详情；名义总量/本地余量/free/锁定/未知各自保留，没有官方假分页', async () => {
    const user = userEvent.setup();
    await mount(PositionsPage, { accountId: READONLY_IDS.accountA });
    expect(await screen.findByRole('cell', { name: 'SYPR' })).toBeVisible();
    for (const cell of await screen.findAllByRole('cell', { name: 'AAPL' })) expect(cell).toBeVisible();
    const local = screen.getByRole('region', { name: '本地名义持仓 · LOCAL_LEDGER' });
    const official = screen.getByRole('region', { name: '本次官方 Funding 股票候选' });
    expect(within(local).getByRole('cell', { name: '12.0000000001' })).toBeVisible();
    expect(within(local).getByRole('cell', { name: '10.0000000001' })).toBeVisible();
    expect(within(official).getByRole('cell', { name: '3.2500000000' })).toBeVisible();
    expect(within(official).getAllByRole('cell', { name: '0' })).toHaveLength(2);
    expect(within(official).getByRole('cell', { name: '未知' })).toBeVisible();
    expect(within(official).queryByRole('cell', { name: 'SYPR' })).not.toBeInTheDocument();
    expect(within(official).getByText('已返回 1 条')).toBeVisible();
    expect(within(official).queryByRole('button', { name: '转到下一页' })).not.toBeInTheDocument();
    expect(within(official).getByTitle('2026-11-11T09:30:02.300Z')).toBeVisible();
    expect(within(official).getByText(/服务端明确返回 null/)).toBeVisible();
    await user.click(within(local).getByRole('button', { name: '查看 SYPR 名义记录' }));
    const details = screen.getByRole('region', { name: '已加载名义持仓详情' });
    expect(within(details).getByTitle('12345678901234567890.123456789012345678')).toBeVisible();
    expect(within(details).getByText('2026-11-11T09:30:00.123456789Z')).toBeVisible();
    expect(within(details).getByText('不可用，非本地未预留股数')).toBeVisible();
    expect(within(details).getByText('存储 realizedPnl（非官方盈亏）')).toBeVisible();
    expect(screen.queryByRole('button', { name: /同步|导入|预检|买入|卖出/ })).not.toBeInTheDocument();
  });

  it('账户应用到同一 URL 并回第一页，切换中不展示旧账户两源数据', async () => {
    const user = userEvent.setup();
    const gate = deferred();
    server.use(
      http.get(`${API}/positions`, async ({ request }) => {
        const url = new URL(request.url);
        reads.push(url);
        const accountId = url.searchParams.get('accountId') ?? READONLY_IDS.accountA;
        if (accountId === READONLY_IDS.accountB) await gate.promise;
        return HttpResponse.json({
          data: positionsFixture({
            page: Number(url.searchParams.get('page')),
            items: [
              positionFixture({
                exchangeAccountId: accountId,
                symbol: accountId === READONLY_IDS.accountB ? 'MSFT' : 'SYPR',
              }),
            ],
          }),
        });
      }),
      http.get(`${API}/market/holdings`, async ({ request }) => {
        const url = new URL(request.url);
        reads.push(url);
        const accountId = url.searchParams.get('accountId') ?? '';
        if (accountId === READONLY_IDS.accountB) await gate.promise;
        return HttpResponse.json({
          data: holdingsFixture({
            accountId,
            items: [
              accountId === READONLY_IDS.accountB
                ? holdingFixture({ symbol: 'NVDA', stockTicker: 'NVDA', assetCode: 'EQ_NVDA' })
                : holdingFixture(),
            ],
          }),
        });
      }),
    );
    const { history } = await mount(PositionsPage, { accountId: READONLY_IDS.accountA, page: '4' });
    await screen.findByRole('cell', { name: 'SYPR' });
    await screen.findAllByRole('cell', { name: 'AAPL' });
    const input = screen.getByRole('textbox', { name: '账户 UUID（两种来源共用）' });
    await user.clear(input);
    await user.type(input, READONLY_IDS.accountB);
    expect(screen.getByRole('cell', { name: 'SYPR' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '查询' }));
    await waitFor(() =>
      expect(reads.filter((url) => url.searchParams.get('accountId') === READONLY_IDS.accountB)).toHaveLength(
        2,
      ),
    );
    expect(screen.queryByRole('cell', { name: 'SYPR' })).not.toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: 'AAPL' })).not.toBeInTheDocument();
    expect(new URL(history.location.href, API).searchParams.get('page')).toBe('1');
    expect(new URL(history.location.href, API).searchParams.get('accountId')).toBe(READONLY_IDS.accountB);
    await act(async () => {
      gate.resolve();
    });
    expect(await screen.findByRole('cell', { name: 'MSFT' })).toBeVisible();
    for (const cell of await screen.findAllByRole('cell', { name: 'NVDA' })) expect(cell).toBeVisible();
  });

  it('缺账户不请求官方；空候选不补本地证券零行', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${API}/market/holdings`, ({ request }) => {
        reads.push(new URL(request.url));
        return HttpResponse.json({ data: holdingsFixture({ items: [] }) });
      }),
    );
    await mount(PositionsPage);
    await screen.findByRole('cell', { name: 'SYPR' });
    expect(reads.filter((url) => url.pathname.endsWith('/holdings'))).toHaveLength(0);
    await user.type(
      screen.getByRole('textbox', { name: '账户 UUID（两种来源共用）' }),
      READONLY_IDS.accountA,
    );
    await user.click(screen.getByRole('button', { name: '查询' }));
    expect(await screen.findByText('本次官方读取未返回股票候选')).toBeVisible();
    const official = screen.getByRole('region', { name: '本次官方 Funding 股票候选' });
    expect(within(official).queryByRole('table')).not.toBeInTheDocument();
    expect(within(official).getByText(/空数组或缺少某证券行不等于该证券已确认零库存/)).toBeVisible();
  });

  it('官方失败保留明确陈旧结果，后续 404 拒绝隐藏旧候选，而不改成本地结果', async () => {
    const user = userEvent.setup();
    await mount(PositionsPage, { accountId: READONLY_IDS.accountA });
    await screen.findAllByRole('cell', { name: 'AAPL' });
    const official = screen.getByRole('region', { name: '官方 Funding 候选查询' });
    server.use(http.get(`${API}/market/holdings`, () => failure(502, 'FUNDING_UNAVAILABLE')));
    await user.click(within(official).getByRole('button', { name: '重新读取' }));
    expect(await within(official).findByText('最新读取失败，保留上次成功结果')).toBeVisible();
    for (const cell of within(official).getAllByRole('cell', { name: 'AAPL' })) expect(cell).toBeVisible();
    server.use(http.get(`${API}/market/holdings`, () => failure(404, 'NOT_FOUND')));
    await user.click(within(official).getByRole('button', { name: '重新读取' }));
    expect(await within(official).findByText('当前范围不可读取')).toBeVisible();
    expect(within(official).queryByRole('cell', { name: 'AAPL' })).not.toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'SYPR' })).toBeVisible();
  });

  it('非法 URL 禁止两源读取；重置后仅读取授权范围内名义记录', async () => {
    const user = userEvent.setup();
    const { history } = await mount(PositionsPage, { accountId: 'invalid' });
    expect(await screen.findByText('筛选地址无效')).toBeVisible();
    expect(reads).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: '重置' }));
    expect(await screen.findByRole('cell', { name: 'SYPR' })).toBeVisible();
    expect(new URL(history.location.href, API).searchParams.has('accountId')).toBe(false);
    expect(reads.filter((url) => url.pathname.endsWith('/holdings'))).toHaveLength(0);
  });

  it('普通管理员不需要交易写能力或管理者专项权即可读取跨所有者两源', async () => {
    actor = ADMIN_USER;
    const { runtime } = await mount(PositionsPage, { accountId: READONLY_IDS.otherAccount });
    for (const cell of await screen.findAllByRole('cell', { name: 'AAPL' })) expect(cell).toBeVisible();
    expect(screen.getByRole('cell', { name: 'SYPR' })).toBeVisible();
    expect(runtime.session.getSnapshot().user).toEqual(ADMIN_USER);
    expect(screen.getByRole('textbox', { name: '本地所有者 UUID' })).toBeVisible();
  });

  it('名义零股数行保持可见；真实 ledger 失效提示重读两源而不创建新资源', async () => {
    server.use(
      http.get(`${API}/positions`, ({ request }) => {
        reads.push(new URL(request.url));
        return HttpResponse.json({
          data: positionsFixture({
            items: [positionFixture({ quantity: '0', reservedQuantity: '0', localAvailableQuantity: '0' })],
          }),
        });
      }),
    );
    const { runtime } = await mount(PositionsPage, { accountId: READONLY_IDS.accountA });
    await screen.findByRole('cell', { name: 'SYPR' });
    await screen.findAllByRole('cell', { name: 'AAPL' });
    const local = screen.getByRole('region', { name: '本地名义持仓 · LOCAL_LEDGER' });
    expect(within(local).getAllByRole('cell', { name: '0' })).toHaveLength(3);
    await act(async () => {
      runtime.convergence.refresh(['ledger']);
    });
    await waitFor(() => expect(reads).toHaveLength(4));
    expect(new Set(reads.map((url) => url.pathname))).toEqual(
      new Set(['/api/v1/positions', '/api/v1/market/holdings']),
    );
  });
});

describe('官方成交页固定窗口、只读详情与来源权限', () => {
  it('未给显式窗口不请求；应用后页码拥有者是 URL，翻页保留原 UTC 筛选', async () => {
    const user = userEvent.setup();
    const { history } = await mount(TradesPage, { accountId: READONLY_IDS.accountA });
    await screen.findByText(/请选择账户并填写固定的 UTC 起止筛选时间/);
    expect(reads).toHaveLength(0);
    await user.type(
      screen.getByRole('textbox', { name: '成交历史筛选起点 UTC' }),
      OFFICIAL_TRADE_WINDOW.from,
    );
    await user.type(screen.getByRole('textbox', { name: '成交历史筛选终点 UTC' }), OFFICIAL_TRADE_WINDOW.to);
    await user.type(screen.getByRole('textbox', { name: '官方历史证券代码' }), ' sypr ');
    await user.click(screen.getByRole('button', { name: '查询' }));
    expect(await screen.findByRole('cell', { name: 'official-execution-page-1' })).toBeVisible();
    expect(screen.getByText('共 51 条')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '转到下一页' }));
    expect(await screen.findByRole('cell', { name: 'official-execution-page-2' })).toBeVisible();
    const url = new URL(history.location.href, API);
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('from')).toBe(OFFICIAL_TRADE_WINDOW.from);
    expect(url.searchParams.get('to')).toBe(OFFICIAL_TRADE_WINDOW.to);
    expect(reads).toHaveLength(2);
    for (const request of reads) {
      expect(request.searchParams.get('from')).toBe(OFFICIAL_TRADE_WINDOW.from);
      expect(request.searchParams.get('to')).toBe(OFFICIAL_TRADE_WINDOW.to);
      expect(request.searchParams.get('symbol')).toBe('SYPR');
    }
    expect(screen.getByText('已应用筛选终点 UTC（请求参数 to）')).toBeVisible();
    expect(screen.queryByRole('button', { name: '成交价 USD' })).not.toBeInTheDocument();
  });

  it('展开已返回官方行而不请求详情；官方订单身份不链接本地 UUID，保留未知费用和历史时间', async () => {
    const user = userEvent.setup();
    await mount(TradesPage, completeTradeSearch);
    await screen.findByRole('cell', { name: 'official-execution-page-1' });
    const initialReads = reads.length;
    await user.click(screen.getByRole('button', { name: '查看成交 official-execution-page-1' }));
    const details = screen.getByRole('region', { name: '已加载官方成交详情' });
    expect(within(details).getByText('official-order-900719925474099398765')).toBeVisible();
    expect(within(details).getByTitle('102.123456789012345678')).toBeVisible();
    expect(within(details).getByText('2026-11-11T09:00:00.123456789Z')).toBeVisible();
    expect(within(details).getByText('未知（接口固定返回 null，不分摊订单费用）')).toBeVisible();
    expect(within(details).queryByRole('link')).not.toBeInTheDocument();
    expect(reads).toHaveLength(initialReads);
    expect(screen.getByText(/本地成交仅嵌在已授权的订单或任务详情中/)).toBeVisible();
    expect(screen.getByRole('link', { name: '从本地订单查看成交' })).toHaveAttribute('href', '/orders');
    expect(screen.queryByRole('button', { name: /同步|导入|重试提交/ })).not.toBeInTheDocument();
  });

  it('交易员无权账户是拒绝不是空历史，普通管理员无专项权限可读官方历史', async () => {
    await mount(TradesPage, { ...completeTradeSearch, accountId: READONLY_IDS.otherAccount });
    expect(await screen.findByText('当前范围不可读取')).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    cleanup();
    actor = ADMIN_USER;
    await mount(TradesPage, { ...completeTradeSearch, accountId: READONLY_IDS.otherAccount });
    expect(await screen.findByRole('cell', { name: 'official-execution-page-1' })).toBeVisible();
  });

  it('真实 orders 失效只重读固定账户历史窗口，不重算 from/to', async () => {
    const { runtime } = await mount(TradesPage, completeTradeSearch);
    await screen.findByRole('cell', { name: 'official-execution-page-1' });
    await act(async () => {
      runtime.convergence.refresh(['orders']);
    });
    await waitFor(() => expect(reads).toHaveLength(2));
    for (const url of reads) {
      expect(url.searchParams.get('from')).toBe(OFFICIAL_TRADE_WINDOW.from);
      expect(url.searchParams.get('to')).toBe(OFFICIAL_TRADE_WINDOW.to);
    }
  });

  it('身份确认期间不读历史；过滤错误不回退到旧账户数据', async () => {
    const gate = deferred();
    server.use(
      http.get(`${API}/auth/me`, async () => {
        await gate.promise;
        return HttpResponse.json({ data: AUTH_DATA });
      }),
    );
    const { history } = await mount(TradesPage, completeTradeSearch);
    expect(reads).toHaveLength(0);
    await act(async () => {
      gate.resolve();
    });
    expect(await screen.findByRole('cell', { name: 'official-execution-page-1' })).toBeVisible();
    await act(async () => {
      history.push(`/?accountId=${READONLY_IDS.accountB}&from=not-a-time&to=${OFFICIAL_TRADE_WINDOW.to}`);
    });
    expect(await screen.findByText('筛选地址无效')).toBeVisible();
    expect(screen.queryByRole('cell', { name: 'official-execution-page-1' })).not.toBeInTheDocument();
    expect(reads).toHaveLength(1);
  });
});
