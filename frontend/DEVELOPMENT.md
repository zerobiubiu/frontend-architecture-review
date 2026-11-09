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
| `bunx playwright test` | E2E（自动复用或拉起 dev server） |
| `bun run theme:build` | 重新生成 Astryx 主题产物 |
| `bun run theme:check` | 校验生成产物与主题源一致（CI 用） |

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

- Provider 顺序：`ThemeModeProvider`（Light/Dark/System）→ `InternationalizationProvider`（zh-CN）→ `LayerProvider`（Toast）→ `QueryClientProvider`。
- 路由为代码路由：根路由 + 首页；`/dev/playground` 仅在 `import.meta.env.DEV` 注册并通过 `lazyRouteComponent` 动态导入，生产不注册。
- Query 默认值：读 `staleTime 30s`、`gcTime 5min`、窗口聚焦重取；只读查询仅在网络/超时/429/5xx 时最多重试 2 次；**mutation `retry: false`**。
- 不引入 Zustand；不让 Router loader 承担服务端缓存。

## 5. API Client

`src/services/api/`：

- `request.ts`：单次 `fetch`，`credentials: 'include'`，`cache: 'no-store'`；超时/取消/网络失败返回 `transport-error`。
- `response.ts`：Zod 宽松解析 `{data|error, operation}`；缺字段填 `null`，不补造状态。
- `errors.ts`：`classifyWriteOutcome` 是写结果唯一分类入口（`applied | rejected | unknown`）；`requireData` 用于只读查询。
- `client.ts`：写请求注入 `X-CSRF-Token` 与 `Idempotency-Key`；响应带回请求发起时的 `sessionEpoch`。

新增接口时：
1. 先在调用方定义/复用后端公开类型与 Zod 边界（不要手写第二套 DTO）；
2. 只读查询用 `requireData` 抛 `ApiOutcomeError`；
3. 写请求必须消费完整 outcome，禁止用 `response.ok` 直接判断业务结果；
4. 任何写请求不得自动重试，不得更换原操作标识。

## 6. 金融数值与时间

- 金额/股数/本金：`DecimalTextInput` + Zod 校验；展示用 `formatDecimal`（Intl 直接格式化字符串，不回填）。
- 时间：`UtcDateTimeField` 以 UTC 文本为权威值；`lib/time/instant.ts` 负责解析/格式化，`lib/time/zoned.ts` 负责 IANA 墙钟 → UTC 与 DST 消歧。
- 禁止用 `Number` 做金融计算，禁止用 `Date` 做时间无损往返；`Date` 只用于展示。
- 新增时区支持需要扩展 `resolveZonedWallClock` 的候选探测（当前按 ±1 小时覆盖整小时 DST 跳变）。

## 7. 测试

- 单元测试：`tests/unit`；组件/协议集成：`tests/integration`；E2E：`tests/e2e`。
- jsdom 缺少的浏览器 API 在 `tests/setup.ts` 补齐：ResizeObserver、IntersectionObserver、matchMedia、scrollIntoView、pointer capture、`HTMLDialogElement.showModal/show/close`。只补行为，不放宽断言。
- MSW 3：`setupServer(...).listen()` 不支持 `onUnhandledRequest`；Node fetch 需绝对 base URL（`http://localhost/api/v1`）。
- Astryx 错误/Toast 文本会同时出现在可见节点与 live region，查询用 `findAllByText` 或 `.first()`，不要用唯一匹配断言。
- Astryx 禁用态是 `aria-disabled` + `readonly`，不要断言原生 `disabled`。
- Playwright 使用 `channel: 'chrome'`，baseURL 用 `http://localhost:<port>`（Vite 绑定 localhost），`reuseExistingServer: true`。

## 8. 代码规范

- Biome：2 空格缩进、行宽 110、单引号、语句分号、LF。
- TypeScript 严格模式：`strict`、`noUncheckedIndexedAccess`、`noImplicitOverride`、`verbatimModuleSyntax`、`isolatedModules`；禁止 `any`。
- 按功能组织文件，避免单文件膨胀；不为局部问题引入新抽象层。
- 不引入第二套 UI 库、Axios、WebSocket 客户端、TanStack Form、TanStack Virtual（按需再评估）。

## 9. 当前边界

仅完成工程底座：无登录、账户、证券、订单、任务、持仓、账本、管理业务；无真实 API/SSE 连接；无 Session Epoch 状态模块、Business SSE Manager、Operation Recovery 模块。详见 `docs/changes/0066-frontend-bootstrap.md`。
