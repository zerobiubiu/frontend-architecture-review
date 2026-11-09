# 前端工程审查说明（frontend-review-guide.md）

- 用途：供外部（ChatGPT 等）对 `frontend/` 工程底座做技术审查。
- 范围：只包含前端工程源码、配置、测试与说明；不含 `backend/`、构建产物、依赖目录与 Git 历史。
- 事实基准：本文件中的版本、提交、测试结果均来自 2026-11-10 本机实际执行与仓库实际文件；未执行项已显式标注。

## 1. 项目基本信息

| 项目 | 值 |
|---|---|
| 项目名称 | `binance-stocks-frontend`（`package.json` name，私有包，版本 0.1.0） |
| 包管理器 | Bun 1.4.3（`packageManager: bun@1.4.3`，只维护 `bun.lock`） |
| 当前 Git 分支 | `astryx-dev` |
| 最新提交 SHA | `f82fed179aae907d31c50565bad841c16b0863ba`（`chore(dev): 前端 tsconfig 显式启用 isolatedModules`） |
| 前端底座提交 | `26af928`（`feat(dev): 新增独立前端工程底座（Astryx + Tailwind v4）`） |
| React / React DOM | 19.3.1 / 19.3.1 |
| TypeScript | 5.9.3 |
| Vite | 8.3.7（`@vitejs/plugin-react` 6.3.0） |
| Astryx | core / theme-neutral / cli 均为 0.7.11（精确锁定） |
| Tailwind CSS | 4.3.5（`@tailwindcss/vite` 4.3.5） |
| 测试 | Vitest 5.1.0、RTL 16.3.3、MSW 3.0.4、Playwright 1.65.0 |
| 静态检查 | Biome 2.6.6 + `tsc -b --noEmit` |
| 运行环境（本次验证） | Windows 10.0.26300 x64；Bun 1.4.3；Node v24.22.0（CLI/Playwright）；本机 Google Chrome |

说明：压缩包内不含 `.git`，上述提交信息仅用于溯源；工作区未提交的审查资料不改变源码提交内容。

## 2. 工程目录说明

```text
frontend/
├── index.html                     # HTML 入口（唯一 script 指向 src/main.tsx）
├── package.json / bun.lock        # 依赖与脚本；锁文件唯一
├── tsconfig.json                  # 项目引用根（app / test / node）
├── tsconfig.app.json              # 应用编译：严格模式 + @/* 别名 + JSON 模块
├── tsconfig.test.json             # src + tests 类型检查
├── tsconfig.node.json             # vite/vitest/playwright/e2e 的类型检查
├── vite.config.ts                 # React + Tailwind 插件、@ 别名、构建目标
├── vitest.config.ts               # jsdom、setup、include/exclude、coverage
├── playwright.config.ts           # Chrome channel、localhost、webServer 复用
├── biome.json                     # 格式与 lint 规则（2 空格/110 列/单引号/分号）
├── .env.example                   # VITE_API_BASE_URL 示例（无敏感值）
├── public/favicon.svg             # 静态图标
├── README.md / DEVELOPMENT.md     # 工程说明与开发维护说明
├── src/
│   ├── main.tsx                   # 挂载：AppProviders + RouterProvider
│   ├── vite-env.d.ts              # Vite 环境类型
│   ├── styles/index.css           # Cascade Layers + Tailwind/Astryx 导入
│   ├── theme/
│   │   ├── app-theme.ts           # 主题源：extends Neutral + Tabler 图标
│   │   ├── icons.tsx              # 29 个语义图标映射（纯 TS，无 JSX）
│   │   ├── tokens.ts              # Astryx CSS 变量的类型化引用
│   │   ├── index.ts               # 导出已生成主题对象/图标/Token
│   │   └── generated/             # astryx theme build 产物（CSS/JS/d.ts，禁手改）
│   ├── app/
│   │   ├── providers/             # ThemeMode / i18n / Layer / QueryClient
│   │   └── router/                # 代码路由、根布局、404、错误边界
│   ├── routes/                    # 页面：home-page、dev/playground-page
│   ├── components/
│   │   ├── ui/                    # DecimalTextInput、UtcDateTimeField、DataTableShell
│   │   └── shared/                # 主题切换
│   ├── lib/
│   │   ├── decimal/decimal.ts     # 十进制字符串解析/比较/求和/规范化
│   │   ├── time/instant.ts        # UTC 解析、格式化、IANA 字段、偏移
│   │   ├── time/zoned.ts          # 墙钟 → UTC、DST 不存在/重复消歧
│   │   └── format/number.ts       # Intl 展示（不回写）
│   └── services/
│       ├── api/                   # Fetch 请求/响应/错误分类/Client 类型
│       └── realtime/              # 业务 SSE 帧类型与解析（不建连）
└── tests/
    ├── setup.ts                   # jsdom 补丁、MSW 生命周期、清理
    ├── msw/                       # handlers / fixtures / server
    ├── unit/                      # 6 个纯逻辑测试文件
    ├── integration/               # 5 个 RTL/MSW 测试文件
    └── e2e/playground.spec.ts     # 7 个 Playwright 场景
```

