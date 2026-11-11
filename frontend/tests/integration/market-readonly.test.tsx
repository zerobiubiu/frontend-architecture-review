/// <reference lib="es2024.promise" />
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw/http';
import type { FunctionComponent } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { type AppServices, createAppServices } from '@/app/runtime';
import type { AuthUser } from '@/features/auth/types';
import { readQuotes } from '@/features/market/api';
import { MarketPage } from '@/features/market/page';
import { readSecurities } from '@/features/securities/api';
import { SecuritiesPage } from '@/features/securities/page';
import { createRpcApi } from '@/services/api/rpc';
import type { ApiOutcome } from '@/services/api/types';
import type { BusinessEventSource } from '@/services/realtime/manager';
import { ADMIN_USER, AUTH_DATA, TRADER_USER } from '../msw/auth-fixtures';
import { READONLY_IDS } from '../msw/readonly/ids';
import {
  MARKET_FIXTURE_EXPIRES,
  MARKET_FIXTURE_TIME,
  makeCatalogPage,
  makeMarketQuote,
  makeQuoteEvent,
  makeQuoteStatus,
} from '../msw/readonly/market';
import { server } from '../msw/server';

const API = 'http://localhost/api/v1';
const disposables: Array<() => void> = [];

class Source implements BusinessEventSource {
  onopen: BusinessEventSource['onopen'] = null;
  onmessage: BusinessEventSource['onmessage'] = null;
  onerror: BusinessEventSource['onerror'] = null;
  readonly url: string;
  closed = false;
  constructor(url: string) {
    this.url = url;
  }
  close(): void {
    this.closed = true;
  }
  open(): void {
    this.onopen?.(new Event('open'));
  }
  frame(value: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(value) }));
  }
}
function success<T>(data: T): ApiOutcome<T> {
  return {
    kind: 'success',
    status: 200,
    data,
    receipt: { kind: 'absent' },
    requestId: 'mock-readonly-market',
    sessionEpoch: 0,
  };
}
function gate() {
  const { promise, resolve } = Promise.withResolvers<void>();
  return { promise, release: resolve };
}
function services(user: AuthUser = TRADER_USER) {
  const sources: Source[] = [];
  const auth = { ...AUTH_DATA, user };
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
    authApi: {
      me: async () => success(auth),
      login: async () => success(auth),
      logout: async () => success({ loggedOut: true as const }),
    },
    broadcastFactory: () => null,
    createEventSource: (url) => {
      const source = new Source(url);
      sources.push(source);
      return source;
    },
  });
  disposables.push(() => {
    runtime.market.stop();
    runtime.businessSync.stop();
    runtime.session.stop();
    runtime.queryClient.clear();
  });
  function quoteSource(): Source {
    const source = sources.findLast((item) => item.url.includes('/market/quote-stream'));
    if (!source) throw new Error('页面尚未建立报价流');
    return source;
  }
  function businessSource(): Source {
    const source = sources.findLast((item) => item.url.endsWith('/events'));
    if (!source) throw new Error('页面尚未建立业务流');
    return source;
  }
  return { runtime, sources, quoteSource, businessSource };
}
async function mount(Component: FunctionComponent, href: string, runtime: AppServices) {
  const history = createMemoryHistory({ initialEntries: [href] });
  disposables.push(() => history.destroy());
  const router = createRouter({
    routeTree: createRootRoute({ component: Component }),
    history,
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  });
  await router.load();
  render(
    <AppProviders services={runtime}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return history;
}
function catalogHandler() {
  return http.get(`${API}/market/symbols`, ({ request }) => {
    const params = new URL(request.url).searchParams;
    return HttpResponse.json({
      data: makeCatalogPage({
        search: params.get('search') ?? undefined,
        page: Number(params.get('page') ?? 1),
        pageSize: Number(params.get('pageSize') ?? 25),
      }),
    });
  });
}

afterEach(() => {
  cleanup();
  for (const dispose of disposables.splice(0).reverse()) dispose();
});

describe('证券目录的真实分页、已返回规则与账户隔离', () => {
  it('目录分页只有 URL 一个拥有者，子串查询重置第一页，展开不发伪造 detail GET', async () => {
    let detailReads = 0;
    server.use(
      catalogHandler(),
      http.get(`${API}/market/symbols/:symbol`, () => {
        detailReads += 1;
        return HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Mock：没有详情接口' } },
          { status: 404 },
        );
      }),
    );
    const h = services();
    const history = await mount(SecuritiesPage, `/securities?accountId=${READONLY_IDS.accountA}`, h.runtime);
    const user = userEvent.setup();
    expect(await screen.findByRole('button', { name: 'AAPL' })).toBeInTheDocument();
    expect(screen.getByTestId('data-table-total')).toHaveTextContent('共 28 条');
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(26);
    expect(screen.getByTitle(MARKET_FIXTURE_TIME)).toBeInTheDocument();
    expect(screen.getByTitle(MARKET_FIXTURE_EXPIRES)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '证券代码' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'AAPL' }));
    const rules = screen.getByRole('region', { name: 'AAPL 已返回交易规则' });
    expect(within(rules).getByTitle('1.000000000000000001')).toHaveTextContent('1.000000000000000001');
    expect(within(rules).getByText('原始 epoch ms：345427200000')).toBeInTheDocument();
    expect(within(rules).getAllByText('未知（未返回）').length).toBeGreaterThan(0);
    expect(detailReads).toBe(0);
    await user.click(screen.getByRole('button', { name: /下一页|next/i }));
    expect(await screen.findByRole('button', { name: 'SYPR' })).toBeInTheDocument();
    expect(new URL(history.location.href, 'http://localhost').searchParams.get('page')).toBe('2');
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4);
    expect(screen.queryByRole('region', { name: 'AAPL 已返回交易规则' })).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: '证券代码包含' }), ' ms ');
    await user.click(screen.getByRole('button', { name: '查询' }));
    expect(await screen.findByRole('button', { name: 'MSFT' })).toBeInTheDocument();
    expect(screen.getByTestId('data-table-total')).toHaveTextContent('共 1 条');
    expect(new URL(history.location.href, 'http://localhost').searchParams.get('page')).toBe('1');
    expect(new URL(history.location.href, 'http://localhost').searchParams.get('search')).toBe('ms');
  });

  it('越界页为空仍保留真实过滤总数，不把未返回证券当不存在', async () => {
    server.use(catalogHandler());
    const h = services();
    await mount(
      SecuritiesPage,
      `/securities?accountId=${READONLY_IDS.accountA}&search=AAPL&page=4`,
      h.runtime,
    );
    expect(await screen.findByText('这一页没有匹配证券')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-total')).toHaveTextContent('共 1 条');
  });

  it('无账户及非法 URL 不读取目录，ADMIN 仍能读取而不要求 trading 写能力', async () => {
    let reads = 0;
    server.use(
      http.get(`${API}/market/symbols`, () => {
        reads += 1;
        return HttpResponse.json({ data: makeCatalogPage({ search: 'AAPL' }) });
      }),
    );
    const h = services(ADMIN_USER);
    const history = await mount(SecuritiesPage, '/securities?accountId=invalid', h.runtime);
    expect(await screen.findByText(/地址中的筛选或分页参数无效/)).toBeInTheDocument();
    expect(reads).toBe(0);
    await act(async () => {
      history.push('/securities');
    });
    expect(await screen.findByText(/请选择所属账户后读取官方证券目录/)).toBeInTheDocument();
    expect(reads).toBe(0);
    await act(async () => {
      history.push(`/securities?accountId=${READONLY_IDS.otherAccount}`);
    });
    expect(await screen.findByRole('button', { name: 'AAPL' })).toBeInTheDocument();
    expect(reads).toBe(1);
  });

  it('账户改变不占用旧账户 placeholder，慢读取期间旧行和详情立即消失', async () => {
    const pending = gate();
    server.use(
      http.get(`${API}/market/symbols`, async ({ request }) => {
        const accountId = new URL(request.url).searchParams.get('accountId');
        if (accountId === READONLY_IDS.accountB) await pending.promise;
        return HttpResponse.json({
          data: makeCatalogPage({ search: accountId === READONLY_IDS.accountB ? 'MSFT' : 'AAPL' }),
        });
      }),
    );
    const h = services();
    await mount(SecuritiesPage, `/securities?accountId=${READONLY_IDS.accountA}`, h.runtime);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'AAPL' }));
    const account = screen.getByRole('textbox', { name: '账户 ID' });
    await user.clear(account);
    await user.type(account, READONLY_IDS.accountB);
    await user.click(screen.getByRole('button', { name: '查询' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'AAPL' })).not.toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'AAPL 已返回交易规则' })).not.toBeInTheDocument();
    await act(async () => pending.release());
    expect(await screen.findByRole('button', { name: 'MSFT' })).toBeInTheDocument();
  });

  it('读取失败保留旧目录与时间，随后 403 隐藏缓存而不是装空', async () => {
    let failure: 503 | 403 | null = null;
    server.use(
      http.get(`${API}/market/symbols`, () =>
        failure === null
          ? HttpResponse.json({ data: makeCatalogPage({ search: 'AAPL' }) })
          : HttpResponse.json(
              {
                error: {
                  code: failure === 403 ? 'FORBIDDEN' : 'MOCK_UNAVAILABLE',
                  message: failure === 403 ? 'Mock：账户读取已拒绝' : 'Mock：官方目录不可用',
                },
              },
              { status: failure },
            ),
      ),
    );
    const h = services();
    await mount(SecuritiesPage, `/securities?accountId=${READONLY_IDS.accountA}`, h.runtime);
    await screen.findByRole('button', { name: 'AAPL' });
    const user = userEvent.setup();
    failure = 503;
    await user.click(screen.getByRole('button', { name: '重新读取' }));
    expect(await screen.findByText('Mock：官方目录不可用')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AAPL' })).toBeInTheDocument();
    expect(screen.getByTitle(MARKET_FIXTURE_TIME)).toBeInTheDocument();
    failure = 403;
    await user.click(screen.getByRole('button', { name: '重新读取' }));
    expect(await screen.findByText('当前范围不可读取')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'AAPL' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('Hono REST 的消费边界', () => {
  it.each(['financial-number', 'source', 'pagination'] as const)(
    '畸形目录 %s 不进入页面缓存',
    async (kind) => {
      const data = makeCatalogPage({ search: 'AAPL' });
      const item = data.items[0];
      if (!item) throw new Error('目录测试缺少证券');
      const malformed =
        kind === 'financial-number'
          ? { ...data, items: [{ ...item, minQuantity: 0.1 }] }
          : kind === 'source'
            ? { ...data, source: 'LOCAL_GUESS' }
            : { ...data, total: '1' };
      server.use(http.get(`${API}/market/symbols`, () => HttpResponse.json({ data: malformed })));
      await expect(
        readSecurities(
          createRpcApi({ baseUrl: API }),
          { accountId: READONLY_IDS.accountA, page: 1, pageSize: 25 },
          new AbortController().signal,
        ),
      ).rejects.toThrow('只读展示契约');
    },
  );

  it.each(['financial-number', 'symbol', 'source', 'shape'] as const)(
    '畸形 REST 报价 %s 不冒充成功',
    async (kind) => {
      const quote = makeMarketQuote();
      const malformed =
        kind === 'financial-number'
          ? [{ ...quote, bid: 312 }]
          : kind === 'symbol'
            ? [{ ...quote, symbol: 'MSFT' }]
            : kind === 'source'
              ? [{ ...quote, timestampSource: 'EXCHANGE' }]
              : { items: [quote], total: 1 };
      server.use(http.get(`${API}/market/quotes`, () => HttpResponse.json({ data: malformed })));
      await expect(
        readQuotes(
          createRpcApi({ baseUrl: API }),
          { accountId: READONLY_IDS.accountA, symbol: 'AAPL' },
          new AbortController().signal,
        ),
      ).rejects.toThrow('只读展示契约');
    },
  );
});

describe('行情页独立 REST / SSE 来源与时间', () => {
  it('只在应用筛选后读一次 REST/建一个流，open/live 状态无报价不显示盘口，晚 REST 不覆盖新 WS', async () => {
    const pending = gate();
    let reads = 0;
    server.use(
      http.get(`${API}/market/quotes`, async () => {
        reads += 1;
        await pending.promise;
        return HttpResponse.json({
          data: [makeMarketQuote('AAPL', { bid: '999', ask: '1000', timestamp: '2026-11-10T12:00:01.000Z' })],
        });
      }),
    );
    const h = services();
    await mount(MarketPage, `/market?accountId=${READONLY_IDS.accountA}&symbol=AAPL`, h.runtime);
    await waitFor(() => expect(reads).toBe(1));
    await act(async () => {
      h.quoteSource().open();
      h.quoteSource().frame(makeQuoteStatus('live'));
    });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('尚无可展示报价')).toBeInTheDocument();
    await act(async () => h.quoteSource().frame(makeQuoteEvent()));
    expect(screen.getByTitle('312.123456789012345678')).toBeInTheDocument();
    expect(screen.getByText('近期已接收推送 · 仅展示参考')).toBeInTheDocument();
    await act(async () => pending.release());
    await screen.findByText('最后成功 REST 证券');
    expect(screen.getByTitle('312.123456789012345678')).toBeInTheDocument();
    expect(screen.queryByTitle('999')).not.toBeInTheDocument();
    const before = h.sources.filter((source) => source.url.includes('/quote-stream')).length;
    await act(async () => h.quoteSource().frame(makeQuoteStatus('reconnecting', { retryable: true })));
    expect(h.sources.filter((source) => source.url.includes('/quote-stream'))).toHaveLength(before);
    expect(screen.getByText('非实时 · 最后取得的报价')).toBeInTheDocument();
    await act(async () =>
      h.quoteSource().frame(makeQuoteStatus('unavailable', { code: 'ACCOUNT_CHANGED', retryable: false })),
    );
    expect(h.quoteSource().closed).toBe(true);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('订阅已终止')).toBeInTheDocument();
  });

  it('REST 单行无假分页；小数、nullable、历史 UTC 原文与未知交易所时间保持分离', async () => {
    const historical = '2026-11-10T12:00:00.123456789Z';
    server.use(
      http.get(`${API}/market/quotes`, () =>
        HttpResponse.json({
          data: [
            makeMarketQuote('AAPL', {
              timestamp: historical,
            }),
          ],
        }),
      ),
    );
    const h = services(ADMIN_USER);
    await mount(MarketPage, `/market?accountId=${READONLY_IDS.otherAccount}&symbol=AAPL`, h.runtime);
    const table = await screen.findByRole('table');
    expect(within(table).getByTitle('312.123456789012345678')).toBeInTheDocument();
    expect(within(table).getByText('未知')).toBeInTheDocument();
    expect(within(table).getByText('UNKNOWN')).toBeInTheDocument();
    expect(screen.getAllByText(historical).length).toBeGreaterThan(0);
    expect(screen.getAllByText('未知（未提供）')).toHaveLength(2);
    expect(screen.getByText('非实时 · 最后取得的报价')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /下一页|next/i })).not.toBeInTheDocument();
    expect(screen.getByText(/不是后端交易 TTL/)).toBeInTheDocument();
  });

  it('市场页未应用的代码草稿不请求，切换账户关闭旧流并清旧盘口', async () => {
    const pending = gate();
    let reads = 0;
    server.use(
      http.get(`${API}/market/quotes`, async ({ request }) => {
        reads += 1;
        const params = new URL(request.url).searchParams;
        if (params.get('accountId') === READONLY_IDS.accountB) await pending.promise;
        return HttpResponse.json({ data: [makeMarketQuote(params.get('symbol') ?? 'AAPL')] });
      }),
    );
    const h = services();
    await mount(MarketPage, `/market?accountId=${READONLY_IDS.accountA}&symbol=AAPL`, h.runtime);
    await screen.findByRole('table');
    const old = h.quoteSource();
    const user = userEvent.setup();
    const symbol = screen.getByRole('textbox', { name: '证券代码' });
    await user.clear(symbol);
    await user.type(symbol, ' msft ');
    expect(reads).toBe(1);
    const account = screen.getByRole('textbox', { name: '账户 ID' });
    await user.clear(account);
    await user.type(account, READONLY_IDS.accountB);
    await user.click(screen.getByRole('button', { name: '查询' }));
    await waitFor(() => expect(old.closed).toBe(true));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(new URL(h.quoteSource().url).searchParams.get('symbol')).toBe('MSFT');
    await act(async () => pending.release());
    expect(await screen.findByRole('table')).toHaveTextContent('MSFT');
    expect(h.sources.filter((source) => source.url.includes('/quote-stream') && !source.closed)).toHaveLength(
      1,
    );
  });

  it('业务 accounts 通知只重读 REST，不产生价格或第二报价源', async () => {
    let reads = 0;
    server.use(
      http.get(`${API}/market/quotes`, () => {
        reads += 1;
        return HttpResponse.json({ data: [makeMarketQuote()] });
      }),
    );
    const h = services();
    await mount(MarketPage, `/market?accountId=${READONLY_IDS.accountA}&symbol=AAPL`, h.runtime);
    await screen.findByRole('table');
    const quoteSource = h.quoteSource();
    await act(async () => h.businessSource().frame({ kind: 'refresh', resources: ['accounts'] }));
    await waitFor(() => expect(reads).toBeGreaterThan(1));
    expect(h.quoteSource()).toBe(quoteSource);
    expect(h.runtime.market.getSnapshot().quote).toBeNull();
    expect(screen.getByText('非实时 · 最后取得的报价')).toBeInTheDocument();
  });
});
