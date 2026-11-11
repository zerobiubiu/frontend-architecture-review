# 前端工程底座独立源码审查

## 1. 审查对象与结论

- 仓库：`zerobiubiu/frontend-architecture-review`
- 固定提交：`e91981da2f113bb9873559e6819530dbd2cacbe2`
- 审查日期：2026-11-10
- 范围：已公开前端快照中的核心实现、对应单元/组件/E2E 测试、主题生成物与构建配置；对照用户提供的后端概览及两轮架构报告。
- 未修改、提交或推送用户仓库；没有连接后端、数据库或资金账户。

**结论：保留现有技术方向，不重建工程、不更换 Astryx。但当前不能出具“工程底座无问题”的验收结论。应先修正下列已发现问题，再验收本阶段；本报告不安排第二阶段业务开发。**

此前交付记录中的 63 个测试、7 个浏览器用例、覆盖率和构建结果是原执行者提供的证据，不能代表本次重新运行了同一套测试。

### 本次实际验证

1. 通过 GitHub 连接器按固定提交读取源码；不是仅阅读交付摘要。
2. 将 `instant.ts`、`zoned.ts`、`errors.ts` 保存到隔离探针目录；逐字节计算 Git blob SHA-1，与仓库返回的 blob SHA 一致。
3. 使用本地 Node 22.16.0 和 TypeScript 的 transpileModule 执行这些纯函数。此过程不等于项目类型检查或全套 Vitest。
4. 使用本地 Chromium + Playwright 对仓库中冲突的 CSS 声明做隔离浏览器探针。此过程不等于运行完整 Astryx 应用。
5. 查阅 decimal.js 10.6.0 发布源码的默认精度，以及 TanStack Query v5 官方网络模式文档；外部资料与项目源码证据分别使用。

### 本次未完成的验证

本地环境没有 Bun，且容器无法解析 GitHub 主机；因此未完成 `git clone`、固定锁文件依赖安装、完整 typecheck/lint/Vitest/build、Astryx 全页面运行及项目 Playwright 重跑。已改用 GitHub 逐文件读取，不需要再次上传压缩包。

公开快照也没有原始后端代码和原仓库完整历史；对“backend 零改动”不作独立 Git 审计认证。

## 2. 问题清单总览

| 编号 | 问题 | 证据等级 | 处置 |
|---|---|---|---|
| REV-01 | 无回执的所有 4xx 被归为 rejected | 精确源码纯函数探针复现 | 必修，不能作为原意图未执行的证据 |
| REV-02 | 格式无效的 operation 被当作不存在，可能落入 applied | 源码控制流可确定；未跑该版本 Zod 集成 | 必修，保留 absent/valid/invalid 三态 |
| REV-03 | 纽约时间草稿无效或未消歧时，旧 UTC/空值仍可提交 | 组件与表单源码联合确认 | 必修，组件错误必须参与表单提交门禁 |
| REV-04 | sumDecimal 使用 decimal.js 默认 20 位有效数字 | 项目源码＋10.6.0 发布源码确认 | 必修，定义独立计算上下文与范围 |
| REV-05 | 时间精度规则与后端有效小数规则不一致；允许年份 0000 | 精确源码探针复现＋报告契约对照 | 修正公开输入与既有值保留边界 |
| REV-06 | components 层覆盖显式主题的 color-scheme | CSS 隔离 Chromium 探针复现 | 必修并补整应用 computed-style 回归 |
| REV-07 | retry:false 不阻止 online 模式下离线 mutation 延后发送 | 当前配置＋v5 官方机制确认；本项目完整队列场景待跑 | 交易 mutation 接入前必须落实 fail-fast 门禁 |

“必修”表示不能把当前实现当作已验收基础模块继续复制，不表示现在已经发生了真实交易事故。当前项目尚无真实交易 Feature。

## 3. REV-01：不能把 HTTP 4xx 直接当成原操作未应用

### 位置

- `frontend/src/services/api/errors.ts` → `classifyWriteOutcome()`（第 23–35 行）
- `frontend/tests/unit/api-errors.test.ts` → “无回执的 4xx 视为未应用，5xx 视为未知”
- `frontend/tests/integration/api-client.test.ts` → 401 分支同样断言 rejected

### 当前代码

```ts
case 'http-error':
  if (outcome.operation) return classifyOperation(outcome.operation);
  return outcome.status >= 400 && outcome.status < 500 ? 'rejected' : 'unknown';
```