## 3. 技术栈说明（全部直接依赖，版本为实际安装值）

### 3.1 运行时依赖

| 依赖 | 版本 | 用途 |
|---|---|---|
| `react` / `react-dom` | 19.3.1 | UI 运行时；Astryx 0.7.11 要求 React ≥19 |
| `@astryxdesign/core` | 0.7.11 | 唯一主 UI：组件、主题运行时、Layer/Toast、i18n、Table |
| `@astryxdesign/theme-neutral` | 0.7.11 | 作为 `extends` 基底，不复制 Token |
| `@stylexjs/stylex` | 0.19.1 | 仅满足 core 的 peer 依赖，未启用 StyleX 编译、无业务 StyleX |
| `@tabler/icons-react` | 3.51.0 | 语义图标注册表与业务图标直接使用 |
| `@tanstack/react-router` | 1.170.46 | 类型安全代码路由、404/错误边界 |
| `@tanstack/react-query` | 5.107.1 | 服务端状态、缓存、失效与只读重试策略 |
| `@tanstack/react-table` | 9.3.1 | 表格列定义、排序状态、列可见性（headless） |
| `react-hook-form` | 7.91.0 | 表单状态与 Controller 适配 |
| `@hookform/resolvers` | 7.0.5 | RHF + Zod 4 resolver |
| `zod` | 4.6.7 | 表单/协议边界校验 |
| `decimal.js` | 10.6.0 | 十进制精确比较/求和（不用于展示格式化） |

### 3.2 开发依赖

| 依赖 | 版本 | 用途 |
|---|---|---|
| `@astryxdesign/cli` | 0.7.11 | `astryx theme build` 生成预编译主题 |
| `typescript` | 5.9.3 | 严格类型检查（显式不升级 TS 7） |
| `vite` | 8.3.7 | 开发服务器与生产构建（Rolldown） |
| `@vitejs/plugin-react` | 6.3.0 | React JSX 转换 |
| `tailwindcss` / `@tailwindcss/vite` | 4.3.5 / 4.3.5 | 工具类与 Vite 集成（无 `tailwind.config.js`） |
| `@biomejs/biome` | 2.6.6 | 格式化与 lint（替代 ESLint/Prettier） |
| `vitest` / `@vitest/coverage-v8` | 5.1.0 / 5.1.0 | 单元/集成测试与覆盖率 |
| `jsdom` | 31.0.0 | DOM 测试环境 |
| `msw` | 3.0.4 | HTTP 协议 Mock（Node 测试） |
| `@testing-library/react` | 16.3.3 | 组件行为测试 |
| `@testing-library/user-event` | 14.6.8 | 真实交互序列 |
| `@testing-library/jest-dom` | 7.0.1 | DOM 断言扩展 |
| `@testing-library/dom` | 10.4.2 | RTL peer |
| `@playwright/test` | 1.65.0 | 浏览器 E2E（`channel: chrome`） |
| `@types/react` / `@types/react-dom` | 19.3.0 / 19.3.0 | React 类型 |
| `@types/node` | 24.19.2 | 配置文件类型 |

