import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { eventResources, loginSchema, quoteStreamEventSchema } from '@project/api-contracts/validation';
import { ADMIN_USER, OWNER_USER, TRADER_USER } from '../msw/auth-fixtures.ts';
import {
  configureReadonly,
  createReadonlyState,
  marketFrame,
  parseMarketControl,
  prepareReadonly,
  READONLY_RESOURCES,
  readonlyEndpoint,
} from './readonly.mjs';

// 仅供浏览器协议验收；不加载后端、数据库、SDK 或任何交易实现。
if (process.env.PROTOCOL_STUB !== '1') {
  throw new Error('本地协议桩必须显式设置 PROTOCOL_STUB=1 后启动');
}

const PORT = 18770;
const COOKIE_NAME = 'protocol_session';
const MOCK_PASSWORD = 'protocol-only-password';
const ALLOWED_ORIGINS = new Set(['http://localhost:5173', 'http://localhost:5273', 'http://localhost:4173']);
const USERS = { trader: TRADER_USER, admin: ADMIN_USER, owner: OWNER_USER };
const ENDPOINTS = new Map([
  ['/api/v1/auth/login', { name: 'login', method: 'POST' }],
  ['/api/v1/auth/me', { name: 'me', method: 'GET' }],
  ['/api/v1/auth/logout', { name: 'logout', method: 'POST' }],
  ['/api/v1/events', { name: 'events', method: 'GET' }],
]);
const MODE_VALUES = {
  login: ['normal', 'rate-limited', 'unavailable', 'network-error', 'malformed'],
  me: ['normal', 'unavailable', 'network-error'],
  logout: ['normal', 'unavailable', 'network-error'],
};
const encoder = (frame) => `data: ${JSON.stringify(frame)}\n\n`;
let state;

function resetState() {
  if (state) {
    for (const stream of [...state.streams.values()]) stream.close();
    for (const stream of [...state.marketStreams.values()]) stream.close();
    for (const gate of state.gates.values()) {
      for (const release of [...gate.waiters.values()]) release(false);
    }
  }
  state = {
    requestSequence: 0,
    sessionSequence: 0,
    streamSequence: 0,
    requests: { login: 0, me: 0, logout: 0, events: 0, preflight: 0, unmatched: 0 },
    cookieRequests: { me: 0, logout: 0, events: 0 },
    rejectedOrigins: 0,
    rejectedCsrf: 0,
    openedStreams: 0,
    closedStreams: 0,
    maxActiveStreams: 0,
    frames: { refresh: 0, unauthorized: 0, unavailable: 0 },
    modes: { login: 'normal', me: 'normal', logout: 'normal' },
    sessions: new Map(),
    streams: new Map(),
    marketStreams: new Map(),
    connectionAttempts: { events: new Map(), market: new Map() },
    readonly: createReadonlyState(),
    gates: new Map(),
    history: [],
  };
}
resetState();

function json(response, status, data, headers = {}) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(data));
}

function failure(response, status, code, message) {
  json(response, status, { error: { code, message, requestId: `protocol-${state.requestSequence}` } });
}

function interruptResponse(response) {
  // 先提交响应头再截断正文；空 TCP reset 可能被浏览器透明重试，不能用于断言应用重试次数。
  response.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': '128',
    Connection: 'close',
  });
  response.end('{"data":');
}

async function readJson(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw new Error('请求必须使用 JSON');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('请求体必须是对象');
  }
  return value;
}

