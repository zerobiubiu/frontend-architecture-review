# 前端开发说明

面向继续开发与审查本工程的人。所有命令在 `frontend/` 下执行。

## 1. 环境

| 工具 | 要求 | 用途 |
|---|---|---|
| Bun | 1.4.3（`packageManager` 固定） | 安装依赖、执行脚本 |
| Node.js | ≥ 22.13 | Astryx CLI、Playwright 等第三方 CLI（可选） |
| Chrome | 任意近期版本 | Playwright `channel: 'chrome'` 复用本机浏览器 |

不使用 npm / pnpm / Yarn，只维护 `bun.lock`。Vite 8 负责开发与生产构建；本工程不要求后端正在运行。

## 2. 脚本

| 命令 | 说明 |
|---|---|
| `bun run dev` | 开发服务器（默认 5173，`strictPort`） |
| `bun run build` | `tsc -b` + Vite 生产构建 |
| `bun run preview` | 预览生产构建 |
| `bun run typecheck` | `tsc -b --noEmit` |
| `bun run lint` / `lint:fix` | Biome 检查 / 自动修复 |
| `bun run format` | Biome 格式化 |
| `bun run test` / `test:run` | Vitest 监听 / 单次 |
| `bun run test:coverage` | Vitest + v8 coverage |
| `bunx --no-install playwright test --retries=0` | 独占本机协议桩、dev 与生产预览；不默认复用服务器 |
| `bun run theme:build` | 重新生成 Astryx 主题产物 |
| `bun run theme:check` | 校验生成产物与主题源一致（CI 用） |
| `bun run --cwd ../backend contracts:prepare` / `bun run contracts:check` | 后端生成本地包 / 调用 `../backend/scripts/contracts-sync.ts --check --consumer` 核对实际安装副本 |

## 3. 主题与样式

### 3.1 主题

- 源文件：`src/theme/app-theme.ts`，只 `defineTheme` 扩展 Neutral 并注入 Tabler 语义图标，不新建颜色/圆角/字体 Token。
- 生成：`src/theme/generated/binance-stocks.{css,js,d.ts}`，由 `astryx theme build` 产出，**禁止手改**。
- 应用导入生成对象（`__built`，运行时不再注入样式）与生成 CSS；CSS 作用域为 `[data-astryx-theme="binance-stocks"]`。
- `src/theme/icons.tsx` 必须保持纯 TS（`createElement`，不写 JSX），因为 CLI 用 Node 直接加载它。
- 生成目录比主题源深一层时，必须带 `--icons-specifier ../icons.tsx`，否则生成 JS 的相对导入会指向不存在的文件（Vite 报 `UNRESOLVED_IMPORT`）。
- 修改主题后执行 `bun run theme:build`，提交生成产物，并确保 `bun run theme:check` 通过。

### 3.2 CSS Cascade Layers

`src/styles/index.css` 必须在所有 `@import` 之前声明层顺序：

```css
@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;
```

导入顺序：Tailwind theme → Tailwind preflight → Astryx reset → Astryx 组件样式 → 生成主题 CSS → Tailwind bridge → Tailwind utilities。

规则：
- 布局用 Tailwind 工具类；组件外观用 Astryx props / 主题变量；
- Token 通过 bridge 类使用（`bg-body`、`bg-surface`、`text-primary`、`border-border`）；
- 不依赖 Astryx 私有类名，不用大量 `!important` 解决层级问题；
- `tokens.ts` 只做 `var(--…)` 的类型化引用，供无法使用工具类的场景读取同一套主题值。

## 4. 应用装配

- Provider 顺序：`ThemeModeProvider` → `InternationalizationProvider`（zh-CN）→ `LayerProvider` → 唯一 `QueryClientProvider` → `AppServicesContext`。
- `AppProviders` 固定服务实例，构造无网络/监听副作用；effect 统一启动/销毁 Session Manager、业务 SSE 和收敛器，兼容 StrictMode 重挂载。
- 代码路由包含登录、受保护工作台及只读业务/管理页、无权限/404/错误页。`/dev/playground` 与 `/dev/access/$capability` 仅开发注册和动态导入，后者只验证同一权限守卫，不是假业务页面。
- 认证跳转使用稳定依赖的 `useNavigate` effect；目标 pathname 已变化时不再重启 pending 导航。不要在响应式守卫里用每次渲染都新建 props 的 `Navigate` 循环发起跳转。
- 权限包装使用 Router 公开的 `RouteComponent` 类型，并动态保留 `.preload`；不能把懒组件退化为普通 React 组件包装，导致冷启动在渲染中才挂起及 React 错误。加载后继续遵从 Router 清空 preload 的行为，不重复启动导入。
- Query 默认值：读 `staleTime 30s`、`gcTime 5min`、窗口聚焦重取；只读查询仅在网络/超时/429/5xx 时最多重试 2 次；**mutation `retry: false`**。
- 不引入 Zustand；不让 Router loader 承担服务端缓存。
- Astryx AppShell 已拥有唯一 main 和跳转内容入口；`ReadPage` 只提供命名 section，不嵌套第二个 main 或重复 SkipLink。表格直接复用 Astryx 自带的滚动/键盘机制，不能再包 overflow 容器裁切其容器留白；48rem 最小表宽保证窄屏列可横向访问。

