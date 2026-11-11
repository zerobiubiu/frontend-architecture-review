# 前端技术架构与后端实现兼容性审查报告（第二版）

- 状态：第二轮复核完成；仅审查与文档修订，未修改后端、契约、迁移，未创建前端工程。
- 基线：后端 3.0.0；本轮核对 HEAD `f7c6d7b`，`backend/` 相对第一轮基线 `6fa779e` 零改动。
- 输入：第一轮报告（[0064 归档](../0064-frontend-architecture-review/0003-feasibility-review-report.md)）、归档提案（同目录 0002）、[项目与后端概览](../../integration/project-and-backend-overview.md)、本轮任务书、当前源码与已发布第三方资料。
- 决策前提：**Astryx 作为唯一主 UI 设计系统**，不再评估 MUI／Chakra／Ant Design 替代。本报告不再输出 MUI 方案。
- 结论性质：前端可进入工程建设，但必须先落实第一章列出的 4 项前端 P0 门禁；本轮未发现需要立即停工的已确认后端 P0 缺陷。

## 第一章：总体审查结论

### 1.1 总体判断

**保留 Astryx + Tailwind CSS v4 的方案有条件可行，可以冻结技术方向，不能跳过前端 P0 门禁直接开发交易写入。** 后端已提供交易执行、任务调度、核对、回执与双路 SSE 的完整基础；真正的风险集中在客户端如何解释未知结果、金融语义、精确数值与时间、以及异步缓存收敛，而不是 Astryx 能否画出界面。

本轮相对第一轮的四项实质修正：

1. **撤回 MUI 主 UI 建议。** Astryx 0.7.11 已核对到 150+ 组件、Table 插件、AppShell／SideNav／TopNav、Dialog／Drawer／Toast、Field／FormLayout 等实际入口；基础组件覆盖不构成替换理由。
2. **P1-001 由“疑点”升级为“已确认缺陷（源码＋控制流探针）”。** 第一次 CSRF 失败请求确实会创建 `REJECTED/NOT_APPLIED` 回执并保存原始 JSON 指纹；随后同一 UUID 的有效请求会因 Zod `trim` 产生不同指纹而 409。
3. **P0-001 由 P0 降为 P1。** 业务 SSE 慢写确实会延迟会话复验，但该通道只发送资源名提示，不包含业务数据；撤销后的真实读取仍受 HTTP 鉴权保护。属资源与生命周期缺陷，不属于已确认的数据泄露。
4. **后端 P0 清零，前端 P0 明确化。** 迟到 401、对象存在性、原操作者失效恢复均调整为 P1；P0 只保留“未知结果恢复”“金融真实性”“精确数值与时间”“非 2xx 必须消费 operation”四项前端正确性门禁。

### 1.2 主要风险

|风险|性质|当前证据|影响面|
|---|---|---|---|
|未知下单／撤单结果跨刷新后误重发|前端设计缺陷风险|后端订单幂等与 operation 双协议已存在；`/operations` 不含下单|交易正确性（P0）|
|资产、盈亏、终态被错误呈现|前端语义缺陷风险|`buyReady` 不校验余额与新鲜度；`realizedPnl` 默认 0 无计算；订单终态可费用未闭环|交易决策（P0）|
|金额/股数/时间经 Number、Date 或控件被舍入／钳制|前端与组件适配风险|Astryx `NumberInput` 使用 number 并在提交时按 min/max 钳制；`DateTimeInput` 无 UTC／微秒语义|交易正确性（P0）|
|非 2xx 响应携带 `SUCCEEDED` 回执被当成失败|前端协议风险|`trackedOperation` 先返回 failure，再附 operation；已有测试断言 502/429＋SUCCEEDED|误重试、误报（P0 规则）|
|业务 SSE 慢写导致撤销延迟与连接名额占用|后端资源管理|`events.ts` 无独立 guard／写超时；`quote-stream.ts` 有 1.5s guard＋3s 写超时|实时性与资源（P1）|
|CSRF 刷新后同一原 ID 重试被误冲突|后端幂等归一化|原始 JSON 与 Zod 解析输入进入不同指纹|管理控制重试（P1）|
|旧会话 401 删除新 Cookie|后端会话竞态|`authenticate` 固定名 `deleteCookie`|会话可用性（P1）|
|对象存在性可区分|后端响应差异|404 专用 code/message 与通用 NOT_FOUND 并存|信息泄露纵深（P1）|
|契约声明与运行时空值／错误不一致|契约完整性|`worker.lastSeenAt`、`settings`、`error.details`、SSE 错误帧|类型安全与防崩溃（P1）|
|Astryx Beta 升级|第三方版本风险|0.7.11 Beta；主题 peer 精确锁定 core 版本|维护成本（P2，已定缓解）|

### 1.3 是否可进入前端开发

|阶段|结论|前置|
|---|---|---|
|设计系统与只读页面（账户、目录、行情、只读列表）|**可以立即开始**|锁版本、Cascade Layers、RTL／浏览器原型三项通过|
|任务配置表单（保存/编辑，不启动）|可以开始|精确时间与字符串金额适配完成|
|交易写入（下单、撤单、任务启停）|**暂缓**|P0-002／P0-003A／P0-004／P0-008 门禁落地|
|真实资金联调|暂缓|第十二章全部条件＋单独授权|

### 1.4 事实等级与验证边界

- **已验证事实**：本轮直接读取的源码、Hono 安装实现、实际测试执行结果。
- **技术推断**：由源码路径推导、但未在真实网络／数据库复现的行为（如浏览器 Cookie 竞态、慢写阻塞时序）。
- **待验证**：需要隔离 PG、真实浏览器、代理或前端原型才能确认的事项。
- **外部技术判断**：依据对应版本官方文档／发布包的能力与限制。

本轮不把“源码可推导”写成“已复现缺陷”，不把“类型检查通过”写成“运行时正确”，不把“跳过测试”写成“通过”。

### 1.5 与第一轮的差异清单

|第一轮结论|第二版结论|依据|
|---|---|---|
|MUI 作为生产主 UI 默认|**撤销**，Astryx 为唯一主 UI|项目决策＋第九章能力核对|
|P0-001 SSE 慢写为 P0|**P1**|业务流仅资源名；无数据通道；属资源／授权时效|
|P0-003 契约缺口为 P0|**拆分**：P0 前端消费规则＋P1 后端类型契约|风险可由客户端防御，后端修复不阻塞开工|
|P0-005 迟到 401 为 P0|**P1**|已确认删除路径，但影响为强制登出／会话可用性|
|P0-006 存在性为 P0|**P1**|UUIDv4 不可枚举，需认证与限流，无内容泄露|
|P0-007 原操作者失效为 P0|**P1**|运维闭环缺口，无越权路径|
|P1-001 为待验证|**已确认缺陷**，P1|Hono 错误分派＋recorder 后置执行＋原始/解析指纹差异|
|P1-002 精确 key 查找 P1|**P2（条件）**|新前端固定 UUID key，可稳定寻回|
|P1-004 全局成交/详情分页 P1|**P1（条件）＋P2**|全局成交页如要求则需接口；详情分页属规模优化|
|P1-006 资产诊断 P1|**P2**|UI 可保守表达，无需阻塞|
|P2-002 Astryx Beta 风险|**决策已定＋缓解方案**|锁定版本、原型、升级流程|
|P2-005 可靠补播|**当前无需**|REST 收敛满足；未来可靠增量另设计|


## 第二章：后端实际架构分析

### 2.1 结构与职责（核对结论）

`backend/src` 下实际分层与本轮复核一致，未发现第一轮的结构误判：

|路径|职责与关键实现|
|---|---|
|`server/app.ts`|CORS、64 KiB bodyLimit、认证→前置回执→Origin/CSRF、路由与统一 `onError`（28-116、117-165）|
|`server/context.ts`|Cookie 名称/属性、会话查询、限流、Origin/CSRF、角色守卫、owner 校验（27-48、314-376、379-414）|
|`server/operations.ts`|`trackedOperation` 与前置拒绝回执记录器（16-47、50-131）|
|`services/trading/*`|交易引擎、预留、结算、任务、资金/库存预检、私有流；真实 `session.transaction` 与 `FOR UPDATE`|
|`services/operations.ts`|回执指纹、执行锁、对象互斥、冻结结果、读取收敛与恢复（44-58、382-545、547+）|
|`domain/*`|订单身份/结算、任务边界、证券准入、资金预留；无 I/O|
|`api/*`|Stocks／Wallet 适配、归一化、错误与限流；SDK `retries: 0`|
|`database/*`|Drizzle schema、Bun SQL 池、迁移哈希/前缀校验与 advisory lock|
|`worker/*`|启动恢复、周期 `tick`、25 ms 不重叠调度、5 秒心跳|

### 2.2 请求到事务的真实链路

以受限控制操作（撤单/任务控制/账户检查·同步·核对/管理写入）为例：

```text
HTTP
  → requestContext（requestId、operationAccepted=false、no-store）
  → authenticate（会话+用户 ACTIVE）
  → recordPreAcceptanceRejection（仅认证+可信 Origin+UUID）
  → protectOriginAndCsrf
  → route handler（Zod parse）
  → trackedOperation → executeOperation（指纹、执行锁、对象互斥、回执）
  → 业务事务（行锁/预留守恒/审计）
  → 返回 {data|error, operation}
```

关键点：Hono 0.13.x 安装实现的 `compose` 在**抛出错误的那一层**调用 `onError`，然后让上游中间件的 `await next()` 正常恢复执行（`node_modules/hono/dist/compose.js:34-45`）。本节结论直接决定 P1-001 是否成立，本轮用无数据库探针验证了该控制流（见 13.3）。

### 2.3 Worker 与共享状态

- Worker 启动先 `recover()`，再周期 `tick()`；独立 25 ms `schedule()` 通道不等待慢挂单查询（`worker/index.ts:156-216`、`worker/task-scheduler.ts:8-29`）。
- 私有流只把官方订单号放入通知集合，仍按原订单读取完整证据；不能直接结算（`services/trading/streams.ts:67-95`）。
- API 与 Worker 通过 PostgreSQL 共享业务事实，没有已实现的 LISTEN/NOTIFY 总线；业务 SSE 每连接轮询摘要（`server/events.ts:159-215`）。
- 用户禁用/权限变更会撤销会话；已建立的 SSE 在下一轮检查或独立 guard 中退场（两类流机制不同，见第五章）。