明确未引入：MUI/Chakra/Ant Design/Emotion、Axios、Zustand、TanStack Form、TanStack Virtual、WebSocket 客户端、AG Grid、图表库、i18next、Sentry。

## 4. 核心架构说明

### 4.1 Provider 结构

`src/app/providers/app-providers.tsx` 固定顺序：

```text
ThemeModeProvider（Light/Dark/System，localStorage 持久化）
  └─ InternationalizationProvider（zh-CN 语言包）
      └─ LayerProvider（Toast 视口/浮层栈）
          └─ QueryClientProvider（单实例，useState 惰性创建）
```

根 `Theme` 会把 `data-theme` 与 `data-astryx-theme` 同步到 `<html>`；`mode=system` 时移除 `data-theme`，交由 CSS `color-scheme: light dark`。

### 4.2 Router

`src/app/router/index.tsx` 使用代码路由（未混用文件路由）：

- 根路由：布局 + `notFoundComponent` + `errorComponent`；
- `/`：`HomePage`；
- `/dev/playground`：仅 `import.meta.env.DEV` 时 `createRoute`，并用 `lazyRouteComponent` 动态导入，生产构建不注册；
- `defaultPreload: 'intent'`、`scrollRestoration`，注册 `Register.router` 类型。

### 4.3 QueryClient

`src/app/providers/query-client.ts`：

- 读：`staleTime 30s`、`gcTime 5min`、窗口聚焦/重连重取；
- 读重试：仅当错误是 `ApiOutcomeError` 且属于网络/超时/429/5xx，最多 2 次；
- 写：`mutations.retry = false`、`networkMode: 'online'`；
- Router loader 不承担服务端数据缓存，避免双重缓存。

### 4.4 Theme

- 源：`src/theme/app-theme.ts`（`defineTheme({ name, extends: neutralTheme, icons })`）。
- 产物：`src/theme/generated/binance-stocks.{css,js,d.ts}`（197 Token、14 组件覆盖、24.1 KB CSS）。
- 应用导入生成对象（`__built`，跳过运行时注入）和生成 CSS；CSS 作用域为 `[data-astryx-theme="binance-stocks"]`。
- 修改后必须 `bun run theme:build`；CI/审查用 `bun run theme:check` 防漂移；生成物禁止手改。
- 图标模块保持纯 TS（`createElement`），因为 CLI 用 Node 加载它；生成目录比源深一层，构建命令必须带 `--icons-specifier ../icons.tsx`。

### 4.5 Icons

`src/theme/icons.tsx` 把 29 个 Astryx 语义名（close/chevron/search/warning/…）映射到 Tabler 组件，构建时合并进主题对象；业务图标仍可直接 `import { IconX } from '@tabler/icons-react'`。

### 4.6 CSS 层

`src/styles/index.css` 在任何 `@import` 前声明：

```css
@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;
```

导入顺序：Tailwind theme → Tailwind preflight → Astryx reset → Astryx 组件 CSS → 生成主题 CSS → Tailwind bridge → Tailwind utilities。浏览器 CSSOM 实测层声明与上表一致；工具类可覆盖组件外观，未使用 `!important`，未依赖 Astryx 私有类名。

### 4.7 API Client