function getSession(request) {
  const values = (request.headers.cookie ?? '').split(';');
  const cookie = values.find((value) => value.trim().startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return null;
  const secret = cookie.trim().slice(COOKIE_NAME.length + 1);
  const session = state.sessions.get(secret);
  return session?.active ? session : null;
}

function sameToken(actual, expected) {
  if (typeof actual !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(actual)) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function publicState() {
  // 控制 DTO 与正式 API 分离，故意不暴露 Cookie、CSRF、密码或请求正文。
  return {
    mock: true,
    requests: state.requests,
    cookieRequests: state.cookieRequests,
    rejectedOrigins: state.rejectedOrigins,
    rejectedCsrf: state.rejectedCsrf,
    modes: state.modes,
    streams: {
      active: state.streams.size,
      opened: state.openedStreams,
      closed: state.closedStreams,
      maxActive: state.maxActiveStreams,
      items: [...state.streams.values()].map((stream) => ({
        id: stream.id,
        sessionId: stream.session.id,
      })),
    },
    frames: state.frames,
    readonly: state.readonly,
    sessions: [...state.sessions.values()].map((session) => ({
      id: session.id,
      username: session.user.username,
      active: session.active,
    })),
    gates: [...state.gates.values()].map((gate) => ({
      id: gate.id,
      endpoint: gate.endpoint,
      pending: gate.waiters.size,
    })),
    history: state.history,
  };
}

function selectedSessions(body) {
  return [...state.sessions.values()].filter(
    (session) => session.active && (body.sessionId === undefined || session.id === body.sessionId),
  );
}

function refresh(stream, resources) {
  state.frames.refresh += 1;
  stream.write({ kind: 'refresh', resources, at: '2026-11-10T00:00:00.000Z' });
}

function revoke(session) {
  session.active = false;
  for (const stream of [...state.streams.values()]) {
    if (stream.session !== session) continue;
    state.frames.unauthorized += 1;
    stream.write({ error: { code: 'UNAUTHENTICATED', message: '本地协议桩会话已失效' } });
    stream.close();
  }
  for (const stream of [...state.marketStreams.values()]) {
    if (stream.session !== session) continue;
    stream.write(
      marketFrame(
        { kind: 'status', status: 'unavailable', code: 'UNAUTHENTICATED', retryable: false },
        stream.subscription,
      ),
    );
    stream.close();
  }
}

async function control(request, response, path) {
  // 测试控制只接受无 Origin 且带显式标记的本机工具请求，浏览器不能跨站驱动控制接口。
  if (request.headers.origin || request.headers['x-protocol-control'] !== '1') {
    failure(response, 403, 'STUB_CONTROL_ONLY', '只允许显式本机测试控制');
    return;
  }
  if (path === '/__stub/state' && request.method === 'GET') {
    json(response, 200, publicState());
    return;
  }
  const known = new Set([
    '/__stub/reset',
    '/__stub/config',
    '/__stub/gates',
    '/__stub/release',
    '/__stub/revoke',
    '/__stub/identity',
    '/__stub/disconnect',
    '/__stub/refresh',
    '/__stub/readonly',
    '/__stub/market',
  ]);
  if (request.method !== 'POST' || !known.has(path)) {
    failure(response, 404, 'NOT_FOUND', '本地协议桩没有此控制路由');
    return;
  }
  const body = await readJson(request);
  if (path === '/__stub/reset') {
    resetState();
  } else if (path === '/__stub/config') {
    const entries = Object.entries(body);
    if (
      entries.some(([key, value]) => !Object.hasOwn(MODE_VALUES, key) || !MODE_VALUES[key].includes(value))
    ) {
      failure(response, 400, 'STUB_CONTROL_INVALID', '未知的协议故障模式');
      return;
    }
    Object.assign(state.modes, body);
  } else if (path === '/__stub/gates') {
    if (
      typeof body.id !== 'string' ||
      !/^[a-z0-9-]{1,60}$/.test(body.id) ||
      (![...ENDPOINTS.values()].some((endpoint) => endpoint.name === body.endpoint) &&
        !READONLY_RESOURCES.some((resource) => body.endpoint === `readonly:${resource}`)) ||
      state.gates.has(body.id) ||
      [...state.gates.values()].some((gate) => gate.endpoint === body.endpoint)
    ) {
      failure(response, 400, 'STUB_CONTROL_INVALID', '闸门名称或端点无效，或已存在闸门');
      return;
    }
    state.gates.set(body.id, { id: body.id, endpoint: body.endpoint, waiters: new Map() });
  } else if (path === '/__stub/release') {
    const gate = state.gates.get(body.id);
    if (!gate) {
      failure(response, 404, 'STUB_GATE_NOT_FOUND', '闸门不存在');
      return;
    }
    state.gates.delete(body.id);
    for (const release of [...gate.waiters.values()]) release(true);
  } else if (path === '/__stub/readonly') {
    if (!configureReadonly(state.readonly, body)) {
      failure(response, 400, 'STUB_CONTROL_INVALID', '只读资源、模式或修订编号无效');
      return;
    }
  } else if (path === '/__stub/market') {
    const command = parseMarketControl(body);
    if (!command) {
      failure(response, 400, 'STUB_CONTROL_INVALID', '行情控制必须使用合法公开报价、状态和订阅范围');
      return;
    }
    for (const stream of [...state.marketStreams.values()]) {
      if (
        command.accountId !== undefined &&
        command.accountId.toLowerCase() !== stream.subscription.accountId
      )
        continue;
      if (command.symbol !== undefined && command.symbol !== stream.subscription.symbol) continue;
      if (command.kind === 'disconnect') stream.close();
      else {
        stream.write(marketFrame(command, stream.subscription));
        if (command.kind === 'status' && command.retryable === false) stream.close();
      }
    }
  } else {
    if (body.sessionId !== undefined && typeof body.sessionId !== 'string') {
      failure(response, 400, 'STUB_CONTROL_INVALID', '会话测试编号无效');
      return;
    }
    const sessions = selectedSessions(body);
    if (path === '/__stub/revoke') {
      for (const session of sessions) revoke(session);
    } else if (path === '/__stub/identity') {
      if (!Object.hasOwn(USERS, body.user)) {
        failure(response, 400, 'STUB_CONTROL_INVALID', '未知的 Mock 身份');
        return;
      }
      for (const session of sessions) session.user = { ...USERS[body.user] };
    } else if (path === '/__stub/refresh') {
      if (!Array.isArray(body.resources) || body.resources.some((value) => !eventResources.includes(value))) {
        failure(response, 400, 'STUB_CONTROL_INVALID', '资源必须来自真实公开资源枚举');
        return;
      }
      for (const stream of state.streams.values()) {
        if (sessions.includes(stream.session)) refresh(stream, body.resources);
      }
    } else if (path === '/__stub/disconnect') {
      if (body.kind !== 'transport' && body.kind !== 'unavailable') {
        failure(response, 400, 'STUB_CONTROL_INVALID', '断流类型无效');
        return;
      }
      for (const stream of [...state.streams.values()]) {
        if (!sessions.includes(stream.session)) continue;
        if (body.kind === 'unavailable') {
          state.frames.unavailable += 1;
          stream.write({ error: { code: 'EVENT_STREAM_UNAVAILABLE', message: '本地协议桩主动暂停业务流' } });
        }
        stream.close();
      }
    }
  }
  json(response, 200, publicState());
}

async function passGate(endpoint, requestId, response) {
  const gate = [...state.gates.values()].find((value) => value.endpoint === endpoint);
  if (!gate) return true;
  return new Promise((resolve) => {
    const finish = (released) => {
      gate.waiters.delete(requestId);
      response.off('close', canceled);
      resolve(released);
    };
    const canceled = () => finish(false);
    gate.waiters.set(requestId, finish);
    response.once('close', canceled);
  });
}

function allowStream(response, session, kind) {
  const now = Date.now();
  const actorId = session.user.id;
  const attempts = state.connectionAttempts[kind];
  const recent = (attempts.get(actorId) ?? []).filter((at) => now - at < 60_000);
  if (recent.length >= 30) {
    failure(response, 429, 'RATE_LIMITED', 'Mock：此类实时连接建连频率超过每分钟30次');
    return false;
  }
  recent.push(now);
  attempts.set(actorId, recent);
  const active = [...state.streams.values(), ...state.marketStreams.values()].filter(
    (stream) => stream.actorId === actorId,
  ).length;
  if (active >= 6) {
    failure(response, 429, 'SSE_CONNECTION_LIMIT', 'Mock：业务与行情流合计每用户最多6条');
    return false;
  }
  return true;
}

function openEvents(request, response, session) {
  if (session && !allowStream(response, session, 'events')) return;
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  response.flushHeaders();
  if (!session) {
    state.frames.unauthorized += 1;
    response.end(encoder({ error: { code: 'UNAUTHENTICATED', message: '本地协议桩需要有效会话' } }));
    return;
  }
  const owner = state;
  const id = `stream-${++state.streamSequence}`;
  let closed = false;
  let heartbeat;
  const stream = {
    id,
    session,
    actorId: session.user.id,
    write: (frame) => {
      if (!closed && !response.destroyed) response.write(encoder(frame));
    },
    close: () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      owner.streams.delete(id);
      owner.closedStreams += 1;
      response.end();
    },
  };
  state.streams.set(id, stream);
  state.openedStreams += 1;
  state.maxActiveStreams = Math.max(state.maxActiveStreams, state.streams.size);
  response.once('close', stream.close);
  request.once('aborted', stream.close);
  // 首帧与后端公开 refresh 形状一致，仅发送资源提示，不产生任何业务数据。
  refresh(stream, [...eventResources]);
  heartbeat = setInterval(() => {
    if (!response.destroyed) response.write(': 本地协议桩保活\n\n');
  }, 15_000);
  heartbeat.unref();
}

function openMarket(request, response, session, subscription, mode) {
  if (!session?.active) {
    failure(response, 401, 'UNAUTHENTICATED', 'Mock：行情流需要有效的原生 Cookie 会话');
    return;
  }
  if (!allowStream(response, session, 'market')) return;
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  response.flushHeaders();
  const owner = state;
  const id = `market-${++owner.streamSequence}`;
  let closed = false;
  let heartbeat;
  const stream = {
    id,
    session,
    actorId: session.user.id,
    subscription,
    write: (frame) => {
      if (!closed && !response.destroyed) response.write(encoder(quoteStreamEventSchema.parse(frame)));
    },
    close: () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      owner.marketStreams.delete(id);
      owner.readonly.market.active = owner.marketStreams.size;
      owner.readonly.market.closed += 1;
      response.end();
    },
  };
  owner.marketStreams.set(id, stream);
  owner.readonly.market.active = owner.marketStreams.size;
  owner.readonly.market.opened += 1;
  owner.readonly.market.maxActive = Math.max(owner.readonly.market.maxActive, owner.marketStreams.size);
  response.once('close', stream.close);
  request.once('aborted', stream.close);
  // 不连接官方来源：本地传输建立只表示 waiting，不证明已收到实时价格。
  stream.write(marketFrame({ kind: 'status', status: 'waiting' }, subscription));
  if (mode === 'malformed') {
    response.write(encoder({ kind: 'quote', ...subscription, value: { quote: { bid: 123 } } }));
  }
  heartbeat = setInterval(() => {
    if (!closed && !response.destroyed) response.write(': 本地 Mock 行情流保活\n\n');
  }, 15_000);
  heartbeat.unref();
}

