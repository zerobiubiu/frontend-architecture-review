# 前端底座独立审查问题修复与复验

- 状态：已执行；本文件为一次已完成的修复记录，定稿后不重写，后续变化另建编号。
- 影响范围：`frontend/` 源码、测试、测试配置与开发演示；`backend/` 只读，零改动。
- 基线：本地分支 `astryx-dev`，起始 HEAD `17cd8dc9715b2a21cc77dec8f88bb6be9cd6fe56`；公开审查快照提交 `e91981da2f113bb9873559e6819530dbd2cacbe2` 仅用于对照，本地不存在该提交，未切换/重置/回退。
- 输入：[独立审查报告](../../review-inputs/frontend-bootstrap/frontend-independent-review-e91981da.md)、[修复任务书](../../review-inputs/frontend-bootstrap/frontend-review-fix-agent-prompt.md)、审查证据 ZIP（探针源码与 JSON 结果）。
- 结论：REV-01～REV-07 全部成立并已修复；第 10 节补充事项逐项处置，无遗留阻塞本阶段验收的问题。

## 1. 复核方法与证据等级

1. 逐项读取当前源码、调用方、既有测试与后端公开契约（`backend/contracts/validation.ts`、`backend/src/domain/tasks/scheduled-start.ts`、`backend/src/services/trading/tasks.ts`、`backend/src/server/app.ts`、`backend/src/server/events.ts`）。
2. 成立的问题先写回归测试，在旧实现上执行并记录失败；再最小修复，重跑同一用例。
3. 修复前探针（临时文件，执行后已删除）：
   - API 分类旧实现：新增 16 条用例，14 失败、2 通过；`classifyWriteOutcome` 返回字符串，`.attempt` 为 `undefined`，401/403/404/409/422/429 均被归为 `rejected`。
   - UTC 字段旧组件（`git show f82fed1:...` 拷入临时测试）：纽约 gap 未解决时真实 RHF 提交回调仍被调用 1 次。
   - 十进制/时间旧实现：新增 9 条用例全部失败（20 位精度求和、尾零被判超限、年份 0000 被接受）。
   - 主题 CSS：修复前 Chromium E2E 断言显式浅色 `colorScheme === 'light'`，实际为 `light dark`。
   - 离线写：旧全局 `networkMode:'online'` 探针复现“离线暂停、联网后自动调用 mutationFn 1 次”。
4. 说明：审查报告的纯函数探针、CSS 隔离探针与本轮完整项目运行是不同证据等级；本记录只把本轮实际执行的命令与浏览器结果写成“通过”。

## 2. 主问题逐项处置

