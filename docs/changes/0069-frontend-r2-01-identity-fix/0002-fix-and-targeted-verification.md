# R2-01 原请求身份约束修复与定向复验

- 状态：已执行；本记录定稿后不重写，后续变更另建编号。
- 日期：2026-11-10。
- 范围：第一阶段前端底座的唯一 P1——R2-01；不扩大为第三轮全面审查或第二阶段开发。
- 输入：[原任务书](0001-r2-01-fix-agent-prompt.md)、[0068 第二轮独立核验](../0068-frontend-bootstrap-independent-review-round2.md)。已完整阅读任务书、0068，以及此前的 0067 和原独立审查输入；历史正文不改写。
- 结论：**R2-01 已关闭；本轮未发现新增 P0/P1。第一阶段底座可以验收，第二阶段可以准入。**此结论不关闭既有 P2，不等于生产发布或真实交易认证。
- 操作边界：backend 只读、未启动；未连接 Worker、数据库、真实账户或资金服务；未安装/升级依赖，未提交、推送或切换分支。

## 1. 修复基线与变更范围

### 1.1 起始状态

实际执行 `git status --short`、`git branch --show-current`、`git rev-parse HEAD`、`git diff --stat`、`git diff --cached --stat`：

| 项目 | 实际结果 |
|---|---|
| 分支 | `astryx-dev` |
| HEAD | `0427627f3637b4363a51b5c1a79de65791237783`，与 0068 核验基线相同 |
| 起始工作区 | 仅有未跟踪的 `docs/changes/0068-frontend-bootstrap-independent-review-round2.md` |
| 起始已跟踪文件差异 | 无 |
| 起始暂存区 | 无差异 |

保护既有 0068 原件，未为匹配旧快照执行 checkout、reset、clean、stash 或 rebase。本轮代码仍未提交，不能将起始 HEAD 冒充包含本修复的提交。

### 1.2 完整变更清单

修改已有文件：

| 文件 | 本轮改动 |
|---|---|
| `frontend/src/services/api/errors.ts` | 完整身份类型、真实 kind/target 配对、平台固定目标、公共匹配入口的运行时检查；两个公开函数强制身份参数 |
| `frontend/src/services/api/types.ts` | 纠正公开回执契约与诊断解析宽松形状的说明；不改解析/传输行为 |
| `frontend/tests/unit/api-errors.test.ts` | 迁移完整请求身份，替换原来的部分身份示例，增加两类终态的运行时负例与正例 |
| `frontend/tests/integration/api-client.test.ts` | 修正错误期待；补 MSW 回执关联、畸形信封、非 2xx、原未知意图后续拒绝及未发送场景 |
| `frontend/tests/msw/fixtures.ts` | 显式请求上下文；夹具必须先接收完整身份，负例通过明确覆盖字段构造 |
| `frontend/tests/msw/handlers.ts` | 正向回执与请求 key/路由目标关联；ACCOUNT_SYNC 改为 ACCOUNT 目标 |
| `frontend/DEVELOPMENT.md` | 更新旧字符串三态说明、身份来源、运行时拒绝及回执终态的含义 |
| `docs/README.md` | 补本轮及 0068 的入口与阅读关系 |
| `docs/changes/README.md` | 补 0068/0069 索引，区分原轮阻塞与本轮修复 |

新增文件：

- `frontend/tests/unit/api-identity.typecheck.ts`：仅编译的公开类型契约正/负例，由现有测试 tsconfig 纳入，不新增配置或依赖。
- `docs/changes/0069-frontend-r2-01-identity-fix/0001-r2-01-fix-agent-prompt.md`：任务书逐字节归档。
- `docs/changes/0069-frontend-r2-01-identity-fix/0002-fix-and-targeted-verification.md`：本报告。
- `docs/changes/0069-frontend-r2-01-identity-fix/README.md`：归档入口、文件关系及校验记录。

既有未跟踪的 0068 不算本轮新增产物，未改写或移动。源码与测试完成后，实际 `git diff --stat` 为 **9 个已跟踪文件、776 行新增、137 行删除**；这个数字不含新类型检查文件、归档文件或既有未跟踪的 0068。

## 2. 根因与最终接口契约

### 2.1 根因

旧 `OriginalOperationIdentity` 的四字段全部 optional，`classifyWriteOutcome` 和 `receiptMatchesRequest` 的 expected 参数也 optional。未传身份会直接匹配，部分身份则跳过未提供字段，导致有效回执在没有可信原请求关联时仍可成为 `applied` 或 `not-applied`。