## 5. API Client

`src/services/api/`：

- `request.ts`：`executeJsonRequest` 是 RPC 与既有客户端共用的原生传输；一次 Fetch，`credentials: 'include'`，`cache: 'no-store'`，动态 CSRF/幂等键，超时和取消覆盖正文消费。
- `response.ts`：`consumeJsonResponse` 只消费一次原生 `Response`；保留非 2xx 回执、`http-data`、畸形响应及 receipt 的 absent/valid/invalid 三态。
- `errors.ts`：`classifyWriteOutcome(outcome, originalIdentity)` 返回 `{ attempt, intent, reason }`。attempt 是本次 HTTP 尝试；intent 为 `applied | not-applied | unknown`，必须绑定发送前确定的完整原请求身份。`requireData` 仅用于只读查询。
- `rpc.ts`：唯一 `hc` 创建位置，消费已展开的 `ApiClient`，不是 `hc<ApiClient>()`。Hono fetch 必须返回原生 `Response`，不注入返回 outcome 的 `requestJson`。
- `client.ts`：保留既有入口，但没有另一套传输/响应安全语义。请求先捕获 epoch，旧代结果用 `StaleSessionResponseError.outcome` 保留原始证据，不进入当前 UI/Query/全局退出处理。

新增接口时：
1. 复用生成 `ApiClient` 的请求/响应派生类型及公开 Schema，不直接导入 `backend/src`，不手写第二套 DTO；静态类型不等于运行时校验。
2. 只读查询用 `requireData` 抛 `ApiOutcomeError`；
3. 写请求必须消费完整 outcome，禁止用 `response.ok` 直接判断业务结果；
4. 任何写请求不得自动重试，不得更换原操作标识。
5. `OriginalOperationIdentity` 的 `id / kind / targetType / targetId` 全部必填，kind 与目标类型必须符合后端受跟踪操作；平台更新显式使用 `PLATFORM/platform`，没有无目标通配分支；
6. 身份来自发送前保存的原意图，不得从响应 operation 反向构造；原 ID 同时用于请求幂等键与回执关联。即使绕过静态类型，缺失、空、部分、非法或错配身份也只得到 `intent: unknown`；
7. `receipt-mismatch` 同时表示原请求身份不完整/不合法或与回执不匹配；`receipt-absent`、`receipt-invalid` 仍独立保留。`applied` 只是该 kind 的匹配回执结论，不等于订单成交、任务完成或账户同步成功。

认证动作仍由唯一 Session Manager 拥有。只读 Feature 的 `api.ts` 均通过既有 `rpc.request` 调用生成的 `$get`，并用 `parseReadOutcome` 校验实际展示投影；健康 503 由明确的健康适配保留 data，不冒充业务 success。没有交易调用；后续写业务仍须发送前保存完整原身份，以原 ID 关联幂等键和回执，消费 assessment.intent，不得用 attempt 解锁原未知意图。

## 6. 金融数值与时间

- 金额/股数/本金：`DecimalTextInput` + Zod 校验；展示用 `formatDecimal`（Intl 直接格式化字符串，不回填）。
- 时间：`UtcDateTimeField` 以 UTC 文本为权威值；`lib/time/instant.ts` 负责解析/格式化，`lib/time/zoned.ts` 负责 IANA 墙钟 → UTC 与 DST 消歧。
- 禁止用 `Number` 做金融计算，禁止用 `Date` 做时间无损往返；`Date` 只用于展示。
- 新增时区支持需要扩展 `resolveZonedWallClock` 的候选探测（当前按 ±1 小时覆盖整小时 DST 跳变）。
- 只读页用 `DecimalValue` 保留原金融文本，不作金额聚合、乘除或盈亏推算；原始 null 保持未知。历史超过六位有效小数的时间交给 `UtcValue`，不可转换时显示原 UTC 和转换限制，不套用新输入 schema 或 Date 重新序列化。

## 7. 测试

