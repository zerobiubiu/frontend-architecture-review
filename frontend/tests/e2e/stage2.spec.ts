import { expect, type Page, test } from '@playwright/test';
import {
  controlProtocol,
  DEVELOPMENT_ORIGIN,
  PREVIEW_ORIGIN,
  PROTOCOL_ORIGIN,
  PROTOCOL_PASSWORD,
  readProtocolState,
  type StubIdentity,
  waitForGate,
} from '../protocol/control.js';

interface StreamObservation {
  active: number;
  maximum: number;
  created: number;
  closed: number;
  credentialed: boolean[];
  frames: string[];
}

declare global {
  interface Window {
    __protocolStreams: StreamObservation;
    __protocolBroadcasts: unknown[];
  }
}

async function login(page: Page, username: StubIdentity = 'trader'): Promise<void> {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: '登录美股交易管理' })).toBeVisible();
  await page.getByRole('textbox', { name: /用户名/ }).fill(username);
  await page.getByLabel(/密码/).fill(PROTOCOL_PASSWORD);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '工作台', exact: true })).toBeVisible();
  await expect(page.getByTestId('identity-name')).toHaveText(username);
  await expect(
    page.getByRole('navigation', { name: '应用顶栏' }).getByText('业务通知已连接', { exact: true }),
  ).toBeVisible();
}

async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: '用户菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '退出登录', exact: true }).click();
}

async function colors(page: Page): Promise<{ body: string; card: string; text: string }> {
  return page.evaluate(() => {
    const shell = document.querySelector('[data-testid="application-shell"]');
    const card = shell?.querySelector('.astryx-card');
    const identity = document.querySelector('[data-testid="identity-name"]');
    if (!shell || !card || !identity) throw new Error('未找到工作台主题探针');
    return {
      body: getComputedStyle(shell).backgroundColor,
      card: getComputedStyle(card).backgroundColor,
      text: getComputedStyle(identity).color,
    };
  });
}

test.beforeEach(async ({ context, request }) => {
  await controlProtocol(request, 'reset');
  await context.addInitScript(() => {
    // 只观察真正的原生 EventSource，不替代网络、Cookie、CORS 或连接状态。
    const NativeEventSource = window.EventSource;
    const observation: StreamObservation = {
      active: 0,
      maximum: 0,
      created: 0,
      closed: 0,
      credentialed: [],
      frames: [],
    };
    window.__protocolStreams = observation;
    window.EventSource = class extends NativeEventSource {
      private observedClosed = false;

      constructor(url: string | URL, options?: EventSourceInit) {
        super(url, options);
        observation.active += 1;
        observation.created += 1;
        observation.maximum = Math.max(observation.maximum, observation.active);
        observation.credentialed.push(this.withCredentials);
        this.addEventListener('message', (event) => observation.frames.push(event.data));
      }

      override close(): void {
        if (!this.observedClosed) {
          this.observedClosed = true;
          observation.active -= 1;
          observation.closed += 1;
        }
        super.close();
      }
    };
    window.__protocolBroadcasts = [];
    const observer = new BroadcastChannel('binance-stocks-session');
    observer.addEventListener('message', (event) => window.__protocolBroadcasts.push(event.data));
    window.addEventListener('pagehide', () => observer.close(), { once: true });
  });
});