部分测试还从回执读取字段构造 expected，或者请求使用 `op-1`、回执使用另一个 UUID，ACCOUNT_SYNC 回执目标仍沿用 ORDER/order-1，却期待 applied。它们不能证明原意图身份安全。

### 2.2 类型与真实目标依据

保留现有单一分类入口：

```ts
classifyWriteOutcome(outcome, originalIdentity)
receiptMatchesRequest(receipt, originalIdentity)
```

两个入口的第二参数均为必填 `OriginalOperationIdentity`。该类型位于 `frontend/src/services/api/errors.ts`，四字段均必填且只读：

- `id: string`；
- `kind`：已有后端公开 OperationKind；
- `targetType`：与 kind 对应的具体目标类型；
- `targetId`：目标字符串；PLATFORM_UPDATE 使用字面量 `'platform'`。

类型和运行时共用一个 kind→targetType 映射，不建立第二套分类框架：

| kind | targetType | targetId |
|---|---|---|
| ORDER_CANCEL | ORDER | 原订单 ID |
| TASK_CONTROL | TASK | 原任务 ID |
| USER_UPDATE | USER | 原用户 ID |
| ACCOUNT_RESTRICT | ACCOUNT | 原账户 ID |
| ACCOUNT_CHECK | ACCOUNT | 原账户 ID |
| ACCOUNT_SYNC | ACCOUNT | 原账户 ID |
| ACCOUNT_RECONCILE | ACCOUNT | 原账户 ID |
| PLATFORM_UPDATE | PLATFORM | 固定 `platform` |

依据不是自行发明：`backend/contracts/validation.ts:680-710` 的公开回执要求 targetType/targetId；`backend/src/server/operations.ts:61-98`、`accounts.ts:302-348`、`admin.ts:566-573` 的实际请求描述符给出上述配对。**现有八种操作没有无目标例外。**本轮不新增无目标分支或虚构操作类型。

### 2.3 运行时 fail closed

`receiptMatchesRequest` 是采用回执前的唯一身份检查点：

1. 拒绝省略、null、非对象、数组。
2. 检查 id/kind/targetType/targetId 的运行时类型；id/targetId 为空或纯空白时拒绝。
3. 以自有属性白名单检查 kind，检查 kind/targetType 真实配对及平台固定 targetId。
4. 严格比较回执与原请求的 id、kind、targetType、targetId，缺任何用于关联的回执字段均不匹配。

缺失、不完整、不合法或错配身份统一保留 `intent: unknown`、`reason: receipt-mismatch`。这是可诊断的结构化原因，不把失败隐藏成业务成功，也未为了新增原因字符串重写无关代码。

`success`、`http-error`、`http-data`、`malformed` 中的有效回执均经同一入口；absent/invalid 继续使用自己的原因。transport-error 仍区分发送前 not-sent 与发送后 unknown，不反推原 ID 的历史结论。

**没有把全部结果设为 unknown：**完整、可信且匹配的 SUCCEEDED 仍为 applied，REJECTED 仍为 not-applied；PROCESSING/UNKNOWN/CONFLICT 仍未知。applied 仅表示该 kind 的回执结论，不等于订单成交、任务完成或账户同步成功。

### 2.4 信任来源与静态能力边界

- expected 来自发送前确定并保存的原请求上下文，同一原 ID 同时用于幂等键和关联判断；禁止从响应 operation 反向构造 expected 后与自身比较。
- TypeScript 可强制完整字段、枚举和 kind/target 配对，但不能证明字符串来自哪一次真实用户确认，也不能静态识别任意合法字符串是否是另一个实际 ID。这部分由来源约定和运行时严格关联共同完成，不声称类型系统能证明业务历史。
- 空对象、缺字段等在类型层被拒绝；空字符串字段及实际值错配在运行时拒绝。生产代码没有使用 any 或双重断言规避该契约。
- 没有实现持久化恢复、Session Manager 或新 Feature。未来相应模块仍须保留原 ID 和会话边界，不能因本轮通过而自动重放交易意图。

## 3. 先 RED、再 GREEN 的实际证据

### 3.1 修改生产实现之前

已先新增和迁移测试/夹具，生产 `errors.ts` 仍为旧实现时实际执行：

```text
bun run test:run tests/integration/api-client.test.ts -t R2-01
```

