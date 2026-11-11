# 前端底座第二轮独立源码核验

- 状态：已执行（审查已完成，不代表工程验收通过）。
- 日期：2026-11-10。
- 范围：第一阶段 `frontend/` 工程底座、当前测试、只读后端契约及相关实现。
- 结论：**不通过。存在 1 项下一阶段开发前必须关闭的 P1：原意图终态判断允许省略原请求身份。**
- 关联：[第一阶段交付](0066-frontend-bootstrap.md)、[上一轮修复记录](0067-frontend-bootstrap-review-fixes.md)、[原独立审查](../../review-inputs/frontend-bootstrap/frontend-independent-review-e91981da.md)。本报告不改写这些记录。
- 执行约束：只新增本报告；未修改现有源码、测试、配置、主题生成物、业务文档或后端，未安装依赖，未提交、推送、切换或重置 Git。未开始第二阶段。

## 1. 审查基线与方法

### 1.1 Git 基线

在仓库根实际执行：

```text
git status --short
git branch --show-current
git rev-parse HEAD
git diff --stat
git diff --cached --stat
```

结果：

| 项目 | 本轮事实 |
|---|---|
| 分支 | `astryx-dev` |
| HEAD | `0427627f3637b4363a51b5c1a79de65791237783`，`fix(dev): 修复前端底座审查问题` |
| 开始时工作区 | `git status --short` 无输出 |
| 开始时未暂存差异 | `git diff --stat` 无输出 |
| 开始时暂存区 | `git diff --cached --stat` 无输出 |
| 修复起始提交 | `17cd8dc9715b2a21cc77dec8f88bb6be9cd6fe56` 在本地存在，无须另选基线 |
| 相对起始提交 | 实际执行 `git diff --stat 17cd8dc9715b2a21cc77dec8f88bb6be9cd6fe56`：31 个文件，新增 2108 行、删除 311 行 |
| 变更范围 | `frontend/` 28 个文件、`docs/` 3 个文件；差异清单不含 `backend/`、包清单、锁文件或生成主题 |

另外实际执行 `git log -6 --oneline`、相对起始提交的 `git diff --numstat`，确认上述范围。公开提交 `e91981da2f113bb9873559e6819530dbd2cacbe2` 仅作为原审查对象标识，不要求本地存在，未对它执行 checkout 或其他工作区操作。

相对起始提交的重点变化是：API 结果/回执类型与分类、敏感写门禁、时间字段及演示表单适配、Decimal 上下文、时间解析、SSE 解析、表格、CSS 根声明、Playwright 服务复用配置，以及对应测试和修复说明。

### 1.2 独立核验方式

1. 重新读取当前真实源码、现有消费者、测试与后端相关契约，不以 0067 的“已修复”结论代替证据。
2. 并行只读审查 API/离线写入、时间/RHF、主题/表格；统一执行现有验证，不让分片重复跑套件。
3. 仓库外探针直接导入当前源码；Fetch 全量替身，不访问后端。另使用真实 TanStack `MutationObserver` 与项目 QueryClient 验证等待期间上下文变化。
4. 用完整前端的 Chromium 实际页面补验 computed styles、即时提交、fold 重置、离线演示和生产隔离。
5. 证据 ZIP 已查看目录及原纯函数/主题结果，其范围是旧快照探针；没有把旧结果计为本轮通过。

下文行号均为上述 HEAD 的现有文件行号。本轮不修改这些文件。LSP references 调用返回 `No language server found for this action`，调用路径改由源码引用检索和消费者阅读确认，未安装语言服务器。

证据等级：**源码**、**本轮可执行纯函数/Mock 探针**、**现有 Vitest/MSW/jsdom**、**真实 Chromium 前端**分别标明；没有真实后端、数据库、账户或资金服务运行证据。

## 2. 总体结论

**不通过；当前不能正式验收第一阶段，也不能以“底座已经验收”为前提进入第二阶段。**

这不是建议重建工程。现有技术方向、正常运行能力及大部分修复可保留。阻塞是一个具体且可局部修复的公共接口：`classifyWriteOutcome()` 允许没有原请求身份就确认 `applied` / `not-applied`，而本轮验收要求终态必须绑定原操作 ID/kind/target。

本轮已有检查全部通过，但测试通过没有覆盖或否定该反例。没有发现已发生的真实交易事故，也没有发现本轮证据足以定为 P0 的问题。

| 等级 | 数量 | 范围 |
|---|---:|---|
| P0 | 0 | 无已证实的当前关键交易事故或同等级阻塞 |
| P1 | 1 | R2-01：原意图终态身份约束可省略 |
| P2 | 3 | R2-02 数值输入域/闭包；R2-03 fold 提示；R2-04 既有时间极端支持域 |

历史时间编辑透传、后续 DTO 运行时校验及真实联调另列为接入约束，不冒充已经验收，也不要求本轮开发对应 Feature。

## 3. REV-01～REV-07 逐项复核

### 3.1 REV-01：HTTP 尝试与原始意图

| 字段 | 内容 |
|---|---|
| 编号 | REV-01 |
| 当前结论 | **部分修复**：attempt/intent 已拆分，终态身份约束未闭合 |
| 源码路径与行号 | `frontend/src/services/api/errors.ts:12-13,29-59,70-113`；`types.ts:80-130`；`client.ts:35-66`；`request.ts:41-68,138-149` |
| 函数/类型 | `WriteAssessment`、`OriginalOperationIdentity`、`receiptMatchesRequest`、`assessReceipt`、`classifyWriteOutcome`、`LOCAL_PRE_SEND_REJECTION`、`requestJson` |
| 对应测试 | `api-errors.test.ts:47`“无回执的 401/403/404/409/422/429…”；`:56`“operationAccepted:false…”；`:68`“只有匹配原 ID/kind/target 的 REJECTED…”；`:90`“SUCCEEDED 回执匹配原 ID…”；`:119`“超时/断网…”；`api-client.test.ts:96,158,207,217` |
| 实际验证 | §6 的现有单元/集成检查通过；仓库外 `core-boundaries.ts` 对六种无回执 4xx 均得到 `attempt:rejected,intent:unknown`；发送前取消不调用 Fetch，发送后超时保持 unknown；错 ID 在完整 expected 下为 receipt-mismatch，省略 expected 或传 `{}` 却为 applied |
| 风险 | 终态判断依赖调用者自愿提供身份，类型没有强制；现有测试示例还采用了不传身份的终态判断 |
| 建议 | **先关闭 R2-01，再准入下一阶段**；不需要实现 Operation Recovery 才能修正该接口 |

