# 独立前端工程底座（frontend）

- 状态：已执行；本文件为一次已执行的变更记录，定稿后不重写，后续演进另建编号。
- 影响范围：新增独立前端工程 `frontend/`；`backend/` 源码、契约、迁移、`docker`／运行配置零改动。
- 版本：后端仍为 3.0.0（无行为变化，不递增）；前端新工程版本 0.1.0。
- 依据：[项目与后端概览](../integration/project-and-backend-overview.md)、[前端架构第二轮复核（Astryx 最终方案）](0065-frontend-architecture-review-v2/README.md)、[前端技术架构提案](0064-frontend-architecture-review/0002-frontend-architecture-proposal.md)。
- 本轮不做：登录、账户／证券／订单／任务／持仓／账本／管理业务、真实 API 与 SSE 连接、真实买卖与撤单、Monorepo Workspace。

## 1. 背景

审查报告确认前端可以进入工程建设，但要求先落地四项前端 P0 门禁：精确数值与时间、非 2xx 必须消费 operation、未知结果恢复、金融语义表达。在此之前仓库只有 `backend/`，没有可独立安装、开发、测试与构建的前端工程，也没有可验证 Astryx + Tailwind v4 组合的载体。

本轮目标是把技术方向固化成可运行底座：独立 Bun 工程、Vite 8 构建、React 19、Astryx 0.7.11 唯一主 UI、Tailwind CSS v4、TanStack 三件套、RHF + Zod、Native Fetch/EventSource、decimal.js 与 Intl，并提供只在开发环境注册的 Engineering Playground 做真实浏览器验证。

## 2. 方案

### 2.1 独立工程

- `frontend/` 自带 `package.json`、`bun.lock`、TypeScript／Vite／Vitest／Playwright／Biome 配置，不共享根级 workspace，不导入 `backend/` 源码。
- 包管理与脚本统一 Bun 1.4.3；`packageManager` 固定为 `bun@1.4.3`，不生成 npm／pnpm／Yarn 锁文件。
- 纯静态 SPA：`vite.config.ts` 只有 React 与 Tailwind 插件，无 SSR、无 Next.js；`VITE_API_BASE_URL` 预留同源 `/api/v1` 与跨源 origin 两种形态。

### 2.2 版本与依赖

以实际 registry 元数据与 `bun.lock` 为准，Astryx 三包精确锁 0.7.11，StyleX 只作为 Core 的 peer 满足项，不启用 StyleX 业务样式编译。

| 依赖 | 锁定值 |
|---|---|
| react / react-dom | 19.3.1 |
| typescript | 5.9.3（不升级 TS 7） |
| vite / @vitejs/plugin-react | 8.3.7 / 6.3.0 |
| @astryxdesign/core、theme-neutral、cli | 0.7.11（精确） |
| @stylexjs/stylex | 0.19.1（满足 Core peer ^0.19.0） |
| tailwindcss / @tailwindcss/vite | 4.3.5 |
| @tanstack/react-router / query / table | 1.170.46 / 5.107.1 / 9.3.1 |
| react-hook-form / @hookform/resolvers / zod | 7.91.0 / 7.0.5 / 4.6.7 |
| decimal.js / @tabler/icons-react | 10.6.0 / 3.51.0 |
| vitest / @vitest/coverage-v8 | 5.1.0 |
| @testing-library/react / user-event / jest-dom | 16.3.3 / 14.6.8 / 7.0.1 |
| msw / jsdom | 3.0.4 / 31.0.0 |
| @playwright/test | 1.65.0 |
| @biomejs/biome | 2.6.6 |

`bun install` 期间 Astryx core/cli 的 postinstall 被 Bun 默认阻止；两个脚本仅打印 `astryx init` 提示，不写项目文件、不影响构建。本轮显式未运行 `bun pm trust`。

### 2.3 主题与 CSS 层

- 使用 `astryx theme build` 生成预编译主题（197 个 Token、14 个组件覆盖，24.1 KB CSS），应用运行时不再注入样式，也不产生“unbuilt theme”警告。
- 主题源文件 `src/theme/app-theme.ts` 只 `extends neutralTheme` 并注入 Tabler 语义图标，不复制颜色／圆角／字体 Token；生成物在 `src/theme/generated/`，由 `bun run theme:check` 防漂移，禁止手改。
- 图标模块保持纯 TS（`createElement` 而非 JSX），因为主题构建会用 Node 直接加载它；业务图标仍可直接使用 Tabler React 组件。
- CSS 入口 `src/styles/index.css` 在任何 `@import` 前声明 `@layer reset, theme, base, astryx-base, astryx-theme, components, utilities`，然后按要求顺序导入 Tailwind theme/preflight、Astryx reset/astryx.css、项目主题、Tailwind bridge 与 utilities。
- 浏览器实测层顺序为 `["reset","theme","base","astryx-base","astryx-theme","components","utilities"]`；Tailwind 布局类可覆盖允许覆盖的样式，未使用 `!important`。
- 组件内建文案接入 Astryx `zh-CN` 语言包，避免 “Select…” 等英文占位符。

