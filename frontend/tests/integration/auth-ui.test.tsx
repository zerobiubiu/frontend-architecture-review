import { QueryClient, type QueryKey, useQuery } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRouter,
  RouterContextProvider,
  type RouterHistory,
  RouterProvider,
} from '@tanstack/react-router';
import { act, fireEvent, type RenderResult, render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { type ReactNode, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { router as applicationRouter } from '@/app/router';
import { ProtectedRoute } from '@/app/router/protected-route';
import { type AppServices, createAppServices } from '@/app/runtime';
import type { SessionBroadcastChannel, SessionBroadcastMessage } from '@/app/session/broadcast';
import type { SessionActionResult } from '@/app/session/manager';
import type { Capability } from '@/features/auth/permissions';
import type { AuthApi, AuthSessionData, AuthUser, LoginInput, LogoutData } from '@/features/auth/types';
import type { ApiOutcome } from '@/services/api/types';
import type { BusinessEventSource, BusinessEventSourceFactory } from '@/services/realtime/manager';
import { ADMIN_USER, AUTH_DATA, OWNER_USER, TRADER_USER } from '../msw/auth-fixtures';

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let accept: ((value: T) => void) | undefined;
  // 项目编译目标为 ES2023，尚无 Promise.withResolvers 的标准库声明。
  const promise = new Promise<T>((resolve) => {
    accept = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!accept) throw new Error('受控 Promise 尚未初始化');
      accept(value);
    },
  };
}

type SessionOutcome = ApiOutcome<AuthSessionData>;
type LogoutOutcome = ApiOutcome<LogoutData>;

function success<T>(data: T): ApiOutcome<T> {
  return {
    kind: 'success',
    status: 200,
    data,
    receipt: { kind: 'absent' },
    requestId: 'req-auth-ui',
    sessionEpoch: 0,
  };
}

function sessionData(user: AuthUser): AuthSessionData {
  return { ...AUTH_DATA, user };
}

function rejected(code = 'UNAUTHENTICATED', status = 401): SessionOutcome {
  return {
    kind: 'http-error',
    status,
    error: {
      code,
      message: code === 'LOGIN_FAILED' ? '账号或密码错误' : '请先登录',
      requestId: 'req-auth-ui',
    },
    receipt: { kind: 'absent' },
    sessionEpoch: 0,
  };
}

function networkFailure<T>(): ApiOutcome<T> {
  return {
    kind: 'transport-error',
    reason: 'network',
    attempted: true,
    message: '测试网络已断开',
    sessionEpoch: 0,
  };
}

interface ControlledAuthApi extends AuthApi {
  readonly me: Mock<AuthApi['me']>;
  readonly login: Mock<AuthApi['login']>;
  readonly logout: Mock<AuthApi['logout']>;
}

function createControlledApi(): ControlledAuthApi {
  return {
    me: vi.fn<AuthApi['me']>().mockResolvedValue(rejected()),
    login: vi.fn<AuthApi['login']>().mockResolvedValue(success(AUTH_DATA)),
    logout: vi.fn<AuthApi['logout']>().mockResolvedValue(success<LogoutData>({ loggedOut: true })),
  } satisfies AuthApi;
}

class FakeEventSource implements BusinessEventSource {
  onopen: BusinessEventSource['onopen'] = null;
  onmessage: BusinessEventSource['onmessage'] = null;
  onerror: BusinessEventSource['onerror'] = null;
  closed = false;

  close() {
    this.closed = true;
  }

  open() {
    if (!this.closed) this.onopen?.(new Event('open'));
  }
}

class FakeBroadcastChannel implements SessionBroadcastChannel {
  readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();
  readonly messages: SessionBroadcastMessage[] = [];
  closed = false;

  postMessage(message: SessionBroadcastMessage) {
    if (!this.closed) this.messages.push(message);
  }

  addEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void) {
    this.listeners.delete(listener);
  }

  close() {
    // 故意不替生产代码移除监听器，避免掩盖 stop 的清理缺失。
    this.closed = true;
  }

  receive(message: SessionBroadcastMessage) {
    if (this.closed) return;
    for (const listener of this.listeners) listener(new MessageEvent('message', { data: message }));
  }
}