### 2.4 数据库与不变量

金额 `numeric(38,18)`、股数 `numeric(30,10)`（`database/schema.ts:29-30`）；订单/任务/持仓/账本均有 CHECK 约束与唯一索引；原操作回执以 `scopeKey` 部分唯一约束未解决对象（`schema.ts:465-467`）。迁移启动时校验已执行前缀与哈希，失败阻断（`database/migrations.ts:169-193`）。

这些约束意味着：**客户端无法通过重算或重传“修正”已冻结的金额、终态或回执**；前端只能呈现并请求服务端推进。


## 第三章：前端技术选型审查（Astryx 为既定前提）

### 3.1 逐项评估

版本为本轮读取的公开元数据观测值，不是组合已通过证明；最终以锁文件和原型为准。

|技术|业务适配|与后端兼容|替代与复杂度|版本/环境限制|需后端配合|最终决定|
|---|---|---|---|---|---|---|
|React 19|多角色管理 SPA 足够；无需 SSR|无框架绑定|Vue 需重写，无收益|19.3.1；StrictMode 下流必须幂等清理|否|必须|
|TypeScript|状态联合、协议解析、表单类型|消费公开声明与 Zod|纯 JS 失去边界|前端建议先锁 5.9.3：`react-doctor@0.9.22` 依赖 `typescript >=5.0.4 <6`；TS 7.0.2 待工具链验证|否|必须（版本待定）|
|Vite|独立静态 SPA，开发代理|仅需 API Base URL|Next/TanStack Start 引入服务端层|8.3.7；Node ^20.19 或 ≥22.12|否|必须|
|Astryx|基础组件、管理页面、表格外壳覆盖充分|纯前端|MUI/Chakra 已排除；见第九章|0.7.11 Beta；React ≥19；主题 peer 精确锁 core 0.7.11；CLI Node ≥22.13|否|**必须（唯一主 UI）**|
|Tailwind v4|布局、工具类、少量定制|纯前端|若不用需更多 CSS 自写|4.3.5；浏览器 Chrome111/Safari16.4/Firefox128|否|必须|
|Astryx CSS Variables|主题唯一数值来源|纯前端|第二套 token 会漂移|随 core 版本；0.7 有选择器迁移|否|必须|
|Tabler Icons|状态/操作/导航图标|纯前端|可换但无必要|3.51.0；React ≥16|否|必须|
|TanStack Router|URL 承载账户/筛选/页码；loader 协调 Query|无框架绑定|React Router 可行|1.170.46；Node ≥20.19|否|必须|
|TanStack Query|REST 权威读取＋SSE 失效；取消/重取|HTTP/JSON|RTK Query/SWR 均可，但需同样时序保护|5.107.1；React 18/19|否|必须|
|Zustand|仅可能用于独立高频行情/偏好|无|初期 URL＋局部 state＋Query 足够；需要时用 vanilla store|5.1.0|否|暂缓（按需）|
|React Hook Form|完整任务配置、条件字段|受控组件适配|TanStack Form 无迁移收益|7.91.0|否|必须|
|Zod|公开输入 schema 复用|validation.ts 仅依赖 zod|Valibot 会形成第二套规则|4.6.7；`@hookform/resolvers@7.0.5` 支持 Zod4|否|必须|
|TanStack Table|只读表格逻辑；服务端分页|与分页/筛选一一映射|AG Grid 当前无编辑/透视需求|9.3.1；Node ≥20|否|必须|
|TanStack Virtual|大详情/10000 候选的 DOM 优化|不改变传输|只在测量后引入|3.14.26；React 16.8–19|否|按需|
|Native EventSource|Cookie GET 流；单证券行情|现有两路 SSE|Fetch 流仅在某需求（读握手状态）时替换|浏览器原生；跨源需 withCredentials|否|必须|
|Native Fetch|52 接口、AbortSignal|error/data/operation 保留|hc 等价；Axios 无收益|浏览器原生|契约补强|必须|
|Backend Contracts|类型来源；避免手写 DTO|hc 推导声明|OpenAPI 当前多此一举|需补空值/错误/流|后端类型修正|必须（调整）|
|decimal.js|精确比较/求和/展示|十进制字符串|Number 不可用|10.6.0|否|必须|
|Intl API|货币/日期/时区展示|字符串输入|不负责序列化|目标浏览器能力需测|否|必须|
|IANA Time Zone|纽约时段/DST|纯展示与输入语义|固定偏移错误|浏览器 tzdata 需验|否|必须|
|Temporal 适配|DST 消歧与微秒解析|原始 UTC 字符串|date-fns 不解决|原生未普及；polyfill 0.5.1|否|按需（需 IANA 编辑时）|
|i18next|多语言 UI|与后端中文 message 独立|当前无多语言范围|27.0.1/18.0.1；Node ≥22|否|暂缓|
|Vitest|纯逻辑/适配器/状态映射|无|bun:test 不适用前端|5.1.0；Node ^22.12/24/26；Vite 6.4/7/8|否|必须（开发）|
|RTL|组件行为/可访问性|无|仅快照测试价值低|16.3.3；React 18/19|否|必须（开发）|
|Playwright|Cookie/CSRF/SSE/多标签/竞态|真实隔离后端|单元 mock 不能替代|1.65.0；Node ≥20；需下载浏览器|需隔离环境|必须（开发）|
|MSW|开发期协议夹具|可模拟 JSON/SSE|不能证明后端或浏览器行为|3.0.4；Node ≥22.12；TS ≥5.9|否|必须（开发）|
|React Doctor|React 代码静态诊断|无|与 ESLint/Oxlint 有重叠|0.9.22；Node ^20.19/≥22.13；依赖 TS <6、捆绑 Playwright core|否|按需（建议 CI 咨询项）|
|Semgrep|SAST（安全规则）|无|与类型/lint 不重叠|官方 CLI 经 pipx/uv/Docker，Python ≥3.10；Windows beta；npm `semgrep@0.0.1` 非官方 CLI|否|按需（CI）|
|Sentry|前端故障监控|无|先本地结构化错误|11.11.0；React 17–19；需 DSN 与脱敏策略|否|暂缓|

### 3.2 关键结论

- **不引入第二套 UI 库。** Astryx 已覆盖应用框架、导航、表单、Overlay、Table；MUI/Emotion/MUI X 均不进入依赖。
- **不因为 TanStack Router 就引入全套 TanStack。** Form 继续 RHF；Store 暂不引入；Virtual 按需。
- **TypeScript 版本要单独决策。** 后端 TS 7.0.2 不影响前端；React Doctor 与部分生态工具仍以 TS 5.x 为上限。建议前端先锁 5.9.3，待 Vite/Vitest/插件与 Astryx 类型在 TS7 下完成独立构建与类型探针后再升级。
- **StyleX 不是业务样式方案。** consumption 使用预编译 CSS；只有 swizzle 或自写 `stylex.create` 才需要 StyleX 编译（第九章）。
- **`@stylexjs/stylex` 仍是必装 peer。** `@astryxdesign/core@0.7.11` 的 peer 为 `@stylexjs/stylex ^0.19.0`（非 optional）；这是依赖，不是业务使用。


## 第四章：API 契约分析

### 4.1 覆盖与形态

后端 52 个显式方法／路径组合未变（52 = 6 应用/认证 + 9 账户 + 13 管理 + 17 业务 + 4 市场/操作/流，其中含 2 条 SSE）。完整逐条清单与请求绑定见第一轮报告第四章，本轮只复核差异与结论。

```text
GET  /healthz | /api/v1/meta | /api/v1/auth/me | /api/v1/overview
POST /api/v1/auth/login | /api/v1/auth/logout | /api/v1/auth/password
GET/POST /api/v1/accounts ; GET/PATCH /api/v1/accounts/:id
POST /api/v1/accounts/:id/check | assets/sync | reconcile
GET  /api/v1/accounts/:id/exchange/orders | exchange/trades
GET  /api/v1/market/symbols | holdings | quotes | quote-stream
POST /api/v1/orders/preflight | /api/v1/orders ; GET /api/v1/orders | /orders/:id
POST /api/v1/orders/:id/cancel | reconcile
GET/POST /api/v1/tasks ; GET/PATCH /api/v1/tasks/:id ; POST /tasks/:id/control
GET  /api/v1/positions | ledger | reconciliations | logs | operations | operations/:id
POST /api/v1/operations/:id/reconcile ; GET /api/v1/events
GET  /api/v1/admin/overview | users | accounts | tasks | orders | ledger | audit | system
POST /api/v1/admin/users ; PATCH /admin/users/:id ; PATCH /admin/accounts/:id
PATCH /api/v1/admin/system ; POST /api/v1/admin/endpoints/benchmark
```

### 4.2 契约差异（修订）

|编号|差异|当前证据|状态|
|---|---|---|---|
|C01|全局错误未进入逐方法推导；登录只推导成功体|`contracts/client.d.ts` 登录段；`server/app.ts:117-165`|保留（P1）|
|C02|`error.details` 声明为 null，实际可带 `blockingOperation`|`client.d.ts:538-543`；`server/operations.ts:31-38`|保留（P1）|
|C03|tracked 错误声明必带 operation；缺 UUID／未认证／来源拒绝可不带|`server/operations.ts:21-23,54-60`；`context.ts:314-376`|保留（P1）|
|C04|`worker.lastSeenAt` 声明 string，源码可 null|`server/queries.ts:190`；`client.d.ts:1449-1453,2824-2827`|保留（P1）|
|C05|`settings` 声明非空，构造可 null|`server/admin.ts:137,558`；`client.d.ts:1454-1467,1496-1508`|保留（P1）|
|C06|SSE 在 RPC 中 `output:{}`；业务流错误帧无 schema|`client.d.ts:5-11,4036-4047`；`server/events.ts:142-149`|保留；复用 quote 联合|
|C07|回执 `result` 为宽松字典；`phase/outcome` 为字符串|`validation/contracts.ts:694-708`|保留（P1）|
|C08|CSRF／幂等头未进入声明 input|`business.ts:289-297`；`operations.ts:21`；`context.ts:362-373`|保留（前端封装）|
|C09|大量成功状态被推导为宽 status 联合|`client.d.ts:154-155,567`|保留（消费端按 `data` 判定）|
|C10|部分路由最终 schema 未公开|`auth.ts:87-92`；`accounts.ts:35-37`；`market-catalog.ts:28-37`|保留（P2）|
|C11|query 类型可出现数组，运行时不支持重复键|`contracts.ts:409`；Hono query 解析|保留（编码单值）|
|C12|契约制品无版本 manifest|`scripts/export-contracts.ts:9,41-43`|保留（P2）|
|C13（新）|`validation.ts` 仅 import zod，可在浏览器复用；但导出器未校验其依赖白名单|`backend/contracts/validation.ts:2`；`export-contracts.ts:35-43`|P2 加固|
|C14（新）|业务流鉴权失败也是 message 内 error，且 HTTP 仍 200|`server/events.ts:142-149`|前端必须识别并 `close()`|