具体判断：

- 无回执 401、403、404、409、422、429 不再证明原意图未执行。`operationAccepted:false` 保留在错误体，不会把原意图升级为 not-applied。
- `LOCAL_PRE_SEND_REJECTION`、已取消但未发出的请求，都表示 not-sent/unknown；与服务端拒绝严格分开。
- Fetch 已执行后的超时/取消均保持 unknown，未发现自动换 key 或自动重试。
- 已有代码没有把 attempt 默认映射回 intent；二者也使用不同字面量，`rejected` 与 `not-applied` 不同。
- **但 `expected` 整体可选，身份内四个字段也全部可选。**未给身份时 `receiptMatchesRequest()` 直接返回 true；只给 id 时不会检查 kind/target。
- 当前 `src/` 没有真实写请求结果消费者或未知记录存储，分类消费者主要在测试中。因此“首次未知 → 后续无回执 401/409”在当前分类链上仍为 unknown，但**没有现成恢复记录消费者可验证跨刷新记录是否保留**。本轮不虚构一个恢复系统来宣称端到端已验收。
- `WriteAssessment` 强制调用者接收对象，不强制其只使用 intent，也不强制身份绑定。这是明确的未来调用方接口缺口，不是已发生交易影响。

### 3.2 REV-02：回执三态与分层解析

| 字段 | 内容 |
|---|---|
| 编号 | REV-02 |
| 当前结论 | **部分修复**：三态及回执保留已修复；可信终态仍受 REV-01 同一身份缺口影响，不重复计 P1 |
| 源码路径与行号 | `frontend/src/services/api/response.ts:15-29,42-81,89-117`；`request.ts:69-137`；`types.ts:32-59,80-118`；`errors.ts:70-82` |
| 函数 | `parseReceipt`、`parseReceiptFromEnvelope`、`parseOperationReceipt`、`parseErrorEnvelope`、`parseDataEnvelope`、`requestJson`、`assessReceipt` |
| 对应测试 | `api-client.test.ts:16,117,130,137,149,158,167`，分别覆盖 absent、未知 status/kind、缺 id、畸形 error、显式错 ID、扩展字段；`api-errors.test.ts:104,112,229` |
| 实际验证 | 现有检查通过；仓库外当前源码探针补验缺 kind、空 operation、畸形业务 data、有效回执+畸形 error、错误目标，三态不会将 invalid 降为 absent/applied |
| 风险 | 不传完整 expected 仍能采用不属于原请求的有效回执；`data as T`、raw 的适用边界必须保留 |
| 建议 | 保留分层解析设计，关闭共享身份门禁缺口；真实 DTO 接入时在业务边界校验 data |

解析矩阵：

| 输入情况 | 当前处理 |
|---|---|
| 没有 operation | absent；即使 HTTP 2xx，intent 也为 unknown |
| operation 缺 id / 缺 kind / 空对象 | invalid，保留 raw，intent 为 unknown |
| 未知 status / kind | invalid；不因有 SUCCEEDED 字样或 HTTP 2xx 就应用 |
| 有未来扩展字段 | looseObject 接受已知核心字段；原回执仍在 raw |
| 有效 operation + 畸形 error | 返回 malformed，但保留有效回执；是否采用终态仍须绑定原请求 |
| 畸形业务 data + 有效 operation | data 不做 DTO 校验，回执独立保留；回执状态不等于 data 合法或业务成功 |
| ID / kind / target 与完整 expected 不同 | unknown / receipt-mismatch |
| 没提供 expected 或只提供部分字段 | 未检查省略的身份字段，见 R2-01 |

**运行时与静态类型的区别：**

- 后端公开 Schema 是服务端契约；前端目前运行时验证了响应信封和回执核心字段。
- `parseDataEnvelope<T>()` 的 `record.data as T` 只影响 TypeScript，不执行 DTO 运行时校验。后续 Hono RPC 的类型推导同样不能自动替代运行时校验。
- 当前没有真实业务 DTO 解引用消费者；不能据此说已完成业务接口校验，也不应为底座预造全部 DTO。

**raw 信息流：**

- 有效/无效回执的 raw、合法 JSON 的 malformed body 都可能完整保留；它们不是脱敏数据。只有非 JSON 的诊断文本被截为 2000 字符。
- 当前未发现 raw/outcome 自动直接渲染、写入日志或持久化的路径；Query 错误对象可以在内存中持有完整 outcome，不等于已经写入持久日志。
- 后续诊断展示、日志或恢复持久化若消费 raw，必须先选择字段、脱敏及限制长度，不能序列化完整响应。当前没有该出口，不为理论风险新增日志框架。

### 3.3 REV-03：时间字段与 RHF 提交门禁

| 字段 | 内容 |
|---|---|
| 编号 | REV-03 |
| 当前结论 | **已修复原提交绕过；另有新 P2 提示错误 R2-03** |
| 源码路径与行号 | `frontend/src/components/ui/utc-datetime-field.tsx:31-55,84-198,202-299`；`routes/dev/playground-page.tsx:78-83,180-194,720-745,770-780`；`main.tsx:12-16` |
| 函数 | `UtcDateTimeField`、`applyNewYorkDraft`、`switchMode`、`clearValue`、编辑状态 effect、Playground 的 Controller/`handleSubmit` 接线 |
| 对应测试 | `utc-datetime-field-rhf.test.tsx:160,172,191,201,212,225,234,244,259`；原 `utc-datetime-field.test.tsx`；`playground.spec.ts:277` |
| 实际验证 | 现有检查通过；真实浏览器补验旧合法 UTC 不先清空、纽约直接替换 gap/非法格式/fold 后立即 Enter，未产生 submitted-json；fold→父表单重置稳定后草稿为空、候选消失；选择第二候选后提交正确 UTC |
| 风险 | 已选择 fold 后仍显示“尚未形成可提交时间”；辅助有效字段的校验范围、reset token、UTC 校验仍是调用方契约 |
| 建议 | 保留提交有效性协议；修正 R2-03 提示。后续真实表单不能漏接辅助有效性或 UTC validator |

本轮浏览器关键场景：