async function handle(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  const url = new URL(request.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const businessWrite =
    path.startsWith('/api/v1/') &&
    !path.startsWith('/api/v1/auth/') &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
  if (businessWrite) state.readonly.forbiddenWrites += 1;
  response.setHeader('X-Protocol-Stub', '1');
  response.setHeader('Vary', 'Origin');
  const origin = request.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    state.rejectedOrigins += 1;
    failure(response, 403, 'ORIGIN_FORBIDDEN', '本地协议桩拒绝此来源');
    return;
  }
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (path === '/__stub/healthz' && request.method === 'GET') {
    json(response, 200, { mock: true, name: 'frontend-protocol-stub', trading: false });
    return;
  }
  if (path.startsWith('/__stub/')) {
    await control(request, response, path);
    return;
  }
  const endpoint = ENDPOINTS.get(path);
  const readonly = readonlyEndpoint(path);
  if (!endpoint && !readonly && !businessWrite) {
    state.requests.unmatched += 1;
    failure(response, 404, 'NOT_FOUND', '本地协议桩没有此路由');
    return;
  }
  const expectedMethod = endpoint?.method ?? 'GET';
  if (request.method === 'OPTIONS') {
    state.requests.preflight += 1;
    const requestedHeaders = (request.headers['access-control-request-headers'] ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (
      !origin ||
      request.headers['access-control-request-method'] !== expectedMethod ||
      requestedHeaders.some(
        (value) => !['content-type', 'x-csrf-token', 'accept', 'last-event-id'].includes(value),
      )
    ) {
      failure(response, 403, 'PREFLIGHT_NOT_ALLOWED', '本地协议桩拒绝此预检');
      return;
    }
    response.writeHead(204, {
      'Access-Control-Allow-Methods': expectedMethod,
      'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Accept, Last-Event-ID',
    });
    response.end();
    return;
  }
  if (!businessWrite && request.method !== expectedMethod) {
    failure(response, 404, 'NOT_FOUND', '本地协议桩没有此方法');
    return;
  }
  const requestId = ++state.requestSequence;
  if (!businessWrite && readonly) state.readonly.requests[readonly.resource] += 1;
  else if (!businessWrite) state.requests[endpoint.name] += 1;
  const cookieReceived = Boolean(
    request.headers.cookie?.split(';').some((value) => value.trim().startsWith(`${COOKIE_NAME}=`)),
  );
  if (endpoint && Object.hasOwn(state.cookieRequests, endpoint.name) && cookieReceived)
    state.cookieRequests[endpoint.name] += 1;
  const record = {
    id: requestId,
    method: request.method,
    path,
    origin: origin ?? null,
    cookieReceived,
    status: null,
  };
  state.history.push(record);
  if (state.history.length > 200) state.history.shift();
  response.once('finish', () => {
    record.status = response.statusCode;
  });
  if (businessWrite) {
    const session = getSession(request);
    if (!session) failure(response, 401, 'UNAUTHENTICATED', '本地协议桩需要有效会话');
    else if (!sameToken(request.headers['x-csrf-token'], session.csrfToken)) {
      state.rejectedCsrf += 1;
      failure(response, 403, 'CSRF_INVALID', '本地协议桩 CSRF 校验失败');
    } else failure(response, 403, 'STUB_READONLY', 'Mock：本地只读协议没有业务写入能力');
    return;
  }
  if (readonly) {
    const session = getSession(request);
    const plan = prepareReadonly(readonly, url, session, state.readonly);
    // 等待闸门前序列化完整快照，后续修订不能改写已在途的读取。
    const body = plan.stream
      ? null
      : JSON.stringify(
          plan.error ? { error: { ...plan.error, requestId: `protocol-${requestId}` } } : { data: plan.data },
        );
    // JSON 报价闸门不阻断独立 SSE，才能检验推送先到、REST 后到的真实竞争。
    if (
      readonly.kind !== 'quote-stream' &&
      !(await passGate(`readonly:${readonly.resource}`, requestId, response))
    ) {
      failure(response, 503, 'STUB_GATE_CANCELED', '测试闸门已取消');
      return;
    }
    if (response.destroyed || response.writableEnded) return;
    if (plan.stream) openMarket(request, response, session, plan.stream, plan.mode);
    else {
      response.writeHead(plan.status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(body);
    }
    return;
  }
  if (!(await passGate(endpoint.name, requestId, response))) {
    failure(response, 503, 'STUB_GATE_CANCELED', '测试闸门已取消');
    return;
  }
  const mode = state.modes[endpoint.name];
  if (mode === 'network-error' && endpoint.name !== 'logout') {
    interruptResponse(response);
    return;
  }
  if (endpoint.name === 'login') {
    const input = loginSchema.strict().safeParse(await readJson(request));
    if (!input.success) {
      failure(response, 422, 'VALIDATION_ERROR', '登录字段不符合公开校验规则');
      return;
    }
    if (mode === 'rate-limited') {
      failure(response, 429, 'RATE_LIMITED', '登录请求过于频繁，请稍后再试');
      return;
    }
    if (mode === 'unavailable') {
      failure(response, 503, 'SERVICE_UNAVAILABLE', '本地协议桩认证暂不可用');
      return;
    }
    if (mode === 'malformed') {
      json(response, 200, { data: { user: TRADER_USER } });
      return;
    }
    const user = Object.hasOwn(USERS, input.data.username) ? USERS[input.data.username] : null;
    if (!user || input.data.password !== MOCK_PASSWORD) {
      failure(response, 401, 'LOGIN_FAILED', '用户名或密码错误');
      return;
    }
    const previous = getSession(request);
    if (previous) revoke(previous);
    const secret = randomBytes(32).toString('base64url');
    const session = {
      id: `session-${++state.sessionSequence}`,
      active: true,
      user: { ...user },
      csrfToken: randomBytes(32).toString('base64url'),
    };
    state.sessions.set(secret, session);
    json(
      response,
      200,
      { data: { user: session.user, csrfToken: session.csrfToken } },
      {
        'Set-Cookie': `${COOKIE_NAME}=${secret}; Path=/; HttpOnly; SameSite=Lax`,
      },
    );
    return;
  }
  const session = getSession(request);
  if (endpoint.name === 'events') {
    openEvents(request, response, session);
    return;
  }
  if (!session) {
    failure(response, 401, 'UNAUTHENTICATED', '本地协议桩需要有效会话');
    return;
  }
  if (endpoint.name === 'me') {
    if (mode === 'unavailable') {
      failure(response, 503, 'SERVICE_UNAVAILABLE', '本地协议桩认证暂不可用');
      return;
    }
    json(response, 200, { data: { user: session.user, csrfToken: session.csrfToken } });
    return;
  }
  if (!sameToken(request.headers['x-csrf-token'], session.csrfToken)) {
    state.rejectedCsrf += 1;
    failure(response, 403, 'CSRF_INVALID', '本地协议桩 CSRF 校验失败');
    return;
  }
  if (mode === 'network-error') {
    interruptResponse(response);
    return;
  }
  if (mode === 'unavailable') {
    failure(response, 503, 'SERVICE_UNAVAILABLE', '本地协议桩注销暂不可用');
    return;
  }
  revoke(session);
  json(
    response,
    200,
    { data: { loggedOut: true } },
    {
      'Set-Cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    },
  );
}

const server = createServer((request, response) => {
  void handle(request, response).catch(() => {
    // 不打印请求、正文、异常对象或认证秘密。
    failure(response, 400, 'STUB_BAD_REQUEST', '本地协议桩无法读取此请求');
  });
});
server.requestTimeout = 0;
server.timeout = 0;
server.listen(PORT, 'localhost', () => {
  console.info(`[本地协议桩] http://localhost:${PORT}，仅 Mock 认证与通知，无交易能力。`);
});
function stop() {
  for (const stream of [...state.streams.values()]) stream.close();
  for (const stream of [...state.marketStreams.values()]) stream.close();
  for (const gate of state.gates.values()) {
    for (const release of [...gate.waiters.values()]) release(false);
  }
  server.close();
  server.closeAllConnections();
}
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