### 2.4 路由、缓存与 Provider

- **代码路由**（不混用文件路由）：`src/app/router/index.tsx` 建立根路由、首页、404 与错误边界；`/dev/playground` 仅在 `import.meta.env.DEV` 下注册，并使用 `lazyRouteComponent` 动态导入，生产构建不注册该路由。
- Provider 顺序：`ThemeModeProvider`（Light/Dark/System，持久化到 localStorage）→ Astryx `InternationalizationProvider`（zh-CN）→ `LayerProvider`（Toast 视口）→ `QueryClientProvider`。
- QueryClient：读请求 `staleTime 30s`、`gcTime 5min`、窗口聚焦重取；仅网络/超时/429/5xx 的只读查询最多重试 2 次；`mutations.retry = false`，任何交易写请求都不自动重试。
- 不引入 Zustand，不让 Router loader 承担服务端缓存。

### 2.5 API Client 语义

`src/services/api/` 是协议骨架而非业务 DTO 集合：

- `request.ts` 只 fetch 一次；超时/取消/断网归为 `transport-error`，不当作业务失败；HTTP 非 2xx 不抛异常。
- `response.ts` 用 Zod 宽松解析 `{data|error, operation}`；回执缺字段填 null，不补造状态。
- `errors.ts` 把写结果分为 `applied | rejected | unknown`：`502 + SUCCEEDED` 视为已应用；`429 + UNKNOWN`、`PROCESSING`、`CONFLICT`、超时、结构异常一律视为未知；`classifyWriteOutcome` 与 `isOperationPreserved` 是该规则的唯一实现。
- `client.ts` 注入 CSRF（仅写请求）、`Idempotency-Key`、AbortSignal 与 session epoch（响应带回发起时纪元，供上层丢弃旧会话响应）。
- `services/realtime/` 只做业务 SSE 帧类型与解析（refresh/error），不建立真实连接；收到 error 帧由未来管理器立即关闭，本阶段不伪造连接行为。

### 2.6 三个业务基础组件

- **DecimalTextInput**：字符串唯一值，`inputMode="decimal"`，不转 Number、不钳制、不舍入；前缀/后缀走 Astryx `InputGroup`，并以 `InputGroup` 作为唯一标签来源，避免可访问名重复；错误只通过外部 `status` 呈现，可直接接 RHF Controller。
- **UtcDateTimeField**：UTC 文本为权威值，最多六位小数秒，七位直接报错；同时展示 UTC 与 America/New_York；可切换纽约墙钟输入，用 Intl tzdata 计算偏移，春季不存在时间拒绝，秋季重复时间返回两个候选并由 `RadioList` 显式选择，未选择前不写入表单值。
- **DataTableShell**：Astryx Table 负责外观，TanStack Table v9 负责列定义、列可见性与排序状态；Registers 排序/可见性 feature，不注册分页 feature，服务端分页状态只由 props（`page/pageSize/totalItems`）拥有；Loading / Empty / Error / Stale 四种状态独立。

### 2.7 测试体系

- Vitest：`tests/unit`（十进制、Intl 格式化、UTC 解析、DST、结果分类、SSE 帧）+ `tests/integration`（API Client MSW 协议分支、DecimalTextInput + RHF + Zod、UtcDateTimeField DST、DataTableShell、主题与 Dialog）。
- jsdom 只补缺失的浏览器 API（ResizeObserver、IntersectionObserver、matchMedia、scrollIntoView、pointer capture、`<dialog>` show/close），不放宽业务断言。
- MSW 使用绝对 base URL `http://localhost/api/v1`，因为 Node 侧 fetch 不接受相对地址。
- Playwright 使用本机 Chrome（`channel: 'chrome'`），不下载额外浏览器；dev server 已存在时复用。

## 3. 实施（改动文件清单）

新增目录 `frontend/`（未改动 `backend/`）：

| 分组 | 文件 |
|---|---|
| 工程配置 | `package.json`、`bun.lock`、`tsconfig.json`、`tsconfig.app.json`、`tsconfig.test.json`、`tsconfig.node.json`、`vite.config.ts`、`vitest.config.ts`、`playwright.config.ts`、`biome.json`、`.gitignore`、`.env.example`、`index.html`、`public/favicon.svg` |
| 主题与样式 | `src/theme/app-theme.ts`、`src/theme/icons.tsx`、`src/theme/tokens.ts`、`src/theme/index.ts`、`src/theme/generated/*`、`src/styles/index.css` |
| 应用装配 | `src/main.tsx`、`src/vite-env.d.ts`、`src/app/providers/{app-providers,query-client,theme-provider}.tsx`、`src/app/router/{index,root-layout,not-found,error-page}.tsx` |
| 路由页面 | `src/routes/home-page.tsx`、`src/routes/dev/playground-page.tsx` |
| 组件 | `src/components/ui/{decimal-text-input,utc-datetime-field,data-table-shell}.tsx`、`src/components/shared/theme-mode-toggle.tsx` |
| 领域工具 | `src/lib/decimal/decimal.ts`、`src/lib/time/{instant,zoned}.ts`、`src/lib/format/number.ts` |
| 服务 | `src/services/api/{client,request,response,errors,types}.ts`、`src/services/realtime/{types,parse}.ts` |
| 测试 | `tests/setup.ts`、`tests/msw/{fixtures,handlers,server}.ts`、`tests/unit/*`（6 份）、`tests/integration/*`（5 份）、`tests/e2e/playground.spec.ts` |