1. 原值为 `2026-03-08T06:30:00Z`，其余必填项合法；切换纽约后一次性替换，不先 clear。
2. 分别输入 `2026-03-08 02:30:00`、`not-a-time`、`2026-11-01 01:30:00`，立即按 Enter，没有先等待错误 Banner。旧 UTC 预览仍在，但提交结果未出现。
3. 未选择 fold 时重置表单，等待重置提交完成后，纽约草稿为 `''`，旧候选区域数量为 0。即时读取可能先见旧 DOM，不能把 React 尚未提交的中间态误报为重置失败。
4. 重新输入 fold 并选择较晚候选，实际提交 `2026-11-01T06:30:00Z`，辅助有效位为 true；同时仍显示错误编辑提示，见 R2-03。

边界判断：

- 非法草稿不会作为“可选字段未设置”绕过门禁；删除全部文本会显式写 `''`，与“清空时间”按钮同为当前明确清空语义。
- `reset()` 必须同时递增 resetToken，才能处理权威 value 未变化但需要清理草稿的情况；现有 Playground 已这样接线。
- 外部 value 更新和模式切换重建/清除草稿，不主动重写既有 UTC 原串。
- locked 覆盖模式切换、清空和候选；两个 TextInput 传递 disabled/readonly。Astryx 使用 aria-disabled/readOnly 的控件不应因没有原生 disabled 就判可编辑。
- 当前没有 `trigger()` 消费路径。**[INFERENCE]** 只 `trigger('scheduledStartAt')` 不能证明辅助字段有效；真实调用方应全表校验或同时包含辅助字段。`setValue` 适配本身不设置 shouldValidate，不能把 formState 的即时变化当成提交门禁证据；`handleSubmit` 会重新校验。
- StrictMode 下通知 effect 没有去重，开发态挂载可能重复通知；现有调用方用 getValues 比较后才 setValue，没有把通知当作提交动作。未证明正常浏览器事件存在短暂错误有效状态绕过。
- 额外的浏览器内动态挂载 RHF/StrictMode 观测探针没有完成：导入 TSX 时受 Vite React Refresh preamble 限制。它不计入通过项，也不算产品失败；没有借此更改项目配置。StrictMode 通知次数及真实 RHF setValue/trigger 全矩阵本轮仍只有上述源码边界判断。

### 3.4 REV-04：Decimal 精度与数值域

| 字段 | 内容 |
|---|---|
| 编号 | REV-04 |
| 当前结论 | **部分修复**：独立 50 位上下文及协议内求和正确，通用输入域/闭包仍不完整 |
| 源码路径与行号 | `frontend/src/lib/decimal/decimal.ts:3-21,37-73`；`lib/format/number.ts:16-30`；`components/ui/decimal-text-input.tsx:11-42,65-88` |
| 函数 | `parseDecimal`、`compareDecimal`、`sumDecimal`、`normalizeDecimalText`、`formatDecimal` |
| 对应测试 | `decimal.test.ts:57`“12 整数 + 18 小数…”；`:63`“尾数进位…”；`:72`“多行累计…”；`:77`“正负抵消…”；`:81`“超过上下文精度…”；`:89`“规范化输出…”；`format-number.test.ts:5,11,19` |
| 实际验证 | 现有检查通过；仓库外确认全局 Decimal 仍 precision=20、项目实例构造器 precision=50；补验精确指定求和、50/51 有效位、numeric 上界的 1000 行累计、抵消、HALF_EVEN 和指数阈值，发现 R2-02 |
| 风险 | 输入有效位≤50 不代表任意中间计算无损，也不限制整数/小数位置；normalize 的普通十进制闭包在阈值处失败 |
| 建议 | 将受支持的 scale、数量上限和运算种类写成真实约束；不能把 clone50 描述成无限精度 |

后端真实范围并非只看一个注释：

- 数据库 `backend/src/database/schema.ts:29-30`：money `numeric(38,18)`，quantity `numeric(30,10)`。
- 公开输入 `backend/contracts/validation.ts:71-99`：数量最多十位小数且不超过 1000000；限价最多两位小数；本金最多十二位整数、十八位小数。行情公开十进制也有其独立范围（`:355` 等）。
- 后端交易领域使用独立 50 位上下文（`backend/src/domain/shared/decimal.ts:3-6`），**不代表所有后端数字都只有这个范围**：资产诊断 `backend/src/api/stocks-assets-diagnostic.ts:153-159` 允许单值四十位整数、二十位小数，并另用 80 位上下文。

本轮数值探针事实：

| 场景 | 当前结果 |
|---|---|
| `999999999999.123456789012345678 + 0.000000000000000001` | `999999999999.123456789012345679` |
| 50 位全 9 输入 | 接受，保留 50 位 |
| 51 位全 1 输入 | 拒绝，reason=precision |
| 1000 个 money 最大正值累计 | `99999999999999999999999.999999999999999` |
| money 最大值 + `1e-18` 对应普通小数文本，再减最大值 | `0.000000000000000001` |
| HALF_EVEN 单有效位观测 | 0.25→0.2；0.75→0.8 |
| 项目实例 `1 / 3` | 50 位上下文结果；不是无限循环小数的精确有限表示 |
| 大整数与 18 位小数的 Intl 字符串格式化 | `123456789012345678.123456789012345678`，未先转 Number |

`numeric(38,18)` 的有界求和有明确余量，例如一百万行最多增加六位整数位，总有效位仍在 50 内；**当前代码并没有将这一例子变成所有未来聚合的数量/scale 门禁**。前端目前没有产品级乘法/除法 helper 或真实聚合消费者，不能据此验收任意价格×数量、汇率、诊断金额或更大聚合。现有 Decimal 算子来自 clone，但运算范围及舍入时点须在对应业务接入前定义。

金融输入保留字符串；formatDecimal 中 `as unknown as number` 是为 Intl 类型声明做的断言，不是运行时 Number 转换。本轮真实运行也验证了字符串精度。非法输入返回 null；空集合求和为加法单位元 0，与“未知值转换为 0”不同。没有发现当前前端业务金融值直接 Number 运算或展示值回填路径。

### 3.5 REV-05：时间精度与后端契约

