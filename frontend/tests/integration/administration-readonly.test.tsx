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
import { type FunctionComponent, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { type AppServices, createAppServices } from '@/app/runtime';
import { useAdminReadDenial } from '@/features/administration/access';
import { parseHealthOutcome } from '@/features/administration/api';
import { AuditPage } from '@/features/administration/audit-page';
import { AdminOverviewPage } from '@/features/administration/overview-page';
import { useAdminUsers } from '@/features/administration/queries';
import { adminOverviewSchema, adminSystemSchema, usersSearchSchema } from '@/features/administration/schemas';
import { SystemPage } from '@/features/administration/system-page';
import { UserDetailPage } from '@/features/administration/user-detail-page';
import { UsersPage } from '@/features/administration/users-page';
import type { AuthUser } from '@/features/auth/types';
import { ApiOutcomeError } from '@/services/api/errors';
import type { ApiOutcome } from '@/services/api/types';
import type { BusinessEventSource } from '@/services/realtime/manager';
import { ADMIN_USER, AUTH_DATA, OWNER_USER, TRADER_USER } from '../msw/auth-fixtures';
import {
  ADMIN_AUDIT,
  ADMIN_HEALTH_DEGRADED,
  ADMIN_OVERVIEW,
  ADMIN_SETTINGS,
  ADMIN_SYSTEM,
  ADMIN_USERS,
  adminAuditPage,
  adminUsersPage,
} from '../msw/readonly/administration';
import { READONLY_IDS } from '../msw/readonly/ids';
import { server } from '../msw/server';

const API = 'http://localhost/api/v1';
const runtimes: AppServices[] = [];
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
    requestId: 'mock-admin',
    sessionEpoch: 0,
  };
}

async function mount(
  Page: FunctionComponent,
  options: { user?: AuthUser; path?: string; href?: string } = {},
) {
  const user = options.user ?? ADMIN_USER;
  const history = createMemoryHistory({ initialEntries: [options.href ?? options.path ?? '/'] });
  histories.push(history);
  const root = createRootRoute({ component: Outlet });
  const route = createRoute({ getParentRoute: () => root, path: options.path ?? '/', component: Page });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history,
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  });
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
      me: async () => success({ ...AUTH_DATA, user }),
      login: async () => success({ ...AUTH_DATA, user }),
      logout: async () => success({ loggedOut: true as const }),
    },
    broadcastFactory: () => null,
    createEventSource: () => new MockBusinessSource(),
  });
  runtimes.push(runtime);
  await router.load();
  render(
    <AppProviders services={runtime}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  await waitFor(() => expect(runtime.session.getSnapshot().status).toBe('authenticated'));
  return { runtime, history };
}

function ManualRefetchProbe() {
  const query = useAdminUsers(usersSearchSchema.parse({}));
  const denied = useAdminReadDenial();
  const [attempted, setAttempted] = useState(false);
  return (
    <>
      <p>{denied}</p>
      <button
        type="button"
        onClick={() => {
          void query.refetch().then(() => setAttempted(true));
        }}
      >
        尝试手动读取
      </button>
      <output aria-label="手动尝试状态">{attempted ? '已完成尝试' : '尚未尝试'}</output>
      {query.data ? <p>不应披露管理数据</p> : null}
    </>
  );
}

afterEach(() => {
  cleanup();
  for (const runtime of runtimes.splice(0)) {
    runtime.businessSync.stop();
    runtime.session.stop();
    runtime.queryClient.clear();
  }
  for (const history of histories.splice(0)) history.destroy();
  vi.restoreAllMocks();
});

