import { QueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw/http';
import type { FunctionComponent } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { type AppServices, createAppServices } from '@/app/runtime';
import type { AuthUser } from '@/features/auth/types';
import { LedgerPage } from '@/features/ledger/page';
import { OperationDetailPage } from '@/features/operations/detail-page';
import { OperationsPage } from '@/features/operations/page';
import { operationKeys } from '@/features/operations/query-keys';
import { ReconciliationsPage } from '@/features/reconciliations/page';
import type { ApiOutcome } from '@/services/api/types';
import type { BusinessEventSource } from '@/services/realtime/manager';
import { ADMIN_USER, AUTH_DATA, TRADER_USER } from '../msw/auth-fixtures';
import { READONLY_IDS } from '../msw/readonly/ids';
import {
  LEDGER_RECONCILE_OPERATION_TIME,
  makeBusinessEvent,
  makeLedgerEntry,
  makeOperationReceipt,
  READONLY_OPERATIONS,
  READONLY_RECONCILIATIONS,
  readonlyBusinessEventsPage,
  readonlyLedgerPage,
} from '../msw/readonly/ledger-reconcile-operations';
import { server } from '../msw/server';

const BASE = 'http://localhost/api/v1';
const runtimes: AppServices[] = [];
const histories: RouterHistory[] = [];

function success<T>(data: T): ApiOutcome<T> {
  return {
    kind: 'success',
    status: 200,
    data,
    receipt: { kind: 'absent' },
    requestId: 'mock-readonly',
    sessionEpoch: 0,
  };
}

class MockSource implements BusinessEventSource {
  onopen: BusinessEventSource['onopen'] = null;
  onmessage: BusinessEventSource['onmessage'] = null;
  onerror: BusinessEventSource['onerror'] = null;
  close(): void {}
}

async function mount(Page: FunctionComponent, path: string, href: string, user: AuthUser = TRADER_USER) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });
  const authData = { ...AUTH_DATA, user };
  const runtime = createAppServices({
    baseUrl: BASE,
    queryClient,
    authApi: {
      me: async () => success(authData),
      login: async () => success(authData),
      logout: async () => success({ loggedOut: true as const }),
    },
    broadcastFactory: () => null,
    createEventSource: () => new MockSource(),
  });
  const history = createMemoryHistory({ initialEntries: [href] });
  const root = createRootRoute({ component: Outlet });
  const route = createRoute({ getParentRoute: () => root, path, component: Page });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history,
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  });
  await router.load();
  runtimes.push(runtime);
  histories.push(history);
  render(
    <AppProviders services={runtime}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { runtime, history, router };
}

function ledgerHandler() {
  return http.get(`${BASE}/ledger`, ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json({
      data: readonlyLedgerPage(
        Number(url.searchParams.get('page') ?? 1),
        Number(url.searchParams.get('pageSize') ?? 25),
      ),
    });
  });
}

function eventHandler() {
  return http.get(`${BASE}/logs`, ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json({
      data: readonlyBusinessEventsPage(
        Number(url.searchParams.get('page') ?? 1),
        Number(url.searchParams.get('pageSize') ?? 25),
      ),
    });
  });
}

afterEach(() => {
  cleanup();
  for (const runtime of runtimes.splice(0)) {
    runtime.businessSync.stop();
    runtime.convergence.stop();
    runtime.session.stop();
    runtime.queryClient.clear();
  }
  for (const history of histories.splice(0)) history.destroy();
});