### 已运行结果

没有 operation 时，401、403、404、409、422、429 均得到 `rejected`。

### 为什么有问题

后端报告已明确：`operationAccepted:false` 仅表示当前 HTTP 尝试未进入登记，不能证明同一原 ID 以前没有应用。403/404/409 也可能是权限、寻回不可见、原 ID 参数冲突或对象冲突，不是“原意图未执行”的证据。

场景：第一次 K 请求的响应丢失；后续对 K 的尝试返回无回执 401/409。当前分类器将其归为 rejected。将来恢复 UI 若据此清理 K 或开放新意图，会破坏跨刷新未知保护。

### 建议

- 分开建模“本次 HTTP 尝试”和“原订单/原操作”的结论。
- 原意图是否未应用，只能依据与原 ID 匹配的可信业务证据。
- 缺少原回执或订单证据时，不以 4xx 状态码自动升级为 rejected。
- 当前确实在发送前本地拒绝的新请求，可单独表示 `not-sent`；不要与原意图结论合并。
- 修改上述错误测试断言，不是仅补更多正常状态测试。

### 验收

第一次响应丢失，随后分别收到 401/403/404/409/429（无回执）、`operationAccepted:false`，原未解决记录仍保留，不能自动创建新 key，也不能显示“已确认未执行”。

## 4. REV-02：operation 无效与不存在不能都变成 null

### 位置

- `frontend/src/services/api/response.ts` → `parseOperation()`、`parseSuccessEnvelope()`、`parseErrorEnvelope()`
- `frontend/src/services/api/request.ts` → 响应分支
- `frontend/src/services/api/errors.ts` → success 分支

### 当前行为

`parseOperation()` 对缺失值和校验失败都返回 null。`parseSuccessEnvelope()` 只检查是否有 data，随后把无效 operation 解析为 null。`classifyWriteOutcome()` 则把“成功信封且 operation 为 null”归为 applied。

### 最小反例

```json
{
  "data": null,
  "operation": {
    "id": "11111111-1111-4111-8111-111111111111",
    "kind": "TASK_CONTROL",
    "status": "UNRECOGNIZED_STATUS"
  }
}
```

若 HTTP 为 200，当前控制流：operation 校验失败 → null → 成功信封 → applied。它实际上只有“无法识别回执”的证据。

另一路径是：错误信封结构不合法，但原始 JSON 中有可解析的 operation；request.ts 直接返回 `malformed` 并设 operation:null，丢失可用于恢复的信息。

### 建议

将回执解析结果区分为：

```ts
type ReceiptParseResult =
  | { kind: 'absent' }
  | { kind: 'valid'; receipt: OperationReceipt }
  | { kind: 'invalid'; raw: unknown };
```

- operation 存在但无法识别时，保留 unknown/protocol-error，不得变成 applied。
- 响应信封、data、error、operation 分层解析；不要让其中一部分损坏抹掉其余可信证据。
- 在领域适配层验证回执与请求原 ID/kind/target 的关联。
- 未承诺运行时校验的数据不能仅用 `data as T` 宣称已验证。

### 验收

覆盖无效状态、缺 id/kind、未知未来字段、有效 operation＋畸形 error、回执 ID 不匹配。均不得误判原业务成功，且诊断/恢复线索保留。

## 5. REV-03：纽约时间草稿与表单值脱节

### 位置

- `frontend/src/components/ui/utc-datetime-field.tsx` → `applyNewYorkDraft()`、纽约分支与 DST RadioList
- `frontend/src/routes/dev/playground-page.tsx` → `orderDraftSchema.scheduledStartAt` 与该字段 Controller
- `frontend/tests/integration/utc-datetime-field.test.tsx`

### 当前行为

`nyDraft`、`zoned` 是组件内部状态；真正的表单值是父级 UTC 字符串 `value`。

草稿为空、格式错误、春季不存在、秋季尚未选择时，函数只更新局部状态并 return，不通知父表单“当前编辑无效”。父表单继续保留此前有效 UTC，或者保留允许通过可选字段校验的空字符串。

Playground 的 Zod 规则只检验 `value === '' || parseUtcInstant(value).ok`，看不到纽约草稿和未解决的 DST 状态。

### 可执行复现步骤

1. 在 RHF 演示表单填写合法必填项。
2. 为计划开始设置合法 UTC。
3. 切换纽约输入，填 `2026-03-08 02:30:00`；不修复错误。
4. 提交演示表单。
5. 源码路径允许旧 UTC 通过 Zod；没有字段级或表单级的草稿有效性门禁。