| 字段 | 内容 |
|---|---|
| 编号 | REV-05 |
| 当前结论 | **部分修复**：新输入规则已对齐；历史编辑透传未闭合，极端纽约支持域有既有 P2 |
| 源码路径与行号 | `frontend/src/lib/time/instant.ts:35-69,86-118,138-190`；`lib/time/zoned.ts:22-81`；`components/ui/utc-datetime-field.tsx:93-105,156-179` |
| 函数 | `validateFields`、`parseUtcInstant`、`parseWallClockText`、`formatInstantInZone`、`offsetMinutesAt`、`resolveZonedWallClock`、`instantAt` |
| 对应测试 | `time-instant.test.ts` 的有效尾零、年份、历史原串用例；`time-zoned.test.ts` 的唯一/gap/fold/小数往返；UTC 字段集成及 E2E |
| 实际验证 | 现有检查通过；仓库外直接解析指定六个样例、闰年、纽约六位及尾零转换；Bun 与 Chromium 均确认极端年份反例 |
| 风险 | 不能把“新输入六位规则正确”宣称为“所有历史值及全部年份纽约往返正确” |
| 建议 | 保留 UTC raw 权威性；历史编辑在真实任务编辑接入前制定合法保留策略，不增加任意绕过开关；极端域见 R2-04 |

指定输入的本轮结果：

| 输入 | 实际结果 |
|---|---|
| `2026-11-10T01:23:45.123456Z` | 接受，raw 与 fraction 原样保留 |
| `2026-11-10T01:23:45.123456000Z` | 接受，尾零不计有效精度，原串不被缩短 |
| `2026-11-10T01:23:45.0000000Z` | 接受，原串保留 |
| `0000-01-01T00:00:00Z` | 拒绝，calendar |
| `0001-01-01T00:00:00Z` | UTC 解析接受；不等于纽约展示也正确 |
| `9999-12-31T23:59:59.999999Z` | UTC 解析接受，fraction 保留 |

2024-02-29 接受、2026-02-29 拒绝。纽约唯一时间 `.123456` 与 `.123456000` 均转换为对应 UTC 并完整保留小数；2026 春季 gap 拒绝，秋季 fold 两个候选均保留微秒。

**实际后端链路与历史例外：**

- `backend/contracts/validation.ts:217` 只是 datetime 字符串入口；真正新建/改时规则还在 `backend/src/services/trading/tasks.ts:368-386`：精确解析、0001–9999、去尾零后≤6 位、直接 SQL timestamptz，不经 Date 毫秒编码。
- `backend/src/domain/tasks/scheduled-start.ts:7-30` 精确比较秒和去尾零后的小数，不使用 Date 毫秒相等。
- `tasks.ts:475,503-519` 对未改变的历史时间保留原 JSONB 和时间列。
- `backend/tests/trading/production.integration.test.ts:978-1016` 明确覆盖历史 `.123456789Z` 只改名称/数量及等价尾零表示。这是读取的后端测试证据，**本轮没有运行该后端测试**。
- 前端所谓历史透传测试只覆盖 `.123456000Z`，没有覆盖真正超过六位有效小数的历史值。0067 中“后端保证存量值有效”不足以关闭该例外。当前不存在真实任务编辑器，因此列为接入前约束，不要求本轮实现 Feature。

当前 epochMillis 用于展示、偏移和候选探测，没有用来判断微秒级业务等价，也没有覆盖提交 raw。模式切换仅展示不回写，应保留。

### 3.6 REV-06：主题与 Cascade Layers

| 字段 | 内容 |
|---|---|
| 编号 | REV-06 |
| 当前结论 | **已修复** |
| 源码路径与行号 | `frontend/src/styles/index.css:9-31`；`theme/generated/binance-stocks.css:82-87`；`theme/app-theme.ts:11-15`；`theme/icons.tsx:41-75`；`app/providers/theme-provider.tsx:18-64` |
| 函数/组件 | `ThemeModeProvider`、`ThemeModeToggle`、`appTheme`、Astryx `Theme` |
| 对应测试 | `theme-dialog.test.tsx`；`playground.spec.ts:168-275`“显式主题覆盖系统偏好，并同步到 Card / 输入框 / Portal” |
| 实际验证 | theme:check 通过；现有 E2E 通过；本轮真实页面额外测量六种 system/explicit 组合、TextInput 外壳背景/边框、弹层及不刷新页面的 system 变化 |
| 风险 | 只验证 Chromium；现有 E2E 的部分相等断言和 Portal 组合仍有盲区，不等于全组件视觉回归 |
| 建议 | 保留现有主题/生成链，不手改生成 CSS；按未来组件消费补实质行为断言 |

业务 components 层已不再声明根 color-scheme；根模式由生成主题管理。库 reset、生成主题和局部媒体样式并非第二套业务主题控制器。ThemeModeProvider 提供 mode，resolvedMode 只展示，Astryx Theme 负责根属性；没有发现两套模式拥有者。

本轮 Chromium computed styles（背景为 RGB）：

| 系统 | 模式 | color-scheme | 应用 `.bg-body` | Card | TextInput 外壳 | 外壳边框 |
|---|---|---|---|---|---|---|
| Light | Light | light | 241,241,241 | 255,255,255 | 255,255,255 | 212,212,212 |
| Light | Dark | dark | 27,27,27 | 27,27,27 | 38,38,38 | 212,212,212 |
| Dark | Light | light | 241,241,241 | 255,255,255 | 255,255,255 | 212,212,212 |
| Dark | Dark | dark | 27,27,27 | 27,27,27 | 38,38,38 | 212,212,212 |
| Light | System | light dark | 241,241,241 | 255,255,255 | 255,255,255 | 212,212,212 |
| Dark | System | light dark | 27,27,27 | 27,27,27 | 38,38,38 | 212,212,212 |

原生 input 自身为透明背景，实际输入外观应读取 `.astryx-text-input` 外壳；只读原生 input 的 borderColor 不能证明组件边框。System 下不刷新页面切换系统 Light/Dark，应用背景随之改变。

弹层实测：

| 显式模式 | Dialog 背景 | Drawer 背景 | Toast 背景 | Toast 内容文字 |
|---|---|---|---|---|
| Light | rgb(255,255,255) | rgb(255,255,255) | rgb(10,19,23) | rgb(255,255,255) |
| Dark | rgb(27,27,27) | rgb(27,27,27) | rgb(255,255,255) | rgb(17,17,17) |

Toast 使用反色外观，不应以“Dark 必须黑底”自行改主题。已观察真实截图；这里的颜色是 computed styles，不是仅有截图生成或 data-theme 属性。