- `types.ts`：`ApiOutcome<T>` 四态（success/http-error/transport-error/malformed），统一携带 `sessionEpoch`；`OperationReceipt` 单一时态形状（缺失字段为 null）。
- `request.ts`：单次 `fetch`，`credentials: 'include'`、`cache: 'no-store'`；组合外部 `AbortSignal` 与超时；HTTP 非 2xx 不抛异常。
- `response.ts`：Zod 宽松解析 `{data|error, operation}`；无法识别时返回 `malformed`，不猜测状态。
- `errors.ts`：`classifyWriteOutcome` 唯一分类入口：`applied | rejected | unknown`；`502+SUCCEEDED` 为 applied，`429+UNKNOWN`/`PROCESSING`/`CONFLICT`/超时/结构异常为 unknown；`isOperationPreserved`、`isRetryableReadFailure`、`requireData`、`ApiOutcomeError`。
- `client.ts`：`createApiClient({ baseUrl, getCsrfToken, getSessionEpoch })`；写请求注入 `X-CSRF-Token` 与 `Idempotency-Key`。

### 4.8 SSE 解析

`src/services/realtime/types.ts` + `parse.ts` 仅覆盖业务流协议：`refresh`（resources 白名单过滤、at、requestId）与 `error` 帧；未知结构返回 `null`。**没有 EventSource 连接、重连、退避或缓存失效逻辑**，这是刻意留给下一阶段。

### 4.9 表单适配

`React Hook Form + zodResolver`：使用 `Controller`，显式映射空值；`z.input` 作为表单值，提交时由 resolver/`schema.parse` 得到 `z.output`；错误通过 Astryx `status={{ type: 'error', message }}` 呈现；条件字段禁用但表单值仍由调用方维护。Playground 中的表单只做本地校验与 JSON 展示，不发请求。

### 4.10 金融数值输入

`DecimalTextInput`：`value: string`，`inputMode="decimal"`，不转 Number、不钳制、不舍入；允许 `12.` 等中间态；前缀/后缀使用 `InputGroup` + `InputGroupText`，内层 `TextInput` 使用空 label，避免可访问名重复；错误只由外部 `status` 呈现（Zod/服务端）。

### 4.11 精确时间

`UtcDateTimeField` + `lib/time`：

- 权威值是原始 UTC 字符串（`YYYY-MM-DDTHH:mm:ss[.ffffff]Z`），最多六位小数秒，七位直接报错；
- 展示同时给出 UTC 与 America/New_York，展示不回写；
- 纽约墙钟输入用 Intl tzdata 双轮偏移求解；春季不存在时间返回 `nonexistent` 并拒绝；秋季重复时间返回两个候选，必须显式选择后才写入 UTC 值；
- 消歧按 ±1 小时探测，覆盖整小时 DST 跳变；非整小时跳变时区需扩展。

### 4.12 表格封装

`DataTableShell`：Astryx `Table` 负责结构/密度/分隔线/hover；TanStack Table v9 注册 `rowSortingFeature + columnVisibilityFeature`，**不注册分页 feature**；`manualSorting: true`；分页状态（page/pageSize/totalItems）由页面 props 唯一拥有；Loading / Empty / Error / Stale 四种状态独立渲染；列可见性菜单受控。

## 5. 关键实现入口

| 相对路径（`frontend/` 下） | 职责 |
|---|---|
| `index.html` | HTML 入口，唯一模块脚本 |
| `src/main.tsx` | 挂载 `AppProviders` 与 `RouterProvider` |
| `src/app/providers/app-providers.tsx` | Provider 组合顺序 |
| `src/app/providers/theme-provider.tsx` | Light/Dark/System 与 `data-theme` 同步 |
| `src/app/providers/query-client.ts` | Query 默认值与写请求禁重试 |
| `src/app/router/index.tsx` | 代码路由、DEV-only playground、类型注册 |
| `src/routes/dev/playground-page.tsx` | Engineering Playground（全部验证场景） |
| `src/components/ui/decimal-text-input.tsx` | 金融字符串输入 |
| `src/components/ui/utc-datetime-field.tsx` | UTC/纽约输入与 DST 消歧 |
| `src/components/ui/data-table-shell.tsx` | Astryx Table + TanStack Table 封装 |
| `src/lib/decimal/decimal.ts` | 十进制解析/比较/求和 |
| `src/lib/time/instant.ts` | UTC 解析、格式化、偏移 |
| `src/lib/time/zoned.ts` | 墙钟解析与 DST 候选 |
| `src/lib/format/number.ts` | Intl 十进制展示 |
| `src/services/api/request.ts` | Fetch 单次请求与超时/取消语义 |
| `src/services/api/response.ts` | 信封与 operation 解析 |
| `src/services/api/errors.ts` | 写结果分类、只读重试、查询错误桥 |
| `src/services/api/client.ts` | Client 组合与 CSRF/幂等键 |
| `src/services/realtime/parse.ts` | 业务 SSE 帧解析 |
| `src/theme/app-theme.ts` | 主题源（唯一 Token 扩展点） |
| `src/theme/icons.tsx` | Tabler 语义图标注册 |
| `src/theme/generated/binance-stocks.css` | 预编译主题 CSS（生成物） |
| `src/styles/index.css` | Cascade Layers 与全局导入 |
| `tests/setup.ts` | jsdom 补丁与 MSW 生命周期 |
| `tests/integration/api-client.test.ts` | 非 2xx + operation 协议测试 |
| `tests/e2e/playground.spec.ts` | 浏览器端到端验证 |