| 编号 | 复核结论 | 根因 | 修复文件与函数 | 回归测试 | 修复前结果 | 修复后结果 | 剩余限制 |
|---|---|---|---|---|---|---|---|
| REV-01 | 成立 | `classifyWriteOutcome` 把无回执的 4xx 当作原意图 `rejected`，混淆“本次 HTTP 尝试”与“原 ID 历史结论” | `services/api/errors.ts`：新增 `WriteAssessment`（`attempt`/`intent`/`reason`）、`receiptMatchesRequest`、`LOCAL_PRE_SEND_REJECTION`；重写 `classifyWriteOutcome(outcome, expected?)`；`types.ts` 增加 `attempted` | `tests/unit/api-errors.test.ts`：4xx/`operationAccepted:false` 持续 unknown；REJECTED 需匹配 id/kind/target；ID 不匹配 → `receipt-mismatch`；`tests/integration/api-client.test.ts` 401/403/409/422 断言 | 旧测试 14/16 失败；401 断言得到 `rejected` | 110 个 Vitest 全部通过；4xx 只影响 `attempt`，`intent` 保持 unknown | 恢复 UI 尚未实现；身份匹配需调用方传入原 ID/kind/target |
| REV-02 | 成立 | `parseOperation` 把缺失与校验失败都折成 null；成功信封无回执 → applied；错误信封畸形时丢失 operation | `services/api/response.ts`：`ReceiptParse` 三态、`parseReceipt`/`parseReceiptFromEnvelope`/`parseDataEnvelope`；`request.ts` 分层解析并保留 receipt；`types.ts` 用 `receipt` 替代 `operation`；`errors.ts` invalid 永不 applied、`validReceiptOf` | `tests/integration/api-client.test.ts`：200+未知 status/未知 kind/缺 id → invalid；有效回执+畸形 error → malformed 仍保留回执；ID 不匹配；扩展字段；2xx 无回执 unknown | 旧实现把无效回执当 absent → applied；畸形 error 丢回执 | 18 条 API 集成用例通过；invalid/mismatch 一律 unknown | `data` 仍按调用方泛型 `as T` 使用，业务 DTO 运行时校验需各 Feature 自行补 Zod |
| REV-03 | 成立 | `nyDraft`/`zoned` 与父表单 UTC 值脱节；无效草稿只显示文字，不参与提交校验 | `components/ui/utc-datetime-field.tsx`：`onEditingStateChange` 有效性协议、`resetToken`、外部 value 同步、显式清空、模式切换草稿同步、NY 输入 ref/status、`locked` 覆盖模式切换/清空/候选 RadioList；`routes/dev/playground-page.tsx`：`scheduledStartEditValid` 字段参与 Zod resolver，错误 Banner，reset token | `tests/integration/utc-datetime-field-rhf.test.tsx`（11 条，真实 RHF 回调）：gap、fold 未选、空值+非法草稿均不提交；候选选择/清空/重置/外部更新/模式切换；readonly 候选禁用；disabled 不能切换模式；`tests/integration/utc-datetime-field.test.tsx` 同步新文案 | 旧组件探针：gap 未解决仍提交 1 次 | 19 条 UTC 组件/RHF 用例通过；浏览器 E2E 提交门禁通过 | 表单是演示模型，非真实任务编辑器；“清空草稿”立即提交空值属于显式清空语义 |
| REV-04 | 成立 | 直接使用 decimal.js 默认 `precision=20`，`.plus()` 会舍入到 20 位有效数字 | `lib/decimal/decimal.ts`：`Decimal.clone({precision:50, rounding:HALF_EVEN, toExpNeg:-100, toExpPos:100})`、`DECIMAL_CONTEXT_PRECISION`、`DECIMAL_MAX_SIGNIFICANT_DIGITS`；超 50 位有效数字返回 `precision` 错误；`normalizeDecimalText` 输出无指数并保持闭包 | `tests/unit/decimal.test.ts`：`999999999999.123456789012345678 + 0.000000000000000001`、尾数进位、1000 行累计、正负抵消、超界拒绝、规范化闭包 | 9 条新增用例失败（默认 20 位） | 24 条 decimal/time 用例通过；结果精确到 31 位 | 上下文按 50 位设计（协议 numeric(38,18) + 12 位余量）；超界输入拒绝而非无限精度 |
| REV-05 | 成立 | 按原始小数总长度限制 ≤6，未按“去尾零后的有效小数”；年份允许 0000 | `lib/time/instant.ts`：`validateFields` 改为有效小数（`replace(/0+$/,'')`）、年份 1–9999；raw 原样保留；历史未改值透传依赖 raw 不经规范化 | `tests/unit/time-instant.test.ts`：`.123456000Z`/`.0000000Z` 接受并保 raw；第七位有效小数拒绝；0000 拒绝、0001/9999 接受；历史原串往返；纽约墙钟同规则 | 9 条新增用例失败（尾零误判、0000 接受） | 通过 | 未新增独立“历史原值绕过”开关；后端契约保证存量值有效，前端只保证 raw 不被重写 |
| REV-06 | 成立 | `@layer components` 中无条件 `:root{color-scheme:light dark}` 覆盖 `astryx-theme` 的显式 light/dark | `styles/index.css`：删除业务层 `color-scheme` 声明，保留注释说明主题唯一负责 | `tests/e2e/playground.spec.ts`：四种系统/显式组合的 `colorScheme`、根背景、Card、输入框颜色/边框；Dialog/Drawer/Toast Portal 背景；system 模式随系统偏好 | 修复前 E2E：显式浅色得到 `light dark` | 修复后 E2E 通过；显式 light/dark 生效，跨系统同显式模式颜色一致 | 仅 Chromium/Chrome；Firefox/WebKit 未验证 |
| REV-07 | 成立（风险门槛） | `retry:false` 不阻止 `networkMode:'online'` 的暂停/恢复发送；全局默认不适合敏感写 | 新增 `services/api/sensitive-write.ts`：`createSensitiveWriteGate`、`createSensitiveMutationOptions`（`networkMode:'always'` + `retry:false` + 发送前门禁）、`SensitiveWriteBlockedError`；`providers/query-client.ts` 注释明确全局默认不足；Playground 增加仅本地演示 | `tests/integration/sensitive-write.test.tsx`（4 条）：离线不调用 Fetch、联网不自动发送、会话/账户/确认变化阻止、错误类型；`tests/e2e/playground.spec.ts`：真实浏览器离线→恢复网络仍 0 次 | 旧 `networkMode:'online'` 探针：联网后 mutationFn 自动调用 1 次 | 4 条集成 + 1 条浏览器用例通过；新旧配置差异被测试固定 | 会话/账户/确认上下文仍是注入的最小上下文，完整 Session Epoch 模块未实现；真实交易 mutation 未接入 |