术语纠正：当前 Astryx Dialog/Drawer 实际使用原生 dialog top-layer；ToastViewport 明确使用 React Portal。因此本报告验证的是这些真实弹层的配色，不把原生 dialog 打开误称为已证明跨 root React Portal 位置。

### 3.7 REV-07：离线敏感写门禁

| 字段 | 内容 |
|---|---|
| 编号 | REV-07 |
| 当前结论 | **已修复本阶段最小边界**，不等于完整 Session Epoch/交易恢复已实现 |
| 源码路径与行号 | `frontend/src/services/api/sensitive-write.ts:30-108`；`app/providers/query-client.ts:4-26`；`routes/dev/playground-page.tsx:197-205,598-632` |
| 函数 | `createSensitiveWriteGate`、`createSensitiveMutationOptions`、`createOnlineSensitiveWriteContext`、`createQueryClient` |
| 对应测试 | `sensitive-write.test.tsx:65,94,112,137`；`playground.spec.ts:300`“离线敏感写不排队，恢复网络也不自动发送” |
| 实际验证 | 现有检查通过；外部真实 MutationObserver+项目 QueryClient+Mock Fetch：离线/恢复仍 0 次 Fetch、isPaused=false；异步 onMutate 等待期间改会话/账户/确认/网络均在发送前阻止；新鲜有效确认的正向对照仅 Fetch 1 次 |
| 风险 | 未来直接 useMutation、scope 串行化、异步 send 前置工作、持久化/hydrate 若绕过门禁，须重新验证；当前没有这些敏感业务路径 |
| 建议 | 保留 always + retry:false + 临发送检查的组合；未来敏感写统一接入，不把普通全局默认当安全保证 |

- QueryClient 的全局 mutation 默认仍是 online，敏感 helper 显式覆盖为 always，配置优先级没有冲突。
- 门禁检查和 send 调用之间没有 await；账户、会话、确认失效不会创建服务端操作，因为 Fetch 尚未被调用。
- 本轮额外让 `onMutate` 等待，再改变上下文后放行，确认检查发生在等待之后，而不只是点击前检查一次。
- 没有发现 mutation persistence、hydrate/dehydrate 配置、service worker 写队列或应用重新加载后自动恢复敏感写的入口；localStorage 仅用于主题。
- TanStack 自身有 paused mutation 恢复机制。当前 helper 的普通路径没有进入暂停队列，不应把“未启用”宣称成底层库不存在恢复能力。
- 现有 Playwright 离线用例运行的是 gate 加本地计数，不是 Fetch/useMutation；这一证据限制由外部真实 Query/Mock Fetch 探针补充，而不是将演示计数冒充真实请求。
- Fetch 已执行后的超时/取消由 requestJson 保持 unknown；AbortSignal 不撤销已经到达服务端的操作。没有真实下单探针。

## 4. 补充事项复核（原报告第 10 节）

### 4.1 `/healthz` 503 data

**传输分支已修复，健康业务页面尚未接入。** `request.ts:98-107` 保留 data 和 receipt 为 http-data；它不是 success，`requireData()` 仍抛查询错误。`api-client.test.ts:186` 验证降级详情，外部探针还确认 503 data 带有效 operation 时不会丢失回执。

后端真实健康地址是根级 `/healthz`（`backend/src/server/app.ts:76-102`），MSW 以 `/api/v1/healthz` 演示传输分支。本轮不把它说成真实健康 URL 联调通过；未来健康页面应使用正确 base/path 并单独消费 http-data。

### 4.2 SSE resources

**解析层已修复。** `services/realtime/parse.ts:4-7,24-25,39-85` 与 `types.ts:10-20,24-50`：

| 情况 | 当前语义 |
|---|---|
| resources 缺省 | scope=all，返回九个已知资源的一次有界收敛信号 |
| resources=[] | scope=declared、空变化列表 |
| 含未知资源 | 已知资源与 unknownResources 分开保留 |
| 畸形 JSON/帧 | invalid，诊断文本最多 500 字符，不指示全站刷新 |

资源白名单通过 Object.hasOwn 检查，不以原型链成员充当资源。`realtime-parse.test.ts:6,25,37,49,61` 有对应行为断言。当前无 SSE Manager，授权过滤、节流/合并和错误帧关闭连接尚无运行消费者；不能宣称已经实现实际有界失效调度。

### 4.3 DataTableShell

**当前平列、服务端分页/排序范围可保留。**

- `data-table-shell.tsx:202-216` 同时要求 onSortingChange 和 getCanSort；无回调不再出现无效按钮/aria-sort。对应测试 `data-table-shell.test.tsx:153-165`。
- `:105-118` 直接使用 data/columns 引用并 manualSorting=true，不注册第二套分页 feature；分页由 props/页面唯一拥有。页面的列与页数据分别 memo。
- `data-table-shell.test.tsx:168-197` 确实 rerender 总数 55→5，同时调用方将 page 3→1。它证明调用方更新后的同步，**不证明组件自动修正任意越界页**；当前设计不应再新增内部页码拥有者。
- 组件已声明仅支持单行平列表头；未支持 colSpan/isPlaceholder，当前调用也未使用分组表头。此限制符合本轮允许的范围。
- `:125,166-190,252-262` 区分错误、stale、空结果、空数据 loading，并保留已有行；现有状态测试未穷举所有组合。
- “排序点击只发出服务端排序状态，不在本地二次排序”测试主要断言状态/按钮，未比较前后行序；manualSorting 的源码证据正确，但测试名称强于断言。

### 4.4 Mock 与真实契约

**演示边界已标注，但夹具不能被当作身份正确性的证据。**

- Playground 的 DemoOrder/表单模型是页面内部类型，reduceOnly 已删除。页面 `:638,647-649,672,783` 明确说明不对应正式 DTO、不发送请求。
- `tests/msw/handlers.ts:6-8,73-84` 明确 details.fields 为模拟字段，不是公开字段契约。
- 任务 Mock 仍有大写 START，handler 不校验请求体；只能证明传输分类，不证明真实控制 action 枚举正确。
- `tests/msw/fixtures.ts:12-47` 的通用回执固定为 ORDER/order-1。ACCOUNT_SYNC 测试改变 kind 却保留该目标，请求 key 与回执 ID 也不一致仍期待 applied；这已成为 R2-01 的实际错误示范，应在关闭 P1 时一并纠正，而非仅靠“这是 Mock”豁免。
- 演示表格以字符串模拟排序，不是金融数字排序参考实现。尚未发现这些演示模型进入正式业务 DTO 或实际发送路径。