秋季重复时间未选择、清空纽约草稿、外部 reset 后草稿不同步也需覆盖。

这不是 DST 算法没有识别出来，而是识别结果没有进入提交控制。

### 相关问题

- 纽约分支没有展示外部 `status`，也未绑定输入 ref，可能丢失 RHF 错误展示/聚焦。
- `isDisabled/isReadOnly` 未覆盖模式切换和候选 RadioList；在已出现候选后切成只读，仍有修改值的路径。
- `nyDraft` 未与外部 value/reset 明确同步。

### 建议

使用明确的字段编辑状态：已提交 UTC、当前草稿、编辑模式、解析状态、消歧结果。通过 form validator、Controller 适配或显式 validity 接口让无效/未决草稿阻止提交；不能仅展示错误文字。

不能只把非法草稿统一写成空串来修复：可选字段空串会通过验证，且“未设置”和“正在编辑但无效”不是同一状态。

### 验收

在真实 RHF 提交测试中确认：gap、fold 未选、无效格式不调用提交回调；明确清空按产品语义提交空值；reset 与模式切换无旧草稿；disabled/readonly 下全部子控件不能改值。

## 6. REV-04：十进制输入无损不等于计算无损

### 位置

- `frontend/src/lib/decimal/decimal.ts` → 直接默认导入 Decimal、`sumDecimal()`
- `frontend/tests/unit/decimal.test.ts` → 求和用例
- 外部依据：decimal.js `v10.6.0/decimal.js` 的 DEFAULTS：precision=20、rounding=4。

### 当前行为

构造 Decimal 可以保留输入，比较也不需要先转 Number；但 `.plus()` 的运算结果受 Decimal 构造器精度配置约束。项目未配置独立计算上下文，使用 20 位有效数字默认值。

### 回归输入

```ts
sumDecimal([
  '999999999999.123456789012345678',
  '0.000000000000000001',
]);
```

数学上的准确结果为：

```text
999999999999.123456789012345679
```

按 decimal.js 10.6.0 默认 20 位有效数字执行加法，结果会被舍入为：

```text
999999999999.12345679
```

这是源码与所用库默认规则的确定性推导；本轮未安装该 npm 依赖执行此用例。

### 建议

- 用 `Decimal.clone()` 建立项目专属上下文，避免修改共享默认构造器。
- 根据协议最大位数、聚合行数上限、可能的中间运算确定精度；例如沿后端已描述的 50 位精度起步，并验证其对前端全部运算边界是否足够。
- 舍入策略显式定义，展示与计算分开；不要因为“精确库”就默认不存在舍入。
- `normalizeDecimalText()` 使用 `.toString()` 会对很小值输出指数形式，而 `isDecimalString()` 拒绝指数；若需要可再次解析的规范化十进制文本，应使用非指数输出并测试闭包性质。

### 验收

覆盖 12 整数＋18 小数的求和、尾数进位、多行累计、正负抵消、50 位上下文边界；另测 `normalizeDecimalText('0.00000001')` 的输出是否满足约定。

## 7. REV-05：时间校验与后端契约不一致

### 位置

- `frontend/src/lib/time/instant.ts` → `validateFields()`（第 48–61 行）
- 依据：后端第一轮报告 8.4、第二轮报告 8.4：去尾零后最多六位有效小数秒，年份范围 0001–9999，未修改的历史原串另有保留边界。

### 本轮纯函数实际结果

| 输入 | 当前结果 | 按已提供契约 |
|---|---|---|
| `2026-11-10T01:23:45.123456Z` | 接受并保留原串 | 正确 |
| `2026-11-10T01:23:45.123456000Z` | fraction-digits 错误 | 尾零不增加有效精度，不应据总长度拒绝 |
| `2026-11-10T01:23:45.0000000Z` | fraction-digits 错误 | 同上 |
| `0000-01-01T00:00:00Z` | 接受 | 超出报告给定年份范围 |
| `2026-02-30T00:00:00Z` | 拒绝 | 正确 |

### 建议

- 仅以去尾零后的小数串检验有效精度，传输 raw 保持原样。
- 增加年份上下限。
- 新输入验证与未改既有值透传分开；不能让通用输入控件强行重写后端已允许保留的历史原值。
- 不把 epochMillis 用作微秒级等价判断，普通展示保留 Date 辅助不构成问题。