关键脚本（`frontend/package.json`）：`dev`、`build`、`preview`、`typecheck`、`lint`、`lint:fix`、`format`、`test`、`test:run`、`test:coverage`、`e2e`、`e2e:install`、`theme:build`、`theme:check`。

## 4. 后续验证建议

1. 后端可隔离运行时，补真实登录／CSRF 刷新／迟到 401 的 Playwright 用例，验证 session epoch 与 Cookie 竞态。
2. 接入业务查询前，先为各资源补齐 DTO 与 Zod 边界，再复用 `requireData` / `classifyWriteOutcome`，不得自行实现第二套错误语义。
3. 业务 SSE 管理器按报告 5.4：单标签单连接、资源族失效、错误帧立即关闭、指数退避、重连全量收敛；MSW 的 JSON handler 不能代替真实 EventSource。
4. 交易写入页面开发前，重新对照 P0-002/003A/004/008 的验收标准，并补充原 ID 持久化与跨刷新恢复的端到端测试。
5. 视觉回归稳定后再考虑拆分 vendor chunk、加载品牌字体、补 Firefox/WebKit 项目与 CI。

## 5. 执行验证记录

### 执行环境

- 主机：Windows 10.0.26300 x64；Bun 1.4.3；Node v24.22.0（仅第三方 CLI／Playwright 使用）。
- 工作目录：`D:/Binance-astryx-dev/frontend`；分支 `astryx-dev`。
- 浏览器：本机安装的 Google Chrome（Playwright `channel: 'chrome'`）；同时用 chrome-devtools MCP 检查 Console。

### 验证命令与实际输出

| 命令 | 实际输出 | 结论 |
|---|---|---|
| `bun install` | `Checked 305 installs across 342 packages (no changes)`；首次安装 292 packages | 通过；锁文件稳定 |
| `bun run typecheck` | `tsc -b --noEmit` 无输出，退出 0 | 通过 |
| `bun run lint` | `Checked 57 files … No fixes applied` | 通过 |
| `bun run test:run` | 11 个测试文件、63 个用例全部通过 | 通过 |
| `bun run test:coverage` | Statements 88.20%、Branches 80.21%、Functions 85.14%、Lines 90.41% | 通过（未设阈值） |
| `bunx playwright test` | 7 passed（启动/主题/图标/Tailwind、Dialog/AlertDialog/Drawer、Toast/Menu/Popover、RHF 表单、UTC/DST、表格分页排序列、移动端） | 通过 |
| `bun run theme:check` | `Theme outputs are up to date` | 通过 |
| `bun run build` | `index.html 0.54 kB`、CSS `302.27 kB (gzip 47.04)`、JS `871.70 kB (gzip 267.31)`；`✓ built in 836ms` | 通过，存在单 chunk >500 kB 警告 |
| `bun run preview` + 访问 `/dev/playground` | 返回 SPA 兜底页并渲染“页面不存在”；Console 无消息；导航不显示 Playground 入口 | 通过（生产不注册验证路由） |
| 浏览器 CSSOM 检查 | 层声明 `reset, theme, base, astryx-base, astryx-theme, components, utilities`；`data-astryx-theme=binance-stocks` | 通过 |
| 浏览器 Console 检查 | 仅 Vite 连接与 React DevTools 提示；无 error | 通过 |

Playwright 截图证据（`frontend/test-results/`，已被 `.gitignore` 排除）：`playground-light.png`、`playground-dark.png`、`playground-mobile.png`。

### 已知限制与未执行项

- 只验证 Chrome；Firefox/WebKit 未执行。
- 未连接真实后端、未验证真实登录／CSRF／SSE、未执行任何真实或模拟交易。
- `e2e:install` 未运行（使用系统 Chrome）；CI 若无 Chrome 需自行安装浏览器。
- 生产 JS 为单 chunk 871.70 kB（gzip 267.31 kB），触发 Vite 体积提示；本轮不拆包。
- 主题 CSS 字体名为 Figtree，但未引入 Google Fonts（避免第三方网络依赖），实际回退到系统字体。
- 生产构建保留 sourcemap；上线前需按部署策略决定是否关闭。
- 未引入 ESLint／React Doctor／Semgrep／CI 配置；静态检查目前只有 TypeScript 与 Biome。
- 未实现真实 SSE 管理器与原操作本地持久化（P0-002 的持久记录），仅有协议类型与结果分类骨架。