### 4.5 工程验证可信度

| 核验点 | 结论与限制 |
|---|---|
| Playwright 服务身份 | `playwright.config.ts:31-36` 默认不复用，只有显式 PLAYWRIGHT_REUSE_SERVER=1 才复用。本轮环境未设置该变量，日志实际出现 WebServer 新启动 |
| theme:check | 本轮正式执行且通过；不是仅有 package script |
| Coverage 阈值 | `vitest.config.ts:21-32` 没有 thresholds。通过只表示测量命令成功，不代表达到了门槛 |
| Bundle | 本轮生产构建再次产生 >500 kB 警告；未通过改阈值或硬拆包掩盖 |
| Sourcemap | `vite.config.ts:23-25` 为 true；0066 只要求上线前决定是否关闭，尚无可执行部署策略。生产发布前要明确公开/私有上传/不发布方式，当前不是已证明的凭据泄漏 |
| 未使用依赖 | 检查直接依赖的源码、配置和 peer 用途，未发现有证据可直接删除的运行依赖。StyleX 是 Astryx peer，testing-library/dom 是 RTL peer，不因缺少业务 import 就判死依赖。未安装依赖审计器，不能把 TS noUnusedLocals 当作完整包依赖审计 |
| 重复封装/计算 | client 与 request 分别负责注入和传输，有不同职责；未发现第二套通信层。response.ts:65 的 safeParse 成功后，:43 再 parse 同一回执属于可省的重复验证，不影响本轮关键语义，无须另建抽象 |
| 开发文档一致性 | DEVELOPMENT.md:71 仍把分类入口描述为旧的字符串三态，:94 仍写 reuseExistingServer:true，与当前代码不一致；属于后续文档修正项，本轮按只读要求不改 |

测试质量总体上不是只测实现：API 分支、RHF 提交回调、数值结果、DST 候选、离线恢复、实际 computed styles 均有消费者可见断言。但不能据总数或覆盖率认定所有业务边界已覆盖：

- 缺少 omitted/empty/partial expected 的终态身份负例；部分新测试还固化了不安全用法。
- 原 RHF gap 测试先 clear，不能单独证明保留旧 UTC 的直接替换；本轮浏览器已补证该路径。
- 缺少 50 位中间运算、指数阈值、真实历史超微秒透传及极端纽约往返断言。
- 主题 E2E 对 Card/输入框部分仅比较同模式跨系统相等，缺模式间差异；Toast 只测同向组合。RTL 的 Portal 位置断言在没有 #root 时还可能空真，不能用于配色认证。
- 没有发现现有 it/test/describe 的 skip/only/todo 被用来掩盖失败；本轮运行套件没有跳过用例。

## 5. 本轮新发现及遗留支持域

### R2-01 · P1：终态判断没有强制绑定原请求身份

- 位置：`frontend/src/services/api/errors.ts:35-59,70-96,110-112`。
- 性质：REV-01/02 未闭合；不是已发生真实交易事故。
- 证据：省略 expected 时直接匹配，空对象也全部跳过；任何有效 SUCCEEDED/REJECTED 回执都可能被提升为原意图终态。新增 malformed 保留路径也受此影响。

本轮实际反例：

```text
原请求身份：original-id / TASK_CONTROL / TASK / task-1
响应回执：other-id / TASK_CONTROL / TASK / task-1 / SUCCEEDED

classifyWriteOutcome(outcome, 完整原请求身份)
→ intent=unknown, reason=receipt-mismatch

classifyWriteOutcome(outcome)
classifyWriteOutcome(outcome, {})
→ intent=applied, reason=receipt-applied
```

**关闭条件：**用于确认原意图的接口必须要求可信原请求 ID/kind 及该 kind 所需目标；缺少身份时运行时也只能保持 unknown。没有目标的操作应显式表达，而不是以省略所有字段作为万能匹配。expected 必须来自发送前保存的原意图，不能从回执反向构造。同步修正不匹配 ID/target 却期待 applied 的夹具和测试，并覆盖省略、空、部分身份、错 kind、错/缺目标以及 SUCCEEDED/REJECTED。无需开发恢复 UI、会话系统或提前引入 Hono RPC。

### R2-02 · P2：Decimal 可接受域与“精确/闭包”承诺不一致

- 位置：`frontend/src/lib/decimal/decimal.ts:16-20,37-43,54-73`。
- 性质：原默认 20 位问题已修；50 位输入域和格式闭包补丁仍不完整。

实际反例一：

```ts
const text = '0.' + '0'.repeat(99) + '1';
parseDecimal(text).ok; // true：只有 1 位有效数字
normalizeDecimalText(text); // '1e-100'
parseDecimal('1e-100').ok; // false
```

`'1' + '0'.repeat(100)` 同样被接受，却规范化成 `1e+100`。仅调 toExpNeg/toExpPos 不是“所有可接受普通小数字符串都不输出指数”的保证。

实际反例二：

```ts
const n = '9'.repeat(50);
sumDecimal([n, '2', '-' + n]);
// 实际 '1'；准确值应为 '2'，误差来自中间的 51 位结果被舍入。
```

三个输入都通过当前输入门槛。当前没有生产 sum/normalize 消费者，真实 DB 金额有界求和也有余量，故不升级为新的 P1；但不能复制“50 位合法输入的任意运算都精确”的错误承诺。后续应让接受域、运算数量/scale 与输出格式闭合，超域明确拒绝，或按业务推导计算精度。

### R2-03 · P2：fold 已选中却继续提示不可提交

- 位置：`frontend/src/components/ui/utc-datetime-field.tsx:108-114,264-266,281-286`。
- 性质：本轮修复补丁新增的相反状态提示。
- 证据：`nyDraftResolvedValue` 只认可 unique，不认可已选择的 fold；选择候选后 zoned 已 resolved，UTC 和辅助有效位均正确，提示却不消失。

本轮完整浏览器中，第二候选成功提交，结果包含：

```json
{"scheduledStartAt":"2026-11-01T06:30:00Z","scheduledStartEditValid":true}
```

同一表单仍显示“当前纽约草稿尚未形成可提交的 UTC 时间”。应依据真实编辑有效性/消歧完成状态展示提示，不要求折叠墙钟本身唯一。这不是已证明的提交绕过。

### R2-04 · P2：既有纽约极端年份支持域不闭合