## 8. REV-06：主题 CSS 层覆盖显式模式

### 位置

- `frontend/src/styles/index.css` → `@layer components { :root { color-scheme: light dark; } }`
- `frontend/src/theme/generated/binance-stocks.css` → astryx-theme 层内 `html[data-theme="light|dark"]`
- `frontend/tests/e2e/playground.spec.ts`、`tests/integration/theme-dialog.test.tsx`

### 两组冲突声明

```css
@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;
@layer astryx-theme {
  :root { color-scheme: light dark; }
  html[data-theme="light"] { color-scheme: light; }
  html[data-theme="dark"] { color-scheme: dark; }
}
@layer components {
  :root { color-scheme: light dark; }
}
```

对于普通声明，后声明的层优先于前层，先于选择器 specificity 判断。上面的 components 规则覆盖主题的显式选择。

### 已执行隔离 Chromium 探针

使用仓库原声明和生成主题的 `light-dark()` 颜色 token：

| 系统偏好 | 显式 data-theme | computed color-scheme | computed 背景 |
|---|---|---|---|
| light | light | light dark | rgb(241, 241, 241) |
| light | dark | light dark | rgb(241, 241, 241) |
| dark | light | light dark | rgb(27, 27, 27) |
| dark | dark | light dark | rgb(27, 27, 27) |

探针确认了已提交 CSS 的层冲突；完整 Astryx 运行时/portal 页面仍需在原工程复跑确认。

当前 E2E 与 RTL 主要断言 data-theme 属性；Vitest 配置 css:false。它们不能证明实际颜色按显式模式切换。截图文件的生成也不是截图差异断言。

### 建议

- 移除业务 components 层对根 color-scheme 的无条件覆盖；由主题唯一负责。
- 不手工修改生成 CSS，不使用 !important 掩盖层级问题。
- 增加系统 light/显式 dark、系统 dark/显式 light 的 computed-style 断言。
- 检查 body、Card、输入框、Dialog/Drawer/Toast portal，而不是只查 html 属性。

## 9. REV-07：禁止重试不等于禁止离线延后发送

### 位置

`frontend/src/app/providers/query-client.ts`：

```ts
mutations: {
  retry: false,
  networkMode: 'online',
}
```

### 机制边界

TanStack Query v5 官方文档说明，online 模式下 Query/Mutation 在离线状态不开始网络工作；这与失败后的 retry 次数是不同机制。在恢复连接后，暂停的 mutation 存在继续执行路径。

因此不能把 `retry:false` 宣称为“写请求永远不会自动延后发送”。初始离线时未发送、之后自动首次发送，也可能执行一份已经过时的交易意图。

当前工程没有真实交易 mutation；本项是现有全局默认值在接入交易前必须处理的风险，不是声称当前项目已执行过错单。本轮未安装固定版本 Query 重跑完整暂停队列。

### 建议

- 为敏感写操作定义 fail-fast 提交门禁，离线时不进入可续发队列。
- 选定 networkMode 与业务前置检查的组合；不能只设置 retry:false。
- 发送前再次核对会话代次、目标账户、原 ID 和用户确认有效性。
- 网络恢复不自动重放交易意图，也不持久化恢复 mutation 队列。
- 一旦网络请求可能已经发送，超时/中断仍按未知结果处理；不能误认为“本地已取消”能撤销服务端。

### 验收

用 OnlineManager/真实浏览器离线模拟：离线点击操作→恢复网络→若用户未重新明确确认，Fetch 调用数应仍为 0；另测会话/账户在暂停期间变化。

## 10. 需要补充但不应混成交易缺陷的事项

### 10.1 /healthz 的 503 data 信封

`request.ts` 非 2xx 只尝试 error 信封。已提供后端契约规定 /healthz 503 仍可携带 data。当前会归为 malformed，无法正常消费降级健康详情。

建议增加明确的 endpoint 适配/保留 data 的传输模型，不把所有非 2xx data 当业务成功。当前还没接入健康页面，不作为已发生业务故障。

### 10.2 SSE 可选 resources

`realtime/parse.ts` 将 resources 声明为必填，解析失败统一 null 并作为“无提示”。报告中的公开 eventRefreshSchema 允许缺省，当前生产者通常补齐。

建议区分“无法识别”和“确定无变化”；按约定将缺 resources 的 refresh 视为授权范围内收敛提示，或先明确版本化的必填契约。不要因吞掉一帧就无限全站重取。