describe('资金流水：服务端分页、原金额和本地来源', () => {
  it('不丢失超安全整数的负金额，币种分开、未知余额不补零，详情只使用已加载行', async () => {
    let detailReads = 0;
    server.use(
      ledgerHandler(),
      http.get(`${BASE}/ledger/:id`, () => {
        detailReads += 1;
        return new HttpResponse(null, { status: 404 });
      }),
    );
    await mount(LedgerPage, '/ledger', '/ledger?page=1&pageSize=10');
    const amount = makeLedgerEntry().amount;
    const shown = await screen.findByTitle(amount);
    expect(shown.textContent?.replaceAll(',', '')).toBe(amount);
    expect(screen.getByRole('table')).toHaveTextContent('USD');
    expect(screen.getByRole('table')).toHaveTextContent('USDC');
    const release = within(screen.getByRole('table'))
      .getAllByRole('row')
      .find((row) => row.textContent?.includes('本地卖出预占释放'));
    expect(release).toBeDefined();
    expect(release?.textContent).toContain('未知');
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: new RegExp(`查看流水 ${READONLY_IDS.ledger}`) }));
    const detail = screen.getByRole('region', { name: '已加载流水详情' });
    expect(within(detail).getAllByText(amount).length).toBeGreaterThan(0);
    expect(detail).toHaveTextContent('未知；不能累计流水补造余额');
    expect(detail).toHaveTextContent(LEDGER_RECONCILE_OPERATION_TIME);
    expect(within(detail).getByRole('link', { name: READONLY_IDS.order })).toHaveAttribute(
      'href',
      `/orders/${READONLY_IDS.order}`,
    );
    expect(detailReads).toBe(0);
    expect(screen.getByTestId('data-table-total')).toHaveTextContent('共 11 条');
  });

  it('金融 number 使读取失败而不是格式化成看似正确的钱，错误只含字段路径', async () => {
    server.use(
      http.get(`${BASE}/ledger`, () =>
        HttpResponse.json({
          data: {
            ...readonlyLedgerPage(),
            items: [
              { ...makeLedgerEntry(), amount: 9007199254740992, secret: 'mock-private-must-not-render' },
            ],
          },
        }),
      ),
    );
    await mount(LedgerPage, '/ledger', '/ledger');
    expect(await screen.findByText(/服务端数据无法按只读展示契约解释/)).toHaveTextContent('items.0.amount');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('mock-private-must-not-render');
  });

  it('真实翻页更新 URL；应用类型和原串证券重置第一页，不私自大写 symbol', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(`${BASE}/ledger`, ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        const data = readonlyLedgerPage(
          Number(url.searchParams.get('page') ?? 1),
          Number(url.searchParams.get('pageSize') ?? 10),
        );
        return HttpResponse.json({
          data: url.searchParams.get('symbol') === 'aapl' ? { ...data, items: [], total: 0 } : data,
        });
      }),
    );
    const { history } = await mount(
      LedgerPage,
      '/ledger',
      `/ledger?accountId=${READONLY_IDS.accountA}&page=1&pageSize=10`,
    );
    await screen.findByText('共 11 条');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /next|下一页/i }));
    await waitFor(() =>
      expect(new URL(history.location.href, 'http://localhost').searchParams.get('page')).toBe('2'),
    );
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2));
    await user.type(screen.getByRole('textbox', { name: '流水类型（status 参数）' }), 'TRADE_BUY');
    await user.type(screen.getByRole('textbox', { name: '关联订单证券（原串精确匹配）' }), 'aapl');
    await user.click(screen.getByRole('button', { name: '查询' }));
    await screen.findByText('当前筛选没有返回流水');
    const applied = requests.at(-1);
    expect(applied?.searchParams.get('status')).toBe('TRADE_BUY');
    expect(applied?.searchParams.get('symbol')).toBe('aapl');
    expect(applied?.searchParams.get('accountId')).toBe(READONLY_IDS.accountA);
    expect(applied?.searchParams.get('page')).toBe('1');
    expect(applied?.searchParams.has('sort')).toBe(false);
  });

  it('切换到账户 B 时不借用账户 A 的金融数据或详情作为占位', async () => {
    let release: () => void = () => {
      throw new Error('Mock gate 未初始化');
    };
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let readB = false;
    server.use(
      http.get(`${BASE}/ledger`, async ({ request }) => {
        const accountId = new URL(request.url).searchParams.get('accountId');
        if (accountId === READONLY_IDS.accountB) {
          readB = true;
          await gate;
        }
        const entry =
          accountId === READONLY_IDS.accountB
            ? makeLedgerEntry({
                id: '60000000-0000-4000-8000-000000000099',
                exchangeAccountId: READONLY_IDS.accountB,
                amount: '7.000000000000000001',
                description: 'Mock · 账户 B 独立流水',
              })
            : makeLedgerEntry({ description: 'Mock · 账户 A 独立流水' });
        return HttpResponse.json({
          data: { items: [entry], total: 1, page: 1, pageSize: 25, source: 'LOCAL_LEDGER' },
        });
      }),
    );
    const { router } = await mount(LedgerPage, '/ledger', `/ledger?accountId=${READONLY_IDS.accountA}`);
    await screen.findByText('Mock · 账户 A 独立流水');
    await act(async () => {
      await router.navigate({ href: `/ledger?accountId=${READONLY_IDS.accountB}` });
    });
    await waitFor(() => expect(readB).toBe(true));
    expect(screen.queryByText('Mock · 账户 A 独立流水')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    act(() => release());
    await screen.findByText('Mock · 账户 B 独立流水');
    expect(screen.getByTitle('7.000000000000000001')).toBeInTheDocument();
  });
});