## 6. 测试情况（本次重新执行）

执行环境：Windows 10.0.26300 x64，Bun 1.4.3，Node v24.22.0，本机 Google Chrome；工作目录 `frontend/`。

| 项目 | 命令 | 本次实际结果 | 状态 |
|---|---|---|---|
| 依赖 | `bun install --frozen-lockfile` | `Checked 305 installs across 342 packages (no changes)` | 通过 |
| TypeScript | `bun run typecheck` | `tsc -b --noEmit` 无输出，退出 0 | 通过 |
| Biome | `bun run lint` | `Checked 57 files … No fixes applied` | 通过 |
| Vitest | `bun run test:run` | 11 个测试文件、63 个用例全部通过 | 通过 |
| Coverage | `bun run test:coverage` | Statements 88.20%（329/373）、Branches 80.21%（300/374）、Functions 85.14%（86/101）、Lines 90.41%（302/334） | 通过（未设阈值） |
| Playwright | `bunx playwright test` | 7 个用例全部通过（11.9s），自动拉起 dev server，使用 `channel: chrome` | 通过 |
| 生产构建 | `bun run build` | `index.html 0.54 kB`；CSS `300.58 kB (gzip 46.76)`；JS `871.70 kB (gzip 267.31)`；另有懒加载 `Tooltip` chunk 2.08 kB；触发 >500 kB 警告 | 通过（有警告） |
| 主题防漂移 | `bun run theme:check` | `Theme outputs are up to date` | 通过 |

说明：

- 以上均为本次打包前重新执行的结果，不是历史结果复用；
- 没有跳过任何 Vitest/Playwright 用例；未出现失败；
- 未执行 Firefox/WebKit 项目（配置仅有 Chromium + 系统 Chrome）；
- 未执行真实后端联调、真实登录/CSRF/SSE 场景；
- Coverage 未设阈值，仅记录实际数值。

## 7. 已知问题（按当前源码核实）