test('协议桩显式标识、来源白名单、预检、CSRF 与未匹配路由隔离', async ({ request }) => {
  const health = await request.get(`${PROTOCOL_ORIGIN}/__stub/healthz`);
  expect(await health.json()).toEqual({ mock: true, name: 'frontend-protocol-stub', trading: false });
  for (const origin of ['http://localhost:5173', 'http://localhost:5273', 'http://localhost:4173']) {
    const response = await request.fetch(`${PROTOCOL_ORIGIN}/api/v1/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type, x-csrf-token',
      },
    });
    expect(response.status()).toBe(204);
    expect(response.headers()['access-control-allow-origin']).toBe(origin);
    expect(response.headers()['access-control-allow-credentials']).toBe('true');
    expect(response.headers()['access-control-allow-headers']).toContain('X-CSRF-Token');
  }
  const forbidden = await request.get(`${PROTOCOL_ORIGIN}/api/v1/auth/me`, {
    headers: { Origin: 'https://untrusted.invalid' },
  });
  expect(forbidden.status()).toBe(403);
  expect(forbidden.headers()['access-control-allow-origin']).toBeUndefined();
  const controlFromBrowser = await request.post(`${PROTOCOL_ORIGIN}/__stub/reset`, {
    headers: { Origin: 'http://localhost:5173', 'X-Protocol-Control': '1' },
    data: {},
  });
  expect(controlFromBrowser.status()).toBe(403);
  expect((await request.get(`${PROTOCOL_ORIGIN}/api/v1/not-implemented`)).status()).toBe(404);
  expect((await request.get(`${PROTOCOL_ORIGIN}/api/v1/auth/login`)).status()).toBe(404);

  const response = await request.post(`${PROTOCOL_ORIGIN}/api/v1/auth/login`, {
    data: { username: 'trader', password: PROTOCOL_PASSWORD },
  });
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(/^[A-Za-z0-9_-]{43}$/.test(data.data.csrfToken)).toBe(true);
  expect((await request.post(`${PROTOCOL_ORIGIN}/api/v1/auth/logout`)).status()).toBe(403);
  const wrongToken = `${data.data.csrfToken.startsWith('a') ? 'b' : 'a'}${data.data.csrfToken.slice(1)}`;
  const invalidCsrf = await request.post(`${PROTOCOL_ORIGIN}/api/v1/auth/logout`, {
    headers: { 'X-CSRF-Token': wrongToken },
  });
  expect(invalidCsrf.status()).toBe(403);
  const me = await request.get(`${PROTOCOL_ORIGIN}/api/v1/auth/me`);
  expect(me.status()).toBe(200);
  const restored = await me.json();
  expect(restored.data.csrfToken === data.data.csrfToken).toBe(true);
  expect(me.headers()['set-cookie']).toBeUndefined();
  const confirmed = await request.post(`${PROTOCOL_ORIGIN}/api/v1/auth/logout`, {
    headers: { 'X-CSRF-Token': data.data.csrfToken },
  });
  expect(await confirmed.json()).toEqual({ data: { loggedOut: true } });
  expect((await request.get(`${PROTOCOL_ORIGIN}/api/v1/auth/me`)).status()).toBe(401);
});

test('登录空值与长度字段校验阻止请求，输入不被截断', async ({ page, request }) => {
  await page.goto('/login');
  const form = page.getByRole('form', { name: '平台登录' });
  const username = page.getByRole('textbox', { name: /用户名/ });
  const password = page.getByLabel(/密码/);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(form.getByText('请输入用户名', { exact: true })).toBeVisible();
  await expect(form.getByText('请输入密码（输入空格会保留）', { exact: true })).toBeVisible();
  expect((await readProtocolState(request)).requests.login).toBe(0);
  await username.fill('u'.repeat(65));
  await password.fill('p'.repeat(129));
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(form.getByText('用户名过长，请减少字符', { exact: true })).toBeVisible();
  await expect(form.getByText('密码过长，不会自动截断', { exact: true })).toBeVisible();
  await expect(password).toHaveValue('p'.repeat(129));
  expect((await readProtocolState(request)).requests.login).toBe(0);
});

test('登录原串保留用户名和密码两端空格，不擅自修正凭据', async ({ page, request }) => {
  await page.goto('/login');
  for (const input of [
    { username: ' trader ', password: PROTOCOL_PASSWORD },
    { username: 'trader', password: ` ${PROTOCOL_PASSWORD} ` },
  ]) {
    await page.getByRole('textbox', { name: /用户名/ }).fill(input.username);
    await page.getByLabel(/密码/).fill(input.password);
    const response = page.waitForResponse(`${PROTOCOL_ORIGIN}/api/v1/auth/login`);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    expect((await response).status()).toBe(401);
    await expect(
      page.getByRole('form', { name: '平台登录' }).getByText('用户名或密码错误', { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel(/密码/)).toHaveValue('');
  }
  expect((await readProtocolState(request)).requests.login).toBe(2);
  await expect(page.getByTestId('application-shell')).toHaveCount(0);
});

for (const scenario of [
  { name: '凭据失败', mode: 'normal', username: 'unknown', message: '用户名或密码错误' },
  { name: '登录限流', mode: 'rate-limited', username: 'trader', message: '登录请求过于频繁，请稍后再试' },
  { name: '网络不可达', mode: 'network-error', username: 'trader', message: '网络不可达，暂时无法确认会话' },
  { name: '响应形状异常', mode: 'malformed', username: 'trader', message: '认证响应异常，无法确认会话' },
]) {
  test(`登录${scenario.name}独立呈现且不自动重试或伪造身份`, async ({ page, request }) => {
    await controlProtocol(request, 'config', { login: scenario.mode });
    await page.goto('/login');
    await page.getByRole('textbox', { name: /用户名/ }).fill(scenario.username);
    await page.getByLabel(/密码/).fill(PROTOCOL_PASSWORD);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(
      page.getByRole('form', { name: '平台登录' }).getByText(scenario.message, { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel(/密码/)).toHaveValue('');
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeEnabled();
    await expect(page.getByTestId('application-shell')).toHaveCount(0);
    const state = await readProtocolState(request);
    expect(state.requests.login).toBe(1);
    expect(state.streams.opened).toBe(0);
    expect(state.sessions).toHaveLength(0);
  });
}

test('登录在途禁用表单且重复提交只发送一次，完成后清除密码', async ({ page, request }) => {
  await controlProtocol(request, 'gates', { id: 'login-in-flight', endpoint: 'login' });
  await page.goto('/login');
  const form = page.getByRole('form', { name: '平台登录' });
  await page.getByRole('textbox', { name: /用户名/ }).fill('trader');
  await page.getByLabel(/密码/).fill(PROTOCOL_PASSWORD);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await waitForGate(request, 'login-in-flight');
  await expect(page.getByRole('button', { name: '正在登录', exact: true })).toBeDisabled();
  await expect(page.getByRole('textbox', { name: /用户名/ })).toBeDisabled();
  await expect(page.getByLabel(/密码/)).toBeDisabled();
  await form.evaluate((element) => {
    element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect((await readProtocolState(request)).requests.login).toBe(1);
  await controlProtocol(request, 'release', { id: 'login-in-flight' });
  await expect(page.getByTestId('identity-name')).toHaveText('trader');
  await logout(page);
  await expect(page.getByRole('heading', { name: '登录美股交易管理' })).toBeVisible();
  await expect(page.getByLabel(/密码/)).toHaveValue('');
  expect((await readProtocolState(request)).requests.login).toBe(1);
});

test('跨端口真实 Cookie、CORS 与首帧恢复身份，检查期间不闪现旧工作台', async ({ page, context, request }) => {
  await login(page);
  await expect(page.getByText('Mock · 本地协议桩', { exact: true })).toBeVisible();
  const initialCookie = (await context.cookies(PROTOCOL_ORIGIN)).find(
    (cookie) => cookie.name === 'protocol_session',
  );
  expect(Boolean(initialCookie?.httpOnly)).toBe(true);
  expect(initialCookie?.sameSite).toBe('Lax');
  expect(initialCookie?.path).toBe('/');
  expect(await page.evaluate(() => document.cookie.includes('protocol_session='))).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__protocolStreams.frames.length)).toBeGreaterThan(0);
  const streams = await page.evaluate(() => window.__protocolStreams);
  const firstFrame = streams.frames[0];
  if (!firstFrame) throw new Error('缺少真实 SSE 首帧');
  expect(JSON.parse(firstFrame)).toEqual({
    kind: 'refresh',
    resources: ['orders', 'tasks', 'accounts', 'ledger', 'events', 'settings', 'users', 'audit', 'worker'],
    at: '2026-11-10T00:00:00.000Z',
  });
  expect(streams.maximum).toBe(1);
  expect(streams.credentialed).toEqual([true]);
  const state = await readProtocolState(request);
  expect(state.cookieRequests.events).toBeGreaterThan(0);
  expect(state.requests.preflight).toBeGreaterThan(0);
  expect(
    state.history.every(
      (record) => record.path.startsWith('/api/v1/') && !record.path.includes('/api/v1/api/v1/'),
    ),
  ).toBe(true);

  await controlProtocol(request, 'gates', { id: 'restore-in-flight', endpoint: 'me' });
  await page.reload();
  await waitForGate(request, 'restore-in-flight');
  await expect(page.getByRole('status', { name: '正在确认会话' })).toBeVisible();
  await expect(page.getByTestId('application-shell')).toHaveCount(0);
  const restored = page.waitForResponse(
    (response) => response.url() === `${PROTOCOL_ORIGIN}/api/v1/auth/me` && response.status() === 200,
  );
  await controlProtocol(request, 'release', { id: 'restore-in-flight' });
  const response = await restored;
  expect(response.headers()['access-control-allow-origin']).toBe(DEVELOPMENT_ORIGIN);
  expect(response.headers()['access-control-allow-credentials']).toBe('true');
  await expect(page.getByTestId('identity-name')).toHaveText('trader');
  await expect.poll(async () => (await readProtocolState(request)).streams.active).toBe(1);
  const finalCookie = (await context.cookies(PROTOCOL_ORIGIN)).find(
    (cookie) => cookie.name === 'protocol_session',
  );
  expect(Boolean(initialCookie && finalCookie && initialCookie.value === finalCookie.value)).toBe(true);
  expect((await readProtocolState(request)).cookieRequests.me).toBeGreaterThan(0);
  const data = await response.json();
  expect(/^[A-Za-z0-9_-]{43}$/.test(data.data.csrfToken)).toBe(true);
  expect(
    await page.evaluate(
      (token) =>
        [...Object.values(localStorage), ...Object.values(sessionStorage)].some((value) =>
          String(value).includes(token),
        ),
      data.data.csrfToken,
    ),
  ).toBe(false);
});

test('退出网络未知立即清理界面与源，不静默核对，只有显式重试才再次注销', async ({
  page,
  context,
  request,
}) => {
  await page.clock.install();
  await login(page);
  const before = await readProtocolState(request);
  await controlProtocol(request, 'config', { logout: 'network-error' });
  await controlProtocol(request, 'gates', { id: 'logout-in-flight', endpoint: 'logout' });
  await logout(page);
  await waitForGate(request, 'logout-in-flight');
  await expect(page.getByRole('heading', { name: '正在退出登录' })).toBeVisible();
  await expect(page.getByTestId('application-shell')).toHaveCount(0);
  await expect.poll(async () => (await readProtocolState(request)).streams.active).toBe(0);
  expect(await page.evaluate(() => window.__protocolStreams.active)).toBe(0);
  await controlProtocol(request, 'release', { id: 'logout-in-flight' });
  await expect(page.getByRole('heading', { name: '服务端注销未确认' })).toBeVisible();
  await expect(page.getByText('本地已清理', { exact: true })).toBeVisible();
  await page.clock.runFor(120_000);
  const unconfirmed = await readProtocolState(request);
  expect(unconfirmed.requests.me).toBe(before.requests.me);
  expect(unconfirmed.requests.logout).toBe(1);
  expect(unconfirmed.rejectedCsrf).toBe(0);
  expect(unconfirmed.cookieRequests.logout).toBe(1);
  expect(unconfirmed.sessions.some((session) => session.active)).toBe(true);
  expect((await context.cookies(PROTOCOL_ORIGIN)).some((cookie) => cookie.name === 'protocol_session')).toBe(
    true,
  );
  await controlProtocol(request, 'config', { logout: 'normal' });
  const retry = page.waitForResponse(`${PROTOCOL_ORIGIN}/api/v1/auth/logout`);
  await page.getByRole('button', { name: '重试退出', exact: true }).click();
  expect((await retry).status()).toBe(200);
  await expect(page.getByRole('heading', { name: '登录美股交易管理' })).toBeVisible();
  const confirmed = await readProtocolState(request);
  expect(confirmed.requests.logout).toBe(2);
  expect(confirmed.requests.me).toBe(before.requests.me);
  expect(confirmed.streams.active).toBe(0);
  expect((await context.cookies(PROTOCOL_ORIGIN)).some((cookie) => cookie.name === 'protocol_session')).toBe(
    false,
  );
});

test('注销失败后显式重新验证才允许从服务端恢复当前凭据', async ({ page, request }) => {
  await login(page);
  await controlProtocol(request, 'config', { logout: 'unavailable' });
  await logout(page);
  await expect(page.getByRole('heading', { name: '服务端注销未确认' })).toBeVisible();
  const before = await readProtocolState(request);
  const verification = page.waitForResponse(`${PROTOCOL_ORIGIN}/api/v1/auth/me`);
  await page.getByRole('button', { name: '重新验证当前凭据（可能恢复会话）', exact: true }).click();
  expect((await verification).status()).toBe(200);
  await expect(page.getByTestId('identity-name')).toHaveText('trader');
  await expect.poll(async () => (await readProtocolState(request)).streams.active).toBe(1);
  expect((await readProtocolState(request)).requests.me).toBe(before.requests.me + 1);
});

for (const role of [
  { username: 'trader', trading: true, administration: false, manageAdmins: false },
  { username: 'admin', trading: false, administration: true, manageAdmins: false },
  { username: 'owner', trading: false, administration: true, manageAdmins: true },
] as const) {
  test(`${role.username} 直接 URL 与侧栏采用同一角色及专项权限边界`, async ({ page }) => {
    await login(page, role.username);
    const navigation = page.getByRole('navigation', { name: '应用导航', exact: true });
    await expect(navigation.getByRole('link', { name: '订单查询', exact: true })).toBeVisible();
    await expect(navigation.getByRole('link', { name: '用户查询', exact: true })).toHaveCount(
      role.administration ? 1 : 0,
    );
    for (const capability of [
      { path: 'trading', label: '交易执行', allowed: role.trading },
      { path: 'administration', label: '系统管理', allowed: role.administration },
      { path: 'manage-admins', label: '管理员授权', allowed: role.manageAdmins },
    ]) {
      await page.goto(`/dev/access/${capability.path}`);
      await expect(
        page.getByRole('heading', {
          name: capability.allowed ? `${capability.label}权限已验证` : '无权访问',
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByTestId('capability-probe')).toHaveCount(capability.allowed ? 1 : 0);
    }
  });
}

test('服务端权限变更经重新核对后重新判定当前直接访问路由', async ({ page, request }) => {
  await login(page);
  await page.goto('/dev/access/trading');
  await expect(page.getByRole('heading', { name: '交易执行权限已验证' })).toBeVisible();
  await controlProtocol(request, 'identity', { user: 'admin' });
  const me = page.waitForResponse(`${PROTOCOL_ORIGIN}/api/v1/auth/me`);
  await page.getByRole('button', { name: '用户菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '重新验证会话', exact: true }).click();
  expect((await me).status()).toBe(200);
  await expect(page.getByRole('heading', { name: '无权访问', exact: true })).toBeVisible();
  await expect(page.getByTestId('current-username')).toHaveText('admin');
  await expect(page.getByTestId('capability-probe')).toHaveCount(0);
});

test('站外返回地址被拒绝，未登录直接访问只能在确认会话后进入', async ({ page, request }) => {
  await controlProtocol(request, 'gates', { id: 'anonymous-initialization', endpoint: 'me' });
  await page.goto('/dev/access/trading');
  await waitForGate(request, 'anonymous-initialization');
  await expect(page.getByTestId('capability-probe')).toHaveCount(0);
  await expect(page.getByTestId('application-shell')).toHaveCount(0);
  await controlProtocol(request, 'release', { id: 'anonymous-initialization' });
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await expect(page.getByRole('heading', { name: '登录美股交易管理' })).toBeVisible();
  await page.goto(`/login?returnTo=${encodeURIComponent('https://untrusted.invalid/account')}`);
  await page.getByRole('textbox', { name: /用户名/ }).fill('trader');
  await page.getByLabel(/密码/).fill(PROTOCOL_PASSWORD);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(`${DEVELOPMENT_ORIGIN}/`);
  await expect(page.getByTestId('identity-name')).toHaveText('trader');
});

test('桌面侧栏键盘折叠和展开实际改变宽度并保留焦点', async ({ page }) => {
  await login(page);
  const navigation = page.getByRole('navigation', { name: '应用导航', exact: true });
  const expandedWidth = await navigation.evaluate((element) => element.getBoundingClientRect().width);
  const collapse = page.getByRole('button', { name: '折叠侧栏', exact: true });
  await collapse.focus();
  await page.keyboard.press('Enter');
  const expand = page.getByRole('button', { name: '展开侧栏', exact: true });
  await expect(expand).toBeFocused();
  await expect
    .poll(() => navigation.evaluate((element) => element.getBoundingClientRect().width))
    .toBeLessThan(expandedWidth - 40);
  await page.keyboard.press('Enter');
  await expect(collapse).toBeFocused();
  await expect
    .poll(async () =>
      Math.abs(
        (await navigation.evaluate((element) => element.getBoundingClientRect().width)) - expandedWidth,
      ),
    )
    .toBeLessThan(1);
});

for (const width of [390, 320]) {
  test(`${width}px 移动导航可键盘开合、包含焦点并归还触发按钮，无横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await login(page);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true);
    const trigger = page.getByRole('button', { name: '打开导航', exact: true });
    await expect(trigger).toBeVisible();
    await expect(page.getByRole('button', { name: '折叠侧栏', exact: true })).toBeHidden();
    await trigger.focus();
    await page.keyboard.press('Enter');
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect
      .poll(() => drawer.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press(index % 2 === 0 ? 'Tab' : 'Shift+Tab');
      expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button').first().focus();
    await page.keyboard.press('Enter');
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}

test('工作台显式主题覆盖系统偏好，跟随系统改变真实背景与文字颜色', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await login(page);
  await page.getByRole('radio', { name: '浅色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const light = await colors(page);
  expect(light.body).not.toBe('rgba(0, 0, 0, 0)');
  expect(light.card).not.toBe('rgba(0, 0, 0, 0)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => colors(page)).toEqual(light);
  await page.getByRole('radio', { name: '深色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(async () => (await colors(page)).body).not.toBe(light.body);
  const dark = await colors(page);
  expect(dark.card).not.toBe(light.card);
  expect(dark.text).not.toBe(light.text);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => colors(page)).toEqual(dark);
  await page.getByRole('radio', { name: '跟随系统', exact: true }).click();
  await expect.poll(() => colors(page)).toEqual(dark);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => colors(page)).toEqual(light);
});

test('跨标签通知不采信附加身份、代次或令牌，只在受控 me 回应后确认新角色', async ({
  page,
  context,
  request,
}) => {
  await page.clock.install();
  await login(page);
  const second = await context.newPage();
  await second.clock.install();
  await second.goto('/');
  await expect(second.getByTestId('identity-name')).toHaveText('trader');
  await controlProtocol(request, 'identity', { user: 'admin' });
  await controlProtocol(request, 'gates', { id: 'cross-tab-verification', endpoint: 'me' });
  await second.evaluate(() => {
    const channel = new BroadcastChannel('binance-stocks-session');
    const forged = {
      user: { id: 'forged', username: 'forged-owner', role: 'ADMIN', canManageAdmins: true },
      epoch: 9_000_000,
      csrfToken: 'forged-not-a-real-token',
    };
    channel.postMessage({ type: 'session-changing', ...forged });
    channel.postMessage({ type: 'session-settled', ...forged });
    channel.close();
  });
  await expect(page.getByRole('status', { name: '正在确认会话' })).toBeVisible();
  await expect(page.getByTestId('application-shell')).toHaveCount(0);
  await expect(page.getByText('forged-owner', { exact: true })).toHaveCount(0);
  const me = page.waitForResponse(`${PROTOCOL_ORIGIN}/api/v1/auth/me`);
  await page.getByRole('button', { name: '手动重新验证会话', exact: true }).click();
  await waitForGate(request, 'cross-tab-verification');
  await expect(page.getByTestId('current-username')).toHaveCount(0);
  await controlProtocol(request, 'release', { id: 'cross-tab-verification' });
  expect((await me).status()).toBe(200);
  await expect(page.getByTestId('identity-name')).toHaveText('admin');
  await second.getByRole('button', { name: '手动重新验证会话', exact: true }).click();
  await expect(second.getByTestId('identity-name')).toHaveText('admin');
  const settled = await readProtocolState(request);
  await page.clock.runFor(90_000);
  await second.clock.runFor(90_000);
  expect((await readProtocolState(request)).requests.me).toBe(settled.requests.me);
  expect(await page.evaluate(() => window.__protocolStreams.maximum)).toBeLessThanOrEqual(1);
  expect(await second.evaluate(() => window.__protocolStreams.maximum)).toBeLessThanOrEqual(1);
});

test('每标签最多一个真实业务源，传输断流有界恢复且不误退出，跨标签退出关闭全部源', async ({
  page,
  context,
  request,
}) => {
  await page.clock.install();
  await login(page);
  const second = await context.newPage();
  await second.clock.install();
  await second.goto('/');
  await expect(second.getByTestId('identity-name')).toHaveText('trader');
  await expect.poll(async () => (await readProtocolState(request)).streams.active).toBe(2);
  const before = await readProtocolState(request);
  await controlProtocol(request, 'disconnect', { kind: 'transport' });
  await expect(page.getByText('业务通知恢复中', { exact: true })).toBeVisible();
  await expect(second.getByText('业务通知恢复中', { exact: true })).toBeVisible();
  await expect(page.getByTestId('identity-name')).toHaveText('trader');
  await expect(second.getByTestId('identity-name')).toHaveText('trader');
  await page.clock.runFor(3_000);
  await second.clock.runFor(3_000);
  await expect(page.getByText('业务通知已连接', { exact: true })).toBeVisible();
  await expect(second.getByText('业务通知已连接', { exact: true })).toBeVisible();
  await expect.poll(async () => (await readProtocolState(request)).streams.active).toBe(2);
  const restored = await readProtocolState(request);
  expect(restored.requests.me).toBe(before.requests.me);
  expect(restored.requests.events).toBe(before.requests.events + 2);
  expect(restored.streams.maxActive).toBe(2);
  expect(restored.requests.unmatched).toBe(0);
  expect(await page.evaluate(() => window.__protocolStreams.maximum)).toBe(1);
  expect(await second.evaluate(() => window.__protocolStreams.maximum)).toBe(1);
  await logout(page);
  await expect(page.getByRole('heading', { name: '登录美股交易管理' })).toBeVisible();
  await expect(second.getByTestId('application-shell')).toHaveCount(0);
  await expect.poll(async () => (await readProtocolState(request)).streams.active).toBe(0);
  expect(await page.evaluate(() => window.__protocolStreams.active)).toBe(0);
  expect(await second.evaluate(() => window.__protocolStreams.active)).toBe(0);
  const messages = await second.evaluate(() => window.__protocolBroadcasts);
  expect(messages.length).toBeGreaterThan(0);
  for (const message of messages) {
    if (typeof message !== 'object' || message === null || !('type' in message)) {
      throw new Error('跨标签广播必须是无身份数据的通知对象');
    }
    expect(Object.keys(message)).toEqual(['type']);
    expect(['session-changing', 'session-settled']).toContain(message.type);
  }
});

test('业务不可用帧按三六十二秒退避后暂停，窗口恢复和聚焦不会自动突破预算', async ({ page, request }) => {
  await page.clock.install();
  await login(page);
  const initial = await readProtocolState(request);
  for (const delay of [3_000, 6_000, 12_000]) {
    await controlProtocol(request, 'disconnect', { kind: 'unavailable' });
    await expect(page.getByText('业务通知恢复中', { exact: true })).toBeVisible();
    await expect(page.getByTestId('identity-name')).toHaveText('trader');
    await page.clock.runFor(delay);
    await expect(page.getByText('业务通知已连接', { exact: true })).toBeVisible();
  }
  await controlProtocol(request, 'disconnect', { kind: 'unavailable' });
  await expect(
    page.getByRole('status', { name: '连接状态' }).getByText('业务通知已暂停', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '重试业务连接', exact: true })).toBeVisible();
  const exhausted = await readProtocolState(request);
  expect(exhausted.requests.events).toBe(initial.requests.events + 3);
  expect(exhausted.frames.unavailable).toBe(4);
  expect(exhausted.streams.active).toBe(0);
  await page.getByRole('button', { name: '重试业务连接', exact: true }).click();
  expect((await readProtocolState(request)).requests.events).toBe(exhausted.requests.events);
  await page.clock.runFor(60_000);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
  });
  await expect(
    page.getByRole('status', { name: '连接状态' }).getByText('业务通知已暂停', { exact: true }),
  ).toBeVisible();
  const stillPaused = await readProtocolState(request);
  expect(stillPaused.requests.events).toBe(exhausted.requests.events);
  expect(stillPaused.requests.me).toBe(initial.requests.me);
  await page.getByRole('button', { name: '重试业务连接', exact: true }).click();
  await expect(page.getByText('业务通知已连接', { exact: true })).toBeVisible();
  await expect.poll(async () => (await readProtocolState(request)).streams.active).toBe(1);
  expect((await readProtocolState(request)).requests.events).toBe(exhausted.requests.events + 1);
  expect(await page.evaluate(() => window.__protocolStreams.maximum)).toBe(1);
});

test('明确未认证业务帧撤销会话且不自动重新核对或重开业务源', async ({ page, request }) => {
  await page.clock.install();
  await login(page);
  const before = await readProtocolState(request);
  await controlProtocol(request, 'revoke');
  await expect(page.getByRole('heading', { name: '登录美股交易管理' })).toBeVisible();
  await expect(page.getByTestId('application-shell')).toHaveCount(0);
  await page.clock.runFor(120_000);
  const after = await readProtocolState(request);
  expect(after.frames.unauthorized).toBe(1);
  expect(after.requests.me).toBe(before.requests.me);
  expect(after.requests.events).toBe(before.requests.events);
  expect(after.streams.active).toBe(0);
  expect(await page.evaluate(() => window.__protocolStreams.active)).toBe(0);
});

test('生产不注册开发页、权限探针或 Mock，认证不可用不会自动假登录', async ({ page, request }) => {
  const apiPaths: string[] = [];
  await page.route('**/api/v1/**', async (route) => {
    apiPaths.push(new URL(route.request().url()).pathname);
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: '生产隔离测试：认证不可用' } }),
    });
  });
  for (const path of ['/dev/playground', '/dev/access/trading', '/dev/access/manage-admins']) {
    await page.goto(`${PREVIEW_ORIGIN}${path}`);
    await expect(page.getByRole('heading', { name: '页面不存在', exact: true })).toBeVisible();
    await expect(page.getByText('Mock · 本地协议桩', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('playground')).toHaveCount(0);
    await expect(page.getByTestId('capability-probe')).toHaveCount(0);
    await expect(page.locator('a[href^="/dev/"]')).toHaveCount(0);
  }
  const failedMe = page.waitForResponse((response) => response.url().includes('/api/v1/auth/me'));
  await page.goto(`${PREVIEW_ORIGIN}/`);
  expect((await failedMe).status()).toBe(503);
  await expect(page.getByRole('heading', { name: '暂时无法确认会话', exact: true })).toBeVisible();
  await expect(page.getByTestId('application-shell')).toHaveCount(0);
  await expect(page.getByText('Mock · 本地协议桩', { exact: true })).toHaveCount(0);
  expect(apiPaths.length).toBeGreaterThan(0);
  expect(apiPaths.every((path) => path.endsWith('/auth/me'))).toBe(true);
  expect(await page.evaluate(() => window.__protocolStreams.created)).toBe(0);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  const state = await readProtocolState(request);
  expect(state.requests.login).toBe(0);
  expect(state.requests.events).toBe(0);
});
