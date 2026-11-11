# 第三阶段本地认证异常诊断

- 状态：诊断已执行；根因已确认，候选地址与真实匿名状态分流已验证，原项目配置未应用修改。
- 来源源码：astryx-dev / `47ec2d98e95cbac10c74991a4eaf9b4061d0379b`，即 [0071 第三阶段报告](0071-frontend-readonly-business-features.md)与第三阶段最终实现所在版本。
- 观察日期：2026-11-11；仅检查既有进程、必要公开配置、脱敏日志和 GET 请求，没有重新启动后端、Worker、数据库、SDK，也没有登录、退出或任何业务／资金操作。
- 浏览器范围：现有工具仅能看到独立 Chrome，无法接管用户日常窗口。用户已明确选择以配置内独立浏览器访问其确认地址 `http://localhost:5173`；不把该上下文的 Cookie 结果当作日常浏览器原会话证据。

## 1. 结论

**两条 bun dev 不会自动把前端 API 接到后端。** 当前前端实际 apiBaseUrl 为 `/api/v1`，Vite 未配置代理，因此应用请求回到 `http://localhost:5173/api/v1/auth/me`，而非 3020 后端。

实际应用 Fetch 带 `Accept: application/json`，得到 **404、空响应、无 Content-Type**；进入 malformed → unavailable，显示“暂时无法确认会话／认证响应异常，无法确认会话”。本次主请求不是“200 HTML”。同 URL 改为地址栏式 `Accept: text/html` 才观察到 Vite 的 200 HTML fallback，二者不可混同。

后端认证端点可达，未带 Cookie 的真实 `/api/v1/auth/me` 返回标准 **401 UNAUTHENTICATED JSON**；这是正常匿名结果。当前 CORS 对该页面 Origin 的精确许可已实测正常。没有本次必须放宽认证 Schema、改协议或关闭安全机制的证据。

最小方案是仅为前端配置可达且同主机名的 API 地址：

```env
# frontend/.env.local，待用户单独授权后应用；本轮没有创建或修改此文件
VITE_API_BASE_URL=http://localhost:3020/api/v1
```

保留用户访问 `http://localhost:5173`。API 的 localhost 地址已真实验证可达，浏览器判定 same-site；本轮 `http://127.0.0.1:5173` 则连接拒绝，不能未经验证就要求切到该前端地址。前端配置生效需重启前端 Vite；无需为此重启已经在运行的后端／Worker。

## 2. 当前运行环境

| 项目 | 观察事实 |
|---|---|
| 用户确认的前端地址 | http://localhost:5173 |
| 前端进程 | 已有 Vite/node PID 173016，父进程链可见 vite 与 bun；活动本地连接端点为 [::1]:5173 |
| 后端公开配置／启动日志 | HOST=127.0.0.1、PORT=3020；既有 API_READY 日志也记录 hostname=127.0.0.1、port=3020 |
| 后端进程 | 已有 API PID 174556，原 launcher/start.ts 父进程 PID 153588 |
| Worker | 原有 Worker PID 176184，与原 launcher 同源；本轮没有创建它 |
| 后端健康 | /healthz 503 JSON；database.online=true，worker.online=true、status=DEGRADED；不等于认证不可用 |
| 必要日志 | launcher/API 有 DATABASE_READY，API 有 API_READY；当前 Worker 安全尾部样本有 WORKER_CYCLE_INCOMPLETE。未输出日志正文、真实标识或配置值 |
| 原工程修改 | 未改 frontend/backend 源码、真实环境文件、认证协议或安全配置；只新增诊断／发布文档与索引 |

首次 Listen 状态枚举未检出条目，不能据此声称服务未启动。随后独立连接端点、PID、API_READY 与真实 HTTP 均证明现有服务在响应；报告不把枚举空结果当作缺少服务，也不推断对外所有网卡绑定。Worker 降级原因未在本任务扩展调查；未执行账户同步或其它业务 GET 来“证明正常”。

## 3. 前端地址配置与实际拼接

本轮只对白名单配置取值，未输出其它环境内容。

| 文件／位置 | 实际结果 |
|---|---|
| frontend/.env | 不存在 |
| frontend/.env.local | 不存在 |
| frontend/.env.development、.env.development.local | 不存在 |
| frontend/.env.example | VITE_API_BASE_URL=/api/v1；示例文件并非有效环境文件的证据 |
| 浏览器已加载模块导出 | 动态读取现有 `/src/services/api/client.ts`，apiBaseUrl=/api/v1 |
| frontend/vite.config.ts | 无 server.proxy／preview.proxy，仅 Vite 静态 SPA 及固定端口 |
| backend/.env 公开字段 | API_ORIGIN=http://127.0.0.1:3020；FRONTEND_ORIGINS 已含 localhost:5173、localhost:4173、127.0.0.1:5173、127.0.0.1:4173 的精确 HTTP Origin；SameSite=strict |