- 单元测试：`tests/unit`；组件/协议集成：`tests/integration`；E2E：`tests/e2e`。
- jsdom 缺少的浏览器 API 在 `tests/setup.ts` 补齐。React 交互集成使用真实事件调度与受控 Promise；长时钟/竞态由状态机单元测试使用假时钟验证，不让 RTL 的 Jest 假时钟识别误阻塞 Vitest。
- MSW 3：`setupServer(...).listen()` 不支持 `onUnhandledRequest`；Node fetch 需绝对 base URL（`http://localhost/api/v1`）。
- Astryx 错误/Toast 文本会同时出现在可见节点与 live region，查询用 `findAllByText` 或 `.first()`，不要用唯一匹配断言。
- Astryx 禁用态是 `aria-disabled` + `readonly`，不要断言原生 `disabled`。
- Playwright 使用本机 `channel: 'chrome'`，默认不复用服务器，单 worker 拥有故障协议桩。先 build，再 E2E；默认 `5173`，被用户占用时显式 `PLAYWRIGHT_PORT=5273`，只允许与协议桩白名单一致的本机端口，不自动找端口或结束用户进程。

## 8. 代码规范

- Biome：2 空格缩进、行宽 110、单引号、语句分号、LF。
- TypeScript 严格模式：`strict`、`noUncheckedIndexedAccess`、`noImplicitOverride`、`verbatimModuleSyntax`、`isolatedModules`；禁止 `any`。
- 按功能组织文件，避免单文件膨胀；不为局部问题引入新抽象层。
- 不引入第二套 UI 库、Axios、WebSocket 客户端、TanStack Form、TanStack Virtual（按需再评估）。

## 9. 当前边界

第三阶段已实现工作台、账户/详情、证券目录/已加载规则、报价、订单/详情、任务/详情、两种持仓来源、官方成交历史、账本/已加载详情、核对、操作回执/业务事件及管理员只读页面。无独立真实 API 的能力不补造路径；未接入官方订单历史专页或重复管理员订单/任务/账本别名。无下单、撤单、任务控制、用户或风控写入口，无完整 Operation Recovery。真实后端未联调；本轮证据见 `docs/changes/0071-frontend-readonly-business-features.md`，不回写 0066～0070。

## 10. 会话、权限与业务同步

- 账号、角色、`canManageAdmins` 与 CSRF 只由认证结果确认；登录表单复用公开 loginSchema，保留凭据原串，密码/CSRF 不写持久存储或广播。
- 状态区分初始化、检查、登录中、已认证、匿名、暂不可用、退出中与退出未确认。网络/5xx/畸形响应不冒充匿名；退出立即推进 epoch、清缓存、停 SSE。失败后只能显式重试退出或显式核对，不能自动恢复旧 Cookie 对应的身份。
- 登录、退出、`/me` 串行；业务请求可取消，认证新动作不以 abort 假装撤销已到达服务端的认证写入。前端不能阻止浏览器应用迟到 Set-Cookie，仍须在隔离后端联调及发布前核对。
- BroadcastChannel 只有“正在变更/已经结束”的提示，不携带用户、token 或远端 epoch。接收端隔离并受控 `/me`；不回环，不跨标签共享 SSE。浏览器不支持通道时，仅保留本标签隔离。
- TRADER 的交易写能力与 ADMIN 管理写能力仍分离，管理管理员还要求 ADMIN 且 `canManageAdmins=true`；本阶段只读业务允许两种角色，管理读取仅 ADMIN，不额外要求专项管理标记。侧栏与直接路由使用同一权限函数。
- 每个已确认会话每标签至多一个原生业务 EventSource，携带 Cookie。error 帧与传输 error 分开处理；后者不猜 HTTP401/429。关闭原生重连后才按 3/6/12 秒自建重连，本地同用户预算每 60 秒最多四次；暂停后需要显式重试且不能绕过预算。
- refresh 只失效当前作用域中显式注册且 `canRead(user)` 通过的 Query，不拼接服务端资源名作为 URL。Query key 包含 epoch/user/account/resource；隐藏消费者只置 stale，活动 Query 的在途通知用版本和尾随补读收敛，不无限延伸失败重读。
- 首个有效 refresh 是连接基线，不因初始全量 users 通知重开 `/me`/SSE；后续身份提示限频。真实业务 Query 已按各 Feature 的 `queries.ts` 登记有限依赖，初始资源通知仍按既有机制收敛，不为了测试请求数忽略通知。菜单始终提供显式重新验证。
- Astryx TopNav 的 `startContent` 在移动模式会移入抽屉；常驻连接状态放 `heading`，手动 MobileNavToggle 放常驻 endContent，避免把导航入口本身藏到抽屉。
- 报价使用公开 quote/status 协议，每标签只订阅当前一个账户/证券；与业务通知各至多一条连接，共用连接预算策略而非混用解析。流断开后旧价只能作历史参考；15 秒只是客户端展示阈值，不是交易 TTL。

## 11. 契约与隔离协议验收

本地包改为后端生成的 `backend/api-contracts/`，只提交生成脚本及 `backend/contracts/` 源契约。TypeScript、Vite、Vitest 继续保留包链接位置并去重 React/Zod/Hono；不要手工导入后端运行类型或建立第二份依赖树。当前契约工作流见第 12 节，历史 Windows Bun 限制按原轮保留。