- 位置：`frontend/src/lib/time/instant.ts:148-169,186-189`；`lib/time/zoned.ts:33-36,47-81`。
- 性质：本轮识别的既有支持域问题，不是修复补丁新增；Bun 与 Chromium 结果一致。

| 输入 | 实际表现 | 原因/保护 |
|---|---|---|
| NY `0001-01-01 09:30:00.123456` | 错误返回 nonexistent | 历史纽约存在秒级偏移，当前偏移按整分钟舍入 |
| UTC `0001-01-01T00:00:00Z` 的 NY 展示 | `0001-12-31 19:03:58` | Intl 结果未读取 era，把跨公元边界的年份误当公元年份 |
| NY `9999-12-31 23:59:59.999999` | unique，但生成 `10000-01-01T04:59:59.999999Z` | 转换后没有复核 UTC 年份；当前 Playground 的 UTC validator 会阻止提交 |

不能因此声称纽约转换完整覆盖 0001–9999。当前现代年份的已测路径正常，真实业务表单尚未接入，应明确支持域并在消费前对齐。另有仅源码确认的既有严格格式边界：前端正则 `$` 可接受末尾换行，后端精确解析还检查完整匹配；不计为本补丁新增问题，也不算已经实测修复。

## 6. 本轮验证结果与证据限制

### 6.1 环境与真实命令

环境：Windows 10.0.26300 x64；Bun 1.4.3；Node v24.22.0；Playwright 1.65.0；实际浏览器 Chrome/155.0.8059.85。以下工程命令均在 `frontend/` 执行，未安装或更新依赖。

| 命令 | 退出码 | 本轮实际输出/结果 |
|---|---:|---|
| `bun install --frozen-lockfile` | — | **跳过**：本任务明确禁止安装依赖；使用既有 node_modules，不将上一轮安装结果挪作本轮结果 |
| `bun run typecheck` | 0 | `$ tsc -b --noEmit`，无诊断 |
| `bun run lint` | 0 | `Checked 60 files in 16ms. No fixes applied.` |
| `bun run test:run` | 0 | `Test Files 13 passed (13)`；`Tests 110 passed (110)` |
| `bun run test:coverage` | 0 | 同一 110 用例通过；Statements 91.15% (464/509)，Branches 84.25% (412/489)，Functions 84.29% (102/121)，Lines 92.65% (416/449)；无阈值 |
| `bun run theme:check` | 0 | `[ok] Theme outputs are up to date with src\theme\app-theme.ts.` |
| `bun run build` | 0 | 9520 modules；HTML 0.54 kB；CSS 300.41 kB / gzip 46.76；主 JS 871.99 kB / gzip 267.48；主 map 4190.64 kB；Tooltip JS 2.08 kB；有 >500 kB 警告 |
| `bunx --no-install playwright test` | 0 | `Running 10 tests using 8 workers`；`10 passed (21.1s)`；实际拉起 WebServer |

Playwright 使用 --no-install 防止 Bunx 访问网络安装包，执行的仍是本地同一版本 Playwright。日志另有 NO_COLOR/FORCE_COLOR 的 Node 提示，不是被隐藏的测试失败。Coverage 重跑同一组用例，不计为新增 110 个不同测试。

### 6.2 仓库外探针

临时目录：`D:/frontend-review-round2-CzMBSv/`。实际命令（工作目录为 frontend）：

```text
bun --tsconfig-override D:/Binance-astryx-dev/frontend/tsconfig.app.json D:/frontend-review-round2-CzMBSv/core-boundaries.ts
bun --tsconfig-override D:/Binance-astryx-dev/frontend/tsconfig.app.json D:/frontend-review-round2-CzMBSv/mutation-boundaries.ts
```

两条命令退出码均为 0。它们是观测探针，**退出 0 不等于观察到的所有业务不变量通过**：前者输出了 R2-01、R2-02 和时间支持域反例；后者输出敏感写门禁与正向发送对照。所有 Fetch 都替换为本地函数，未产生真实网络调用。

第二条使用真实 MutationObserver、OnlineManager、项目 QueryClient，状态结果为：离线失败且非 paused；联网不续发；等待期间四种上下文变化均阻止；全程前述拒绝场景 Fetch 为 0，最后有效确认正向对照只发 1 次。没有把一个始终不发送的假函数当作门禁成功。

上述临时目录已执行清理；没有将探针复制进项目、添加永久测试或留下临时配置。关键反例与实际输出已写在本报告中。

### 6.3 完整浏览器

另外实际启动并检查：

```text
bun run dev --port 5273 --strictPort --host 127.0.0.1
bun run preview --port 4173 --strictPort --host 127.0.0.1
```

均成功就绪，只访问本地前端。浏览器通过 omp 现有配置打开，未自定义浏览器启动配置或下载浏览器。已关闭本轮标签并停止两个服务。

| 场景 | 证据/结果 |
|---|---|
| Light / Dark / System | §3.6 的真实 computed styles、实际截图及同页系统切换；通过 |
| Dialog / Drawer / Toast | 完整前端真实弹层及内容颜色；通过；术语与覆盖边界见 §3.6 |
| RHF 旧 UTC + 直接非法替换 + 立即 Enter | 三类未决草稿不提交；通过当前浏览器事件路径 |
| fold→reset | 稳定后空草稿、无旧候选；通过；未穷举所有外部 reset/setValue/trigger 组合 |
| fold→选择→提交 | UTC 正确；发现相反提示 R2-03 |
| 离线敏感写演示 | blocked:offline、已发送 0；恢复网络仍为该状态；仅本地 gate 演示，实际 Query/Fetch 证据另见探针 |
| 生产 `/dev/playground` | 页面显示“页面不存在”，没有 Playground 组件或导航入口；Console/页面错误为空 |
| 开发页面错误 | 本轮读取的页面错误集合为空；工具内 TSX 探针导入异常单独披露，不记作业务页面错误 |

手工浏览器探针中有被 Toast 覆盖、抽屉关闭动画尚未完成、精确可访问名/输入选择器不匹配的操作失败；重新观察 DOM 后继续对应步骤，没有将工具交互失败报成产品缺陷，也未重跑整套套件掩盖结果。

### 6.4 通过、失败、跳过及未执行的区别