### 4.3 明确回答

**当前能否用 Native Fetch + 现有 Backend Contracts 完成整个前端 API 层？**

**可以，但必须补一层“协议适配 + 防御解析”，不是零成本直接使用。** 具体需要：

1. 从 `ApiClient` 派生请求／成功响应类型（Hono `InferRequestType`/`InferResponseType` 仅作类型依赖）。
2. 自定义 `ApiErrorBody`：`operation` 可选、`details` 为真实 JSON、`operationAccepted` 仅在存在时为 false。
3. 显式处理健康 503（仍是 `data`）、业务 SSE 错误帧、行情 `status.retryable`。
4. 对 `worker`、`settings`、`result` 等已知运行时空值逐一收窄，禁止直接解引用声明。
5. 所有写请求方法签名强制要求对应原 ID；非 2xx 也返回结构化结果，不抛成“业务失败”。

不需要 Hono RPC 运行时、OpenAPI 或共享 workspace。若未来出现第二语言消费者，再评估 OpenAPI；当前维护两套协议只会增加漂移。


## 第五章：SSE 可行性分析

### 5.1 两路流的真实协议

|项目|业务流 `GET /api/v1/events`|行情流 `GET /api/v1/market/quote-stream`|
|---|---|---|
|消息类型|默认 `message`；无 `event:` 名|默认 `message`；`kind=quote|status`|
|载荷|`{kind:"refresh",resources[9],at,requestId}`；鉴权失败为 `{error:{code,message,requestId}}`|quote：账户+证券+报价快照+来源时间；status：connecting/waiting/live/snapshot/reconnecting/unavailable + retryable|
|资源|orders/tasks/accounts/ledger/events/settings/users/audit/worker；**无 operations/positions/trades**|单证券、单账户；非成交账本|
|ID/序号|帧 `id` 为“毫秒-连接内计数”，每连接从 0；非持久游标|无帧 id|
|触发|每连接轮询 `max(updatedAt)+count` 等摘要（`events.ts:159-215`）；首连全资源|relay 推送；静默≥5 s 且到期补读 REST；REST 无市场时间|
|补播|无 `Last-Event-ID` 读取、无历史查询（`events.ts:123-239`）|无|
|配额|每用户每 API 进程 6 条（两类合计，`events.ts:23-37`）；建流 30 次/60 s（`:58`）|共享同一 6 条；建流 30 次/60 s（`quote-stream.ts:26-38`）|
|授权|每轮查 session 未撤销/未过期、用户 ACTIVE、角色一致（`:127-149`）|独立 1.5 s guard 复验会话/账户/凭据，失败发终止 status 后关闭（`:79-107`）|

已知语义边界（源码事实）：同一轮多处变更合并；重连重复提示；`max+count` 可漏掉未改变最大时间的更新；`ledger` 比较 `createdAt`，而费用补币种只改 `updatedAt`（`settlement.ts:530-541`）；`worker` 只比较 `online:status`。因此 SSE 只能做“失效提示”，不能做增量日志或交易事实。

### 5.2 业务流慢写：是否真实安全风险

必须区分三件事：

|问题|结论|依据|
|---|---|---|
|① 撤销后连接延迟关闭|**存在**。会话检查、版本查询、`writeSSE`、`sleep` 在同一循环（`events.ts:127-239`），无写超时、无独立 guard|Hono `StreamingApi.write` 直接 `await writer.write`（`node_modules/hono/dist/utils/stream.js`），慢消费者会让该 Promise 长期不结算|
|② 已写入缓冲但未到浏览器|**存在但无业务数据**。可能晚到的只是一帧资源名刷新，`data` 不含订单/金额/账户内容|`events.ts:223-233`|
|③ 撤销后新产生的敏感事件|**不成立**。写阻塞时循环停在同一帧；解除后下一轮先查会话并退出。且 SSE 从不发送业务对象|同上|

**最终判断：**

- 不属于已确认的数据泄露；不能写成“撤销后仍泄露交易数据”。
- 属于**资源生命周期与授权时效问题**：慢客户端可占住每用户 6 个名额之一，撤销/禁用不能在可预期时间内释放；业务流也没有行情流的 3 s 写截止。
- 因此由 P0 调整为 **P1**。修复可复用行情流模式：独立 `setInterval` guard 做会话复验 + 每帧写 `setTimeout(() => stream.abort(), 3000)` + `finally` 释放名额。`stream.abort()` 会取消 readable，使挂起 write 失败并被 `write` 内部捕获，这一解除阻塞行为属**技术推断**，需隔离测试确认。
- 代理缓冲：后端设置了 `X-Accel-Buffering:no`，Hono 设置 chunked/no-cache；实际 nginx/Cloudflare 行为不在仓库内，**待部署验证**。

### 5.3 行情流可复用的保护

`quote-stream.ts` 已实现：独立 1.5 s guard、`maintain()` 复验、终止时只保留 status、写/心跳 3 s 截止后 `abort`、关闭上游并释放配额（`:79-160`）。业务流改造应复用同一模式，而不是新建事件总线。

### 5.4 前端连接与缓存收敛

建议最终链路：

```text
业务 SSE（每标签 1 条）→ 解析 refresh/error → 资源→QueryKey 映射 → 合并短窗口 → 标记 stale
  → 仅重读活动 query；在途 GET 保留“尾随重读”；epoch/账户变化取消旧请求
REST 查询（权威）→ 页面渲染；operations/未知原ID → 独立轮询 + 精确 GET
行情 SSE（每标签仅当前 1 条）→ quote/status → 当前账户+证券+generation 的单一快照 → UI
```

规则：

1. 业务事件无 accountId/实体 id，不能做精确缓存更新；只做资源族失效。
2. `orders` 提示同时影响订单、任务详情内订单/成交、持仓、账本、overview；`accounts` 影响账户与行情/目录/持仓缓存有效性。
3. 收到业务流 `error` 帧或行情 `retryable:false`：立即 `close()`，进入登录/重新读取流程；不能让 EventSource 自动重连刷配额。
4. 初连/重连/重新聚焦：全资源收敛 + `/operations` 未解决项 + 正在跟踪的原 ID。
5. 多标签：默认每标签 2 条、非当前行情关闭；需要共享时再评估 `BroadcastChannel`+Web Locks 选主，复杂度不作为首期依赖。
6. 无补播：断线期间的变化只能靠 REST 重读；不得以帧 id 推断遗漏数量。


## 第六章：业务状态与操作恢复分析

### 6.1 订单：10 状态（复核不变）

枚举与写入路径与第一轮一致（`domain/orders/status.ts`、`api/normalize.ts:64-87`、`services/trading/engine.ts`、`settlement.ts`）。本轮新增两条展示约束：

1. `FILLED/CANCELED/EXPIRED/REJECTED` 只是**订单生命周期**终态；`feeFinalized`、`feePending`、`tradeEvidencePending`、`reservationReleased`、`sellInventoryVerifiedAt` 必须独立展示（`schema.ts:201-217`）。
2. 市价买入允许“已 FILLED 但未花满本金”；`summary.partialOrders` 与 `filledOrders` 可重叠，不能相加当分布（`server/business.ts:388-398`）。

禁止：由页面倒计时、最新报价、当前余额或旧快照推断终态；由 `FILLED` 解锁同证券新卖单（SELL 仍需库存下降核实，`sell-inventory.ts:19-101`）。

### 6.2 任务：13 状态与真实写入范围

|状态|本轮核对|
|---|---|
|CREATED/SCHEDULED/RUNNING/PAUSED/RECONCILING/RECOVERY_REQUIRED/STOPPING/COMPLETED/EXPIRED/STOPPED|有业务写入路径；转换受 `taskBoundary`、`changeState`、安全停机与证据门禁约束|
|VALIDATING/READY/FAILED|**仅枚举/读取兼容，当前无业务写入路径**（`validation/contracts.ts:30-44`；`tasks.ts:461,558,577`；统计只读 `admin.ts:91-94`）|

按钮结论不变：编辑仅 CREATED/READY/PAUSED；start 仅 CREATED/READY；resume 仅 PAUSED；管理员仅 pause/stop/reconcile；RECOVERY_REQUIRED 的 pause 先保持恢复态再核对。完整 PATCH 必须提交完整有效分支；`startedAt` 决定冻结字段与窗口缩短；省略默认值会重置而非保留。

任务详情返回全部 orders/trades/events（无页长），非原子快照；`summary.remaining` 未扣活动委托，不能显示为“还能再下的量”；`lastInterruption=null` 不证明从未故障。

预算边界：已有 `targetNotional` 与“已成交＋活动委托≤目标”的守恒（`schema.ts:169-173`、`reservations.ts:92-101`），**没有**含费总支出硬预算、平台级 `maxTaskNotional`、整任务融资保证。

### 6.3 原操作回执：5 状态与冻结结果

公开字段：`id/actorUserId/kind/targetType/targetId/status/phase/outcome/result/error/createdAt/updatedAt/finishedAt`（`contracts.ts:694-708`）。`phase` 为自由字符串，实际含 REGISTERED/LOCAL_APPLIED/CANCEL_INTENT/EXTERNAL_STARTED/RECONCILE_STARTED/CONFIRMED；`result` 可空且随时点变化。

|状态|真实含义|
|---|---|
|PROCESSING|执行者可能仍持锁；禁止重发|
|UNKNOWN|无可信终态，可能部分应用；保留占用与对象门禁|
|CONFLICT|枚举与未解决约束保留；生产源码未发现写入者；HTTP 409 不等于该状态|
|REJECTED|本次原操作已证明未应用（含前置拒绝、对象占用、4xx 在 REGISTERED 阶段）|
|SUCCEEDED|该 kind 定义的本地应用/核对流程完成，不等于目标业务成功|