async function flushUi() {
  // 让 React 与 Query 的当前通知批次落定；长时钟边界由状态机单元测试负责。
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

function SensitiveCacheConsumer({ queryKey }: { readonly queryKey: QueryKey }) {
  const query = useQuery<string>({
    queryKey,
    enabled: false,
    queryFn: () => {
      throw new Error('缓存消费者不得发起业务请求');
    },
  });
  return <output aria-label="受保护缓存消费者">{query.data ?? '无敏感缓存'}</output>;
}

interface CacheConsumerOptions {
  readonly queryKey: QueryKey;
  readonly capability?: Capability;
}

interface MountedUi {
  readonly router: typeof applicationRouter;
  readonly history: RouterHistory;
  readonly initial: Promise<SessionActionResult>;
}

interface UiHarness {
  readonly api: ControlledAuthApi;
  readonly services: AppServices;
  readonly sources: FakeEventSource[];
  readonly channels: FakeBroadcastChannel[];
  readonly createEventSource: Mock<BusinessEventSourceFactory>;
  readonly broadcastFactory: Mock<() => FakeBroadcastChannel>;
  readonly user: UserEvent;
  readonly maximumLiveSources: number;
  readonly maximumLiveChannels: number;
  unmount(): void;
  mount(entry?: string, cacheConsumer?: CacheConsumerOptions): Promise<MountedUi>;
}

const harnesses: UiHarness[] = [];

function createHarness(api = createControlledApi()): UiHarness {
  const sources: FakeEventSource[] = [];
  const channels: FakeBroadcastChannel[] = [];
  let maximumLiveSources = 0;
  let maximumLiveChannels = 0;
  const createEventSource = vi.fn<BusinessEventSourceFactory>(() => {
    const source = new FakeEventSource();
    sources.push(source);
    maximumLiveSources = Math.max(maximumLiveSources, sources.filter((item) => !item.closed).length);
    return source;
  });
  const broadcastFactory = vi.fn(() => {
    const channel = new FakeBroadcastChannel();
    channels.push(channel);
    maximumLiveChannels = Math.max(maximumLiveChannels, channels.filter((item) => !item.closed).length);
    return channel;
  });
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const services = createAppServices({
    baseUrl: 'http://localhost/api/v1',
    queryClient,
    authApi: api,
    createEventSource,
    broadcastFactory,
  });
  const user = userEvent.setup();
  let view: RenderResult | null = null;
  let mountedHistory: RouterHistory | null = null;

  const harness: UiHarness = {
    api,
    services,
    sources,
    channels,
    createEventSource,
    broadcastFactory,
    user,
    get maximumLiveSources() {
      return maximumLiveSources;
    },
    get maximumLiveChannels() {
      return maximumLiveChannels;
    },
    unmount() {
      view?.unmount();
      view = null;
      mountedHistory?.destroy();
      mountedHistory = null;
    },
    async mount(entry = '/', cacheConsumer?: CacheConsumerOptions) {
      const history = createMemoryHistory({ initialEntries: [entry] });
      mountedHistory = history;
      const router = createRouter({
        routeTree: applicationRouter.routeTree,
        history,
        defaultPreload: false,
        defaultPendingMs: 0,
        defaultPendingMinMs: 0,
        scrollRestoration: false,
      });
      await router.load();
      let children: ReactNode = <RouterProvider router={router} />;
      if (cacheConsumer) {
        // 公共 Router 上增加真实 Query 消费者，不修改应用 routeTree 或替换权限守卫。
        children = (
          <RouterContextProvider router={router}>
            {children}
            <ProtectedRoute capability={cacheConsumer.capability}>
              <SensitiveCacheConsumer queryKey={cacheConsumer.queryKey} />
            </ProtectedRoute>
          </RouterContextProvider>
        );
      }
      view = render(
        <StrictMode>
          <AppProviders services={services}>{children}</AppProviders>
        </StrictMode>,
      );
      // effect 已启动；公开 restore 与当前检查合并，仅取得其完成边界，不启动第二次检查。
      const initial = services.session.restore();
      await flushUi();
      return { router, history, initial };
    },
  };
  harnesses.push(harness);
  return harness;
}

async function finishInitial(
  initial: Promise<SessionActionResult>,
  request: Deferred<SessionOutcome>,
  outcome: SessionOutcome,
) {
  await act(async () => {
    request.resolve(outcome);
    await initial;
  });
  await flushUi();
}

async function fillLogin(user: UserEvent, input: LoginInput) {
  if (input.username) await user.type(screen.getByRole('textbox', { name: /用户名/ }), input.username);
  if (input.password) await user.type(screen.getByLabelText(/密码/), input.password);
}

async function selectUserAction(harness: UiHarness, label: string) {
  await harness.user.click(screen.getByRole('button', { name: '用户菜单' }));
  await harness.user.click(screen.getByRole('menuitem', { name: label }));
  await flushUi();
}

beforeEach(() => {
  sessionStorage.clear();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('认证界面测试未设业务数据桩，禁止真实网络'));
});

