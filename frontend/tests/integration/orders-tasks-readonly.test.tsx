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
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { type AppServices, createAppServices } from '@/app/runtime';
import type { AuthUser } from '@/features/auth/types';
import { readOrder, readOrders } from '@/features/orders/api';
import { OrderDetailPage } from '@/features/orders/detail-page';
import { OrdersPage } from '@/features/orders/page';
import { orderKeys } from '@/features/orders/query-keys';
import { orderDetailSchema, orderSearchSchema, orderViewSchema } from '@/features/orders/schemas';
import { readTasks } from '@/features/tasks/api';
import { TaskDetailPage } from '@/features/tasks/detail-page';
import { TasksPage } from '@/features/tasks/page';
import { taskKeys } from '@/features/tasks/query-keys';
import { taskConfigSchema, taskDetailSchema, taskSearchSchema } from '@/features/tasks/schemas';
import { createRpcApi } from '@/services/api/rpc';
import type { BusinessEventSource } from '@/services/realtime/manager';
import { ADMIN_USER, TRADER_USER } from '../msw/auth-fixtures';
import { API } from '../msw/handlers';
import { READONLY_IDS } from '../msw/readonly/ids';
import {
  HISTORICAL_SCHEDULED_START,
  LAST_INTERRUPTION_FIXTURE,
  MARKET_BUY_ORDER_FIXTURE,
  MARKET_BUY_TASK_FIXTURE,
  MARKET_SELL_ORDER_FIXTURE,
  MARKET_SELL_TASK_FIXTURE,
  ORDER_DETAIL_FIXTURE,
  ORDER_DETAILS,
  ORDER_FIXTURE,
  ORDER_MARKET_BUY_ID,
  ORDER_MARKET_SELL_ID,
  ordersPageFixture,
  READONLY_ORDERS,
  READONLY_TASKS,
  TASK_DETAIL_FIXTURE,
  TASK_DETAILS,
  TASK_MARKET_BUY_ID,
  TASK_MARKET_SELL_ID,
  tasksPageFixture,
} from '../msw/readonly/orders-tasks';
import { server } from '../msw/server';

class ReadonlySource implements BusinessEventSource {
  onopen: BusinessEventSource['onopen'] = null;
  onmessage: BusinessEventSource['onmessage'] = null;
  onerror: BusinessEventSource['onerror'] = null;
  close() {}
}

const disposables: AppServices[] = [];
const histories: RouterHistory[] = [];
const signal = () => new AbortController().signal;
const notFound = () =>
  HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Mock：未取得记录' } }, { status: 404 });

function installReads(user: AuthUser = TRADER_USER) {
  const calls: URL[] = [];
  function allowedOwner(params: URLSearchParams) {
    return user.role === 'ADMIN' || !params.get('ownerUserId') || params.get('ownerUserId') === user.id;
  }
  server.use(
    http.get(`${API}/auth/me`, () => HttpResponse.json({ data: { user, csrfToken: 't'.repeat(43) } })),
    http.get(`${API}/orders`, ({ request }) => {
      const url = new URL(request.url);
      calls.push(url);
      if (!allowedOwner(url.searchParams))
        return HttpResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Mock：无权查询其他所有者' } },
          { status: 403 },
        );
      const rows =
        user.role === 'ADMIN'
          ? READONLY_ORDERS
          : READONLY_ORDERS.filter((row) => row.ownerUserId === user.id);
      return HttpResponse.json({ data: ordersPageFixture(url.searchParams, rows) });
    }),
    http.get(`${API}/tasks`, ({ request }) => {
      const url = new URL(request.url);
      calls.push(url);
      if (!allowedOwner(url.searchParams))
        return HttpResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Mock：无权查询其他所有者' } },
          { status: 403 },
        );
      const rows =
        user.role === 'ADMIN' ? READONLY_TASKS : READONLY_TASKS.filter((row) => row.ownerUserId === user.id);
      return HttpResponse.json({ data: tasksPageFixture(url.searchParams, rows) });
    }),
    http.get(`${API}/orders/:id`, ({ params, request }) => {
      calls.push(new URL(request.url));
      const data = ORDER_DETAILS[String(params.id)];
      return data && (user.role === 'ADMIN' || data.order.ownerUserId === user.id)
        ? HttpResponse.json({ data })
        : notFound();
    }),
    http.get(`${API}/tasks/:id`, ({ params, request }) => {
      calls.push(new URL(request.url));
      const data = TASK_DETAILS[String(params.id)];
      return data && (user.role === 'ADMIN' || data.task.ownerUserId === user.id)
        ? HttpResponse.json({ data })
        : notFound();
    }),
  );
  return calls;
}