### 10.3 DataTableShell 控件能力

- `manualSorting:true` 是正确方向，但渲染排序按钮只看 column.getCanSort，未结合是否有 onSortingChange/后端能力。无回调时可能出现可点击但无效果的排序按钮。
- 每次渲染拷贝 data/columns，会打破引用稳定性；无需现在断言性能故障，但应检查是否有必要。
- 分组表头未显式处理 colSpan/isPlaceholder；当前都是平列，不影响当前演示。若不支持分组，请限制/说明 API，不必立即扩展通用组件。
- “分页控件不会在总数变化后保留旧页”测试没有改变 totalItems，没有 rerender，只点了 previous，实际只验证上一页回调。需改名或补真正的总数收缩用例。

### 10.4 Mock 不是公开业务契约

Playground/夹具中出现 `reduceOnly`、大写 `START`、模拟字段级 validation details 等演示结构，与后端报告并非完全一致。开发专用展示允许如此，但不能把它们复制成真实 Order/Task DTO 或说已经完成后端契约验证。

### 10.5 交付与可重复验证

- Bundle 871.70 kB 是原报告数据，本轮无 dist/构建重跑，不能定位根因。不要只为消警告硬拆 vendor；先做实际产物分析。
- sourcemap:true 已在 vite.config.ts 确认；发布是否对外暴露 .map 需单独明确，开发期不是漏洞证明。
- 字体加载与多浏览器覆盖是已知未完成事项，不是重新选 UI 的理由。
- `theme:check` 是独立脚本；可加入验收/CI，防止 theme 源改了但生成物未更新。
- Playwright `reuseExistingServer:true` 可能复用其他实例；CI/正式验收应验证目标进程身份或禁止复用。
- 覆盖率配置无阈值；不要把“覆盖率命令退出 0”称为达到验收阈值。

## 11. 可以保留的设计

1. frontend 独立 package.json 与 bun.lock；未发现需要改成根 workspace 的依据。
2. Astryx 为唯一主 UI，使用预编译主题和统一 Tabler 语义图标；不需要换 MUI。
3. QueryClient 由 AppProviders 的惰性 useState 创建，当前没有重复服务端缓存方案。
4. Playground 以 import.meta.env.DEV 条件注册并动态导入；保持开发/生产边界。
5. DecimalTextInput 本体保留字符串，不做 Number/范围钳制；问题在计算上下文，不是需要换控件。
6. 表格分页由调用方拥有，当前不引入第二套客户端分页；业务资源能力仍须显式控制。
7. UTC 普通常规六位输入 raw 保留、非法日历拒绝，以及 2026 年纽约 DST 两个具体边界，在本轮纯函数探针中通过。
8. API 先解析 body、保留已识别非 2xx operation 的方向正确；需要补齐保守分类边界，而不是推倒传输层。

## 12. 本阶段复验清单

优先新增会在修复前失败的测试，不以增加用例数量替代行为断言：

- 无回执的 401/403/404/409/429 不解除原未知记录。
- malformed operation 不被降级成“未携带 operation”并归为 applied。
- gap/fold 未选/无效纽约草稿阻止 RHF 提交；旧 UTC 不被静默提交。
- readonly/disabled 的全部候选控件不能改值。
- 最大本金精度加法与累计保持预期结果。
- 有效尾零时间允许并原样保留；year 0000 拒绝；历史未改原串策略单独测试。
- 系统/显式相反主题的 computed styles 正确，portal 同步。
- 离线敏感 mutation 不在联网后自动发送。
- 健康 503 data、SSE 缺省 resources 按明确契约处理。
- 分页总数实际收缩测试，与无排序能力的表格控件测试。

所有修复限定前端本阶段模块与测试；不改变后端交易规则，不增加业务页面，不升级依赖来回避问题。上述修复完成后再出具本阶段复验结果。

## 13. 附带探针

- `source-hash-check.json`：三份纯函数源码与仓库 Git blob 哈希比对。
- `pure-function-results.json`：时间解析、纽约转换、API 分类的实际输出。
- `theme-layer-result.json`：四种系统/显式主题组合的 Chromium computed-style 结果。
- `theme_layer_probe.py`：CSS 声明最小浏览器探针。
- `source/` 与 `compiled/`：仅用于隔离验证的三个公开源文件及转译产物，不是修复版工程。

本轮审查结束。结论是先修本阶段明确问题，不推进下一阶段。