afterEach(async () => {
  const cleanupStates = harnesses.splice(0).map((harness) => {
    const queries = harness.services.queryClient.getQueryCache().getAll();
    harness.unmount();
    // 先记录 Provider 的真实清理结果，再作兜底；即使清理断言失败也不污染下一例。
    const state = {
      sourcesClosed: harness.sources.every((source) => source.closed),
      channelsClosed: harness.channels.every((channel) => channel.closed && channel.listeners.size === 0),
      observersDetached: queries.every((query) => query.getObserversCount() === 0),
    };
    harness.services.businessSync.stop();
    harness.services.session.stop();
    harness.services.convergence.stop();
    harness.services.queryClient.clear();
    return state;
  });
  try {
    await flushUi();
    for (const state of cleanupStates) {
      expect(state).toEqual({ sourcesClosed: true, channelsClosed: true, observersDetached: true });
    }
  } finally {
    vi.restoreAllMocks();
    sessionStorage.clear();
  }
});

describe('真实 Provider、路由与会话拥有者的认证界面边界', () => {
  it('构造无副作用，严格模式只在 effect 启动且确认前不暴露工作台或旧缓存', async () => {
    const pending = deferred<SessionOutcome>();
    const api = createControlledApi();
    api.me.mockReturnValue(pending.promise);
    const harness = createHarness(api);
    const oldKey = ['session', 0, TRADER_USER.id, null, 'orders', '旧身份'] as const;
    harness.services.queryClient.setQueryData(oldKey, '旧身份的敏感订单缓存');
    expect(api.me).not.toHaveBeenCalled();
    expect(api.login).not.toHaveBeenCalled();
    expect(api.logout).not.toHaveBeenCalled();
    expect(harness.broadcastFactory).not.toHaveBeenCalled();
    expect(harness.createEventSource).not.toHaveBeenCalled();

    const { initial } = await harness.mount('/', { queryKey: oldKey });
    expect(screen.queryByRole('heading', { name: '工作台' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('application-shell')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('受保护缓存消费者')).not.toBeInTheDocument();
    expect(screen.queryByText('旧身份的敏感订单缓存')).not.toBeInTheDocument();
    expect(harness.services.queryClient.getQueryData(oldKey)).toBeUndefined();
    expect(harness.services.session.getCsrfToken()).toBeNull();
    expect(api.me).toHaveBeenCalledTimes(1);
    expect(harness.sources).toHaveLength(0);
    expect(harness.channels).toHaveLength(2);
    expect(harness.maximumLiveChannels).toBe(1);

    await finishInitial(initial, pending, success(AUTH_DATA));
    expect(await screen.findByRole('heading', { name: '工作台' })).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByLabelText('受保护缓存消费者')).toHaveTextContent('无敏感缓存');
    expect(harness.sources.filter((source) => !source.closed)).toHaveLength(1);
    expect(harness.createEventSource).toHaveBeenCalledWith('http://localhost/api/v1/events', {
      withCredentials: true,
    });
    await act(async () => {
      harness.sources[0]?.open();
    });
    expect(screen.getByText('业务通知已连接')).toBeInTheDocument();

    harness.unmount();
    expect(
      harness.sources.every(
        (source) =>
          source.closed && source.onopen === null && source.onmessage === null && source.onerror === null,
      ),
    ).toBe(true);
    expect(harness.channels.every((channel) => channel.closed && channel.listeners.size === 0)).toBe(true);
    const sourceCount = harness.sources.length;
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    await flushUi();
    expect(harness.sources).toHaveLength(sourceCount);

    const remount = await harness.mount('/');
    await remount.initial;
    expect(screen.getByRole('heading', { name: '工作台' })).toBeInTheDocument();
    expect(harness.sources.filter((source) => !source.closed)).toHaveLength(1);
    expect(harness.maximumLiveSources).toBe(1);
    expect(harness.maximumLiveChannels).toBe(1);
  });

  it.each([
    { label: '空用户名', input: { username: '', password: '测试口令' }, message: '请输入用户名' },
    { label: '空密码', input: { username: 'trader', password: '' }, message: '请输入密码（输入空格会保留）' },
    {
      label: '超长用户名',
      input: { username: 'u'.repeat(65), password: '测试口令' },
      message: '用户名过长，请减少字符',
    },
    {
      label: '超长密码',
      input: { username: 'trader', password: 'p'.repeat(129) },
      message: '密码过长，不会自动截断',
    },
  ])('公开登录校验拒绝$label，真实表单不发送认证请求', async ({ input, message }) => {
    const harness = createHarness();
    const { initial } = await harness.mount('/login');
    await initial;
    await fillLogin(harness.user, input);
    await harness.user.click(screen.getByRole('button', { name: '登录' }));
    await flushUi();
    expect(within(screen.getByRole('form', { name: '平台登录' })).getByText(message)).toBeInTheDocument();
    expect(harness.api.login).not.toHaveBeenCalled();
    expect(harness.sources).toHaveLength(0);
  });

  it('登录保留原始首尾空格，同一时刻重复提交只发送一次且失败后清空密码不持久化', async () => {
    const response = deferred<SessionOutcome>();
    const entered = deferred<void>();
    const harness = createHarness();
    harness.api.login.mockImplementation(() => {
      entered.resolve(undefined);
      return response.promise;
    });
    const storageWrites = vi.spyOn(Storage.prototype, 'setItem');
    const { initial } = await harness.mount('/login');
    await initial;
    const input: LoginInput = { username: ' trader ', password: '  测试口令  ' };
    await fillLogin(harness.user, input);
    const form = screen.getByRole('form', { name: '平台登录' });
    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
      await entered.promise;
    });
    expect(harness.api.login).toHaveBeenCalledTimes(1);
    expect(harness.api.login.mock.calls[0]?.[0]).toEqual(input);
    expect(screen.getByRole('button', { name: '正在登录' })).toBeDisabled();
    const username = screen.getByRole('textbox', { name: /用户名/ });
    const password = screen.getByLabelText(/密码/);
    expect(username).toHaveAttribute('aria-disabled', 'true');
    expect(password).toHaveAttribute('aria-disabled', 'true');
    await harness.user.type(username, '不应写入');
    await harness.user.type(password, '不应写入');
    expect(username).toHaveValue(input.username);
    expect(password).toHaveValue(input.password);
    expect(screen.queryByTestId('application-shell')).not.toBeInTheDocument();

    await act(async () => {
      response.resolve(rejected('LOGIN_FAILED'));
    });
    await flushUi();
    expect(
      within(screen.getByRole('form', { name: '平台登录' })).getByText('账号或密码错误'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/密码/)).toHaveValue('');
    expect(screen.getByRole('textbox', { name: /用户名/ })).toHaveValue(input.username);
    expect(screen.getByRole('button', { name: '登录' })).toBeEnabled();
    expect(JSON.stringify(storageWrites.mock.calls)).not.toContain(input.password);
    expect(JSON.stringify(storageWrites.mock.calls)).not.toContain(AUTH_DATA.csrfToken);
    expect(JSON.stringify(harness.channels.flatMap((channel) => channel.messages))).not.toContain(
      input.password,
    );
    expect(
      JSON.stringify(
        harness.services.queryClient
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain(input.password);
  });

  it('公开登录校验接受六十四位用户名及一百二十八个空格密码，不截断或套用创建用户规则', async () => {
    const harness = createHarness();
    harness.api.login.mockResolvedValue(rejected('LOGIN_FAILED'));
    const { initial } = await harness.mount('/login');
    await initial;
    const input: LoginInput = { username: 'u'.repeat(64), password: ' '.repeat(128) };
    await fillLogin(harness.user, input);
    await harness.user.click(screen.getByRole('button', { name: '登录' }));
    await flushUi();
    expect(harness.api.login).toHaveBeenCalledTimes(1);
    expect(harness.api.login.mock.calls[0]?.[0]).toEqual(input);
    expect(screen.getByLabelText(/密码/)).toHaveValue('');
  });

  it('匿名直接访问受保护地址后经真实登录返回原能力页，成功身份与令牌不落持久存储', async () => {
    const harness = createHarness();
    const storageWrites = vi.spyOn(Storage.prototype, 'setItem');
    const { history, initial } = await harness.mount('/dev/access/trading');
    await initial;
    await flushUi();
    expect(history.location.pathname).toBe('/login');
    expect(new URL(history.location.href, 'http://localhost').searchParams.get('returnTo')).toBe(
      '/dev/access/trading',
    );
    expect(screen.getByRole('heading', { name: '登录美股交易管理' })).toBeInTheDocument();
    await fillLogin(harness.user, { username: TRADER_USER.username, password: ' 原始登录密码 ' });
    await harness.user.click(screen.getByRole('button', { name: '登录' }));
    await flushUi();
    expect(history.location.pathname).toBe('/dev/access/trading');
    expect(screen.getByRole('heading', { name: '交易执行权限已验证' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '无权访问' })).not.toBeInTheDocument();
    expect(screen.getByTestId('current-username')).toHaveTextContent(TRADER_USER.username);
    expect(harness.services.session.getCsrfToken()).toBe(AUTH_DATA.csrfToken);
    expect(JSON.stringify(storageWrites.mock.calls)).not.toContain('原始登录密码');
    expect(JSON.stringify(storageWrites.mock.calls)).not.toContain(AUTH_DATA.csrfToken);
    expect(JSON.stringify(harness.channels.flatMap((channel) => channel.messages))).not.toContain(
      AUTH_DATA.csrfToken,
    );
    expect(JSON.stringify(harness.channels.flatMap((channel) => channel.messages))).not.toContain(
      TRADER_USER.id,
    );
  });

  it.each([
    { label: '交易员', user: TRADER_USER, trading: true, administration: false, manageAdmins: false },
    { label: '普通管理员', user: ADMIN_USER, trading: false, administration: true, manageAdmins: false },
    { label: '专项管理员', user: OWNER_USER, trading: false, administration: true, manageAdmins: true },
  ])('$label / 导航和直接地址使用当前角色，管理员不继承交易且专项授权独立', async (role) => {
    const api = createControlledApi();
    api.me.mockResolvedValue(success(sessionData(role.user)));
    const harness = createHarness(api);
    const { router, history, initial } = await harness.mount('/');
    await initial;
    expect(screen.getByRole('heading', { name: '工作台' })).toBeInTheDocument();
    const navigation = within(screen.getByRole('navigation', { name: '应用导航' }));
    expect(navigation.getByRole('link', { name: '订单查询' })).toBeInTheDocument();
    expect(Boolean(navigation.queryByRole('link', { name: '用户查询' }))).toBe(role.administration);
    const routes = [
      { path: '/dev/access/trading', allowed: role.trading, heading: '交易执行权限已验证' },
      { path: '/dev/access/administration', allowed: role.administration, heading: '系统管理权限已验证' },
      { path: '/dev/access/manage-admins', allowed: role.manageAdmins, heading: '管理员授权权限已验证' },
    ];
    for (const route of routes) {
      await act(async () => {
        await router.navigate({ href: route.path });
      });
      await flushUi();
      expect(history.location.pathname).toBe(route.path);
      if (route.allowed) {
        expect(screen.getByRole('heading', { name: route.heading })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: '无权访问' })).not.toBeInTheDocument();
      } else {
        expect(screen.getByRole('heading', { name: '无权访问' })).toBeInTheDocument();
        expect(screen.queryByTestId('capability-probe')).not.toBeInTheDocument();
        await harness.user.click(screen.getByRole('button', { name: '返回工作台' }));
        await flushUi();
        expect(history.location.pathname).toBe('/');
        expect(screen.getByRole('heading', { name: '工作台' })).toBeInTheDocument();
      }
    }
    expect(api.me).toHaveBeenCalledTimes(1);
    expect(api.login).not.toHaveBeenCalled();
  });

  it('显式复核降权先隔离旧权限页和真实缓存消费者，返回后原地址立即无权访问', async () => {
    const recheck = deferred<SessionOutcome>();
    const api = createControlledApi();
    api.me.mockResolvedValueOnce(success(sessionData(OWNER_USER))).mockReturnValue(recheck.promise);
    const harness = createHarness(api);
    const cacheKey = ['session', '专项权限缓存'] as const;
    const { history, initial } = await harness.mount('/dev/access/manage-admins', {
      queryKey: cacheKey,
      capability: 'manage-admins',
    });
    await initial;
    await act(async () => {
      harness.services.queryClient.setQueryData(cacheKey, '仅旧专项身份可见的缓存');
    });
    await flushUi();
    expect(screen.getByRole('heading', { name: '管理员授权权限已验证' })).toBeInTheDocument();
    expect(screen.getByLabelText('受保护缓存消费者')).toHaveTextContent('仅旧专项身份可见的缓存');
    const previousSource = harness.sources.find((source) => !source.closed);
    const previousSignal = harness.services.session.getSessionSignal();
    await selectUserAction(harness, '重新验证会话');
    expect(api.me).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('application-shell')).not.toBeInTheDocument();
    expect(screen.queryByTestId('capability-probe')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('受保护缓存消费者')).not.toBeInTheDocument();
    expect(screen.queryByText('仅旧专项身份可见的缓存')).not.toBeInTheDocument();
    expect(harness.services.queryClient.getQueryData(cacheKey)).toBeUndefined();
    expect(harness.services.session.getCsrfToken()).toBeNull();
    expect(previousSignal.aborted).toBe(true);
    expect(previousSource?.closed).toBe(true);
    const currentCheck = harness.services.session.restore();
    await finishInitial(
      currentCheck,
      recheck,
      success(sessionData({ ...OWNER_USER, canManageAdmins: false })),
    );
    expect(history.location.pathname).toBe('/dev/access/manage-admins');
    expect(screen.getAllByRole('heading', { name: '无权访问' })).toHaveLength(2);
    expect(screen.queryByTestId('capability-probe')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('受保护缓存消费者')).not.toBeInTheDocument();
    const navigation = within(screen.getByRole('navigation', { name: '应用导航' }));
    expect(navigation.getByRole('link', { name: '订单查询' })).toBeInTheDocument();
    expect(navigation.getByRole('link', { name: '用户查询' })).toBeInTheDocument();
  });

  it('注销未确认保持隔离，焦点、网络与广播不自动恢复，只有显式重试再次发送原注销令牌', async () => {
    const firstLogout = deferred<LogoutOutcome>();
    const retryLogout = deferred<LogoutOutcome>();
    const api = createControlledApi();
    api.me.mockResolvedValue(success(AUTH_DATA));
    api.logout.mockReturnValueOnce(firstLogout.promise).mockReturnValueOnce(retryLogout.promise);
    const harness = createHarness(api);
    const { history, initial } = await harness.mount('/');
    await initial;
    const oldSignal = harness.services.session.getSessionSignal();
    await selectUserAction(harness, '退出登录');
    expect(screen.getByRole('heading', { name: '正在退出登录' })).toBeInTheDocument();
    expect(screen.queryByTestId('application-shell')).not.toBeInTheDocument();
    expect(oldSignal.aborted).toBe(true);
    expect(harness.services.session.getCsrfToken()).toBeNull();
    expect(harness.sources.every((source) => source.closed)).toBe(true);
    await act(async () => {
      firstLogout.resolve(networkFailure<LogoutData>());
    });
    await flushUi();
    expect(screen.getByRole('heading', { name: '服务端注销未确认' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试退出' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '重新验证当前凭据（可能恢复会话）' })).toBeEnabled();
    expect(screen.queryByRole('heading', { name: '登录美股交易管理' })).not.toBeInTheDocument();
    await act(async () => {
      harness.channels.find((channel) => !channel.closed)?.receive({ type: 'session-settled' });
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
    });
    await flushUi();
    expect(api.me).toHaveBeenCalledTimes(1);
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: '服务端注销未确认' })).toBeInTheDocument();
    expect(harness.sources.filter((source) => !source.closed)).toHaveLength(0);

    await harness.user.click(screen.getByRole('button', { name: '重试退出' }));
    await flushUi();
    expect(api.logout).toHaveBeenCalledTimes(2);
    expect(api.logout.mock.calls.map(([token]) => token)).toEqual([AUTH_DATA.csrfToken, AUTH_DATA.csrfToken]);
    expect(api.me).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: '正在退出登录' })).toBeInTheDocument();
    await act(async () => {
      retryLogout.resolve(success<LogoutData>({ loggedOut: true }));
    });
    await flushUi();
    expect(history.location.pathname).toBe('/login');
    expect(screen.getByRole('heading', { name: '登录美股交易管理' })).toBeInTheDocument();
    expect(screen.getByLabelText(/密码/)).toHaveValue('');
    expect(screen.queryByTestId('application-shell')).not.toBeInTheDocument();
    expect(harness.services.session.getSnapshot().status).toBe('anonymous');
  });

  it.each([
    { label: '当前凭据仍有效', outcome: success(sessionData(ADMIN_USER)), authenticated: true },
    { label: '当前凭据已经失效', outcome: rejected(), authenticated: false },
  ])('注销未确认后$label，显式核对之前绝不自动恢复身份', async ({ outcome, authenticated }) => {
    const recheck = deferred<SessionOutcome>();
    const api = createControlledApi();
    api.me.mockResolvedValueOnce(success(AUTH_DATA)).mockReturnValue(recheck.promise);
    api.logout.mockResolvedValue(networkFailure<LogoutData>());
    const harness = createHarness(api);
    const { initial } = await harness.mount('/');
    await initial;
    await selectUserAction(harness, '退出登录');
    expect(screen.getByRole('heading', { name: '服务端注销未确认' })).toBeInTheDocument();
    await flushUi();
    expect(api.me).toHaveBeenCalledTimes(1);
    await harness.user.click(screen.getByRole('button', { name: '重新验证当前凭据（可能恢复会话）' }));
    await flushUi();
    expect(api.me).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('application-shell')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '登录美股交易管理' })).not.toBeInTheDocument();
    const currentCheck = harness.services.session.restore();
    await finishInitial(currentCheck, recheck, outcome);
    if (authenticated) {
      expect(screen.getByRole('heading', { name: '工作台' })).toBeInTheDocument();
      expect(screen.getByTestId('identity-name')).toHaveTextContent(ADMIN_USER.username);
      const navigation = within(screen.getByRole('navigation', { name: '应用导航' }));
      expect(navigation.getByRole('link', { name: '订单查询' })).toBeInTheDocument();
      expect(navigation.getByRole('link', { name: '用户查询' })).toBeInTheDocument();
    } else {
      expect(screen.getByRole('heading', { name: '登录美股交易管理' })).toBeInTheDocument();
      expect(screen.queryByTestId('application-shell')).not.toBeInTheDocument();
      expect(harness.sources.every((source) => source.closed)).toBe(true);
    }
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(api.me).toHaveBeenCalledTimes(2);
  });

  it('认证服务不可达不伪装匿名或工作台，仅显式复核恢复真实身份', async () => {
    const api = createControlledApi();
    api.me.mockResolvedValueOnce(networkFailure<AuthSessionData>()).mockResolvedValue(success(AUTH_DATA));
    const harness = createHarness(api);
    const { history, initial } = await harness.mount('/');
    await initial;
    expect(history.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { name: '暂时无法确认会话' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '登录美股交易管理' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('application-shell')).not.toBeInTheDocument();
    expect(harness.sources).toHaveLength(0);
    await flushUi();
    expect(api.me).toHaveBeenCalledTimes(1);
    await harness.user.click(screen.getByRole('button', { name: '重新验证会话' }));
    await flushUi();
    expect(screen.getByRole('heading', { name: '工作台' })).toBeInTheDocument();
    expect(api.me).toHaveBeenCalledTimes(2);
  });

  it.each([
    { label: '旧管理员成功', outcome: success(sessionData(OWNER_USER)) },
    { label: '旧四零一', outcome: rejected() },
    { label: '旧四零三', outcome: rejected('CSRF_INVALID', 403) },
  ])('$label / 不能污染同一会话拥有者后发的真实交易员登录', async ({ outcome }) => {
    const oldMe = deferred<SessionOutcome>();
    const newLogin = deferred<SessionOutcome>();
    const api = createControlledApi();
    api.me.mockReturnValue(oldMe.promise);
    api.login.mockReturnValue(newLogin.promise);
    const harness = createHarness(api);
    const { initial } = await harness.mount('/login');
    let login: Promise<SessionActionResult> = Promise.resolve({ kind: 'stale' });
    await act(async () => {
      login = harness.services.session.login({ username: TRADER_USER.username, password: ' 新交易员密码 ' });
    });
    expect(api.login).not.toHaveBeenCalled();
    await act(async () => {
      oldMe.resolve(outcome);
      expect(await initial).toEqual({ kind: 'stale' });
    });
    await flushUi();
    expect(api.login).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('application-shell')).not.toBeInTheDocument();
    expect(harness.services.session.getCsrfToken()).toBeNull();
    await act(async () => {
      newLogin.resolve(success(AUTH_DATA));
      expect(await login).toEqual({ kind: 'success' });
    });
    await flushUi();
    expect(screen.getByRole('heading', { name: '工作台' })).toBeInTheDocument();
    expect(screen.getByTestId('identity-name')).toHaveTextContent(TRADER_USER.username);
    const navigation = within(screen.getByRole('navigation', { name: '应用导航' }));
    expect(navigation.getByRole('link', { name: '订单查询' })).toBeInTheDocument();
    expect(navigation.queryByRole('link', { name: '用户查询' })).not.toBeInTheDocument();
  });

  it('旧页面已卸载的登录动作迟到，不清空新登录表单也不污染新角色', async () => {
    const oldLogin = deferred<SessionOutcome>();
    const previous = createHarness();
    previous.api.login.mockReturnValue(oldLogin.promise);
    const oldMount = await previous.mount('/login');
    await oldMount.initial;
    await fillLogin(previous.user, { username: OWNER_USER.username, password: ' 旧页面密码 ' });
    await previous.user.click(screen.getByRole('button', { name: '登录' }));
    await flushUi();
    expect(previous.api.login).toHaveBeenCalledTimes(1);
    previous.unmount();

    const current = createHarness();
    const newMount = await current.mount('/login');
    await newMount.initial;
    const newInput: LoginInput = { username: TRADER_USER.username, password: ' 新页面尚未提交的密码 ' };
    await fillLogin(current.user, newInput);
    await act(async () => {
      oldLogin.resolve(success(sessionData(OWNER_USER)));
    });
    await flushUi();
    expect(screen.getByRole('textbox', { name: /用户名/ })).toHaveValue(newInput.username);
    expect(screen.getByLabelText(/密码/)).toHaveValue(newInput.password);
    expect(screen.getByRole('button', { name: '登录' })).toBeEnabled();
    expect(current.api.login).not.toHaveBeenCalled();
    expect(current.services.session.getSnapshot().status).toBe('anonymous');
    expect(previous.sources).toHaveLength(0);
    await current.user.click(screen.getByRole('button', { name: '登录' }));
    await flushUi();
    expect(current.api.login.mock.calls[0]?.[0]).toEqual(newInput);
    expect(screen.getByTestId('identity-name')).toHaveTextContent(TRADER_USER.username);
    const navigation = within(screen.getByRole('navigation', { name: '应用导航' }));
    expect(navigation.queryByRole('link', { name: '用户查询' })).not.toBeInTheDocument();
  });
});