实际退出码 **1**：

```text
Test Files  1 failed (1)
Tests       24 failed | 30 passed | 18 skipped (72)
```

这里 18 个 skipped 是名称过滤排除的既有用例，**不是代码中的 skip，也不是为了绕过失败**。选中的 R2-01 行为用例共 54 项。

失败是运行时语义断言，而非类型编译错误：SUCCEEDED/REJECTED 的缺失、错型、部分身份仍分别得到 applied/not-applied；调用者与回执共同使用错误 kind/target 配对也被旧实现接受。畸形 error 的 operation 被实际解析保留，随后错误采用终态，因此该 RED 覆盖真实 API Client→响应解析→回执分类链。

代表性实际差异：

```text
期望：attempt=unknown, intent=unknown, reason=receipt-mismatch
实际：attempt=unknown, intent=applied, reason=receipt-applied

REJECTED 对应实际 intent=not-applied、reason=receipt-rejected，同样失败。
```

另外，在修改生产代码前建立仓库外当前源码断言：

```text
bun D:/frontend-r2-01-probe-SX9LQS/identity-gate.ts
```

该命令退出 **1**，30 个观测中有 18 个身份保护断言失败；两类完整匹配正例已正常。这不是只证明“所有东西都失败”的探针。

### 3.2 修复同一行为后

修改生产实现后实际执行：

```text
bun run test:run tests/unit/api-errors.test.ts tests/integration/api-client.test.ts
```

退出 **0**，两个文件 **205 个用例全部通过**。同一仓库外断言命令再执行退出 **0**，30 个观测无违例，完整匹配的两类正例仍正常。

随后仅对七个 R2-01 相关代码/测试文件运行一次局部 Biome 格式及导入整理，未格式化全项目；正式全套检查再次覆盖整理后的代码。未宣称所有新单元参数组合都在旧实现上单独跑过：行为 RED 明确来自上面的 MSW 用例和同一仓库外断言。

## 4. 逐项关闭矩阵与类型负例

### 4.1 运行时验收矩阵

| 场景 | SUCCEEDED 回执 | REJECTED 回执 | 对应证据 |
|---|---|---|---|
| 省略 expected / undefined | unknown | unknown | 单元「`$status 回执遇到 $name 时不能确认终态，公开匹配接口也必须拒绝`」；MSW 畸形错误身份矩阵；外部同一断言 |
| null / 空对象 / 原始错误类型 / 数组 | unknown，不抛出采用终态 | unknown，不抛出采用终态 | 同上；单元还含布尔、大整数、符号 |
| 仅 id / 仅 id+kind | unknown | unknown | 单元及 MSW 部分身份矩阵 |
| 缺 targetType / targetId | unknown | unknown | 单元及 MSW 部分身份矩阵 |
| 必填字段空、纯空白、undefined/null、非字符串，即使与伪造回执相同 | unknown | unknown | 单元字段矩阵；避免只比较相等而不检查合法性 |
| 未知 kind，即使回执使用同一未知值 | unknown | unknown | 单元同值负例 |
| kind/targetType 错误配对，即使回执也错误地配成相同值 | unknown | unknown | 单元八种配对负例、MSW 配对负例 |
| 平台无目标或使用其他 targetId | unknown | unknown | 单元固定平台目标负例、编译负例 |
| 四个关联字段逐一错配 | unknown | unknown | 单元和 MSW 回执错配矩阵 |
| 回执缺 id/kind/targetType/targetId | unknown | unknown | 单元缺字段矩阵；MSW 对目标缺失仍保留诊断解析结果但不采用终态 |
| 完整可信身份 + 完整匹配回执 | applied | not-applied | 单元完整匹配正例；MSW 非 2xx 和畸形错误匹配正例 |
| 非 2xx + 完整匹配 | 保留回执并正常分类 | 保留回执并正常分类 | MSW「非 2xx 的匹配回执仍可确认该种操作的结论，不等同于目标业务完成」 |
| 畸形 error + 可解析回执，缺/部分/错身份 | 保留回执但 unknown | 保留回执但 unknown | MSW「畸形错误保留回执，但 `$name` 时不得确认终态」 |
| 畸形 error + 完整匹配身份 | 保留回执并 applied | 保留回执并 not-applied | MSW「畸形错误信封仍保留完整匹配回执，并允许采用该种操作的终态」 |