async function mount(href: string) {
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
  const services = createAppServices({
    baseUrl: API,
    queryClient,
    broadcastFactory: () => null,
    createEventSource: () => new ReadonlySource(),
  });
  disposables.push(services);
  const history = createMemoryHistory({ initialEntries: [href] });
  histories.push(history);
  const root = createRootRoute({ component: Outlet });
  const routes = [
    createRoute({ getParentRoute: () => root, path: '/orders', component: OrdersPage }),
    createRoute({ getParentRoute: () => root, path: '/orders/$id', component: OrderDetailPage }),
    createRoute({ getParentRoute: () => root, path: '/tasks', component: TasksPage }),
    createRoute({ getParentRoute: () => root, path: '/tasks/$id', component: TaskDetailPage }),
  ];
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history,
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  });
  await router.load();
  render(
    <AppProviders services={services}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  await waitFor(() => expect(services.session.getSnapshot().status).toBe('authenticated'));
  return { services, history, router };
}

afterEach(() => {
  cleanup();
  for (const services of disposables.splice(0)) services.queryClient.clear();
  for (const history of histories.splice(0)) history.destroy();
  vi.restoreAllMocks();
});

describe('真实订单／任务读取契约与金额边界', () => {
  it('公开 F 原串过滤与真实分页走同一 RPC，未知侧向／排序参数不产生能力', async () => {
    const calls = installReads();
    const rpc = createRpcApi({ baseUrl: API });
    const search = orderSearchSchema.parse({
      accountId: READONLY_IDS.accountA,
      symbol: ' aapl ',
      status: 'FILLED',
      search: '%_\\',
      page: 2,
      pageSize: 1,
      side: 'SELL',
      sort: 'price',
    });
    const data = await readOrders(rpc, search, signal());
    expect(data).toMatchObject({ source: 'LOCAL_LEDGER', total: 0, items: [], page: 2, pageSize: 1 });
    expect(calls[0]?.searchParams.get('symbol')).toBe(' aapl ');
    expect(calls[0]?.searchParams.get('search')).toBe('%_\\');
    expect(calls[0]?.searchParams.has('side')).toBe(false);
    expect(calls[0]?.searchParams.has('sort')).toBe(false);
    const tasks = await readTasks(
      rpc,
      taskSearchSchema.parse({ symbol: 'MSFT', status: 'RUNNING', pageSize: 1 }),
      signal(),
    );
    expect(tasks.items.map((task) => task.id)).toEqual([TASK_MARKET_BUY_ID]);
    expect(tasks.total).toBe(1);
  });

  it('LIMIT／MARKET BUY／MARKET SELL 保留各自 null 字段、费用币种及十八位金额，不以 number 接收金额', () => {
    expect(orderViewSchema.parse(MARKET_BUY_ORDER_FIXTURE)).toMatchObject({
      price: null,
      quantity: null,
      notional: '125.123456789012345678',
      fee: '0.010000000000000001',
      feeCurrency: 'USD',
      tradingSession: null,
    });
    expect(orderViewSchema.parse(MARKET_SELL_ORDER_FIXTURE)).toMatchObject({
      price: null,
      notional: null,
      quantity: '1.0000000001',
      quoteCurrency: null,
      fee: null,
      feeCurrency: null,
    });
    expect(orderViewSchema.safeParse({ ...ORDER_FIXTURE, filledNotional: 200.01 }).success).toBe(false);
    expect(orderViewSchema.safeParse({ ...MARKET_BUY_ORDER_FIXTURE, quantity: '1' }).success).toBe(false);
    expect(orderViewSchema.safeParse({ ...MARKET_SELL_ORDER_FIXTURE, tradingSession: 'RTH' }).success).toBe(
      false,
    );
    expect(orderViewSchema.safeParse({ ...ORDER_FIXTURE, feeCurrency: 'USD' }).success).toBe(false);
    expect(orderDetailSchema.parse(ORDER_DETAIL_FIXTURE).trades[0]?.fee).toBeNull();
  });

  it('历史 config 原时间九位保留，与顶层毫秒辅助值分开；市价配置不接受限价字段混入', () => {
    const detail = taskDetailSchema.parse(TASK_DETAIL_FIXTURE);
    expect(detail.task.config.scheduledStartAt).toBe(HISTORICAL_SCHEDULED_START);
    expect(detail.task.scheduledStartAt).toBe('2026-11-10T08:00:00.123Z');
    expect(detail.task.status).toBe('EXPIRED');
    expect(detail.lastInterruption?.status).toBe('PAUSED');
    expect(taskConfigSchema.parse(MARKET_BUY_TASK_FIXTURE.config)).not.toHaveProperty('targetQuantity');
    expect(taskConfigSchema.parse(MARKET_SELL_TASK_FIXTURE.config)).not.toHaveProperty('targetNotional');
    expect(
      taskConfigSchema.safeParse({ ...MARKET_BUY_TASK_FIXTURE.config, fixedPrice: '10.00' }).success,
    ).toBe(false);
    expect(
      taskConfigSchema.safeParse({ ...MARKET_BUY_TASK_FIXTURE.config, fixedNotional: 125 }).success,
    ).toBe(false);
  });

  it('畸形金额经 MSW 在读取边界拒绝，错误不暴露完整响应内容', async () => {
    server.use(
      http.get(`${API}/orders/:id`, () =>
        HttpResponse.json({
          data: {
            ...ORDER_DETAIL_FIXTURE,
            order: { ...ORDER_FIXTURE, fee: 1.1, requestHash: 'mock-sensitive-payload-never-render' },
          },
        }),
      ),
    );
    const rpc = createRpcApi({ baseUrl: API });
    const failed = readOrder(rpc, READONLY_IDS.order, signal());
    await expect(failed).rejects.toThrow('order.fee');
    await expect(failed).rejects.not.toThrow('mock-sensitive-payload-never-render');
  });

  it('keys 隔离会话、所有者、账户及完整有效筛选，详情不冒认账户', () => {
    const first = { epoch: 3, user: TRADER_USER };
    const search = orderSearchSchema.parse({ accountId: READONLY_IDS.accountA });
    expect(orderKeys.list(first, search)).not.toEqual(
      orderKeys.list({ epoch: 4, user: TRADER_USER }, search),
    );
    expect(orderKeys.list(first, search)).not.toEqual(orderKeys.list({ epoch: 3, user: ADMIN_USER }, search));
    expect(orderKeys.list(first, search)).not.toEqual(
      orderKeys.list(first, { ...search, accountId: READONLY_IDS.accountB }),
    );
    expect(orderKeys.list(first, search)).not.toEqual(orderKeys.list(first, { ...search, symbol: 'aapl' }));
    expect(orderKeys.detail(first, READONLY_IDS.order)).toEqual([
      'session',
      3,
      TRADER_USER.id,
      null,
      'orders',
      'detail',
      READONLY_IDS.order,
    ]);
    expect(taskKeys.detail({ epoch: 3, user: null }, null)[2]).toBeNull();
  });
});