describe('核对记录：未分页数组和部分证据', () => {
  it('忽略不生效的 symbol/search/page 地址参数，不制造分页或历史截止时间', async () => {
    let query: URL | undefined;
    server.use(
      http.get(`${BASE}/reconciliations`, ({ request }) => {
        query = new URL(request.url);
        return HttpResponse.json({ data: READONLY_RECONCILIATIONS });
      }),
    );
    await mount(
      ReconciliationsPage,
      '/reconciliations',
      `/reconciliations?accountId=${READONLY_IDS.accountA}&symbol=AAPL&search=ignored&page=99&pageSize=1`,
    );
    await screen.findByText('已返回 3 条');
    expect(screen.queryByRole('button', { name: /next|下一页/i })).not.toBeInTheDocument();
    expect(query?.searchParams.get('accountId')).toBe(READONLY_IDS.accountA);
    for (const key of ['symbol', 'search', 'page', 'pageSize'])
      expect(query?.searchParams.has(key)).toBe(false);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: new RegExp(`查看核对记录 ${READONLY_IDS.reconciliation}`) }));
    const detail = screen.getByRole('region', { name: '已加载核对记录详情' });
    expect(detail).toHaveTextContent('PARTIAL');
    expect(detail).toHaveTextContent('完整官方持仓和现金结算仍未核实');
    expect(detail).toHaveTextContent('记录未保存 historyTo，不能用创建时间替代');
    expect(detail).toHaveTextContent('BINANCE_WALLET');
    expect(detail).toHaveTextContent('42.123456789012345678');
    expect(within(detail).getAllByText('未知').length).toBeGreaterThan(0);
    expect(within(detail).queryByText('记录更新时间')).not.toBeInTheDocument();
  });

  it('显示 historyError/walletError 和真实差异 ID；官方订单 ID 不伪装本地详情', async () => {
    server.use(
      http.get(`${BASE}/reconciliations`, () => HttpResponse.json({ data: READONLY_RECONCILIATIONS })),
    );
    await mount(ReconciliationsPage, '/reconciliations', '/reconciliations');
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: /查看核对记录 70000000-0000-4000-8000-000000000002/ }),
    );
    let detail = screen.getByRole('region', { name: '已加载核对记录详情' });
    expect(detail).toHaveTextContent('UNAVAILABLE');
    expect(detail).toHaveTextContent('Mock · Funding 读取失败');
    expect(detail).toHaveTextContent('Mock · 官方历史第一页失败');
    expect(detail).toHaveTextContent('本记录没有 Funding 快照，不能补零');
    await user.click(
      screen.getByRole('button', { name: /查看核对记录 70000000-0000-4000-8000-000000000003/ }),
    );
    detail = screen.getByRole('region', { name: '已加载核对记录详情' });
    expect(detail).toHaveTextContent('DIFFERENCE');
    expect(within(detail).getByRole('link', { name: READONLY_IDS.order })).toHaveAttribute(
      'href',
      `/orders/${READONLY_IDS.order}`,
    );
    expect(within(detail).getByText('EXTERNAL-ORDER-17')).toBeInTheDocument();
    expect(within(detail).queryByRole('link', { name: 'EXTERNAL-ORDER-17' })).not.toBeInTheDocument();
  });
});