- **本轮实际通过：**上表七条非安装工程命令；既有 Vitest/Playwright 无失败、无跳过；外部两条探针命令成功执行；所列浏览器正常场景。
- **本轮实际失败的不变量：**R2-01 的身份终态约束、R2-02 的泛化精确/格式闭包、R2-03 的消歧后状态文案；R2-04 为既有支持域反例。不能因已有套件绿灯将它们写成通过。
- **本轮跳过：**依赖安装/刷新，原因是任务禁止，而非 Bun 不可用。
- **本轮未完成的额外探针：**动态挂载 RHF/StrictMode 的内部观测；原因和未验证范围见 §3.3。
- **仅源码证据：**无持久化恢复入口、无真实敏感 mutation、原请求消费者当前缺席、部分 trigger/StrictMode 行为边界、后端历史保留路径及已有后端测试内容。
- **仅 Mock/纯函数或 jsdom 证据：**HTTP 错误/回执矩阵、DTO 畸形输入、金融 helper、SSE 解析、细粒度表格与控件状态；真实 Query + Fetch 替身不等于真实后端。
- **有真实浏览器证据：**主题/弹层、当前 Playground 表单操作、离线本地门禁、生产隔离，以及两个极端年份转换反例。
- **没有真实后端证据：**未启动 API/Worker、未连接数据库/账户/资金、未验证真实登录/CSRF/SSE、未执行真实交易或撤单。
- **其他未执行：**Firefox/WebKit、CI 环境、干净依赖重装/可复现安装、部署环境 sourcemap 策略、多标签会话与真实恢复。没有用旧轮结果补足。

## 7. 架构边界与可以保留的设计

### 7.1 四类边界

| 边界 | 当前判断 |
|---|---|
| API/操作 | HTTP status、回执 status、业务 data 分开处理；unknown 不等于 rejected；attempt rejected 不等于 intent not-applied；解析错误不等于无回执；发送后超时未知；写请求不自动重试。**原请求身份强制性仍须先修** |
| 金融数据 | 输入/传输为字符串，展示不回填、未知不变 0、Decimal Context 独立；50 位有限精度和接受域缺口已明示，不为未来任意运算背书 |
| 时间 | UTC raw 权威、展示不回写、现代 DST gap/fold 门禁正确；有效小数与新建/改时服务规则一致；毫秒值不用于微秒等价。历史透传和极端支持域仍有边界 |
| UI/主题 | Astryx 是唯一主 UI；Tailwind v4 提供布局/工具类及官方 token bridge；Token 源由主题扩展并生成；Tabler 语义图标统一注册；未发现第二套 UI 或样式系统 |

### 7.2 不需要继续重建的设计

1. frontend 独立 Bun 项目，不改为根 workspace，不更换组件库或升级技术栈。
2. Native Fetch 单次传输、注入式 CSRF/session epoch、完整 outcome 和分层回执解析；只修正现有身份约束，不另建第二套错误语义。
3. 敏感写 always + retry:false + 临发送同步检查；继续禁止持久化/自动恢复交易意图。
4. DecimalTextInput 原串输入、Intl 展示、项目独立 Decimal clone；修正范围承诺，不需要替换数值库。
5. UTC raw 与纽约草稿分开、显式 fold 候选、辅助提交有效性；不以清空非法草稿冒充修复。
6. 预编译 Astryx 主题、现有层顺序、单一根模式控制及统一 Tabler 图标；不手改生成 CSS。
7. 表格分页/排序状态由页面唯一拥有；保留当前平列表头限制，不扩建通用表格框架。
8. Playground 的 DEV 条件注册与动态导入；本轮生产实际隔离成立。
9. SSE 仅做解析层，健康接口仅做降级传输模型，不为验收制造 Manager/健康业务页面。

## 8. 下一阶段准入判断

| 问题 | 明确回答 |
|---|---|
| 第一阶段能否正式验收？ | **当前不能。**先关闭 R2-01 并进行定向独立复核 |
| 是否可以进入第二阶段？ | **当前不建议准入。**P1 关闭后可进入，无须为所有 P2 重建工程 |
| 哪些问题不阻碍一般第二阶段建设？ | R2-02 的超协议通用数值域、R2-03 提示、R2-04 极端时间域，以及字体、Bundle、覆盖率阈值、多浏览器和非部署阶段的 sourcemap 决策；但相关业务接入/发布前仍须满足各自前置条件 |
| 哪些必须先处理？ | 原意图终态必须绑定可信原请求身份；同步纠正错误夹具/测试。修复后实际验证缺省/空/部分身份不可得到终态，完整匹配可采用，错身份保持 unknown，无回执后续 4xx 不解除未知 |
| 第二阶段能否开始 AppShell、Session Epoch、API Client 与 Hono RPC 接入？ | **R2-01 关闭并复核后，可以。**本轮不自动开始这些工作，也不要求提前实现它们来关闭 P1 |

**Hono RPC 适配判断：**当前 Native Fetch 不是缺陷。单次传输、CSRF/幂等键/session epoch 注入、响应信封与回执解析已分离，适合在第二阶段保持同一安全语义并接入后端公开类型/`hc` 或其 transport 适配。Hono 推导静态请求/响应类型不能替代运行时 data 校验，也不能绕过非 2xx 回执、原 ID 匹配及未知保护。这里是基于现有接口结构的可适配性判断，**没有执行 Hono RPC 原型或联调**，不承诺零修改接入。

P1 修复的最低复核建议：只覆盖身份缺失/错配与正确终态、一次发送未知后无回执拒绝的调用序列、现有 API 分类回归；不要为了关门槛实现 AppShell、完整恢复或真实交易。金融乘除/聚合边界在相应业务接入前明确；历史超微秒原值保留在任务编辑接入前落实；sourcemap 在生产部署前定案。

### 执行记录

- 能力：read、grep、glob、bash、eval、task、browser 已用；lsp 已尝试但无可用语言服务器。
- jev：已调用 api_identity_priority、decimal_boundary_priority、fold_message_priority、time_boundary_priority；用于等级复核，不代替源码/运行证据。
- Skill：code-security、typescript、vitest、react-hook-form、vercel-react-best-practices、web-design-guidelines、playwright-cli、webapp-testing 已应用；依赖下载类附带命令受本任务禁止安装约束未执行。
- 例外：未安装依赖，未运行真实后端/其他浏览器；额外 RHF 内部挂载探针未完成。按本轮只读约束，不修改现有文档索引、不新建归档组、不修复发现项；报告是唯一新增工程文件，构建/测试仅刷新忽略的运行产物。