|kind|SUCCEEDED 的真实含义|
|---|---|
|ORDER_CANCEL|原单已绑定可信终态且释放预留，或本地未发送意图中止；`TARGET_TERMINAL_OTHER` 可能是 FILLED|
|TASK_CONTROL|本地控制已提交；不表示任务完成/全部撤单|
|USER_UPDATE / ACCOUNT_RESTRICT / PLATFORM_UPDATE|本地状态/限制/设置已提交；不撤销交易所挂单|
|ACCOUNT_CHECK|检查事实已保存，`connectionStatus` 可为 ERROR|
|ACCOUNT_SYNC|同步结果或失败标记已保存；可 HTTP 502＋SUCCEEDED|
|ACCOUNT_RECONCILE|冻结范围核对完成；`result.status` 可为 DIFFERENCE/UNAVAILABLE/PARTIAL|

### 6.4 两条恢复链路（不得合并）

**A. 下单：订单自身幂等。** `Idempotency-Key` 1–200 字符、owner+key 作用域；`POST /orders` 不写 `operation_receipts`。恢复：UUID → `GET /orders/:id`；仅知 key → `GET /orders?search=`（最长 100、模糊、需精确核对）。新前端固定使用 UUID 作为 key，36 字符，可稳定检索。

**B. 八类控制：UUID 原操作。** `/operations` 仅返回未解决候选（无分页/排序），`/operations/:id` 读取时可在执行锁下把孤立 REGISTERED 收敛为 REJECTED；`POST /operations/:id/reconcile` 只推进该类型允许的核对，不重放原动作；ACCOUNT_RECONCILE 仅原 actor 可续（`services/operations.ts:553-572`）。

**C. `operationAccepted:false` 的语义边界。** 它只说明**本次 HTTP 尝试**未进入登记，不能证明同一 UUID 过去未应用（`context.ts:239-252`、`server/operations.ts:99-130`）。收到 401 携带 false 时，必须重新登录后按原 ID `GET`，不得换 ID。

### 6.5 P1-001：CSRF 失败也会落原始指纹（已确认）

执行路径（全部为当前源码）：

1. 中间件顺序：authenticate → `recordPreAcceptanceRejection` → `protectOriginAndCsrf`（`app.ts:73-75`）。
2. 记录器只要求：有效 UUID、`operationAccepted===false`、可信 Origin（`server/operations.ts:54-59`）；**不要求 CSRF**。
3. 它在 `next()` 之前读取原始 JSON 并构造 descriptor（`:70-98`）。
4. 下游 CSRF 抛 403；Hono 在抛出处调用 `onError`，上游 `await next()` 恢复（`compose.js:34-45`；本轮探针验证 `afterNextRan=true`、status=403）。
5. 记录器看到 `c.res.status≥400`，用原始 input 调 `executeOperation`（`:99-126`）；work 抛 4xx，在 REGISTERED 阶段落 `REJECTED/NOT_APPLIED`，并写 `requestHash`（`services/operations.ts:500-538`）。
6. 第二次请求 CSRF 有效，路由用 `adminAccountUpdateSchema.strict()` 解析，`adminBlockReason` 被 `.trim()`（`contracts.ts:156`；`admin.ts:417-421`），trackedOperation 用解析后 input 计算指纹（`server/operations.ts:25-26`；`services/operations.ts:394-400`）。
7. 同 UUID 已存在且 hash 不同 → `OPERATION_KEY_CONFLICT` 409（`:408-415`）。

**结论：**第一段请求**确实**创建回执并保存原始指纹；场景成立。限制：只影响经前置拒绝后同 UUID 重试的受控操作；当前可触发字段为带首尾空白的 `adminBlockReason`（其他 tracked 输入无 transform/default）。数据库端到端未执行（需隔离 PG），但控制流与指纹差异已由源码＋无库探针确认。

最小修复方向（后端，P1，无需迁移）：让前置拒绝与正常路径共用同一输入规范化；或把“仅前置拒绝形成的 REJECTED 回执”视为可安全重试：同 actor/target/kind 且 `phase=REGISTERED`、`outcome=NOT_APPLIED`、错误码属于前置拒绝类时，允许以原 UUID 重新执行并用新指纹替换回执，同时保留审计。禁止在冲突时静默换 UUID 或忽略比较。

### 6.6 跨生命周期禁止动作

|场景|必须|禁止|
|---|---|---|
|刷新/关闭/重开|同身份按原 ID 读取；持久最小定位记录|组件重建即换 ID；把取消请求当服务端未执行|
|重新登录|新 CSRF/epoch，旧原 ID 继续查|401 后自动重放写请求|
|账户/用户切换|隔离 query scope、关闭旧行情、清敏感缓存|把原 key 改绑账户；展示他人恢复信息|
|SSE 断线|标非实时，REST 收敛|由断线推断失败/释放占用|
|HTTP 超时/429/502|保留 status/error/operation，无终态只查原 ID|按非 2xx 判定未应用；换 key 重发|
|旧 GET 晚到|epoch/账户代次隔离，尾随重读|用旧 ACCEPTED 清除 cancelStarted 保护|


## 第七章：安全与权限分析

### 7.1 Cookie / CSRF / Origin / CORS（复核不变）

- Cookie：HTTPS 下 `__Host-equity_production_session`；HttpOnly、Secure（HTTPS）、Path=/、SameSite 默认 strict；8 小时不滑动（`context.ts:27-48`；`auth.ts:66-70`）。
- 登录返回 `{user,csrfToken}`；写操作除登录外必须可信 Origin + `X-CSRF-Token`；GET 流不需要 CSRF（`context.ts:350-376`）。
- CORS 精确来源白名单、`credentials:true`、允许头 `Content-Type/X-CSRF-Token/Idempotency-Key`（`app.ts:31-36`）。
- 匿名受保护请求可能先 401（认证在来源校验前）；跨站部署需 SameSite=None+HTTPS，仍受第三方 Cookie 策略限制。

### 7.2 迟到 401：优先级 P1（后端修复）

源码确认：无效会话分支 `clearSessionCookie(c)` 后抛 401（`context.ts:340-342`）；删除使用固定名称/路径（`:39-40`），新登录写同名 Cookie（`auth.ts:70`）。旧 A 的响应晚于新 B 登录时，可删除 B。**浏览器级复现未执行**，属技术推断但代码路径明确。

影响：强制登出／会话可用性，不是越权或交易错误。因此由 P0 调整为 **P1**；若产品把“强制登出”列为安全事件，可保留 P0。登出、改密、管理员自撤权仍显式删除固定名 Cookie，仅修 401 分支不能声称所有竞态解决。

前端可做：sessionEpoch、AbortSignal、旧响应隔离、跨标签广播、串行认证。前端不能做：拦截 HttpOnly Set-Cookie；不得 401 后自动重试写操作。

### 7.3 对象存在性：P1（纵深防御）

|入口|不存在|存在但无权|
|---|---|---|
|账户详情/账户动作|`ACCOUNT_NOT_FOUND` + “账户不存在”|`NOT_FOUND` + “资源不存在或无权访问”|
|订单详情/撤单/核对|`ORDER_NOT_FOUND`|同上|
|任务详情/控制/编辑|`TASK_NOT_FOUND`|同上|
|原操作回执|`OPERATION_NOT_FOUND` + “尚未找到原操作…”|同码，消息为“不存在或无权读取…”|

证据：`server/queries.ts:71-91`；`context.ts:408-412`；`services/operations.ts:70-82,322`。

评估：需要有效会话；对象 UUID 为 v4 随机（`schema.ts:43` 等）；认证请求 1000/60s、写 120/60s、管理员 300/60s；未泄露内容，未发现可枚举条件。结论：**存在性信号成立，内容泄露/可枚举/越权不成立**，P1；统一错误码与消息可作纵深加固，同时保留内部审计与“404 不证明未执行”语义。

### 7.4 角色与缓存隔离

角色矩阵与第一轮一致（`accounts.ts:302,327-349`；`business.ts:283-432`；`admin.ts:168-633`；`services/operations.ts:70-82,559-560`）。三点强化：

1. `canManageAdmins` 只影响管理员管理；普通管理员仍有监管权限，但不是交易员。
2. 管理员 pause/stop/reconcile 可能推进既有自动撤单授权，不是纯只读。
3. Query key 必须含 `sessionEpoch/user/role/account/参数`；身份切换清缓存、关两流、取消在途；账户切换不得复用上一账户 `placeholderData`。

### 7.5 部署兼容

|形态|结论|
|---|---|
|同源（推荐）|外部静态托管/代理把前端与 `/api` 放同一 Origin；写请求仍需 Origin/CSRF|
|跨源同站|配置精确 `FRONTEND_ORIGINS`；Fetch `credentials:include`、EventSource `withCredentials:true`|
|跨站|需 `SameSite=None`+HTTPS；第三方 Cookie 策略可能阻断，需实测|
|HTTPS 终止代理|`API_ORIGIN` 必须是公开 HTTPS，否则 Cookie 名称/Secure 错误|


## 第八章：数据表格和数据处理分析

### 8.1 分页与筛选（复核，完整矩阵）

F 默认 page=1、pageSize=25、最大 100；P=`{items,total,page,pageSize}`；无通用排序/游标/增量。from/to 多过滤 createdAt。接口接受 F 不代表使用全部字段（`queries.ts:34-63`）。

|资源|形态|有效筛选|排序|忽略/限制|
|---|---|---|---|---|
|本地/admin 订单|P 1/25/100|F；search 覆盖 clientOrderId/idempotencyKey/symbol/reason|createdAt↓|无动态排序|
|任务|P|F；search name/symbol/reason|createdAt↓|附 lastInterruption|
|admin 用户|P|owner/status/时间/search|createdAt↓|accountId/symbol 忽略|
|普通账户|数组无 limit|owner/account/status/时间/search|createdAt↓|page/size 忽略|
|admin 账户|P|同账户（symbol 忽略）|createdAt↓|—|
|positions|P|owner/account/symbol/时间|symbol↑|status/search 忽略|
|账本/admin 账本|P|F；status→type；symbol 经订单|createdAt↓|—|
|审计|P|owner→actor/status→result/时间/search|createdAt↓|accountId 仅 targetId|
|logs|P（三源 union）|F|createdAt↓|无 level|
|核对记录|数组无 limit|owner/account/status/时间|createdAt↓|symbol/search/page 忽略|
|operations|数组无 limit|内部未解决候选|未指定|非历史|
|官方订单/成交|P 1/25/100；默认 7 天|symbol/from/to/page/size|上游顺序|size 未再断言 rows 长度|
|本地全局成交|**无接口**|—|—|只能读订单/任务详情|
|证券目录|P+source/expiresAt|accountId/search/refresh|symbol↑|无白名单|
|holdings|完整快照 ≤10000 项|accountId|上游顺序|无分页|