调用路径：client.ts:68 的环境值或 `/api/v1` → runtime.ts:35-46 → rpc.ts:19-35 → auth/api.ts:46-49 → request.ts → response.ts → Session Manager。

`rpcRootUrl` 仅去掉配置末尾 `/api/v1`，Hono 再按声明添加一次 api/v1/auth/me。因此：

- 当前 `/api/v1` 得到空 RPC root，浏览器按当前页面同源解析；不自动发现 3020。
- `http://localhost:3020/api/v1` 得到 `http://localhost:3020`，最终正好请求 `http://localhost:3020/api/v1/auth/me`，不重复前缀。
- 不是代码直接把 window.location.origin 错写成后端，而是相对 API 默认值在未提供同源代理的独立开发环境中指向了 Vite。

## 4. 真实 HTTP 结果

均为 GET、无有效 Cookie、redirect=manual；没有观察到重定向。

| 请求 URL／Accept | 状态 | Content-Type／响应 | 请求耗时 |
|---|---|---|---|
| http://127.0.0.1:3020/healthz；application/json | 503 | application/json；data 健康降级对象 | 34 ms |
| http://127.0.0.1:3020/api/v1/meta；application/json | 200 | application/json；data 中能力／环境／版本结构 | 2 ms |
| http://127.0.0.1:3020/api/v1/auth/me；application/json | 401 | application/json；error.code=UNAUTHENTICATED | 3 ms |
| http://localhost:5173/api/v1/auth/me；application/json | 404 | 无 Content-Type，空响应；不是 JSON／HTML 成功 | 2 ms |
| http://localhost:5173/api/v1/auth/me；text/html | 200 | text/html，HTML 含 /@vite/client | 单独对照探针，未将其耗时替代应用 Fetch |
| 浏览器 localhost:5173 → 127.0.0.1:3020/api/v1/auth/me | 401 | cors 可读 JSON，标准匿名错误 | 5 ms |
| 浏览器 localhost:5173 → localhost:3020/api/v1/auth/me | 401 | cors 可读 JSON，标准匿名错误 | 4 ms |

实际匿名 JSON 脱敏结构：

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "<string，未输出值>",
    "requestId": "<string，未输出值>"
  }
}
```

没有有效登录 Cookie，故没有实际 200 身份响应；不输出或虚构 user 值、CSRF 值。

## 5. 真实浏览器 Network／Console

| 项目 | 错误的主应用请求 | 只读后端对照请求（推荐主机名） |
|---|---|---|
| 页面 Origin | http://localhost:5173 | http://localhost:5173 |
| Request URL | http://localhost:5173/api/v1/auth/me | http://localhost:3020/api/v1/auth/me |
| Method | GET | GET |
| Status | 404 | 401 |
| Accept | application/json | application/json |
| Request Origin 头 | 同源 GET 未见该头，正常 | http://localhost:5173 |
| Sec-Fetch-Site | same-origin | same-site |
| Content-Type | 未提供 | application/json |
| Access-Control-Allow-Origin | 无，同源请求不需要 | 精确 http://localhost:5173 |
| Access-Control-Allow-Credentials | 无 | true |
| Cookie 请求头 | 未见；本独立上下文未登录 | 未见；本独立上下文未登录 |
| Set-Cookie 响应头 | 未见 | 未见；/me 本身不设置／续期会话 |
| JavaScript 可读性 | 请求可读但不是可信认证 JSON | 401 JSON 可由 Fetch 正常读取，没有 CORS 阻断 |

Console 实际观察到 404 Failed to load resource；页面可见原报错文案。不存在把主应用的 404 当后端 401、把缺 CORS 头当同源故障或将 200 HTML 对照探针当应用响应的混用。

另一个实际对照 `localhost:5173 → 127.0.0.1:3020` 虽然同样 ACAO 精确／ACAC=true、401 JSON 可读，但 Sec-Fetch-Site 为 cross-site；不应仅因 CORS 成功就宣告默认 Strict Cookie 登录链可用。

## 6. Cookie 与认证 Schema

### 6.1 已确认和未确认的 Cookie 事实

- 统一传输的真实源码 request.ts:97-104 使用 credentials=include，GET 不发送 CSRF 头。
- 后端 HTTP 会话 Cookie 为 HttpOnly、Path=/、SameSite=strict、Secure=false、无 Domain；安全名称／标志由 API_ORIGIN 协议决定。/me 只返回身份与派生 CSRF，不重新设置 Cookie。
- 本次匿名请求没有 Cookie 发送，也没有 Set-Cookie；这不是“浏览器拒绝接受 Cookie”的证据。
- **未执行登录，未验证 Cookie 新建／接受、已登录 Cookie 后续发送、真实 200 恢复、退出与迟到 Set-Cookie 竞态。** 未读取用户日常浏览器 Cookie；用户已同意此取证限制。
- 最小候选使用 localhost 前后端同站地址，保留 Strict，不需关闭浏览器策略、设置通配 CORS 或改成 localStorage Token。

### 6.2 运行时结构校验

auth/types.ts 从公开 ApiClient 推导静态类型；实际身份响应运行时 schema 在 frontend/src/features/auth/api.ts:7-19，不把泛型当验证：

| 字段 | 当前要求 |
|---|---|
| data.user.id | UUID 字符串 |
| data.user.username | 1–64 字符字符串 |
| data.user.role | TRADER 或 ADMIN |
| data.user.canManageAdmins | 必需布尔，非 ADMIN 不能为 true |
| data.csrfToken | 精确 43 字符 base64url 字符串 |

后端真实 auth/me 投影与这些条件相符。本次没有收到 200 身份 JSON，所以不能归因为某个成功字段缺失或 Schema 过度严格，也不为 HTML／空响应放宽 schema。

## 7. Session Manager 实际分流与独立验证

- 主应用可见 unavailable。对应源码：response.ts:124-194 将非 JSON／空坏信封分类 malformed；auth/api.ts:21-32 不伪造成功；manager.ts:245-256 将其置 unavailable。UI 和源码路径共同支持这一状态判断，没有直接改内部 state。
- 标准匿名分支要求 http-error + status401 + code UNAUTHENTICATED；不是任意 401 都强行变匿名或成功。
- 在同一真实浏览器中，使用原 createAppServices／SessionManager 创建临时独立实例，baseUrl 显式传 `http://localhost:3020/api/v1`，广播禁用、未启动业务或行情 SSE；真实 GET /me 后观察 `checking → anonymous`，无 user、无 error。结束后 stop 并清空临时 QueryClient。
- 该探针没有 Mock 认证结果，没有替换主应用服务或修改原代码／环境。它证明推荐地址、真实匿名响应与原状态机可共同正常工作，**不等于主应用已经应用修复**。