## 3. 第 10 节补充事项处置

| 事项 | 处置 | 证据 | 状态 |
|---|---|---|---|
| 10.1 `/healthz` 503 data | `types.ts` 新增 `http-data`；`request.ts` 在错误信封不可用时解析 `data` 并保留 receipt；`http-data` 不是 success，分类为 unknown，`requireData` 仍抛错 | `tests/integration/api-client.test.ts` healthz 503 用例 | 已修复 |
| 10.2 SSE 缺省 resources | `realtime/types.ts` 增加 `scope:'declared'|'all'`、`unknownResources`、`invalid` 帧；`parse.ts` 区分缺省（有界全量）、空数组（无变化）、未知资源、畸形帧 | `tests/unit/realtime-parse.test.ts` 5 条 | 已修复（仅解析层，无 Manager） |
| 10.3 表格控件能力 | 仅在 `onSortingChange` 存在时渲染排序按钮与 `aria-sort`；移除 `data`/`columns` 复制；JSDoc 明确仅支持单行表头；新增真实 `totalItems` 收缩 rerender 用例 | `tests/integration/data-table-shell.test.tsx` 7 条 | 已修复 |
| 10.4 Mock 边界 | 删除演示 `reduceOnly`；订单类型标注“演示，不对应后端字段契约”；表单顶部 Banner 说明非接口验收依据；handlers 注释标明 `details.fields` 非公开契约字段 | `playground-page.tsx`、`tests/msw/handlers.ts` | 已修复（演示模型，未宣称契约对接） |
| 10.5 验证可信度 | Playwright 默认不再复用现有服务（需显式 `PLAYWRIGHT_REUSE_SERVER=1`）；`theme:check` 纳入本轮验收；覆盖率仅按实际数字报告、未设阈值；Bundle/字体/sourcemap 作为已知限制记录，不硬拆 | `playwright.config.ts`、本文件第 4 节 | 已处置 |

## 4. 本轮执行验证

环境：Windows 10.0.26300 x64；Bun 1.4.3；Node v24.22.0；Playwright 1.65.0；Chrome 155.0.8059.85。工作目录 `frontend/`。

| 命令 | 实际输出 | 结果 |
|---|---|---|
| `bun install --frozen-lockfile` | `Checked 305 installs across 342 packages (no changes)` | 通过 |
| `bun run typecheck` | `tsc -b --noEmit` 无输出，exit 0 | 通过 |
| `bun run lint` | `Checked 60 files … No fixes applied` | 通过 |
| `bun run test:run` | 13 个测试文件、110 个用例全部通过 | 通过 |
| `bun run test:coverage` | Statements 91.15%（464/509）、Branches 84.25%（412/489）、Functions 84.29%（102/121）、Lines 92.65%（416/449） | 通过（无阈值） |
| `bun run theme:check` | `Theme outputs are up to date` | 通过 |
| `bun run build` | HTML 0.54 kB；CSS 300.41 kB（gzip 46.76）；JS 871.99 kB（gzip 267.48）；Tooltip 懒加载 2.08 kB；>500 kB 警告 | 通过（有警告） |
| `bunx playwright test` | 10 个用例全部通过（连续两次完整套件均 10 passed） | 通过 |
| 生产隔离（`bun run preview` + 浏览器） | `/dev/playground` 渲染“页面不存在”，无 Playground 组件/导航入口，Console 无消息 | 通过 |