### 8.2 表格技术分工

- **Astryx Table 负责视觉与结构**：density/dividers/hover/truncate、列宽、选择、固定列、排序指示、行状态（`Table.d.ts`；插件导出见 `Table/index.d.ts`）。
- **TanStack Table 负责数据逻辑**：列定义、可见性、排序/筛选状态、服务端分页参数；或直接用 Astryx 的 consumer-owned `useTablePagination({page,onPageChange,totalItems,pageSize})`＋服务端返回的 total。
- **只能有一个分页/排序状态拥有者**。不要同时开启 Astryx `useTablePagination` 和 TanStack client pagination；不要用 `paginateData` 切服务端已分页数据。
- Virtual 仅在测量到 10000 候选或大详情时引入；它不影响传输与查询。
- 当前不引入 AG Grid／MUI X：无交易事实单元格编辑、透视或 Excel 粘贴需求；订单/账本不可前端改。

### 8.3 金融数值

|数据|表示|前端规则|
|---|---|---|
|限价|字符串，≤2 位小数|保留原串；不钳制、不舍入|
|股数/目标|字符串，≤10 位小数，≤1,000,000|文本输入；Decimal 比较|
|市价本金|字符串，≤12 整数＋18 小数|与股数分支互斥|
|官方价格/费用|金额 18 位、股数 10 位；HALF_EVEN 内部计算|原始证据不截断；展示舍入不回写|
|预留费用|max(本金×费率,最低) 向上取分|标“估算”|
|实际费用|订单累计 fee 可 null；逐笔 fee 可 null|未知不填 0|
|余额|Funding USDC free 快照；`cashBalance` 恒 null|未知/历史/明确零分开|
|名义持仓|本地成交重放；`availableQuantity:null`|非官方库存/可卖量|
|盈亏|`realizedPnl` 默认 0 未计算；`unrealizedPnl:null`|显示“不提供/未计算”，不得展示 0 为已实现|

`Intl.NumberFormat` 可格式化精确字符串，但旧引擎可能先转 Number；目标浏览器需验证，展示值不得回填。

### 8.4 时间与 DST

- 计划开始：UTC `Z`、完整秒、去尾零后 ≤6 位小数；服务层校验（`tasks.ts:368-396`）。`config.scheduledStartAt` 原串是编辑基线；顶层列经 Date 可能丢微秒。
- 任务间隔：JSON number，0.1–86400 s、≤3 位小数。
- 展示：`Intl.DateTimeFormat` 指定 `UTC`/`America/New_York`/本地；不参与序列化。
- 输入：默认提供 **UTC 精确文本**（正则＋日历校验＋Temporal/自写解析），保留原串；若支持纽约墙钟，必须拒绝春季不存在时刻、要求秋季重复时刻明确 offset，并回显 UTC。
- 不用 date-fns 替代微秒语义；Temporal polyfill 仅在 IANA 编辑需要时引入。

### 8.5 资产真实性

`buyReady` 不校验余额>0、快照年龄；`sellReady/tradingReady` 不校验具体证券库存（`account-projection.ts:12-42`）。`walletSyncError` 可来自连接检查的规则/私有流失败，不严格等于钱包接口失败。holdings 空数组不制造任意证券零库存；卖出仍需当次 preflight。核对：DIFFERENCE 优先于 UNAVAILABLE，PARTIAL 不是全量一致（`engine.ts:1102-1124`）。


## 第九章：Astryx 可行性与实施方案（唯一主 UI）

### 9.1 能力结论

**Astryx 0.7.11 可以承担本项目的基础 UI 组件体系**：应用框架（AppShell）、导航（SideNav/TopNav/Breadcrumbs/TabList）、Overlay（Dialog/AlertDialog/Drawer/Toast/Popover/Tooltip/CommandPalette）、表单（Field/FormLayout/TextInput/TextArea/Selector/MultiSelector/Checkbox/Radio/Switch/Slider/FileInput/DateInput/DateTimeInput/NumberInput）、反馈（Banner/Badge/StatusDot/ProgressBar/Spinner/EmptyState）、数据展示（Table/List/TreeList/MetadataList/Pagination）均有公开入口。

它**不直接承担**：金融字符串输入、UTC 微秒／DST 输入、服务端数据表格逻辑、RHF 绑定、权限/恢复语义。这些必须是业务组件，不是替换 UI 库能消除的。

### 9.2 组件使用矩阵

|类别|组件|策略|理由|
|---|---|---|---|
|应用框架|AppShell、SideNav、TopNav、Breadcrumbs、TabList|直接使用|管理台标准布局；移动端用 AppShell 的 mobile nav|
|动作|Button、IconButton、Link、SegmentedControl、ToggleButtonGroup、Toolbar|直接使用|状态与危险动作由业务层控制|
|反馈|Banner、Badge、StatusDot/Indicator、InfoTip、ProgressBar、Spinner、Skeleton、EmptyState|直接使用＋状态映射|Banner 用于“实时/陈旧/未知”提示，不承载交易事实|
|Overlay|Dialog、AlertDialog、Drawer、Popover、Tooltip、Toast、CommandPalette、DropdownMenu|直接使用|确认框需业务文案与禁用条件|
|表单容器|FormLayout、Field、FieldStatus|直接使用|统一标签/描述/错误/必填语义|
|文本|TextInput、TextArea|直接使用（受控字符串）|`value:string`＋`onChange(value,e)`＋rest 事件可接 RHF|
|选择|Selector、MultiSelector、ComplexSelector|直接使用；账户/证券加远程搜索封装|`hasSearch` 只过滤已加载 options，不等于服务端搜索|
|开关/选择|CheckboxInput/CheckboxList、RadioList、Switch、Slider|直接使用|布尔/枚举映射|
|表格|Table、TableSelectionToolbar、Pagination|直接使用外观；数据逻辑用 TanStack 或 consumer-owned 分页插件|见 9.6|
|数值|NumberInput|**仅非金融整数/设置**；提交时按 min/max 钳制（源码 `resolveNumberInputCommit`）|金额/股数/本金禁用|
|日期时间|DateInput、DateTimeInput|**只做日历/时间外观**；业务值走独立精确适配|`value` 为无时区的 `YYYY-MM-DDTHH:MM[:SS]`|
|金融输入|（需自建）DecimalTextInput|封装 TextInput：`inputMode="decimal"`、字符串、无钳制、Zod 校验、原值保留|Astryx 无字符串小数输入|
|精确时间|（需自建）UtcDateTimeField|UTC 文本＋日历辅助＋TZ 预览＋DST 消歧|Date 不能无损六位小数|
|导航/其他|SideNav、TopNav、CommandPalette、Toast|直接使用|命令面板可做证券/订单跳转|

### 9.3 RHF 适配

Astryx 输入是受控组件：`value` + `onChange(value, event)`，`ref` 指向原生输入（TextInput），其余 HTML 事件经 `rest` 转发（`BaseProps` 保留 `onBlur`）。使用 `Controller`，每个字段显式映射空值：

```tsx
<Controller
  control={form.control}
  name="price"
  render={({ field, fieldState }) => (
    <DecimalTextInput
      label="限价"
      value={field.value ?? ""}
      onChange={field.onChange}
      onBlur={field.onBlur}
      ref={field.ref}
      status={fieldState.error ? { type: "error", message: fieldState.error.message } : undefined}
      isDisabled={locked}
    />
  )}
/>
```

约定：

- 表单值使用 `z.input`（可含默认缺省），提交前 `schema.parse` 得到完整分支；不得把 `z.infer` 的解析前值直接当已校验。
- `undefined/null/""` 三者分开：Astryx `DateTimeInput` 清空返回 `undefined`，RHF 默认值必须显式给出 `null` 或 `""`，避免受控/非受控警告。
- disabled 字段不参与 UI 编辑，但完整 PATCH 仍需从详情 `task.config` 注入原值；不要依赖 `disabled` 输入被表单序列化。
- 条件字段切换（LIMIT / MARKET BUY / MARKET SELL）时先清除禁入字段，再校验；`strict()` 会拒绝多余键。
- 服务端错误（422 字段摘要、409 原 ID 冲突、409 对象忙）显示为表单级 Banner，不伪造字段级错误。

### 9.4 Tailwind v4 与 Cascade Layers

安装：`tailwindcss@4` + `@tailwindcss/vite`，在 `vite.config.ts` 注册插件；`globals.css` 必须是页面第一个样式入口并先声明层顺序：

```css
@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;

@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/preflight.css" layer(base);
@import "@astryxdesign/core/reset.css";
@import "@astryxdesign/core/astryx.css";
@import "@astryxdesign/theme-neutral/theme.css";
@import "@astryxdesign/core/tailwind-theme.css";
@import "tailwindcss/utilities.css" layer(utilities);
```

规则：

- 层顺序声明必须在任何 import 之前；否则 Astryx reset 可能压过工具类。
- 使用 bridge 时不要重复定义同名 `@theme` token；应用自定义 token 与 Astryx token 重名会互相覆盖，需改名或使用 `@theme inline`。
- 业务布局用 Tailwind；组件外观用 Astryx props/`className`（bridge token），不要用 `!important` 硬改。
- `tailwind-theme.css` 是纯 CSS、零 JS；主题切换自动生效。

### 9.5 图标、深色主题与版本锁定

**图标：** 以 `defineTheme({extends: neutralTheme, icons: {...}})` 把语义名映射到 Tabler 组件；或启动时 `registerIcons()`。`Icon` 也接受任意 SVG 组件。示例：

```tsx
import { IconX, IconChevronDown, IconAlertTriangle } from "@tabler/icons-react";
import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

export const appTheme = defineTheme({
  extends: neutralTheme,
  name: "app-neutral",
  icons: {
    close: <IconX />,
    chevronDown: <IconChevronDown />,
    warning: <IconAlertTriangle />,
  },
});
```

- 语义名覆盖常用内置图标；业务图标直接以组件传给 `Icon`，不新建全局注册表。
- 图标必须有文字或 `aria-label`，不作为唯一状态表达。