describe('管理员只读权限与真实用户读取', () => {
  it.each([ADMIN_USER, OWNER_USER])(
    'ADMIN canManageAdmins=$canManageAdmins 都能读取全部管理员，且没有管理写控件',
    async (user) => {
      server.use(http.get(`${API}/admin/users`, () => HttpResponse.json({ data: adminUsersPage() })));
      await mount(UsersPage, { user });
      const owner = await screen.findByRole('link', { name: 'owner' });
      expect(owner).toHaveAttribute('href', `/administration/users/${OWNER_USER.id}`);
      const table = screen.getByRole('table');
      expect(within(table).getAllByRole('row')).toHaveLength(ADMIN_USERS.length + 1);
      expect(within(table).getByRole('cell', { name: 'true（专项权限）' })).toBeVisible();
      expect(within(table).getAllByRole('cell', { name: 'false（无专项权限）' })).toHaveLength(3);
      const ownerRow = owner.closest('tr');
      expect(ownerRow).not.toBeNull();
      if (!ownerRow) throw new Error('未取得用户表格行');
      expect(within(ownerRow).getByRole('link', { name: '查看该用户账户' }).getAttribute('href')).toContain(
        `ownerUserId=${OWNER_USER.id}`,
      );
      expect(
        screen.queryByRole('button', { name: /创建|编辑|停用|启用|删除|授权|风控|交易/ }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: /^角色$/ })).not.toBeInTheDocument();
    },
  );

  it.each([
    ['概览', AdminOverviewPage],
    ['用户', UsersPage],
    ['审计', AuditPage],
    ['系统', SystemPage],
  ] as const)('TRADER 在%s明确拒绝，不发送管理员读取', async (_name, Page) => {
    const calls = vi.fn();
    server.use(
      http.get(`${API}/admin/*`, () => {
        calls();
        return HttpResponse.json({ data: adminUsersPage() });
      }),
    );
    const { runtime } = await mount(Page, { user: TRADER_USER });
    const rpc = vi.spyOn(runtime.rpc, 'request');
    expect(await screen.findAllByText(/TRADER 无管理读取权限/)).not.toHaveLength(0);
    expect(calls).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('TRADER 对有效用户详情 ID 也无管理读取权限', async () => {
    const calls = vi.fn();
    server.use(
      http.get(`${API}/admin/users`, () => {
        calls();
        return HttpResponse.json({ data: adminUsersPage() });
      }),
    );
    await mount(UserDetailPage, {
      user: TRADER_USER,
      path: '/administration/users/$id',
      href: `/administration/users/${OWNER_USER.id}`,
    });
    expect(await screen.findByText(/TRADER 无管理读取权限/)).toBeVisible();
    expect(calls).not.toHaveBeenCalled();
    expect(screen.queryByText('true（持有）')).not.toBeInTheDocument();
  });

  it('TRADER 即使显式 refetch 也不能绕过 canRead 门禁', async () => {
    const { runtime } = await mount(ManualRefetchProbe, { user: TRADER_USER });
    const rpc = vi.spyOn(runtime.rpc, 'request');
    await userEvent.setup().click(screen.getByRole('button', { name: '尝试手动读取' }));
    await waitFor(() => expect(screen.getByLabelText('手动尝试状态')).toHaveTextContent('已完成尝试'));
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.queryByText('不应披露管理数据')).not.toBeInTheDocument();
  });

  it('用户详情只通过 ownerUserId 精确列表查询，普通 ADMIN 可查看专项管理员', async () => {
    const seen: URL[] = [];
    server.use(
      http.get(`${API}/admin/users`, ({ request }) => {
        const url = new URL(request.url);
        seen.push(url);
        const items = ADMIN_USERS.filter((user) => user.id === url.searchParams.get('ownerUserId'));
        return HttpResponse.json({ data: adminUsersPage({ items, total: items.length, pageSize: 1 }) });
      }),
    );
    await mount(UserDetailPage, {
      path: '/administration/users/$id',
      href: `/administration/users/${OWNER_USER.id}`,
    });
    expect(await screen.findByText('true（持有）')).toBeVisible();
    expect(screen.getByText('owner')).toBeVisible();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.pathname).toBe('/api/v1/admin/users');
    expect(seen[0]?.searchParams.get('ownerUserId')).toBe(OWNER_USER.id);
    expect(seen[0]?.searchParams.get('pageSize')).toBe('1');
    expect(screen.getByRole('link', { name: '查看该用户账户' }).getAttribute('href')).toContain(
      `ownerUserId=${OWNER_USER.id}`,
    );
    expect(screen.queryByRole('button', { name: /授权|编辑|重置密码|删除/ })).not.toBeInTheDocument();
  });

  it('非法用户 UUID 不发送列表或伪造的详情请求', async () => {
    const calls = vi.fn();
    server.use(
      http.get(`${API}/admin/users*`, () => {
        calls();
        return HttpResponse.json({ data: adminUsersPage() });
      }),
    );
    await mount(UserDetailPage, {
      path: '/administration/users/$id',
      href: '/administration/users/not-a-uuid',
    });
    expect(await screen.findByText(/用户 ID 必须是有效 UUID/)).toBeVisible();
    expect(calls).not.toHaveBeenCalled();
    expect(screen.queryByText('true（持有）')).not.toBeInTheDocument();
  });

  it('访问被拒后不再显示之前的管理员用户数据', async () => {
    let denied = false;
    server.use(
      http.get(`${API}/admin/users`, () =>
        denied
          ? HttpResponse.json(
              { error: { code: 'FORBIDDEN', message: 'Mock：管理读取权限已撤销' } },
              { status: 403 },
            )
          : HttpResponse.json({ data: adminUsersPage() }),
      ),
    );
    await mount(UsersPage);
    expect(await screen.findByRole('link', { name: 'owner' })).toBeVisible();
    denied = true;
    await userEvent.setup().click(screen.getByRole('button', { name: '重新读取' }));
    expect(await screen.findByText('当前范围不可读取')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'owner' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('审计真实映射与分页', () => {
  it('发起者/result/目标 ID/原证券与创建日期保持真实语义，分页不以当前行数代替总数', async () => {
    const seen: URL[] = [];
    server.use(
      http.get(`${API}/admin/audit`, ({ request }) => {
        const url = new URL(request.url);
        seen.push(url);
        return HttpResponse.json({
          data: adminAuditPage({
            items: ADMIN_AUDIT.slice(0, 1),
            total: 81,
            page: Number(url.searchParams.get('page') ?? 1),
            pageSize: 1,
          }),
        });
      }),
    );
    const params = new URLSearchParams({
      ownerUserId: OWNER_USER.id,
      accountId: READONLY_IDS.accountA,
      symbol: 'aapl',
      status: 'FAILURE',
      search: 'ACCOUNT',
      from: '2026-11-01T00:00:00Z',
      to: '2026-11-30T23:59:59Z',
      page: '2',
      pageSize: '1',
    });
    const { history } = await mount(AuditPage, {
      path: '/administration/audit',
      href: `/administration/audit?${params}`,
    });
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('cell', { name: 'FAILURE' })).toBeVisible();
    expect(within(table).getByRole('link', { name: OWNER_USER.id })).toBeVisible();
    expect(within(table).getByText(READONLY_IDS.accountA)).toBeVisible();
    expect(screen.getByTestId('data-table-total')).toHaveTextContent('共 81 条');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(seen[0]?.searchParams.get('ownerUserId')).toBe(OWNER_USER.id);
    expect(seen[0]?.searchParams.get('accountId')).toBe(READONLY_IDS.accountA);
    expect(seen[0]?.searchParams.get('status')).toBe('FAILURE');
    expect(seen[0]?.searchParams.get('symbol')).toBe('aapl');
    expect(seen[0]?.searchParams.get('from')).toBe('2026-11-01T00:00:00Z');
    expect(seen[0]?.searchParams.has('role')).toBe(false);
    expect(seen[0]?.searchParams.has('level')).toBe(false);
    params.set('page', '3');
    await act(async () => {
      history.push(`/administration/audit?${params}`);
    });
    await waitFor(() => expect(seen.at(-1)?.searchParams.get('page')).toBe('3'));
    const user = userEvent.setup();
    const search = screen.getByRole('textbox', { name: '动作 / 目标类型 / 目标 ID 关键词' });
    await user.clear(search);
    await user.type(search, 'TASK');
    await user.click(screen.getByRole('button', { name: '查询' }));
    await waitFor(() => expect(seen.at(-1)?.searchParams.get('page')).toBe('1'));
    expect(seen.at(-1)?.searchParams.get('search')).toBe('TASK');
    expect(new URL(history.location.href, 'http://localhost').searchParams.get('page')).toBe('1');
  });

  it('可空发起者/角色/目标不伪造用户或账户身份', async () => {
    server.use(
      http.get(`${API}/admin/audit`, () =>
        HttpResponse.json({ data: adminAuditPage({ items: ADMIN_AUDIT.slice(2, 3), total: 1 }) }),
      ),
    );
    await mount(AuditPage);
    expect(await screen.findByText('无用户发起者')).toBeVisible();
    expect(screen.getByText('无目标 ID')).toBeVisible();
    expect(within(screen.getByRole('table')).queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('系统运行 nullable、预留政策与降级证据', () => {
  it('概览保留实际可空 settings 与 Worker 时间，而非生成类型的非空假设', async () => {
    server.use(
      http.get(`${API}/admin/overview`, () =>
        HttpResponse.json({
          data: {
            ...ADMIN_OVERVIEW,
            settings: null,
            worker: { online: false, status: 'UNKNOWN', lastSeenAt: null },
          },
        }),
      ),
    );
    await mount(AdminOverviewPage);
    expect(await screen.findByText('平台设置记录不可用')).toBeVisible();
    expect(screen.getByText('未判定在线')).toBeVisible();
    expect(screen.getByText('UNKNOWN')).toBeVisible();
    expect(screen.queryByTitle(ADMIN_SETTINGS.maxOrderNotional)).not.toBeInTheDocument();
  });

  it('503 健康数据明确降级，DEGRADED/RECOVERING/旧心跳和测速缓存不标成健康', async () => {
    server.use(
      http.get(`${API}/admin/system`, () => HttpResponse.json({ data: ADMIN_SYSTEM })),
      http.get('http://localhost/healthz', () =>
        HttpResponse.json({ data: ADMIN_HEALTH_DEGRADED }, { status: 503 }),
      ),
    );
    await mount(SystemPage);
    expect(await screen.findByText('健康检查降级（HTTP 503）')).toBeVisible();
    expect(await screen.findByText('平台设置与预留政策')).toBeVisible();
    expect(screen.getByText('在线（不代表运行健康）')).toBeVisible();
    expect(screen.getByText('RECOVERING')).toBeVisible();
    expect(screen.getByText(/旧行不表示实例仍在线/)).toBeVisible();
    expect(screen.getByTitle(ADMIN_SETTINGS.feeReserveRate)).toBeVisible();
    expect(screen.getByTitle(ADMIN_SETTINGS.feeReserveMinimum)).toBeVisible();
    expect(screen.getAllByText('https://mock-secondary.invalid')).toHaveLength(2);
    expect(screen.getByText(/GET 不触发测量/)).toBeVisible();
    expect(screen.getByText(/即使 tradingReady=true，也不代表当前可以交易/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /测速|保存|修改|编辑|急停|恢复|创建|授权/ }),
    ).not.toBeInTheDocument();
  });

  it('无设置和无进程测速缓存不补零或默认值', async () => {
    server.use(
      http.get(`${API}/admin/system`, () =>
        HttpResponse.json({ data: { ...ADMIN_SYSTEM, settings: null, endpoints: null } }),
      ),
      http.get('http://localhost/healthz', () =>
        HttpResponse.json(
          {
            data: {
              ...ADMIN_HEALTH_DEGRADED,
              database: { online: false, environmentValid: false },
              worker: { online: false, status: 'UNKNOWN', lastSeenAt: null },
            },
          },
          { status: 503 },
        ),
      ),
    );
    await mount(SystemPage);
    expect(await screen.findByText('没有进程测速缓存')).toBeVisible();
    expect(screen.getByText('平台设置记录不可用')).toBeVisible();
    expect(screen.queryByText('https://mock-secondary.invalid')).not.toBeInTheDocument();
    expect(screen.queryByTitle(ADMIN_SETTINGS.feeReserveMinimum)).not.toBeInTheDocument();
    expect(await screen.findByText('未判定在线')).toBeVisible();
  });

  it('health 503 的显式适配不能把普通 system 503 + data 当成业务成功', async () => {
    server.use(
      http.get(`${API}/admin/system`, () => HttpResponse.json({ data: ADMIN_SYSTEM }, { status: 503 })),
      http.get('http://localhost/healthz', () =>
        HttpResponse.json({ data: ADMIN_HEALTH_DEGRADED }, { status: 503 }),
      ),
    );
    await mount(SystemPage);
    expect(await screen.findByText('健康检查降级（HTTP 503）')).toBeVisible();
    expect(await screen.findByText('读取失败')).toBeVisible();
    expect(screen.queryByText('平台设置与预留政策')).not.toBeInTheDocument();
    expect(screen.queryByTitle(ADMIN_SETTINGS.feeReserveMinimum)).not.toBeInTheDocument();
  });

  it('实际金额必须为十进制文本，nullable 例外仅限已核实字段', () => {
    expect(
      adminSystemSchema.safeParse({ ...ADMIN_SYSTEM, settings: { ...ADMIN_SETTINGS, feeReserveRate: 0.001 } })
        .success,
    ).toBe(false);
    expect(
      adminOverviewSchema.safeParse({
        ...ADMIN_OVERVIEW,
        settings: null,
        worker: { ...ADMIN_OVERVIEW.worker, lastSeenAt: null },
      }).success,
    ).toBe(true);
    expect(
      adminSystemSchema.safeParse({
        ...ADMIN_SYSTEM,
        settings: { ...ADMIN_SETTINGS, maxOrderNotional: null },
      }).success,
    ).toBe(false);
    expect(
      adminSystemSchema.safeParse({
        ...ADMIN_SYSTEM,
        heartbeats: [{ id: 'worker:bad', instanceId: 'bad', lastSeenAt: null, details: {} }],
      }).success,
    ).toBe(false);
  });

  it('health 仅接受其公开的 200/ok 与 503/degraded 配对', () => {
    const degraded: ApiOutcome<unknown> = {
      kind: 'http-data',
      status: 503,
      data: ADMIN_HEALTH_DEGRADED,
      receipt: { kind: 'absent' },
      requestId: null,
      sessionEpoch: 1,
    };
    expect(parseHealthOutcome(degraded)).toMatchObject({
      httpStatus: 503,
      health: { status: 'degraded', worker: { online: true, status: 'DEGRADED' } },
    });
    expect(() => parseHealthOutcome({ ...degraded, status: 500 })).toThrow(ApiOutcomeError);
    expect(() =>
      parseHealthOutcome({ ...degraded, data: { ...ADMIN_HEALTH_DEGRADED, status: 'ok' } }),
    ).toThrow();
    expect(() => parseHealthOutcome({ ...degraded, data: ADMIN_SYSTEM })).toThrow();
  });
});