中间态 PROCESSING/UNKNOWN/CONFLICT 的完整匹配结果仍为 unknown；无回执 4xx、operationAccepted:false、absent/invalid、发送后超时以及发送前取消的相关回归均通过。

首次未知序列由 `api-client.test.ts` 的「手动沿用原 ID 后收到 `$status`、`$name` 且无回执，原意图仍未知」执行：

1. 第一次实际进入 Mock handler 后以网络错误丢失响应，attempted=true、intent=unknown。
2. 测试调用方显式沿用同一 key 再调用，分别收到无回执 401/409/429，含有/没有 operationAccepted:false 两种情况。
3. intent 仍 unknown，断言 key 不变且仅发生两次显式请求，没有自动额外发送。
4. 对同一原 ID 追加已预先取消的本地请求，仍为 not-sent/unknown，handler 次数不增长。

该序列不伪造持久化恢复系统，也不将“本次未发送”解释为原意图历史未执行。

### 4.2 TypeScript 负例证明

`frontend/tests/unit/api-identity.typecheck.ts` 放在现有 `tsconfig.test.json` 的 include 范围，根 tsconfig 也引用该项目；不是未纳入编译的展示文件。它只编译，不执行这些故意非法调用。

实际执行：

```text
bunx --no-install tsc --project tsconfig.test.json --noEmit
```

退出 **0**，无诊断。文件中对两个公开函数分别使用 `@ts-expect-error` 检查省略、undefined、null、空对象、字符串、部分身份、未知 kind/target、非字符串字段、错误 kind/target 配对、平台非固定/无目标等非法调用；八种后端合法组合同时有正常调用正例。若这些非法调用被类型签名放宽为合法，未使用的 expect-error 将让检查失败，而不是静默忽略。

未新增编译配置、类型测试框架或依赖，未用静态报错代替第 3 节的运行时 RED。

## 5. 调用方、Mock 与分层检查

- 当前 `frontend/src/` 没有真实写请求结果消费者；全部现有分类和匹配调用在相关单元/集成测试及仅编译负例中。完整引用检查未发现遗漏的旧 optional 调用；故意省略/非法输入只存在明确的负例。
- `fixtures.ts` 在请求前声明 ORDER_CANCEL_REQUEST、ACCOUNT_SYNC_REQUEST、TASK_CONTROL_REQUEST、ACCOUNT_RECONCILE_REQUEST；不从 `outcome.receipt` 构造 expected。
- `receipt(identity, overrides)` / `receiptJson(identity, overrides)` 的身份参数必填；正例源于请求上下文，负例明确改一个字段或明确构造非法身份。
- ACCOUNT_SYNC 的目标为 ACCOUNT/account-1；handler 从请求 Idempotency-Key 和路由目标构造关联字段，不再沿用 ORDER/order-1。
- 写入的正向用例将同一请求上下文的 ID 传入幂等键，分类使用同一事先确定的上下文；读取类信封中的 unknown 断言明确不是 GET 写入确认。
- 保留三态解析及诊断宽松形状，不因目标缺失抹掉回执，也不因“可以解析”就采纳终态。
- request.ts、response.ts、client.ts 的传输/注入逻辑未改，Native Fetch 没有被替换，没有自动重试、换 key 或新 fallback。
- 保留演示 Mock 与正式 DTO 的界限，未借本轮改造 START 等无关演示模型；未引入 Hono RPC 或新业务页面。

## 6. 本轮实际执行验证

环境：Windows x64；Bun 1.4.3；Node v24.22.0；TypeScript 5.9.3；Playwright 1.65.0。使用既有依赖，未安装替代版本。下列工程命令工作目录为 `frontend/`。

| 命令 | 退出码 | 实际结果 |
|---|---:|---|
| `bun run test:run tests/integration/api-client.test.ts -t R2-01`，修复前 | 1 | 24 failed、30 passed、18 被名称过滤排除；真实运行时 RED |
| `bun run test:run tests/unit/api-errors.test.ts tests/integration/api-client.test.ts`，修复后 | 0 | 两文件 205 passed |
| `bunx --no-install tsc --project tsconfig.test.json --noEmit` | 0 | 类型正/负例检查成功，无诊断 |
| `bun run typecheck` | 0 | `tsc -b --noEmit`，无诊断 |
| `bun run lint` | 0 | `Checked 61 files in 26ms. No fixes applied.` |
| `bun run test:run` | 0 | 13 文件、281 passed，无失败/跳过 |
| `bun run theme:check` | 0 | `Theme outputs are up to date with src\theme\app-theme.ts.` |
| `bun run build` | 0 | 9520 modules；HTML 0.54 kB；CSS 300.41 kB（gzip 46.76）；主 JS 871.99 kB（gzip 267.48）；主 map 4191.94 kB；仍有 >500 kB 警告 |
| `bunx --no-install playwright test` | 0 | 实际新起 Vite WebServer，10 passed（23.5s）；既有 Chromium 回归 |