**深色主题：** `<Theme theme={appTheme} mode="system|light|dark">`；token 用 `[light, dark]` 元组；不要并行接入第二套 dark provider。业务组件只读 CSS 变量，不读 `window.matchMedia` 自行切色。

**版本锁定：**

```json
{
  "dependencies": {
    "@astryxdesign/core": "0.7.11",
    "@astryxdesign/theme-neutral": "0.7.11",
    "@stylexjs/stylex": "^0.19.0"
  },
  "devDependencies": {
    "@astryxdesign/cli": "0.7.11"
  }
}
```

- 三者同版本；主题 peer 精确锁 core，混版会失配。
- CLI 要求 Node ≥22.13；纳入 engines 与 CI。
- 升级走独立分支：`npx @astryxdesign/cli upgrade --from 0.7.11 --apply`，配合视觉回归与组件测试；不直接使用 canary 文档／包。
- `@stylexjs/stylex` 是 core 的必装 peer；预编译组件不需要 StyleX 构建插件。

### 9.6 Beta 风险与 swizzle 策略

|风险|缓解|
|---|---|
|组件 API 变动|锁精确版本；业务侧包一层薄适配（DecimalTextInput、UtcDateTimeField、DataTableShell），把 Astryx props 变化挡在业务外|
|类名/主题选择器迁移（0.7 已发生）|不自建依赖内部类名的 CSS；只用公开 props/data 属性/theme 覆盖|
|样式层冲突|固定 layer 顺序；在真实页面验证 portal、暗色、嵌套主题|
|CLI/主题生成物|不手改生成的 `astryx-themes` 模块；升级后重新生成|
|swizzle 分叉|默认不 swizzle；仅当公开 API 无法满足且有 ADR 时复制单个组件，记录上游版本、diff 与回收计划；swizzle 需 StyleX 编译器|
|NumberInput/DateTimeInput 语义|不使用其值作为金融/计划时间权威；见 9.2|

### 9.7 业务组件清单（Astryx 组合 vs 自建）

|业务组件|实现方式|独立数据/状态|测试|
|---|---|---|---|
|AppShell/Nav/AccountSelector/UserMenu|Astryx AppShell+SideNav+TopNav+Selector 组合|账户来自 Query；选中项在 URL|导航/键盘/权限入口|
|NotificationCenter|Toast/Banner+本地队列|无服务端源|关闭/去重/可访问性|
|AccountSummary/AccountStatus/FundingBalance/AssetSnapshot|Card+MetadataList+Badge/Banner+DecimalText|账户 Query；预检另查|零/未知/历史快照/陈旧|
|PositionTable/HoldingsEvidence|Astryx Table＋TanStack|positions Query＋holdings 当次读取|本地名义 vs 官方候选|
|OrderEntry|FormLayout+Field+DecimalTextInput+Selector+Switch|本地表单＋preflight Query（不缓存为许可）|三分支/精度/禁用|
|OrderPreflightPanel|Banner+MetadataList|React Query（短 staleTime）|通过/拒绝/过期|
|OrderConfirmDialog/CancelOrderDialog|AlertDialog/Dialog|无|确认文案/未知提示/防双击|
|OrderStatus/OrderDetail|Badge+StatusDot+MetadataList+Table|订单详情 Query|终态≠费用/库存闭环|
|OrderTable|DataTableShell（Astryx Table＋TanStack）|订单 Query（服务端分页）|分页/筛选/空态|
|TaskEditor|FormLayout+Field 组合＋自定义时间/数值|本地表单＋完整 PATCH|完整分支/冻结字段/DST|
|TaskConfigurationSummary|MetadataList+Code/Text|只读|不可编辑字段|
|TaskMonitor/TaskProgress/TaskControlPanel/TaskOrderTable|Card+ProgressBar+Banner+Table+Button|任务 Query/控制 mutation|状态按钮矩阵/核对中|
|OperationStatus/OperationRecoveryPanel|Banner+MetadataList+Timeline(自建)|operations 轮询＋精确 GET|PROCESSING/UNKNOWN/SUCCEEDED 语义|
|UnknownOrderPanel|Banner+表单|本地定位记录＋订单/回执 Query|禁止换 ID 重发|
|ReconciliationPanel/DifferenceList|Card+Table+Badge|核对记录 Query|DIFFERENCE/UNAVAILABLE/PARTIAL|
|LedgerTable/TradeTable/AuditTable|DataTableShell|各自 Query|金额只读/来源|
|UserManagementTable/AdminAccountTable|DataTableShell+Dialog|管理 Query＋原操作 mutation|角色/最后管理员/409|
|RiskControlPanel/WorkerHealthStatus|FormLayout+Banner+StatusDot|settings/worker Query|急停/心跳/降级|

所有表格共用 `DataTableShell`（列定义、分页状态、空/错/陈旧态、列固定），但每个资源的筛选能力由各自 schema 决定，不做“万能表格”。


## 第十章：问题及改进清单（全量复核）

优先级标准：P0 只保留会直接破坏交易正确性、安全边界或关键业务可靠性且无法由前端防御的问题；可由前端设计规避的列为前端 P0 门禁，但不等于后端缺陷。

### 10.1 全量对照表

|原编号|原结论|复核结果|关键依据|最终优先级|责任方|
|---|---|---|---|---|---|
|P0-001|业务 SSE 慢写撤权（P0）|**调整**：延迟成立，数据泄露不成立|`events.ts:127-239`；`stream.js` write await；payload 仅资源名|**P1**|后端|
|P0-002|下单/回执恢复拆分（P0）|**确认**|`business.ts:289-332`；`operations.ts` kinds；`/operations` 不含下单|**P0**|前端|
|P0-003|契约缺失（P0）|**拆分**：P0 消费规则＋P1 类型契约|`server/operations.ts:27-47`；`client.d.ts` 空值/错误段|**P0（前端）／P1（后端）**|双方|
|P0-004|金融真实性（P0）|**确认**|`account-projection.ts:12-42`；`schema.ts:305-307`；`settlement.ts:486-499`|**P0**|前端|
|P0-005|迟到 401 删 Cookie（P0）|**降级**：路径确认，影响为会话可用性|`context.ts:340-342,39-40`；`auth.ts:70`|**P1**|后端|
|P0-006|对象存在性（P0）|**降级**：存在性成立，内容/越权不成立|`queries.ts:71-91`；`context.ts:408-412`；`operations.ts:322`|**P1**|后端|
|P0-007|原 actor 失效恢复（P0）|**降级**：运维闭环缺口|`operations.ts:553-572`；`admin.ts:319-354`|**P1**|双方/产品|
|P0-008|精度/时间（P0）|**确认**|`contracts.ts:70-98,206-224`；`tasks.ts:368-396`；Astryx NumberInput/DateTimeInput|**P0**|前端|
|P1-001|前置拒绝指纹（待验证）|**确认缺陷**|`app.ts:73-75`；`server/operations.ts:54-126`；`compose.js:34-45`；`contracts.ts:156`；`services/operations.ts:394-415`|**P1**|后端|
|P1-002|精确原 key 查找|**降级（条件）**|`business.ts:289-297`；`contracts.ts:338`|**P2**|后端|
|P1-003|SSE 覆盖/摘要|**确认**|`events.ts:159-215`；`contracts.ts:11-21`|**P1**|前端＋后端增强|
|P1-004|本地成交/大详情分页|**拆分**|`business.ts:302-320,351-402`；无全局成交路由|**P1（全局成交，条件）／P2（详情分页）**|后端|
|P1-005|任务总预算|**确认（需求缺口）**|`schema.ts:139-173`；`reservations.ts:92-101`|**P1**|产品/后端|
|P1-006|资产来源诊断|**降级**|`account-assets.ts:60-66,110-142`|**P2**|后端|
|P2-001|原请求参数回显|**确认缺失**|`schema.ts:444-461`；`contracts.ts:694-708`|**P2**|后端（条件）|
|P2-002|Astryx Beta|**决策已定＋缓解**|0.7.11 Beta；theme peer 锁 core|**无需（按 9.6 缓解）**|前端|
|P2-003|多标签/多证券|**确认**|`events.ts:23-37`；`quote-stream.ts:19-38`|**P2**|前端|
|P2-004|契约版本 manifest|**确认**|`export-contracts.ts:9,41-43`|**P2**|后端|
|P2-005|可靠补播|**当前无需**|`events.ts:123-239`|**无需**|—|
|R-01（新）|SSE 错误帧后自动重连|**新增前端规则**|`events.ts:142-149`；EventSource 自动重连语义|**P1**|前端|
|R-02（新）|React Doctor 与 TS7 冲突|**工具风险**|`react-doctor@0.9.22` 依赖 `typescript <6`|**P2**|前端|
|R-03（新）|npm `semgrep` 非官方|**工具风险**|npm 包 0.0.1 无 bin；官方为 pipx/uv/Docker|**P2**|前端|
|R-04（新）|`@stylexjs/stylex` 必装 peer|**依赖事实**|core peer `^0.19.0`（非 optional）|**P1（构建配置）**|前端|

### 10.2 P0（前端门禁，开工写入前必须落地）

#### P0-002 未知下单/撤单的跨刷新恢复

- **问题**：下单走订单幂等，控制操作走 UUID 回执；两者不可合并。若前端只保存组件状态，刷新/重登会丢失原标识，可能被误当新意图。
- **证据**：`server/business.ts:289-332`（下单/撤单/核对）；`services/operations.ts:679-688` kinds 在 `validation/contracts.ts`；`/operations` 仅未解决候选（`services/operations.ts:352-367`）。
- **影响**：重复下单、重复撤单、错误释放假设、审计断链。
- **建议**：发送前持久化最小定位记录（用户、账户、kind、targetId、UUID/key、时间、待核对标记）；恢复只按原 ID；未知不换 ID；无回执动作（账户/任务创建等）失联时只能查询确认，不能统一套回执协议。
- **数据库变更**：无。**行为影响**：无（纯前端）。

#### P0-003A 非 2xx 必须消费 operation

- **问题**：`trackedOperation` 先按 failure 返回 HTTP 错误，同时附 `operation`；HTTP 502/429 可与 `SUCCEEDED` 回执并存。若前端 throw-on-non2xx，会丢回执并可能误重试。
- **证据**：`server/operations.ts:27-47`；`services/trading/account-assets.ts:80-97`；现有测试源码 `tests/operations-http.integration.test.ts:98-104,178-182`（源码阅读，未执行）。
- **影响**：误报失败、重复控制、恢复信息丢失。
- **建议**：HTTP 层返回 `{status,data?,error?,operation?}`；业务层先读 operation，再决定刷新与提示；任何写请求不自动重试。
- **数据库变更**：无。**行为影响**：无。

