import { QueryClient } from '@tanstack/react-query';
import {
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  type RouteComponent,
  type RouterHistory,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw/http';
import { afterEach, describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { type AppServices, createAppServices } from '@/app/runtime';
import { QuerySurface } from '@/components/read-only/query-surface';
import { readAccountDetail, readAccountsList } from '@/features/accounts/api';
import { AccountDetailPage } from '@/features/accounts/detail-page';
import { AccountsPage } from '@/features/accounts/page';
import { useAccountsList } from '@/features/accounts/queries';
import { accountQueryKeys } from '@/features/accounts/query-keys';
import { accountSearchSchema, accountViewSchema } from '@/features/accounts/schemas';
import type { AuthUser } from '@/features/auth/types';
import { createRpcApi } from '@/services/api/rpc';
import type { ApiOutcome } from '@/services/api/types';
import type { BusinessEventSource } from '@/services/realtime/manager';
import { ADMIN_USER, AUTH_DATA, TRADER_USER } from '../msw/auth-fixtures';
import { API } from '../msw/handlers';
import {
  ACCOUNT_FUNDING_RAW,
  ACCOUNT_SNAPSHOT_RAW_TIME,
  type AccountFixtureDto,
  createAccountFixtures,
  OTHER_OWNER_ACCOUNT,
  READY_ACCOUNT,
  UNAVAILABLE_ACCOUNT,
} from '../msw/readonly/accounts';
import { READONLY_IDS } from '../msw/readonly/ids';
import { server } from '../msw/server';

const disposables: AppServices[] = [];
const histories: RouterHistory[] = [];

class MockBusinessSource implements BusinessEventSource {
  onopen: BusinessEventSource['onopen'] = null;
  onmessage: BusinessEventSource['onmessage'] = null;
  onerror: BusinessEventSource['onerror'] = null;
  close() {}
}

function success<T>(data: T): ApiOutcome<T> {
  return {
    kind: 'success',
    status: 200,
    data,
    receipt: { kind: 'absent' },
    requestId: 'mock-accounts-auth',
    sessionEpoch: 0,
  };
}

function services(user: AuthUser): AppServices {
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
  const auth = { ...AUTH_DATA, user };
  const runtime = createAppServices({
    baseUrl: API,
    queryClient,
    authApi: {
      me: async () => success(auth),
      login: async () => success(auth),
      logout: async () => success({ loggedOut: true as const }),
    },
    broadcastFactory: () => null,
    createEventSource: () => new MockBusinessSource(),
  });
  disposables.push(runtime);
  return runtime;
}

/** MSW 返回真实变化的筛选/所有权结果，仅管理员分支使用接口已有分页。 */
function accountHandlers(user: AuthUser, rows: () => AccountFixtureDto[] = createAccountFixtures) {
  function filtered(request: Request): AccountFixtureDto[] {
    const params = new URL(request.url).searchParams;
    const needle = params.get('search')?.toLowerCase();
    return rows()
      .filter((row) => {
        if (user.role === 'TRADER' && row.ownerUserId !== user.id) return false;
        if (params.get('ownerUserId') && row.ownerUserId !== params.get('ownerUserId')) return false;
        if (params.get('accountId') && row.id !== params.get('accountId')) return false;
        if (params.get('status') && row.status !== params.get('status')) return false;
        const from = params.get('from');
        const to = params.get('to');
        if (from && Date.parse(row.createdAt) < Date.parse(from)) return false;
        if (to && Date.parse(row.createdAt) > Date.parse(to)) return false;
        if (needle && !`${row.label}\n${row.apiKeyLast4 ?? ''}`.toLowerCase().includes(needle)) return false;
        return true;
      })
      .sort(
        (left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
      );
  }
  return [
    http.get(`${API}/accounts`, ({ request }) => {
      const owner = new URL(request.url).searchParams.get('ownerUserId');
      if (user.role === 'TRADER' && owner && owner !== user.id) {
        return HttpResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Mock: 无权查询其他用户数据' } },
          { status: 403 },
        );
      }
      return HttpResponse.json({ data: filtered(request) });
    }),
    http.get(`${API}/admin/accounts`, ({ request }) => {
      if (user.role !== 'ADMIN') {
        return HttpResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Mock: 需要管理员身份' } },
          { status: 403 },
        );
      }
      const params = new URL(request.url).searchParams;
      const page = Number(params.get('page') ?? 1);
      const pageSize = Number(params.get('pageSize') ?? 25);
      const result = filtered(request);
      return HttpResponse.json({
        data: {
          items: result.slice((page - 1) * pageSize, page * pageSize),
          total: result.length,
          page,
          pageSize,
        },
      });
    }),
    http.get(`${API}/accounts/:id`, ({ params }) => {
      const row = rows().find((entry) => entry.id === params.id);
      if (!row || (user.role === 'TRADER' && row.ownerUserId !== user.id)) {
        return HttpResponse.json(
          { error: { code: row ? 'NOT_FOUND' : 'ACCOUNT_NOT_FOUND', message: 'Mock: 账户不可读取' } },
          { status: 404 },
        );
      }
      return HttpResponse.json({ data: row });
    }),
  ];
}

async function mount(
  component: RouteComponent,
  href: string,
  user: AuthUser = TRADER_USER,
  path = '/accounts',
) {
  const runtime = services(user);
  const history = createMemoryHistory({ initialEntries: [href] });
  histories.push(history);
  const root = createRootRoute({ component: Outlet });
  const route = createRoute({ getParentRoute: () => root, path, component });
  const router = createRouter({
    routeTree: root.addChildren([route]),
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
  return { runtime, router, history };
}

function ListProbe() {
  const query = useAccountsList(accountSearchSchema.parse({}));
  return (
    <QuerySurface query={query}>
      {(data) => (
        <>
          <output aria-label="账户结果分支">{data.kind}</output>
          <ul>
            {data.items.map((account) => (
              <li key={account.id}>{account.label}</li>
            ))}
          </ul>
        </>
      )}
    </QuerySurface>
  );
}

afterEach(() => {
  cleanup();
  for (const history of histories.splice(0)) history.destroy();
  for (const runtime of disposables.splice(0)) {
    runtime.session.stop();
    runtime.businessSync.stop();
    runtime.queryClient.clear();
  }
});

describe('账户 GET 展示边界与真实分页', () => {
  it('只接受有效筛选，保留非空原串，不创造证券或排序能力', () => {
    const search = accountSearchSchema.parse({
      status: ' ACTIVE ',
      search: ' A123 ',
      symbol: 'IGNORED',
      sort: 'label',
    });
    expect(search).toMatchObject({ status: ' ACTIVE ', search: ' A123 ', page: 1, pageSize: 25 });
    expect(search).not.toHaveProperty('symbol');
    expect(search).not.toHaveProperty('sort');
    expect(accountSearchSchema.safeParse({ accountId: 'not-a-uuid' }).success).toBe(false);
    expect(accountSearchSchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(
      accountSearchSchema.safeParse({
        from: '2026-11-02T00:00:00Z',
        to: '2026-11-01T00:00:00Z',
      }).success,
    ).toBe(false);
  });

  it.each([
    { availableCash: 42 },
    { reservedCash: 25 },
    { lastSyncAt: 123 },
    {
      walletSnapshot: {
        ...READY_ACCOUNT.walletSnapshot,
        funding: { ...READY_ACCOUNT.walletSnapshot.funding, free: 1 },
      },
    },
  ])('拒绝使用中的金融 number / 非法来源时间，不把它们变为金额文本：%j', (overrides) => {
    expect(accountViewSchema.safeParse({ ...READY_ACCOUNT, ...overrides }).success).toBe(false);
  });

  it('验证 nullable、来源和原历史时间，不把 connectionStatus 错限为闭合枚举', () => {
    const view = accountViewSchema.parse({ ...UNAVAILABLE_ACCOUNT, connectionStatus: 'FUTURE_STATUS' });
    expect(view.availableCash).toBeNull();
    expect(view.cashBalance).toBeNull();
    expect(view.walletSnapshot?.funding?.freeze).toBeNull();
    expect(view.walletSnapshot?.receivedAt).toBe(ACCOUNT_SNAPSHOT_RAW_TIME);
    expect(view.walletSnapshot?.funding?.free).toBe(ACCOUNT_FUNDING_RAW);
    expect(view.source).toBe('UNAVAILABLE');
    expect(view.connectionStatus).toBe('FUTURE_STATUS');
    expect(accountViewSchema.safeParse({ ...READY_ACCOUNT, source: 'LOCAL_LEDGER' }).success).toBe(false);
  });

  it('大写 UUID 直达仍接受同一账户的小写数据库标识', async () => {
    const canonicalId = 'a1b2c3d4-1111-4111-8111-abcdef123456';
    server.use(
      http.get(`${API}/accounts/:id`, () =>
        HttpResponse.json({ data: { ...READY_ACCOUNT, id: canonicalId } }),
      ),
    );
    const account = await readAccountDetail(createRpcApi({ baseUrl: API }), canonicalId.toUpperCase());
    expect(account.id).toBe(canonicalId);
    expect(account.availableCash).toBe(READY_ACCOUNT.availableCash);
  });

  it('TRADER 读取完整匹配数组，状态 / 标签尾号 / 创建时间筛选实际改变返回行', async () => {
    server.use(...accountHandlers(TRADER_USER));
    const rpc = createRpcApi({ baseUrl: API });
    const all = await readAccountsList(rpc, accountSearchSchema.parse({ page: 9, pageSize: 1 }), false);
    expect(all.kind).toBe('array');
    expect(all.items.map((row) => row.id)).toEqual([READONLY_IDS.accountA, READONLY_IDS.accountB]);
    expect(all).not.toHaveProperty('total');
    expect(all).not.toHaveProperty('page');
    const filtered = await readAccountsList(
      rpc,
      accountSearchSchema.parse({
        status: 'DISABLED',
        search: 'b456',
        from: '2026-10-01T00:00:00Z',
        to: '2026-10-01T00:00:00Z',
      }),
      false,
    );
    expect(filtered.items.map((row) => row.id)).toEqual([READONLY_IDS.accountB]);
    const originalString = await readAccountsList(
      rpc,
      accountSearchSchema.parse({ search: ' b456 ' }),
      false,
    );
    expect(originalString.items).toEqual([]);
  });

  it('ADMIN 真实分页保留总数，不把页长或空页当总数；所有者筛选改变跨用户结果', async () => {
    server.use(...accountHandlers(ADMIN_USER));
    const rpc = createRpcApi({ baseUrl: API });
    const first = await readAccountsList(rpc, accountSearchSchema.parse({ pageSize: 1 }), true);
    const second = await readAccountsList(rpc, accountSearchSchema.parse({ page: 2, pageSize: 1 }), true);
    const empty = await readAccountsList(rpc, accountSearchSchema.parse({ page: 4, pageSize: 1 }), true);
    expect(first).toMatchObject({ kind: 'paged', total: 3, page: 1, pageSize: 1 });
    expect(first.items[0]?.id).toBe(READONLY_IDS.accountA);
    expect(second).toMatchObject({ kind: 'paged', total: 3, page: 2, pageSize: 1 });
    expect(second.items[0]?.id).toBe(READONLY_IDS.accountB);
    expect(empty).toMatchObject({ kind: 'paged', items: [], total: 3, page: 4 });
    const other = await readAccountsList(
      rpc,
      accountSearchSchema.parse({ ownerUserId: READONLY_IDS.otherTrader }),
      true,
    );
    expect(other.items.map((row) => row.id)).toEqual([READONLY_IDS.otherAccount]);
  });

  it('API 不以假 balances 路径回填；详情非法 UUID 不发请求，跨所有者直接拒绝', async () => {
    let detailReads = 0;
    server.use(...accountHandlers(TRADER_USER));
    server.use(
      http.get(`${API}/accounts/not-a-uuid`, () => {
        detailReads += 1;
        return HttpResponse.json({ data: READY_ACCOUNT });
      }),
    );
    const rpc = createRpcApi({ baseUrl: API });
    await expect(readAccountDetail(rpc, 'not-a-uuid')).rejects.toThrow();
    expect(detailReads).toBe(0);
    expect((await readAccountDetail(rpc, READONLY_IDS.accountA)).id).toBe(READONLY_IDS.accountA);
    await expect(readAccountDetail(rpc, READONLY_IDS.otherAccount)).rejects.toThrow('Mock: 账户不可读取');
    await expect(
      readAccountsList(rpc, accountSearchSchema.parse({ ownerUserId: READONLY_IDS.otherTrader }), false),
    ).rejects.toThrow('Mock: 无权查询其他用户数据');
  });

  it('详情响应必须属于请求的账户，拒绝把其它 UUID 的有效投影放入当前账户范围', async () => {
    server.use(
      http.get(`${API}/accounts/${READONLY_IDS.accountB}`, () => HttpResponse.json({ data: READY_ACCOUNT })),
    );
    await expect(readAccountDetail(createRpcApi({ baseUrl: API }), READONLY_IDS.accountB)).rejects.toThrow(
      '服务端数据无法按只读展示契约解释：id',
    );
  });

  it('Query key 只包含实际筛选 / 分页，并保留用户 epoch 和账户边界', () => {
    const search = accountSearchSchema.parse({ accountId: READONLY_IDS.accountA });
    const trader = { epoch: 7, user: TRADER_USER };
    const admin = { epoch: 7, user: ADMIN_USER };
    expect(accountQueryKeys.list(trader, search)).toEqual(
      accountQueryKeys.list(trader, { ...search, page: 5, pageSize: 1 }),
    );
    expect(accountQueryKeys.list(admin, search)).not.toEqual(
      accountQueryKeys.list(admin, { ...search, page: 5 }),
    );
    expect(accountQueryKeys.detail(trader, READONLY_IDS.accountA)).not.toEqual(
      accountQueryKeys.detail(trader, READONLY_IDS.accountB),
    );
    expect(accountQueryKeys.list(trader, search)).not.toEqual(
      accountQueryKeys.list({ ...trader, epoch: 8 }, search),
    );
    expect(accountQueryKeys.list(trader, search)[4]).toBe('accounts');
    expect(accountQueryKeys.list({ epoch: 7, user: null }, search)[2]).toBeNull();
  });
});

describe('账户页面的可见行为与读取边界', () => {
  it('TRADER 页面无假分页；应用状态筛选使用 URL 并返回真实改变的数组', async () => {
    server.use(...accountHandlers(TRADER_USER));
    const { history } = await mount(AccountsPage, '/accounts?page=9&pageSize=1&symbol=IGNORED');
    expect(await screen.findByRole('link', { name: READY_ACCOUNT.label })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: UNAVAILABLE_ACCOUNT.label })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: OTHER_OWNER_ACCOUNT.label })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /下一页|next/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /证券/ })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: '账户状态' }), 'DISABLED');
    await user.click(screen.getByRole('button', { name: '查询' }));
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: READY_ACCOUNT.label })).not.toBeInTheDocument(),
    );
    expect(await screen.findByRole('link', { name: UNAVAILABLE_ACCOUNT.label })).toBeInTheDocument();
    const params = new URL(history.location.href, 'http://localhost').searchParams;
    expect(params.get('page')).toBe('1');
    expect(params.get('status')).toBe('DISABLED');
    expect(params.has('symbol')).toBe(false);
  });

  it('ADMIN 页使用真实 admin 分页，翻页改变行且保留服务端总数；支持隐藏列而不提供排序', async () => {
    server.use(...accountHandlers(ADMIN_USER));
    const { history } = await mount(
      AccountsPage,
      '/administration/accounts?pageSize=1',
      ADMIN_USER,
      '/administration/accounts',
    );
    expect(await screen.findByRole('link', { name: READY_ACCOUNT.label })).toBeInTheDocument();
    expect(screen.getByTestId('data-table-total')).toHaveTextContent('共 3 条');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /下一页|next/i }));
    expect(await screen.findByRole('link', { name: UNAVAILABLE_ACCOUNT.label })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: READY_ACCOUNT.label })).not.toBeInTheDocument();
    expect(new URL(history.location.href, 'http://localhost').searchParams.get('page')).toBe('2');
    expect(screen.getByTestId('data-table-total')).toHaveTextContent('共 3 条');
    expect(screen.queryByRole('button', { name: '账户状态' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '列' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: '本地预留（非可执行资金）' }));
    expect(screen.queryByRole('columnheader', { name: '本地预留（非可执行资金）' })).not.toBeInTheDocument();
  });

  it('TRADER 不能在管理别名页读取，即使已有普通账户缓存也不显示', async () => {
    let reads = 0;
    server.use(
      http.get(`${API}/accounts`, () => {
        reads += 1;
        return HttpResponse.json({ data: [READY_ACCOUNT] });
      }),
    );
    const { runtime } = await mount(
      AccountsPage,
      '/administration/accounts',
      TRADER_USER,
      '/administration/accounts',
    );
    await waitFor(() => expect(runtime.session.getSnapshot().status).toBe('authenticated'));
    const snapshot = runtime.session.getSnapshot();
    act(() =>
      runtime.queryClient.setQueryData(
        accountQueryKeys.list({ epoch: snapshot.epoch, user: snapshot.user }, accountSearchSchema.parse({})),
        { kind: 'array', items: [accountViewSchema.parse(READY_ACCOUNT)] },
      ),
    );
    expect(await screen.findByText('当前身份没有系统管理读取权限。')).toBeInTheDocument();
    expect(reads).toBe(0);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('详情分离识别金额与历史 free、保留未知和九位 UTC，不用 updatedAt 冒充上游时间', async () => {
    server.use(...accountHandlers(TRADER_USER));
    await mount(AccountDetailPage, `/accounts/${READONLY_IDS.accountB}`, TRADER_USER, '/accounts/$id');
    expect(await screen.findByRole('heading', { name: UNAVAILABLE_ACCOUNT.label })).toBeInTheDocument();
    const funding = screen.getByRole('region', { name: '识别的资金投影与本地预留' });
    expect(
      within(funding).getByText('Funding availableCash（USDC 快照）').closest('dt')?.nextElementSibling,
    ).toHaveTextContent('未知');
    expect(
      within(funding).getByText('cashBalance（接口未提供）').closest('dt')?.nextElementSibling,
    ).toHaveTextContent('未知');
    const historical = screen.getByRole('region', { name: '已存钱包快照（历史证据）' });
    expect(within(historical).getByTitle(ACCOUNT_FUNDING_RAW)).toBeInTheDocument();
    expect(within(historical).getAllByText(ACCOUNT_SNAPSHOT_RAW_TIME).length).toBeGreaterThan(0);
    expect(within(historical).getByText('已存 freeze').closest('dt')?.nextElementSibling).toHaveTextContent(
      '未知',
    );
    expect(screen.getByText('报价币种 / 结算币种').closest('dt')?.nextElementSibling).toHaveTextContent(
      'USD / USDC',
    );
    expect(
      screen.getByText('上游资产更新时间 sourceUpdatedAt').closest('dt')?.nextElementSibling,
    ).toHaveTextContent('账户 API 未提供');
    expect(screen.getByRole('link', { name: '本地订单' })).toHaveAttribute(
      'href',
      `/orders?accountId=${READONLY_IDS.accountB}`,
    );
    expect(screen.queryByRole('link', { name: READONLY_IDS.otherTrader })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /连接检查|资金同步|主动核对|配置|保存|删除/ }),
    ).not.toBeInTheDocument();
  });

  it('非法详情 URL 不读取；非法列表 URL 不能用默认条件冒充请求结果', async () => {
    let reads = 0;
    server.use(
      http.get(`${API}/accounts/:id`, () => {
        reads += 1;
        return HttpResponse.json({ data: READY_ACCOUNT });
      }),
    );
    server.use(
      http.get(`${API}/accounts`, () => {
        reads += 1;
        return HttpResponse.json({ data: [READY_ACCOUNT] });
      }),
    );
    await mount(AccountDetailPage, '/accounts/not-a-uuid', TRADER_USER, '/accounts/$id');
    expect(await screen.findByText('账户 ID 必须是有效 UUID；未发送账户请求。')).toBeInTheDocument();
    expect(reads).toBe(0);
    cleanup();
    await mount(AccountsPage, '/accounts?accountId=bad');
    expect(await screen.findByText(/地址中的筛选或分页参数无效/)).toBeInTheDocument();
    expect(reads).toBe(0);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('切换账户立即隐藏旧详情，等待新范围请求后只展示新账户', async () => {
    server.use(...accountHandlers(TRADER_USER));
    const gate = createControlledPromise<void>();
    server.use(
      http.get(`${API}/accounts/${READONLY_IDS.accountB}`, async () => {
        await gate;
        return HttpResponse.json({ data: UNAVAILABLE_ACCOUNT });
      }),
    );
    const { router } = await mount(
      AccountDetailPage,
      `/accounts/${READONLY_IDS.accountA}`,
      TRADER_USER,
      '/accounts/$id',
    );
    expect(await screen.findByRole('heading', { name: READY_ACCOUNT.label })).toBeInTheDocument();
    await act(async () => {
      await router.navigate({ href: `/accounts/${READONLY_IDS.accountB}` });
    });
    expect(screen.queryByRole('heading', { name: READY_ACCOUNT.label })).not.toBeInTheDocument();
    gate.resolve(undefined);
    expect(await screen.findByRole('heading', { name: UNAVAILABLE_ACCOUNT.label })).toBeInTheDocument();
  });

  it.each([403, 404])('同一范围重读 %s 后隐藏已缓存账户；不把旧快照作为有权数据', async (status) => {
    server.use(...accountHandlers(TRADER_USER));
    await mount(AccountDetailPage, `/accounts/${READONLY_IDS.accountA}`, TRADER_USER, '/accounts/$id');
    expect(await screen.findByRole('heading', { name: READY_ACCOUNT.label })).toBeInTheDocument();
    server.use(
      http.get(`${API}/accounts/${READONLY_IDS.accountA}`, () =>
        HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Mock: 当前账户范围不可读' } }, { status }),
      ),
    );
    await userEvent.setup().click(screen.getByRole('button', { name: '重新读取' }));
    expect(await screen.findByText('当前范围不可读取')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: READY_ACCOUNT.label })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '当前账户的只读业务页面' })).not.toBeInTheDocument();
  });

  it('普通 5xx 保留最后成功账户及失败提示；后续成功和 accounts 失效提示取得新结果', async () => {
    let rows = createAccountFixtures();
    server.use(...accountHandlers(TRADER_USER, () => rows));
    const { runtime } = await mount(ListProbe, '/accounts');
    expect(await screen.findByText(READY_ACCOUNT.label)).toBeInTheDocument();
    server.use(
      http.get(
        `${API}/accounts`,
        () =>
          HttpResponse.json(
            { error: { code: 'MOCK_UNAVAILABLE', message: 'Mock: 账户记录读取暂时失败' } },
            { status: 503 },
          ),
        { once: true },
      ),
    );
    await userEvent.setup().click(screen.getByRole('button', { name: '重新读取' }));
    expect(await screen.findByText('最新读取失败，保留上次成功结果')).toBeInTheDocument();
    expect(screen.getByText(READY_ACCOUNT.label)).toBeInTheDocument();
    expect(screen.getByLabelText('账户结果分支')).toHaveTextContent('array');
    rows = rows.map((row) =>
      row.id === READONLY_IDS.accountA ? { ...row, label: 'Mock — Updated by account notification' } : row,
    );
    act(() => runtime.convergence.refresh(['accounts']));
    expect(await screen.findByText('Mock — Updated by account notification')).toBeInTheDocument();
    expect(screen.queryByText(READY_ACCOUNT.label)).not.toBeInTheDocument();
  });

  it('共享列表 hook 的 ADMIN 分支实际跨所有者读取，不由交易写能力拦截', async () => {
    server.use(...accountHandlers(ADMIN_USER));
    await mount(ListProbe, '/accounts', ADMIN_USER);
    expect(await screen.findByText(OTHER_OWNER_ACCOUNT.label)).toBeInTheDocument();
    expect(screen.getByLabelText('账户结果分支')).toHaveTextContent('paged');
  });
});