局部整理的实际命令为：

```text
bunx --no-install biome check --write src/services/api/errors.ts src/services/api/types.ts tests/unit/api-errors.test.ts tests/unit/api-identity.typecheck.ts tests/integration/api-client.test.ts tests/msw/fixtures.ts tests/msw/handlers.ts
```

结果 `Checked 7 files ... Fixed 4 files`；仅针对上述相关文件整理格式/导入，正式 lint 未执行自动修复。

仓库外同一断言的退出码及前后结果见第 3 节；临时目录已清理。没有手动常驻服务，Playwright 使用自己的本地 WebServer，命令已退出。

证据边界：

- **API 语义与身份安全：**真实前端函数、createApiClient、MSW/Mock 响应及反射负例；不是实际后端联调。
- **静态约束：**本轮实际 tsc 编译；不是只贴函数签名。
- **浏览器：**本轮实际运行既有 10 个 Chromium E2E，证明相关页面回归未破坏；未新增 UI，也不把 E2E 当作真实交易或原意图持久恢复认证。
- **未执行：**真实后端/Worker/数据库/账户、真实交易/撤单、Firefox/WebKit、生产部署、覆盖率。覆盖率不是本次关闭条件，没有搬用 0068 的测量值。
- 没有永久 skip/only、关闭检查、升级依赖或改锁文件来获得通过。修复前的名称过滤与修复后完整套件明确区分。

## 7. 定向独立复核与工作区保护

### 7.1 两条独立只读复核

修复和定向 GREEN 后，两个新只读 reviewer 分别核对：

| 视角 | 结论 | 证据范围 |
|---|---|---|
| IdentityContractReview | 接口侧已关闭，未发现新增 P0/P1 | `errors.ts:36-55,65-90,94-146` 的类型、运行时、统一采用路径；后端真实目标依据；解析/传输保留 |
| IdentityConsumerReview | 消费者/测试侧闭合，未发现新增 P0/P1 | 全部引用、请求前身份来源、正确 ACCOUNT_SYNC 目标、运行时矩阵、原未知序列、类型 proof 纳入编译及开发说明 |

reviewer 没有写文件或运行检查；第 6 节的执行证据由主执行者实际产生，不冒充为 reviewer 独立重跑。复核范围仅 R2-01 及相关回归，没有重新审查 UI 选型或尝试修复 P2。

### 7.2 范围与字节证据

实际执行的范围排除检查：

```text
git diff --exit-code -- backend frontend/package.json frontend/bun.lock frontend/src/lib/decimal/decimal.ts frontend/src/components/ui/utc-datetime-field.tsx frontend/src/lib/time/instant.ts frontend/src/lib/time/zoned.ts frontend/src/theme/generated frontend/src/services/api/request.ts frontend/src/services/api/response.ts frontend/src/services/api/client.ts docs/changes/0066-frontend-bootstrap.md docs/changes/0067-frontend-bootstrap-review-fixes.md
```

退出 **0**，无差异输出。工作区检查没有出现 backend 新文件；暂存区仍无差异，未提交/推送。

对历史文档、依赖/锁文件、四个 P2 相关源码、主题 CSS 和三个传输文件共 13 个受保护文件，起止 SHA-256 输出一致。关键快照如下：

| 文件 | SHA-256 |
|---|---|
| 0066 历史记录 | `fc023114f9ae3607d4ec6805db479dc0e42affa23c2d2c62276046cf5abd22b3` |
| 0067 历史记录 | `7dcb2f5d8db5a0c8800c1f8d86681c78e58c098816a352a4024441a96fcd14e7` |
| 0068 历史记录 | `e122e364542882a9ec33fa1102b5ba0da074c61fd7e30424d5ce06dcf034e342` |
| `frontend/package.json` | `cfb3a79cfa6e2617aa33c8c45c0da213f1cdba00538a12e089931681c1069f61` |
| `frontend/bun.lock` | `a65e8dee2f5b3f9de9fd49916b2d4f06287b257542207d9b2311955e5a76d8f0` |
| 修复后的 `errors.ts` | `ea46c42b0b35fa91114659bb1d16675511e9e13630a7a52bc825d9b93e53df8b` |
| 修复后的 `types.ts` | `97a66f24c452a5d9a9d3dac108ec76a528cdca194999c0237853d7394c8ef809` |
| 新类型 proof | `7cc6ded1a98e507053d0b3190c42940efccfdaeeae1c33daea799df794694e30` |