#### P0-004 金融真实性语义

- **问题**：`buyReady/sellReady` 不是交易许可；`realizedPnl` 为未计算默认值；订单终态不等于费用/库存闭环；`PARTIAL` 不是全量一致。
- **证据**：`account-projection.ts:12-42`；`schema.ts:305-307`；`settlement.ts:486-499`；`engine.ts:1102-1124`。
- **影响**：错误加仓/减仓、误判可卖量、误报收益。
- **建议**：资产分“当前未知/最近快照/历史保留/明确零”；币种、来源、时间同屏；PnL 显示“不提供/未计算”；订单详情拆生命周期/证据/费用/预留/库存；动作由当次 preflight 与服务端准入决定。
- **数据库变更**：无。**行为影响**：无（展示口径）。

#### P0-008 精确数值与时间

- **问题**：金额/股数/本金为十进制字符串；计划时间最多六位小数且必须保留 `config` 原串。Astryx `NumberInput` 提交时按 `min/max` 钳制（已读源码 `resolveNumberInputCommit`），`DateTimeInput` 值为无时区 ISO 分钟/秒。
- **证据**：`contracts.ts:70-98,206-224`；`tasks.ts:368-396,476-519`；Astryx 0.7.11 源码。
- **影响**：数值被改写、时间被舍入/误解 DST，直接造成错误委托。
- **建议**：DecimalTextInput（字符串、无钳制）；UtcDateTimeField（原串、六位小数、DST 显式处理）；展示舍入不回写。
- **数据库变更**：无。**行为影响**：无。

### 10.3 P1

|编号|问题|复核与建议|责任方|DB|
|---|---|---|---|---|
|P1-001|CSRF 前置拒绝保存原始指纹，同 UUID 重试冲突|已确认；共用规范化或允许前置拒绝回执重试；禁止换 UUID|后端|无|
|P0-001|业务 SSE 无写超时/独立 guard|复用行情模式：1.5s guard＋3s 写截止＋finally 释放；`stream.abort()` 解除阻塞需隔离验证|后端|无|
|P0-005|旧 401 删除新 Cookie|无效会话分支不自动清 Cookie；同时评估登出/改密/自撤权路径；浏览器 E2E 验证|后端|无|
|P0-006|对象存在性 code/message 差异|统一 404 对外码/消息，保留内部审计与“不证明未执行”|后端|无|
|P0-007|原 actor 失效后账户核对无人可续|定义有审计的恢复策略；管理员接管需新授权接口|双方/产品|视方案|
|P1-003|SSE 无 operations/ledger 更新/Worker 细节|前端有限轮询保证收敛；后端可补资源与 `updatedAt` 比较，不承诺补播|前端＋后端|无|
|P1-004|无全局本地成交列表|如产品要求成交页，新增只读分页查询；详情数组分页另议|后端|未必|
|P1-005|无含费总预算/整任务融资保证|UI 明示；如做硬预算需平台字段与门禁|产品/后端|可能需要|
|R-01|SSE error 帧后 EventSource 自动重连|收到业务 error／行情 `retryable:false` 立即 close，进入登录/退避|前端|无|
|R-04|`@stylexjs/stylex` 必装|加入依赖与锁文件；不启用 StyleX 编译|前端|无|
|C01-C08|契约空值/错误/流/头缺失|补公共错误与可空投影、SSE 联合、方法头约束|后端＋前端|无|

### 10.4 P2 与无需处理

|编号|结论|建议|
|---|---|---|
|P1-002|新前端固定 UUID key，可稳定寻回；任意历史 key 才需精确 lookup|保持现状或加 owner 范围精确 GET|
|P1-006|UI 可保守表达“当前证据不可用”|需要更细诊断再加结构化字段|
|P2-001|公开回执无原请求参数|如需回显，新增脱敏 requestSummary；不能从 hash 还原|
|P2-003|单标签 2 条流可满足当前；多证券会触顶|先按需关闭行情；共享连接另评估|
|P2-004|契约制品无版本绑定|发布 manifest 关联版本/commit|
|P2-002/P2-005|Beta 风险已决策；补播当前不需要|按 9.6 缓解；可靠增量另设计|


## 第十一章：最终技术栈与前端实现架构

### 11.1 最终技术栈（不可再默认替换）

|分类|技术|决定|版本范围|采用原因|
|---|---|---|---|---|
|UI 框架|React|必须|^19.3|Astryx 要求 ≥19；并发/StrictMode 可满足|
|语言|TypeScript|必须|5.9.x（暂定，TS7 待验证）|生态工具（React Doctor 等）仍以 5.x 为上限；后端版本不约束前端|
|构建|Vite|必须|^8.3|纯静态 SPA；`@tailwindcss/vite` 与插件兼容|
|主 UI|Astryx|必须（唯一）|0.7.11 精确|项目决策；组件覆盖充分；Beta 由锁版与适配层控制|
|CSS|Tailwind CSS|必须|^4.3|布局/工具类；官方 bridge 与 Astryx token 同步|
|Token|Astryx CSS Variables|必须|随 core|单一主题数值来源|
|图标|@tabler/icons-react|必须|^3.51|按需导入，SVG 可映射 Icon Registry|
|路由|TanStack Router|必须|^1.170|URL 状态、loader 协调 Query|
|服务端状态|TanStack Query|必须|^5.107|REST 缓存、取消、失效、重取|
|客户端状态|Zustand|暂缓/按需|—|初期 URL＋局部 state＋Query 足够；避免双写|
|表单|React Hook Form|必须|^7.91|完整配置表单、Controller 适配|
|校验|Zod|必须|4.6.7|复用公开 schema；RHF resolver 兼容|
|Resolver|@hookform/resolvers|必须|^7.0.5|Zod4 适配|
|表格逻辑|TanStack Table|必须|^9.3|headless；服务端分页/列状态|
|表格虚拟化|TanStack Virtual|按需|^3.14|仅大列表 DOM 优化|
|实时|Native EventSource|必须|浏览器原生|现有 SSE；Cookie GET|
|HTTP|Native Fetch|必须|浏览器原生|统一错误/回执封装；无 Axios|
|契约|Backend Contracts|必须（调整）|随后端 3.0.0|类型来源；补错误/空值/流|
|十进制|decimal.js|必须|^10.6|精确比较/求和/展示|
|格式化|Intl API|必须|浏览器原生|货币/日期/时区展示|
|时区|IANA（UTC/America/New_York）|必须|浏览器 tzdata|DST 正确性|
|精确时间|Temporal 适配|按需|polyfill 0.5.x|仅在 IANA 编辑时需要|
|单测|Vitest|必须（开发）|^5.1|纯逻辑/适配器/映射|
|组件测试|React Testing Library|必须（开发）|^16.3|行为与可访问性|
|E2E|Playwright|必须（开发）|^1.65|Cookie/CSRF/SSE/多标签|
|协议 Mock|MSW|必须（开发）|^3.0|开发夹具；不替代真实后端|
|React 诊断|React Doctor|按需（CI 咨询）|0.9.22|额外静态检查；TS<6 限制|
|SAST|Semgrep|按需（CI）|官方 CLI|安全规则；非 npm 包|
|i18n|i18next/react-i18next|暂缓|27.x/18.x|当前无多语言交付范围|
|错误监控|Sentry|暂缓|11.x|需 DSN/脱敏/数据驻留批准|
|Hono RPC|hc|不引入运行时|—|现有类型已足够；避免额外绑定|
|OpenAPI|—|暂缓|—|无第二语言消费者|
|MUI/Chakra/AntD/Emotion/StyleX 业务样式|—|**不引入**|—|Astryx 唯一 UI；StyleX 仅内部|
|WebSocket/Socket.IO|—|不引入|—|SSE 满足当前单向提示|
|AG Grid/MUI X DataGrid|—|不引入|—|无编辑/透视需求|
|K 线/图表库|—|不引入|—|非行情分析终端|

### 11.2 目录与职责

```text
src/
├── app/
│   ├── router/            # 路由树、角色守卫、错误边界
│   ├── providers/         # Theme、QueryClient、Toast
│   ├── session/           # 登录态、CSRF、sessionEpoch、跨标签广播
│   └── business-sync/     # 业务 SSE → 资源失效映射、尾随重读
├── routes/                # 路由装配，薄层
├── features/
│   ├── auth/ accounts/ market/ orders/ tasks/
│   ├── operations/ reconciliations/ positions/ ledger/ administration/
├── components/
│   ├── ui/                # DecimalTextInput、UtcDateTimeField、DataTableShell、ConfirmDialog
│   ├── shared/            # 状态标签、金额/时间展示、空/错/陈旧态
│   └── data-table/        # 列定义工具、分页/筛选控件
├── shared/
│   ├── http/              # fetch 封装、错误信封、operation 保留
│   ├── contracts/         # 契约快照类型派生
│   ├── realtime/          # EventSource 生命周期、解析器
│   ├── decimal/           # 字符串十进制工具
│   └── time/              # UTC/IANA/精度工具
├── theme/                 # index.ts、tokens.ts、icons.tsx（Astryx defineTheme）
└── styles/                # index.css（layer 顺序 + Tailwind/Astryx 导入）
```

**不建空目录、不做通用 service 层。** 只有跨 feature 稳定复用的才进 `shared`；业务 API 放在所属 feature。

### 11.3 Feature 职责与状态归属