describe('操作回执与业务事件：身份未知和有限历史', () => {
  it('回执列表无 query/分页；/logs 独立真实分页，不把事件筛选应用到回执', async () => {
    const receiptQueries: string[] = [];
    const eventQueries: URL[] = [];
    server.use(
      http.get(`${BASE}/operations`, ({ request }) => {
        receiptQueries.push(new URL(request.url).search);
        return HttpResponse.json({ data: READONLY_OPERATIONS });
      }),
      http.get(`${BASE}/logs`, ({ request }) => {
        const url = new URL(request.url);
        eventQueries.push(url);
        return HttpResponse.json({
          data: readonlyBusinessEventsPage(
            Number(url.searchParams.get('page') ?? 1),
            Number(url.searchParams.get('pageSize') ?? 10),
          ),
        });
      }),
    );
    await mount(OperationsPage, '/operations', '/operations?status=STATE&page=2&pageSize=10');
    const receipts = screen.getByRole('region', { name: '未解决扫描回执' });
    await within(receipts).findByText('已返回 2 条');
    expect(within(receipts).queryByRole('button', { name: /next|下一页/i })).not.toBeInTheDocument();
    expect(receipts).toHaveTextContent('SUCCEEDED');
    expect(receipts).toHaveTextContent('未知（未关联独立原身份）');
    expect(receipts).toHaveTextContent('不是完整未解决集合或终态历史');
    expect(receiptQueries).toEqual(['']);
    const events = screen.getByRole('region', { name: '业务事件分页查询' });
    await within(events).findByText('共 11 条');
    expect(within(events).getByRole('table')).toHaveTextContent('Mock · 任务历史业务事件 10');
    expect(within(events).getByRole('button', { name: /previous|上一页/i })).toBeEnabled();
    expect(eventQueries.at(-1)?.searchParams.get('status')).toBe('STATE');
    expect(eventQueries.at(-1)?.searchParams.get('page')).toBe('2');
  });

  it('从 GET data 解析 SUCCEEDED，但原意图仍未知；白名单外的 result/input/secret 不入 UI 或缓存', async () => {
    const secret = 'mock-private-original-input';
    let writes = 0;
    server.use(
      http.get(`${BASE}/operations/:id`, () =>
        HttpResponse.json({
          data: makeOperationReceipt({
            result: {
              status: 'PARTIAL',
              details: { source: 'BINANCE_STOCKS', note: 'Mock · 完整现金尚未核实' },
              input: { secret },
              apiSecret: secret,
            },
          }),
        }),
      ),
      http.post(`${BASE}/operations/:id/reconcile`, () => {
        writes += 1;
        return HttpResponse.json({ data: makeOperationReceipt() });
      }),
    );
    const { runtime } = await mount(
      OperationDetailPage,
      '/operations/$id',
      `/operations/${READONLY_IDS.operation}`,
    );
    await screen.findByText('SUCCEEDED');
    expect(screen.getByText('本客户端原意图：未知（未关联）')).toBeInTheDocument();
    expect(screen.getByText('PARTIAL')).toBeInTheDocument();
    expect(document.body).toHaveTextContent('没有发送前独立保存的完整原请求身份');
    expect(document.body).toHaveTextContent('服务端操作者 UUID');
    expect(document.body).toHaveTextContent(ADMIN_USER.id);
    expect(document.body).not.toHaveTextContent(secret);
    const data = runtime.queryClient.getQueryData(
      operationKeys.detail(
        { epoch: runtime.session.getSnapshot().epoch, user: TRADER_USER },
        READONLY_IDS.operation,
      ),
    );
    expect(JSON.stringify(data)).not.toContain(secret);
    expect(JSON.stringify(data)).not.toContain('"raw"');
    expect(writes).toBe(0);
    expect(screen.queryByRole('button', { name: /恢复|主动核对|重试提交/ })).not.toBeInTheDocument();
  });

  it.each([
    {
      name: 'invalid',
      data: { ...makeOperationReceipt(), kind: 'FUTURE_KIND', secret: 'mock-invalid-raw-secret' },
      expected: '回执无法验证（invalid）',
    },
    { name: 'absent', data: null, expected: 'GET data 未提供回执' },
  ])('保留 $name 三态，不把读取成功变成 applied', async ({ data, expected }) => {
    server.use(http.get(`${BASE}/operations/:id`, () => HttpResponse.json({ data })));
    const { runtime } = await mount(
      OperationDetailPage,
      '/operations/$id',
      `/operations/${READONLY_IDS.operation}`,
    );
    await screen.findByText(expected);
    expect(document.body).not.toHaveTextContent('mock-invalid-raw-secret');
    expect(screen.queryByText('SUCCEEDED')).not.toBeInTheDocument();
    expect(
      JSON.stringify(
        runtime.queryClient
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain('mock-invalid-raw-secret');
  });

  it('仅 UUID 或错配响应不能制造完整原身份；错误 UUID 不发请求', async () => {
    let requests = 0;
    server.use(
      http.get(`${BASE}/operations/:id`, () => {
        requests += 1;
        return HttpResponse.json({ data: makeOperationReceipt() });
      }),
    );
    await mount(OperationDetailPage, '/operations/$id', '/operations/not-a-uuid');
    await screen.findByText('操作标识必须为有效 UUID；未发起读取');
    expect(requests).toBe(0);
  });

  it('GET 返回不同 UUID 的回执为 invalid，而不是拿该回执自建 expected', async () => {
    server.use(
      http.get(`${BASE}/operations/:id`, () =>
        HttpResponse.json({ data: makeOperationReceipt({ id: '80000000-0000-4000-8000-000000000099' }) }),
      ),
    );
    await mount(OperationDetailPage, '/operations/$id', `/operations/${READONLY_IDS.operation}`);
    await screen.findByText('回执无法验证（invalid）');
    expect(screen.queryByText('SUCCEEDED')).not.toBeInTheDocument();
  });

  it('服务端 SUCCEEDED 的 ACCOUNT_CHECK 仍可报告连接 ERROR 和钱包失败', async () => {
    server.use(
      http.get(`${BASE}/operations/:id`, () =>
        HttpResponse.json({
          data: makeOperationReceipt({
            kind: 'ACCOUNT_CHECK',
            outcome: 'CONTROL_APPLIED',
            result: {
              status: 'ACTIVE',
              connectionStatus: 'ERROR',
              connectionMessage: 'Mock · 官方连接检查失败',
              walletSyncError: 'Mock · 资金读取失败已保存',
              assetsAvailable: false,
            },
          }),
        }),
      ),
    );
    await mount(OperationDetailPage, '/operations/$id', `/operations/${READONLY_IDS.operation}`);
    await screen.findByText('SUCCEEDED');
    const result = screen.getByRole('region', { name: '服务端结果投影' });
    expect(within(result).getByText('ACTIVE')).toBeInTheDocument();
    expect(within(result).getByText('ERROR')).toBeInTheDocument();
    expect(result).toHaveTextContent('Mock · 官方连接检查失败');
    expect(result).toHaveTextContent('Mock · 资金读取失败已保存');
    expect(screen.getByText('本客户端原意图：未知（未关联）')).toBeInTheDocument();
  });

  it('重新读取 404 隐藏先前回执，不把未取得记录当作原意图未执行', async () => {
    let denied = false;
    server.use(
      http.get(`${BASE}/operations/:id`, () =>
        denied
          ? HttpResponse.json(
              {
                error: {
                  code: 'OPERATION_NOT_FOUND',
                  message: 'Mock · 未取得记录，不能据此解除未知保护',
                  requestId: 'mock-denied',
                },
              },
              { status: 404 },
            )
          : HttpResponse.json({ data: makeOperationReceipt() }),
      ),
    );
    await mount(OperationDetailPage, '/operations/$id', `/operations/${READONLY_IDS.operation}`);
    await screen.findByText('SUCCEEDED');
    denied = true;
    await userEvent.setup().click(screen.getByRole('button', { name: '重新读取' }));
    await screen.findByText('当前范围不可读取');
    expect(screen.queryByText('SUCCEEDED')).not.toBeInTheDocument();
    expect(document.body).toHaveTextContent('不能据此解除未知保护');
  });

  it('任务资源变化重读三源事件与关联回执；管理员使用 workspace 读权限而非交易写权限', async () => {
    let message = 'Mock · 初始任务业务事件';
    let receiptReads = 0;
    let eventReads = 0;
    server.use(
      http.get(`${BASE}/operations`, () => {
        receiptReads += 1;
        return HttpResponse.json({ data: READONLY_OPERATIONS });
      }),
      http.get(`${BASE}/logs`, () => {
        eventReads += 1;
        return HttpResponse.json({
          data: {
            items: [makeBusinessEvent({ resourceType: 'TASK', resourceId: READONLY_IDS.task, message })],
            total: 1,
            page: 1,
            pageSize: 25,
          },
        });
      }),
    );
    const { runtime } = await mount(OperationsPage, '/operations', '/operations', ADMIN_USER);
    await screen.findByText(message);
    await screen.findByText('已返回 2 条');
    message = 'Mock · 通知后取得的新任务业务事件';
    act(() => runtime.convergence.refresh(['tasks']));
    await screen.findByText(message);
    await waitFor(() => expect(receiptReads).toBe(2));
    expect(eventReads).toBe(2);
  });

  it('无效回执数组项保持 invalid 行而不是丢弃成空列表，业务事件仍可独立读取', async () => {
    server.use(
      http.get(`${BASE}/operations`, () =>
        HttpResponse.json({
          data: [{ ...makeOperationReceipt(), status: 'UNRECOGNIZED', secret: 'mock-list-secret' }, null],
        }),
      ),
      eventHandler(),
    );
    await mount(OperationsPage, '/operations', '/operations');
    const receipts = screen.getByRole('region', { name: '未解决扫描回执' });
    await within(receipts).findByText('已返回 2 条');
    expect(receipts).toHaveTextContent('invalid · 回执无法验证');
    expect(receipts).toHaveTextContent('absent · 未提供回执');
    expect(receipts).not.toHaveTextContent('mock-list-secret');
    await screen.findByText('共 11 条');
  });
});