浏览器验证范围：

- RHF 提交门禁：gap 阻止提交、修复后提交正确 UTC（`playground.spec.ts:277`）。
- 主题 computed styles：四种系统/显式组合 + Card/输入框 + Dialog/Drawer/Toast Portal（`:168`）。
- 离线敏感写：`context.setOffline(true)` → blocked，恢复网络后仍 0 次（`:300`）。
- 生产 Playground 隔离：构建后 preview 实测（非 E2E 套件，使用 chrome-devtools 实际打开）。

未执行：Firefox/WebKit；真实后端/登录/CSRF/SSE；真实账户或交易；CI 环境。未跳过任何 Vitest/Playwright 用例，无失败用例。覆盖率命令退出 0 不代表达到阈值。

## 5. 变更文件清单

修改（23）：

- `frontend/playwright.config.ts`
- `frontend/src/app/providers/query-client.ts`
- `frontend/src/components/ui/data-table-shell.tsx`
- `frontend/src/components/ui/utc-datetime-field.tsx`
- `frontend/src/lib/decimal/decimal.ts`
- `frontend/src/lib/time/instant.ts`
- `frontend/src/routes/dev/playground-page.tsx`
- `frontend/src/services/api/errors.ts`
- `frontend/src/services/api/request.ts`
- `frontend/src/services/api/response.ts`
- `frontend/src/services/api/types.ts`
- `frontend/src/services/realtime/parse.ts`
- `frontend/src/services/realtime/types.ts`
- `frontend/src/styles/index.css`
- `frontend/tests/e2e/playground.spec.ts`
- `frontend/tests/integration/api-client.test.ts`
- `frontend/tests/integration/data-table-shell.test.tsx`
- `frontend/tests/integration/utc-datetime-field.test.tsx`
- `frontend/tests/msw/handlers.ts`
- `frontend/tests/unit/api-errors.test.ts`
- `frontend/tests/unit/decimal.test.ts`
- `frontend/tests/unit/realtime-parse.test.ts`
- `frontend/tests/unit/time-instant.test.ts`

新增（3 源码/测试）：

- `frontend/src/services/api/sensitive-write.ts`
- `frontend/tests/integration/sensitive-write.test.tsx`
- `frontend/tests/integration/utc-datetime-field-rhf.test.tsx`

本记录新增：`docs/changes/0067-frontend-bootstrap-review-fixes.md`，并回填 `docs/README.md`、`docs/changes/README.md`。`frontend/README.md`、`frontend/DEVELOPMENT.md` 仍是上一轮未跟踪文档，本轮未修改。未修改生成主题文件。

## 6. 工作区与 backend 核对

- 起始：分支 `astryx-dev`，HEAD `17cd8dc`，工作区仅有上一轮未跟踪的 `frontend/README.md`、`frontend/DEVELOPMENT.md`。
- 结束：23 个已跟踪文件修改 + 3 个新增源码/测试 + 2 个既有未跟踪文档 + 本记录；未提交、未推送、未切换分支、未 stash/reset/clean。
- `git diff --stat -- backend` 为空；`git status --short -- backend` 无输出。未读取或启动后端服务，未连接数据库/账户。

## 7. 最终回答

- **七项主问题是否全部修复或有证据证明不成立？** 七项均成立，均已修复并有修复前失败/探针与修复后通过证据；没有以“不成立”关闭的项。
- **是否仍有阻碍本阶段验收的问题？** 无遗留阻塞项。Bundle 体积、字体、sourcemap、多浏览器、真实后端联调仍属已知限制，不阻止工程底座复验。
- **哪些结论通过 Mock/纯函数，哪些通过完整浏览器？** API 回执/分类、十进制、时间/DST、SSE、表格、离线门禁的细粒度行为由 Vitest/MSW/纯函数验证；RHF 提交门禁、主题 computed styles、离线门禁、生产 Playground 隔离通过真实 Chromium。未做真实后端联调。
- **当前底座是否具备重新接受独立审查的条件？** 具备。建议复审重点：`errors.ts` 的 attempt/intent 语义、`parseReceipt` 三态、`onEditingStateChange` 协议、Decimal 50 位边界、主题层唯一性、敏感写门禁的注入上下文。