## 8. 最小修复方案：尚未应用

1. 用户单独授权后，仅在 frontend/.env.local 设置 `VITE_API_BASE_URL=http://localhost:3020/api/v1`。
2. 保持浏览器地址 http://localhost:5173，保持现有后端运行；仅使前端 Vite 重新加载公开配置。
3. 当前 FRONTEND_ORIGINS 已精确包含 http://localhost:5173，且实际响应头正确，因此针对这个方案没有需要先修改后端 CORS／SameSite 的证据。API_ORIGIN 当前 HTTP 协议与 Cookie flags 相容；没有改它。
4. 应用配置后，先验证主应用请求实际到 localhost:3020，标准匿名401进入登录页；这一步本轮未实施。
5. 只有另获隔离环境与合成账号授权后，再验证登录200、Cookie 接收／发送、CSRF、退出及会话竞态；不索要／打印真实凭据，不用真实资金冒烟。

若选择全部127.0.0.1的另一方案，必须先让前端真实监听并可由127访问；本轮该地址连接拒绝，不把源码推荐样例冒充已实测配置。不能将 localhost 前端直接配到127 API 后，仅凭匿名CORS读通就忽略 Strict 的跨站条件。

## 9. 确认／推断／未验证

| 级别 | 内容 |
|---|---|
| 已确认 | 当前 API Base=/api/v1；主请求发往Vite5173并返回404空体；后端匿名401正常；当前精确CORS可读；推荐localhost API地址可达且same-site；原SessionManager独立实例真实匿名分流正常；API／Worker为既有进程 |
| 高概率风险而非本次根因 | localhost前端与127 API混用时，Strict可能影响后续登录Cookie发送；没有已登录Cookie实测，不能声称已经被阻断 |
| 未验证 | 用户日常浏览器原会话、Cookie新建接受／已登录发送、认证200真实字段、主应用应用新配置后的恢复、完整隔离后端联调；Worker降级深层原因 |

是否代码缺陷：本次确定的是独立开发环境的公开 API 地址配置缺失／默认同源前提不满足，而不是需要修改认证协议、放宽 Schema 或强改401处理。apiReachable 在源码中仅表示收到非传输错误，不证明响应方一定是真实后端；不能拿它推翻本次 Network 证据。

## 10. 执行与修改边界

完整阅读用户指定16份资料、2814行，并沿实际认证／CORS／配置／启动源码核对；没有仅接受旧报告结论。进程／HTTP／Network／公开配置／原状态机探针属本轮实测，0070／0071 中工程测试数字仍是历史轮次。

只对白名单读取 API_ORIGIN、FRONTEND_ORIGINS、SameSite、HOST、PORT 等公开配置；日志只统计固定事件代码和公开监听字段。没有输出密码、Cookie 值、CSRF／Session Token、数据库连接串、ENCRYPTION_KEY、API Secret、真实用户或账户数据，也不归档浏览器 trace。

未启动／终止现有 API、Worker、数据库、SDK；未执行买卖、撤单、账户同步、任务控制、登录或退出。没有改原项目 frontend/backend 源码、真实环境或安全配置。Jev 的有界判定为 frontend_api_target，修复状态 diagnosed_candidate_verified_not_applied；不据此冒充主应用已修复或生产认证。