`tests/protocol/server.mjs` 必须显式 `PROTOCOL_STUB=1`，仅绑定 localhost:18770；没有数据库、SDK 或交易路径。测试控制接口带独立标记且拒绝浏览器 Origin，接口数据与真实数据分离。认证公开错误码、字段与校验范围以当前后端为依据；额外故障模式只证明前端错误处理，不是新的后端契约。

网络故障用已提交响应头后的截断正文模拟，保留“单次 Fetch/结果未知”断言。空 TCP reset 可能触发浏览器透明重试，不能据此把浏览器网络栈行为误认为应用层重试，也不能将 UNKNOWN 改为成功。

生产构建不会注册开发页或自动回退 Mock。前端源码映射继续输出，仅供内部排错；部署时应由静态托管配置禁止公开 `.map` 或单独保管，不把构建完成当成已落实生产部署策略。Coverage 本轮实际运行，但未设置数字阈值；不要以覆盖率替代业务断言。

## 12. 契约生成与重新克隆

从仓库根目录首次准备：

```bash
cd backend
bun install
bun run contracts:prepare
cd ../frontend
bun install
bun run contracts:check
bun run typecheck
```

后端公开快照更新后，先在 backend 执行 `contracts:prepare`，再在 frontend 安装、检查和类型验证。`prepare` 仅包装已有 `backend/contracts/`，不重新推导 AppType；真正公开 API 变更由获准的后端工作先执行既有 `contracts:export`。旧的源实现一致性检查保留为 `backend` 的 `contracts:source:check`，它会临时声明编译；新的 `contracts:check` 只读生成目录，缺失/不完整/陈旧均非零退出。

前端 `contracts:sync` 已移除，不保留根 `api-contracts/` 或兼容别名。`contracts:check` 实际执行后端脚本并带 `--consumer`，同时核对四个生成文件、安装副本、导出路径、Hono 和 file: 目标。不能把路径正确或生成成功当成消费副本已更新。

本轮实际 Bun 为 1.4.4，普通安装与 frozen 安装成功，未升级项目锁定依赖、未提权。Bun 文件安装可能共享 inode：重建源目录不会自动替换已经安装的旧 inode；陈旧/损坏副本检查失败时，显式执行 `bun install --force --frozen-lockfile` 后再检查，不能手工伪造副本或忽略失败。

生成根类型入口使用 `./client.js`，使 NodeNext 正确解析同名声明；不修改公开 `client.d.ts`/`validation.ts` 原文，也不通过扩大 tsconfig 路径映射掩盖类型退化。E2E 共享夹具遵守 ESM 扩展名规则；纯类型检查的负例不执行非法调用。

`backend/api-contracts/` 被 Git 和后端格式化器排除；任何工作目录均由脚本自身 URL 定位同一个 backend。迁移与异地无依赖目录重建证据见 `docs/changes/0071-frontend-readonly-business-features/0002-contract-migration-verification.md`。不运行后端服务、Worker、数据库或 SDK 来准备契约。

## 13. 只读 Feature 约定

- 请求/响应类型从 `ApiClient` 与 Hono 推导；复用公开输入/来源 schema，仅为实际展示字段建立运行时投影。不把静态泛型当成运行时验证。
- Query key 由各模块 `query-keys.ts` 唯一构造，包含 epoch、用户、账户/授权范围及有效请求参数；URL 应用筛选时回第一页，草稿不因 SSE 刷新而丢失。账户切换不使用旧账户 placeholderData。
- 只传后端实际支持的筛选/分页字段；无分页的账户/候选/核对/操作数组不伪造分页。当前查询没有用户可指定的服务端排序，不展示虚假排序按钮。
- `useResourceQuery` 统一处理权限、信号、精确缓存登记及有界收敛。访问拒绝随精确 Query 实例保留；失败重试/卸载不能解除，成功读取并解析后才恢复。拒绝结果不进入普通“失败保留陈旧数据”路径。
- `QuerySurface` 区分未选择范围、首次加载、空结果、普通失败、最后成功缓存时间、访问拒绝及业务通知状态；缓存读取时间不是后端来源时间，连接正常不是交易许可。
- 操作 GET 只显示服务端回执报告；没有独立原请求身份时不推导原意图终态，不从回执反构 expected，也不调用恢复、核对或重放写接口。
- 本地持仓、官方 Funding 候选、Spot 钱包、USD 名义成交与 USDC 预留分别展示；空集合不补零行，未知费用/估值/可卖量不推算。
- MSW 与本地协议桩有明确 Mock 标识；生产没有假登录/假数据回退。GET 可触发后端缓存、审计或回执收敛，前端只读不承诺服务端绝无持久化副作用。