describe('订单与任务领域页面', () => {
  it.each([TRADER_USER, ADMIN_USER])(
    '%s 普通只读详情可用；FILLED 与费用／预留／操作历史分开',
    async (user) => {
      const calls = installReads(user);
      await mount(`/orders/${READONLY_IDS.order}`);
      const identity = await screen.findByRole('region', { name: '订单身份与有效委托' });
      expect(within(identity).getByText(ORDER_FIXTURE.clientOrderId)).toBeInTheDocument();
      expect(within(identity).getByText(ORDER_FIXTURE.exchangeOrderId)).toBeInTheDocument();
      expect(within(identity).getByText(ORDER_FIXTURE.idempotencyKey)).toBeInTheDocument();
      const evidence = screen.getByRole('region', { name: '成交、费用与核对证据' });
      expect(within(evidence).getByText('FILLED')).toBeInTheDocument();
      expect(within(evidence).getByText('false · 最终费用未确认')).toBeInTheDocument();
      expect(within(evidence).getByText('false · 本地预留未释放')).toBeInTheDocument();
      expect(within(evidence).getByText('未知费用，不能按 0 处理')).toBeInTheDocument();
      expect(screen.getByText('没有按订单查询完整操作历史的 GET')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /撤单|提交|核对订单/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /下一页|next/i })).not.toBeInTheDocument();
      expect(calls.map((url) => url.pathname)).toEqual([`/api/v1/orders/${READONLY_IDS.order}`]);
    },
  );

  it('市价买入展示本金而非指定股数，部分累计费不等于最终费用', async () => {
    installReads();
    await mount(`/orders/${ORDER_MARKET_BUY_ID}`);
    const identity = await screen.findByRole('region', { name: '订单身份与有效委托' });
    expect(within(identity).getByText('不适用：MARKET BUY 仅按本金')).toBeInTheDocument();
    expect(within(identity).getByTitle('125.123456789012345678')).toBeInTheDocument();
    const evidence = screen.getByRole('region', { name: '成交、费用与核对证据' });
    expect(within(evidence).getByTitle('0.010000000000000001')).toBeInTheDocument();
    expect(within(evidence).getByText('false · 最终费用未确认')).toBeInTheDocument();
  });

  it('市价卖出空官方 ID、未知币种与开始提交保持未知，不把空值改为零', async () => {
    installReads();
    await mount(`/orders/${ORDER_MARKET_SELL_ID}`);
    const identity = await screen.findByRole('region', { name: '订单身份与有效委托' });
    expect(within(identity).getByText('未取得；不证明尚未发送')).toBeInTheDocument();
    expect(within(identity).getByText('未知；不从 USD 价格或 USDC 资金推断')).toBeInTheDocument();
    expect(within(identity).getByTitle('1.0000000001')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '成交、费用与核对证据' })).toHaveTextContent('UNKNOWN');
  });

  it('任务原文时间、当前 EXPIRED 与历史 PAUSED 各自展示，后端重叠计数不重算', async () => {
    const calls = installReads();
    await mount(`/tasks/${READONLY_IDS.task}`);
    const config = await screen.findByRole('region', { name: '当前公开配置' });
    expect(within(config).getByText(HISTORICAL_SCHEDULED_START)).toBeInTheDocument();
    const state = screen.getByRole('region', { name: '当前任务与历史受阻' });
    expect(within(state).getByText('EXPIRED')).toBeInTheDocument();
    expect(within(state).getByText('PAUSED')).toBeInTheDocument();
    expect(within(state).getByText(LAST_INTERRUPTION_FIXTURE.reason)).toBeInTheDocument();
    const progress = screen.getByRole('region', { name: '服务端进度汇总' });
    expect(within(progress).getByText('剩余目标不是可新增委托预算')).toBeInTheDocument();
    expect(within(progress).getByTitle('2.0000000000')).toBeInTheDocument();
    expect(within(progress).getByText(/可同时计入 CANCELED/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /下一页|next/i })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('data-table-total')).toHaveLength(3);
    expect(screen.getAllByTestId('data-table-total').map((element) => element.textContent)).toEqual([
      '已返回 2 条',
      '已返回 2 条',
      '已返回 2 条',
    ]);
    expect(calls.map((url) => url.pathname)).toEqual([`/api/v1/tasks/${READONLY_IDS.task}`]);
  });

  it.each([
    { id: TASK_MARKET_BUY_ID, expected: '市价买入本金配置', absent: '限价规则' },
    { id: TASK_MARKET_SELL_ID, expected: '股数批次配置', absent: '市价买入本金配置' },
  ])('任务 $id 只显示相应公开模式配置', async ({ id, expected, absent }) => {
    installReads();
    await mount(`/tasks/${id}`);
    const config = await screen.findByRole('region', { name: '当前公开配置' });
    expect(within(config).getByRole('heading', { name: expected })).toBeInTheDocument();
    expect(within(config).queryByRole('heading', { name: absent })).not.toBeInTheDocument();
    expect(within(config).queryByText('取价规则')).not.toBeInTheDocument();
  });

  it('服务端分页写入 URL；筛选应用归第一页、大小写原串匹配，账户切换不展示其他账户旧行', async () => {
    const user = userEvent.setup();
    installReads();
    const { history } = await mount(`/orders?accountId=${READONLY_IDS.accountA}&page=1&pageSize=1`);
    await screen.findByText(MARKET_SELL_ORDER_FIXTURE.clientOrderId);
    await user.click(screen.getByRole('button', { name: /下一页|next/i }));
    await screen.findByText(ORDER_FIXTURE.clientOrderId);
    expect(new URL(history.location.href, 'http://localhost').searchParams.get('page')).toBe('2');
    const symbolInput = screen.getByRole('textbox', { name: '证券代码（精确）' });
    await user.type(symbolInput, 'aapl');
    await user.click(screen.getByRole('button', { name: /^查询$/ }));
    await screen.findByText('没有匹配当前筛选的本地订单');
    expect(new URL(history.location.href, 'http://localhost').searchParams.get('page')).toBe('1');
    expect(new URL(history.location.href, 'http://localhost').searchParams.get('symbol')).toBe('aapl');
    await user.clear(screen.getByRole('textbox', { name: '证券代码（精确）' }));
    const account = screen.getByRole('textbox', { name: '账户 ID' });
    await user.clear(account);
    await user.type(account, READONLY_IDS.accountB);
    await user.click(screen.getByRole('button', { name: /^查询$/ }));
    await screen.findByText(MARKET_BUY_ORDER_FIXTURE.clientOrderId);
    expect(screen.queryByText(ORDER_FIXTURE.clientOrderId)).not.toBeInTheDocument();
    expect(screen.queryByText(MARKET_SELL_ORDER_FIXTURE.clientOrderId)).not.toBeInTheDocument();
  });

  it('任务关键词不搜索历史受阻或 ID，真实名称匹配恢复领域结果', async () => {
    const user = userEvent.setup();
    installReads();
    await mount(`/tasks?search=${encodeURIComponent('此前因资金来源不可用')}`);
    await screen.findByText('没有匹配当前筛选的任务');
    const search = screen.getByRole('textbox', { name: '任务关键词' });
    await user.clear(search);
    await user.type(search, '到期的限价');
    await user.click(screen.getByRole('button', { name: /^查询$/ }));
    await screen.findByRole('link', { name: TASK_DETAIL_FIXTURE.task.name });
    expect(screen.getByRole('table')).toHaveTextContent('EXPIRED');
    expect(screen.getByRole('table')).toHaveTextContent('PAUSED');
  });

  it.each(['/orders/not-a-uuid', '/tasks/official-123'])(
    '非法路径 %s 不发详情请求，页面说明 ID 边界',
    async (href) => {
      const calls = installReads();
      await mount(href);
      await screen.findByText(/ID 必须为有效 UUID；未发起详情请求/);
      expect(calls).toHaveLength(0);
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    },
  );

  it('非法 URL 筛选不降级为默认范围；交易员越权 owner 返回拒绝而非空表', async () => {
    const calls = installReads();
    const { router } = await mount('/orders?accountId=not-a-uuid');
    await screen.findByText('地址中的筛选或分页参数无效，请重置后查询');
    expect(calls).toHaveLength(0);
    await act(async () => {
      await router.navigate({ href: `/orders?ownerUserId=${READONLY_IDS.otherTrader}` });
    });
    await screen.findByText('当前范围不可读取');
    expect(screen.queryByText('没有匹配当前筛选的本地订单')).not.toBeInTheDocument();
  });

  it('详情依赖真实 ledger/events 变化重读；拒绝后旧记录不再可见', async () => {
    installReads();
    const { services } = await mount(`/orders/${READONLY_IDS.order}`);
    await screen.findByRole('region', { name: '订单身份与有效委托' });
    let reads = 0;
    server.use(
      http.get(`${API}/orders/:id`, () => {
        reads += 1;
        return HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Mock：访问权限已变化' } },
          { status: 404 },
        );
      }),
    );
    act(() => services.convergence.refresh(['ledger']));
    await screen.findByText('当前范围不可读取');
    expect(reads).toBe(1);
    expect(screen.queryByText(ORDER_FIXTURE.clientOrderId)).not.toBeInTheDocument();
    act(() => services.convergence.refresh(['events']));
    expect(reads).toBe(1);
  });
});