1. **JS Bundle 体积**：单入口 chunk `871.70 kB`（gzip 267.31 kB），触发 Vite 体积警告；未做 vendor 拆包/代码分割（Playground 已懒加载，但公共依赖仍集中）。
2. **字体未实际加载**：生成主题引用 `Figtree`，但未导入 `@astryxdesign/theme-neutral/fonts.css` 或自建 `@font-face`，实际回退系统字体。
3. **Sourcemap**：`vite.config.ts` 中 `build.sourcemap: true`，生产产物包含约 4.19 MB 的 JS map；发布前需按部署安全策略决定是否关闭。
4. **浏览器覆盖**：仅验证 Chrome；Firefox/WebKit 未运行。
5. **未联调真实后端**：无真实登录、Cookie、CSRF、限流、SSE、数据库；所有请求语义仅由 MSW/单测验证。
6. **Session Epoch 未实现**：只有 `ApiOutcome.sessionEpoch` 字段与 `getSessionEpoch` 注入点；没有会话模块、纪元递增、旧响应丢弃或 `queryClient.cancelQueries` 逻辑。
7. **Business SSE Manager 未实现**：只有帧类型与解析器；无 EventSource 生命周期、错误帧关闭、退避重连、资源→QueryKey 失效映射。
8. **Operation Recovery 未实现**：无发送前本地持久化定位记录、无“待核对”入口；仅提供 `createOperationId` 与结果分类。
9. **业务 Feature 未实现**：`src/routes` 只有首页与 Playground；没有 auth/accounts/market/orders/tasks/positions/ledger/administration 页面。
10. **主题生成耦合**：生成产物由 Astryx CLI 0.7.11 产出；升级 CLI/Core 必须重新生成并跑 `theme:check`，否则主题 CSS/JS 可能与包版本不一致。
11. **Playwright 依赖本机 Chrome**：`channel: 'chrome'`，CI 无 Chrome 时需安装浏览器或切换 channel。
12. **开发服务器绑定**：Vite 默认绑定 `localhost`（IPv6），E2E 必须用 `http://localhost:<port>`，`127.0.0.1` 会连接失败。
13. **依赖安装提示**：Bun 默认阻止 Astryx core/cli 的 postinstall（仅 `astryx init` 提示），未执行 `bun pm trust`；不影响构建，但安装日志会出现 blocked postinstalls。
14. **静态检查范围**：只有 TypeScript + Biome；未接入 ESLint、React Doctor、Semgrep 或 CI 流水线。
15. **覆盖率排除项**：`main.tsx`、路由装配、DEV Playground、生成主题不计入覆盖率，因此覆盖率不代表这些路径已被测试。

## 8. 审查建议（希望外部重点关注）

1. **工程架构**：`app/providers`、`app/router`、`routes`、`components`、`lib`、`services` 的分层是否合理？是否存在职责重叠或缺失的边界？
2. **过度设计**：`ApiOutcome` 四态、`classifyWriteOutcome`、`requireData` 的双层错误模型是否必要？是否有更简单且不丢失 operation 的写法？
3. **依赖重复**：Astryx + Tailwind bridge 是否重复承担样式职责？`@testing-library/dom` 等 peer 的显式声明是否冗余？
4. **Astryx 使用规范**：`defineTheme extends Neutral`、预编译主题、语义图标注册、`InputGroup` 组合、`useToast`/`LayerProvider` 用法是否有偏离官方推荐之处？
5. **样式层**：固定 Cascade Layers 顺序与 Tailwind bridge 的共存方式是否稳健？`components` 层的使用是否过少/过多？
6. **RHF + Zod**：`useForm<z.input<...>, unknown, z.output<...>>` 的泛型组合、Controller 空值映射、禁用字段处理是否正确？是否应引入 `z.input` 专用表单类型？
7. **DecimalTextInput**：字符串输入是否真正避免 Number 路径？`InputGroup` 空 label 的 a11y 处理是否可接受？还需要哪些边界（前导零、正负号、超长输入、粘贴）？
8. **UtcDateTimeField**：六位小数与 DST 处理是否完整？`±1 小时`候选探测、Intl 依赖、非整小时时区、闰秒/年份边界是否需要更严格方案？
9. **TanStack 职责**：Router loader 与 Query 的边界、Table 手动排序/分页、Astryx Pagination 的状态拥有者是否一致？是否会出现双状态或双请求？
10. **测试充分性**：63 个 Vitest 用例与 7 个 Playwright 场景是否覆盖关键行为？缺少哪些应优先补的契约测试（例如 SSE error 帧关闭、原 ID 恢复、CSRF 失败重试）？
11. **安全与维护性**：CSRF/凭据/错误信息展示是否存在风险？`operation` 与未知结果语义是否有误用可能？类型可空性与契约演进是否可维护？
12. **阶段判断**：以当前底座状态，是否可以开始应用框架（登录、账户、只读页面）开发？还是应先补齐 Session Epoch、SSE Manager、Operation Recovery 三项？