未改 backend 版本、前端包版本、依赖、锁文件、主题生成物、P2 源码或原三份历史记录。构建、测试只刷新忽略的运行产物；未新增 AppShell、Session Epoch、SSE Manager、Operation Recovery、登录、账户或交易 Feature。

## 8. 保留事项与准入结论

### 8.1 已知事项没有被本轮修复

| 编号/事项 | 仍存在的风险与范围 | 接入前条件 |
|---|---|---|
| R2-02 | Decimal 超协议接受域、中间运算精度和规范化闭包；数值工具相关源码未改 | 相应聚合/乘除或更广数值域接入前，明确 scale、数量上限、运算/舍入与输出闭包；不能宣称无限精度 |
| R2-03 | fold 已选后仍显示不可提交提示；UTC 字段源码未改 | 后续修正提示与真实编辑状态的一致性；不把当前正确提交门禁误报为已修复该提示 |
| R2-04 | 纽约极端年份、历史秒级偏移和转换越界；时间工具未改 | 在相应支持域消费前明确/校验边界，不能声称完整覆盖所有年份 |
| 历史超六位有效小数时间 | 后端允许未改历史原串保留，当前前端真实任务编辑尚未接入 | 接入真实任务编辑前落实未改原值透传与新输入校验的区别，不增加任意绕过开关 |
| Bundle/字体/多浏览器/sourcemap | 包体警告仍在；字体、多浏览器与生产 map 策略不是本次关闭内容 | 按相应业务/部署阶段落实；不得把当前构建成功当成生产发布批准 |

这些仍按 0068 的已知非阻塞事项管理；不因本轮未处理它们再次扩大 R2-01 范围，也不删除其风险或写成已修复。

### 8.2 明确回答

1. **R2-01 是否关闭？** 是。完整原请求身份同时成为类型与运行时的终态前置条件，原缺口反例已得到 RED/GREEN 证据。
2. **缺失、空、部分、错配身份是否都不能得到终态？** 是。两类终态均有负例，公开匹配接口也拒绝；回执缺关联字段同样不能确认。
3. **完整匹配正例是否正常？** 是。SUCCEEDED/REJECTED 及非 2xx、畸形错误保留路径都正常，不是“全部 unknown”。
4. **是否有新增阻塞问题？** 本轮 R2-01 定向实现、测试与独立复核未发现新增 P0/P1；没有将结论扩大为全仓或真实后端安全认证。
5. **第一阶段是否可以验收？** 可以。0068 指出的唯一 P1 已关闭，既有技术方向和底座设计保留，已知 P2 不被伪关闭。
6. **第二阶段是否可以准入？** 可以开始此前确定的 AppShell、Session Epoch、API Client 与 Hono RPC 契约接入；须继续遵守运行时 DTO 校验、完整原身份、未知保护和各业务接入前条件。**本轮没有开始这些开发，也没有提前引入 Hono RPC。**

后续验证建议仅针对后续改动：如果新增 operation kind，按真实后端描述符补目标映射和正/负例；真实写入 Feature 接入时，验证发送前身份保存、会话变更和原 ID 恢复，仍不得自动换 key 或重放。当前任务到本报告结束。

### 执行记录

- 能力：task 已用于测试分片及独立只读复核；bash/eval 已执行 RED/GREEN、类型与工程验证；lsp 已尝试但无服务。
- jev：已调用 r2_01_closed、new_blocker、foundation_admission；用于定向关闭及准入判断，不代替代码和运行证据。
- Skill：code-security、tdd、typescript、vitest、msw 已应用；Playwright 复用现有项目套件，未安装工具或改变浏览器配置。
- 例外：LSP 不可用，改用引用检索和实际 tsc；无真实后端/资金认证。R2-02～R2-04 及本节其他事项保留，未擅自修复或开始第二阶段。