|Feature|拥有的 API|Query key 根|表单 schema|状态归属|
|---|---|---|---|---|
|auth|login/me/logout/password|`auth`|登录/改密|Query（me）＋session 模块|
|accounts|accounts/*、check/sync/reconcile|`accounts`|账户创建/编辑|Query＋原操作 mutation|
|market|symbols/holdings/quotes/quote-stream|`market`|—|Query（当前快照）＋行情连接状态|
|orders|orders/*、preflight、exchange 历史|`orders`,`exchange`|OrderEntry|Query＋本地表单＋原ID定位|
|tasks|tasks/*|`tasks`|TaskEditor（完整分支）|Query＋本地表单|
|operations|operations/*|`operations`|—|Query＋有限轮询|
|reconciliations|reconciliations、account reconcile|`reconciliations`|—|Query|
|positions|positions、holdings 证据|`positions`|—|Query|
|ledger|ledger、trades（详情内）|`ledger`|—|Query|
|administration|admin/*|`admin`|用户/限制/平台设置|Query＋原操作 mutation|

### 11.4 生命周期

**SessionEpoch**：登录/退出/改密/用户切换时递增；所有 query key 前缀与请求上下文携带；旧 epoch 响应直接丢弃；切换时 `queryClient.cancelQueries()`、清敏感缓存、关闭两流。

**Business SSE Manager**：应用级单例，每个标签最多 1 条；解析 `refresh|error`；错误帧→close＋触发重新认证；断线指数退避（上限 30 s），重连成功触发全资源收敛；不按组件建流。

**Market SSE Manager**：仅当前账户+证券一条；`accountId/symbol/generation` 变化时关闭旧流、丢弃旧消息；quote 只更新单一快照，status 更新连接/新鲜度；`retryable:false` 关闭并提示。

**Operation Recovery**：发送前写本地定位记录（非敏感）；页面提供“待核对”入口，按原 ID 调 `/orders/:id` 或 `/operations/:id`；PROCESSING/UNKNOWN 只轮询/核对，SUCCEEDED 展示其 kind 特定含义；记录在确认终态后由用户清除，不自动当作失败。

**Reconciliation**：独立视图，不把核对记录混入订单状态；展示 DIFFERENCE/UNAVAILABLE/PARTIAL 与次级错误，不生成“全量一致”。


## 第十二章：前后端联调前置条件

### 12.1 前端开发前必须完成

|门禁|验收标准|责任方|
|---|---|---|
|Astryx 基线|锁定 core/theme/cli 0.7.11＋`@stylexjs/stylex`；Cascade Layers 生效；暗色/portal/移动端原型通过|前端|
|金融输入|DecimalTextInput 不舍入、不钳制；极限小数与 Zod 错误可见|前端|
|精确时间|UTC 原串往返、六位小数、DST 春季/秋季用例通过|前端|
|恢复协议|下单/回执两条链路、非 2xx operation、`operationAccepted:false` 语义、未知不换 ID|前端|
|金融语义|资产/盈亏/终态/核对标签评审通过|前端＋产品|
|契约适配|错误信封、可空投影、SSE error/status、健康 503 解析|前端（依赖后端类型修正）|
|测试骨架|Vitest/RTL/Playwright/MSW 分工与首个失败用例可运行|前端|

### 12.2 可与前端开发并行

- 后端 P1 修复（P1-001 指纹、P0-001 SSE guard、P0-005 Cookie、P0-006 错误统一、契约空值）。前端先用防御解析，不被阻塞。
- 全局本地成交 API、详情分页、含费预算：按产品优先级排期，不阻塞只读页面。
- React Doctor／Semgrep 接入 CI：工具链与 TS 版本确定后加。

### 12.3 环境与配置

- Node 24 LTS（满足 Vite 8、Vitest 5、MSW 3、Astryx CLI ≥22.13）；Bun 可作包管理。
- `API_BASE_URL`：同源用相对 `/api/v1`；跨源用公开 HTTPS origin。
- `FRONTEND_ORIGINS` 精确配置；跨源 Fetch `credentials:include`、EventSource `withCredentials:true`。
- 代理需关闭 SSE 缓冲、设置足够读超时、SPA history fallback；前端 HTML 自身 CSP 的 `connect-src` 要允许 API origin。

### 12.4 测试分工

|工具|只负责|不负责|
|---|---|---|
|Vitest|十进制/时间解析、资源→key 映射、错误/回执解析、状态映射|DOM/网络|
|RTL|组件可见行为、键盘/焦点、表单 Controller、空/错/禁用态|真实 Cookie/SSE|
|Playwright|登录/CSRF、跨标签、SSE 断线重连、旧响应隔离|后端内部事务|
|MSW|开发期 JSON/SSE 夹具、错误分支|证明后端或浏览器行为|
|React Doctor|React 规则/性能/可访问性静态建议|安全/交易语义|
|Semgrep|SAST 规则（XSS、危险 API、密钥）|运行时/依赖漏洞|

**MSW 不能替代**：真实 HTTP/PG、Cookie 时序、SSE 代理缓冲、浏览器竞态。


## 第十三章：最终建议与验证证据

### 13.1 十五个验收问题

|#|问题|结论|
|---|---|---|
|1|Astryx 能否作为唯一主 UI？|**可以**，基础组件覆盖充分；金融输入/精确时间/表格数据逻辑需业务封装，不是替换 UI 库能消除|
|2|Tailwind v4 能否稳定共存？|**可以**，前提是固定 layer 顺序、使用官方 bridge、避免同名 token 覆盖；需要真实页面验证 portal/暗色|
|3|哪些直接用、哪些必须封装？|直接用：AppShell/导航/Overlay/Field/TextInput/Selector/Table/Badge/Banner 等；必须封装：DecimalTextInput、UtcDateTimeField、DataTableShell、恢复/核对面板|
|4|RHF+Zod 是否适合任务表单？|**适合**；用 Controller、z.input/output 区分、完整分支、显式空值；不适合把服务端交易规则复制进前端|
|5|Router/Query/Table 是否最优？|**是当前最优组合**；不让 Router 再养一份服务端缓存；Table 与 Astryx 只保留一个分页/排序状态拥有者|
|6|Zustand 是否需要？|**初期不需要**；URL+局部 state+Query 足够，高频行情实测后再考虑 vanilla store|
|7|两条 SSE 是否够用？|**当前够用**：资源提示+单证券行情；不是可靠日志/补播；operations 等需独立轮询|
|8|SSE 与 Query 如何收敛？|按 5.4：资源族失效、合并短窗口、尾随重读、epoch 隔离、错误帧关闭、重连全量收敛|
|9|未知订单/回执如何恢复？|按 6.4：两条链路、持久原 ID、非 2xx 也读 operation、未知不换 ID、无回执动作只查询|
|10|契约还缺什么？|错误信封/可空投影/SSE 错误帧/回执 result/请求头约束；Fetch 可用，不需 RPC/OpenAPI|
|11|迟到 401 必须后端修？|**是**，P1；前端只能隔离状态，不能阻止 Set-Cookie|
|12|上一轮有无误判？|有：P0-001/005/006/007 降级，P1-001 确认，P1-002 降级，P1-006 降级，P2-002 由决策关闭|
|13|开发前必须解决？|第十二章 12.1 的前端门禁；后端 P1 可并行|
|14|开发中可解决？|12.2 列出的后端增强、成交页、预算、工具链|
|15|技术栈能否冻结？|**方向可以冻结**：Astryx+Tailwind+RHF/Zod+Router/Query/Table+Fetch/EventSource+decimal/Intl；具体版本待原型与 TS 决策后锁|

### 13.2 结论

- **保留 Astryx 是可行的工程选择**，不是对 Beta 风险的无视；风险由锁版、薄适配层、升级流程和原型门禁管理。
- **本轮不把后端 P1 变成前端停工理由**：前端可用防御解析和恢复协议先行；交易写入前必须完成四项前端 P0。
- **不建议再引入 MUI/Chakra/AntD/Emotion/StyleX 业务样式/WebSocket/AG Grid**；它们不会减少当前真正的工作量。

### 13.3 执行证据（本轮）

- 基线：`git log -1` → `f7c6d7b`；`git diff 6fa779e --stat -- backend` 为空（后端未变）。
- 类型检查：`cd backend && bun run typecheck` → `$ tsc --noEmit`，退出成功（无输出）。
- 安全定向测试（无 DB／无外部账户）：

```sh
RUN_DATABASE_TESTS=0 LOG_FILE_ENABLED=false \
DATABASE_URL=postgres://review:review@127.0.0.1:1/equity_review_no_connect \
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 \
bun --no-env-file test tests/server.test.ts tests/security-event-stream.test.ts \
  tests/market-quote-relay.test.ts tests/trading/policy.test.ts \
  tests/trading/scheduled-start.test.ts tests/trading/market-orders.test.ts \
  tests/quote-price-rounding.test.ts tests/security.test.ts tests/config.test.ts \
  tests/equity-balance.test.ts tests/sell-inventory.test.ts
```

实际结果：**113 pass，9 skip，0 fail；2264 expect() calls；122 tests / 11 files；183 ms**。跳过项为 DB 集成/真实流分支，不代表全量通过。

- 控制流探针（无数据库、内存 Hono）：复刻 authenticate→recorder→CSRF 顺序，下游抛 403 后上游 `await next()` 仍执行，`afterNextRan=true`、`status=403`、响应体可读；同一请求体可在 recorder 与后续 Zod 中二次解析（Hono 文本缓存）。该探针只证明控制流，不证明数据库落库结果。
- 第三方核对：Astryx 0.7.11（core/CLI/theme，peer 与 Node 要求）、Tailwind 4.3.5、React Doctor 0.9.22（TS<6、Node 限制）、Semgrep 官方安装（pipx/uv/Docker）；npm `semgrep@0.0.1` 非官方 CLI。
- 未执行：`contracts:check`（会写临时目录）、`build`、`test:db`、迁移、API/Worker 启动、真实账户/交易、浏览器原型、代理 SSE、前端安装构建。

### 13.4 残余风险与待验证

|事项|缺什么|如何验证|是否阻塞前端|
|---|---|---|---|
|P1-001 数据端到端|隔离 PG|同 UUID、同 JSON、先错 CSRF 后有效 CSRF；断言回执与 409|否（可并行修复）|
|SSE 慢写时序|真实慢客户端/代理|停读客户端 + 撤销会话；观察终止时间与名额释放|否|
|迟到 Cookie 竞态|真实浏览器|Playwright 延迟旧 401；跨标签登录|否（后端 P1）|
|Astryx 原型|浏览器|三原型：任务表单/订单详情恢复/监管表；键盘/IME/移动/暗色|是（12.1）|
|RTL 与 Astryx|DOM 环境|portal/measure/ResizeObserver polyfill 实测|是（测试骨架）|
|TS7 前端|独立构建|Vite/Vitest/Astryx/RHF 在 TS7 下类型与构建|否（先锁 5.9）|

### 13.5 归档说明

按仓库“大型任务自动归档”规则，本报告应归入 `docs/changes/0065-frontend-architecture-review-v2/`（任务书、报告与本 README）；归档后原文件名为 `0002-frontend-architecture-feasibility-review-v2.md`，映射与哈希写入该目录 README。若需要保留根目录副本，可另行指示。
