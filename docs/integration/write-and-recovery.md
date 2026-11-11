# 写入、防重复与原 ID 恢复

- 状态：现状参考。
- 基线：后端 **3.0.0**，提交 **d9d758f**。
- 消费者入口：本资料与 [`backend/contracts/client.d.ts`](../../backend/contracts/client.d.ts)、[`backend/contracts/validation.ts`](../../backend/contracts/validation.ts)。这两个生成文件是公开静态类型和校验 schema 的唯一来源；已知运行时空值及错误分支并非均被静态声明穷尽，须按实际载荷检查。本文解释业务含义，不另建 DTO。
- 配套阅读：[业务模型与动作](backend-model-and-actions.md)、[HTTP 与事件](http-and-events.md)、[查询与响应](query-and-response-contracts.md)、[接口目录](api-catalog.md)、[启动与验收](bootstrap-and-acceptance.md)。文末源码链接仅用于审计，不要求消费者回源推断协议。

本文所有路径均相对 `/api/v1`。当前公开写方法只有 `POST`、`PATCH`，没有删除账户、任务、订单、用户、回执或强制释放未知占用的公开接口。

## 1. 先分清三类身份与三层结果

### 1.1 ID 不是同一种东西

| 标识 | 产生者与作用域 | 可以做什么 | 不能做什么 |
| --- | --- | --- | --- |
| `error.requestId`／HTTP `X-Request-Id` | 服务端为每次 HTTP 请求生成 | 排查这一次请求 | 不能去重、恢复原业务或证明未执行；重试会得到另一个请求编号 |
| 高风险操作的 `Idempotency-Key` | 客户端预先生成 UUID；服务端按全局原操作 ID 保存 | 绑定原执行者、操作种类、目标和请求内容；读取持久回执 | 不能跨身份、换目标、换动作或改参数复用 |
| `POST /orders` 的 `Idempotency-Key` | 客户端生成 **1–200 字符、非空且不含 U+0000–U+001F／U+007F 控制字符**的键；作用域为订单所有者 | 找回同一所有者、同一内容的已保存订单意图 | 不等于 operation UUID；不保证跨用户去重；没有专用 GET 按此键查询接口 |
| 订单 `id` | 服务端本地订单 UUID | GET 订单详情、核对、撤单目标 | 不是客户端提交键，也不是官方订单号 |
| 订单 `clientOrderId` | 服务端在保存订单意图时生成并持久化 | 后端始终据此核对同一个官方订单 | 消费者不能自行更换它来“重试原单” |
| 订单 `exchangeOrderId` | 官方返回，可空 | 已有官方订单身份与撤单定位 | 空值不证明订单从未发送；不能据此释放占用 |

高风险 operation UUID 与目标 UUID 均按小写保存；UUID 大小写不产生新操作。订单提交键不是 UUID 专用字段，不应擅自改大小写、截短或重新生成。即使统一选择 UUID 作为订单提交键，也必须区分这两套恢复协议。

### 1.2 HTTP、操作应用、外部业务各自判断

1. **HTTP 请求结果**：是否取得响应，响应是 `{ data }` 还是 `{ error }`，HTTP 状态及错误码是什么。
2. **原操作是否应用**：有回执时看 `operation.status`、`phase`、`outcome` 和冻结的 `result`；不能用最新对象外观代替原回执。
3. **业务是否达到用户目标**：再看连接、资产、订单、任务、核对记录自己的状态及证据门禁。

因此，下列组合都是真实协议，而非异常格式：

- HTTP 200 + `operation.status=SUCCEEDED` + 账户 `connectionStatus=ERROR`：检查流程与结果保存已完成，连接检查未通过。
- HTTP 502／429 + `operation.status=SUCCEEDED`：本地写入已经提交，后续钱包／订单读取失败；不得重复应用已经完成的控制。
- HTTP 201 + 订单 `status=UNKNOWN` 或 `REJECTED`：下单接口返回了持久订单，不代表交易所受理或成交成功。
- HTTP 200 + 原操作仍 `UNKNOWN`：恢复接口的查询成功，不代表原操作已经解决。
- HTTP 202 + 非空 `data`：本次工作返回了对象，但仍无可信操作终态；对象不是终态证据。

## 2. 全部写接口矩阵

所有写请求均要求可信 `Origin`；登录以外还要求有效会话与 `X-CSRF-Token`。JSON 请求同时发送 `Content-Type: application/json`。这些条件与业务 ID 要求是两套独立门禁。认证与跨源细节见 [HTTP 与事件](http-and-events.md)。

表内形状约定：

- **普通成功**：`{ data: 返回值 }`，没有顶层 `operation`。
- **跟踪成功／处理中**：无本次失败时为 `{ data: 返回值或 null, operation: 原回执 }`；回执 `SUCCEEDED` 返回 200，其余未解决状态返回 202。
- **普通错误 E**：`{ error: { code, message, requestId, ...可选信息 } }`，没有保证存在的 `data` 或 `operation`。
- **跟踪错误 T**：`{ error: { ... }, operation: 原回执 }`，使用本次真实错误状态；回执仍可能 `SUCCEEDED`。登记本身或更早层失败时也可能仅有 E，必须保留原 ID。
- “无回执”是指没有统一的 `OperationReceipt`，不是“数据库不保存业务对象或审计”。给这些接口额外加 `Idempotency-Key` 不会获得统一回执或去重能力。

### 2.1 认证与账户

| 方法、路径 | 原 ID 请求要求／持久回执 | 正常响应及失败形状 | 副作用、冲突与恢复入口 |
| --- | --- | --- | --- |
| `POST /auth/login` | 不需要；无回执 | 200，`data.user`、`data.csrfToken`，设置会话 Cookie；失败 E | 创建本地会话及审计，不向官方下单。响应丢失先 GET `/auth/me` 判断浏览器现有会话；不能证明某一次登录是否建过会话 |
| `POST /auth/logout` | 不需要；无回执 | 200，`data.loggedOut=true`，清 Cookie；失败 E | 撤销当前会话。随后 `/auth/me` 的 401 说明当前已无法认证，不是原请求回执；已失效时不循环提交退出 |
| `POST /auth/password` | 不需要；无回执 | 200，`data.changed=true`、`data.reauthenticate=true`，清 Cookie；失败 E | 验证旧密码，原子更新密码、撤销此用户全部会话及记录审计。无原 ID 查询，也不回显密码；响应丢失后的限制见第 8 节 |
| `POST /accounts` | 不需要；无回执 | 201，安全账户投影；失败 E | 加密保存凭据与本地审计；不读取官方资产，不代签、不启用交易。每交易员至多一个活动账户，但这不是请求去重。丢失响应读账户列表，不盲目重建 |
| `PATCH /accounts/:id` | 不需要；无回执 | 200，安全账户投影；失败 E | 交易员修改自有账户；同账户存在未解决 operation 时拒绝。换凭据、禁用、停止新增交易会影响原核对链／任务，详见第 8 节；GET 当前账户只能确认当前字段 |
| `POST /accounts/:id/check` | **必须 UUID**；`ACCOUNT_CHECK` | 跟踪 200／202 或 T；官方检查失败通常仍 200，并在账户结果中体现 `ERROR` | 交易员执行；读取官方规则、私有订单连接与钱包，保存本次结果。与同账户其他未解决 operation 互斥；GET `/operations/:原ID` 恢复原结果，不重新检查 |
| `POST /accounts/:id/assets/sync` | **必须 UUID**；`ACCOUNT_SYNC` | 跟踪 200／202 或 T；钱包失败可为错误 HTTP + **成功回执** | 自有账户交易员或管理员；读取钱包并保存快照／失败标记。与同账户 operation 互斥；GET 原回执，不用当前余额证明原同步成功 |
| `POST /accounts/:id/reconcile` | **必须 UUID**；`ACCOUNT_RECONCILE` | 跟踪 200／202 或 T；`data` 为核对记录，不是账户 DTO | 自有账户交易员或管理员；冻结原核对范围，逐单取证、推进已有任务，读官方历史／钱包并保存记录。不补下单、不撤单；中断只能按原 operation ID 继续，详见第 6 节 |

### 2.2 订单与任务

| 方法、路径 | 原 ID 请求要求／持久回执 | 正常响应及失败形状 | 副作用、冲突与恢复入口 |
| --- | --- | --- | --- |
| `POST /orders/preflight` | 不需要；无回执 | 200，`PreflightResult`，可能 `ok=false`；失败 E | 交易员；读取当次规则、报价、资金／库存并在锁内校验。不创建订单、不锁资、不形成可兑现的“预检票据”；正式提交仍独立校验 |
| `POST /orders` | **必须订单提交键：1–200 非控制字符**；只持久保存订单意图，**不建 operation 回执** | 201，安全订单投影，重复命中也为 201；失败 E | 交易员；事务保存唯一意图、`clientOrderId`、预留和账本后才可能真实下单。同所有者原键同内容只返既有订单，改内容 409 `IDEMPOTENCY_CONFLICT`。GET `/orders/:订单ID`、POST 订单核对；原键重取的限制见第 7 节 |
| `POST /orders/:id/cancel` | **必须 UUID**；`ORDER_CANCEL` | 跟踪 200／202 或 T | 仅交易员撤自有订单。先核对原单，撤单开始落库后才可能发送一次官方撤单；原订单未知／证据未齐时不能新发撤单。与同订单未解决 operation 互斥；GET／POST 原 operation 恢复，不换 key 重撤 |
| `POST /orders/:id/reconcile` | 不需要；无独立回执 | 200，安全订单投影，仍可能 `UNKNOWN` 或证据未齐；失败 E | 自有订单交易员或管理员；按原 `clientOrderId` 只读核对官方并结算已有证据，推进相关任务但不新增订单。它不重发下单或人工撤单；如已有撤单 operation，随后仍需读该原回执 |
| `POST /tasks` | 不需要；无回执 | 201，任务行；失败 E | 交易员；读取规则、报价和挂单数后仅保存 `CREATED` 配置，**不启动、不生成订单、不锁资金**。名称不构成请求唯一键；重复请求可生成多个任务 |
| `PATCH /tasks/:id` | 不需要；无回执 | 200，任务行；失败 E | 交易员；全量提交 `TaskInput`，非字段增量 patch。仅未启动或暂停等允许状态可编辑，同任务未解决 operation 阻断编辑；可能调整已有订单的本地等待截止，但保存本身不下单／撤单。响应丢失只能核对当前配置及事件 |
| `POST /tasks/:id/control` | **必须 UUID**；`TASK_CONTROL`，请求 `{ action }` | 跟踪 200／202 或 T；本地控制成功后，外部核对失败仍返回真实错误 | 交易员可 `start/pause/resume/stop/reconcile`；管理员只能 `pause/stop/reconcile`。同任务未解决 operation 互斥；`start/resume` 可使后续 Worker 产生实盘订单；`pause/stop/reconcile` 会核对原单，且可能执行**原已配置且到期的自动撤单**，不是无副作用纯查询 |

### 2.3 管理与恢复

| 方法、路径 | 原 ID 请求要求／持久回执 | 正常响应及失败形状 | 副作用、冲突与恢复入口 |
| --- | --- | --- | --- |
| `POST /admin/users` | 不需要；无回执 | 201，公开用户字段；失败 E | 创建本地用户并存密码哈希、审计；用户名唯一，但不是原请求回执。管理员权限门禁与限流仍适用；丢失响应按用户名核对列表，不能改名重建来“补成功” |
| `PATCH /admin/users/:id` | **必须 UUID**；`USER_UPDATE` | 跟踪 200／202 或 T | 原子修改状态／管理员管理权限并保存回执。禁用或管理权限变化使目标会话失效；禁用使关联任务安全停机且保留挂单。保护最后一个活动管理员；同用户未解决 operation 互斥 |
| `PATCH /admin/accounts/:id` | **必须 UUID**；`ACCOUNT_RESTRICT` | 跟踪 200／202 或 T | 原子修改平台账户限制与回执，限制时安全停机但不撤销挂单／释放未知占用。解除平台限制不替交易员开启交易或恢复任务；与同账户 operation 互斥 |
| `PATCH /admin/system` | **必须 UUID**；`PLATFORM_UPDATE` | 跟踪 200／202 或 T | 原子保存平台设置与回执。急停阻止新增意图并安全停机，已有挂单继续核对；解除急停不自动恢复。冲突范围为唯一 `PLATFORM:platform` |
| `POST /admin/endpoints/benchmark` | 不需要；无回执 | 200，`data.results`、`data.selected`、`data.measuredAt`；失败 E | 管理员；读官方连通性，指定 `accountId` 时读该账户规则。记录审计，最近结果仅为当前 API 进程内存；`selected` 不是已持久切换节点或写请求重试授权 |
| `POST /operations/:id/reconcile` | 路径 **已有原 operation UUID**；**不要求新 `Idempotency-Key`，不接收新业务参数** | 200，`{ data: 原回执 }`，其中仍可能未解决；失败 E，不保证附顶层 `operation` | 先读原回执再按 kind 核对／继续允许的原流程；不创建一个“恢复操作”的新回执。原执行者、其他读者及各 kind 限制见第 5 节 |

所有接口都可能在认证、来源、CSRF、请求体大小、校验、权限或限流阶段失败；没有统一“所有 4xx 都未执行”规则。矩阵不把通用错误层虚构成各接口的固定错误 DTO。

## 3. 高风险回执：形状、登记与冲突

### 3.1 回执的稳定部分

使用公开 `OperationReceipt`／`operationReceiptSchema`，不要从服务端表结构导入类型。可依赖的共同语义如下：

- `id`：原操作 UUID；`actorUserId`：**原执行者**，不是当前读取者。
- `kind`、`targetType`、`targetId`：原操作绑定身份；一个账户核对记录的 `result.id` 不等于目标账户 ID，应对照 `result.exchangeAccountId`。
- `status`：原操作的应用状态；`phase`、`outcome`：阶段和结论说明，不是 HTTP 状态，也不是订单／任务状态。
- `createdAt`、`updatedAt`、`finishedAt`：原回执时间。终态 `SUCCEEDED/REJECTED` 有 `finishedAt`；未解决状态为 null。时间经过本身不结束操作。
- `result`：可空、按 kind 和阶段解释的 JSON 对象；不是公开的全 kind 判别 DTO。对需要的字段做运行时检查，缺失时保留未知，而不是强制断言成账户／订单／任务。
- `error`：原回执保存的 `{ code, message }` 或 null，不含原 HTTP 状态、`requestId` 或完整异常。它与这次 HTTP 的 `error` 不是同一个对象。

请求内容指纹绑定**原执行者 + kind + 目标类型 + 目标 ID + 输入**。对象属性顺序不会制造新内容；但同一 HTTP 请求体在前置拒绝登记与正常执行路径上可能产生不同输入指纹，见第 3.2 节。不要自行重算价格、金额、时间或默认值，也不要假设看似等值的字符串一定具有同一指纹。

同一个原 UUID 只登记一次。请求到达跟踪登记层后，按已有回执与实际身份／指纹比较；下表的回执状态行均以身份与指纹匹配为前提：

| 已有回执 | 重复请求行为 |
| --- | --- |
| `SUCCEEDED` | 200，`data` 为原 `result`，附原回执；不再运行原业务副作用 |
| `REJECTED` | 409，带保存的错误码／消息和原回执；不会因条件后来改善而重新执行。首次拒绝原本可能是 403／404／422／429，重取的 409 不恢复首次 HTTP 状态 |
| `PROCESSING/UNKNOWN/CONFLICT` | 202，通常 `data=null`，附已有回执；不接着执行，也不重发。应 GET 原回执，必要时调用原 ID reconcile |
| 原 ID 尚在并发登记、尚不可读取 | 可返回 409 `OPERATION_IN_PROGRESS`；只保留原 ID 继续查询，不能另生成 ID |
| 跨身份、跨 kind／目标或输入指纹不同 | 409 `OPERATION_KEY_CONFLICT`；不改变原绑定，也不是重置授权。相同请求体也可能因第 3.2 节的路径差异而指纹不同 |

重复“写”接口还会经过当前会话、CSRF、参数、路由权限及部分目标归属校验，所以恢复首选专门的 GET，而非依赖重复业务接口永远能到达回执层。

### 3.2 前置失败何时留下回执

跟踪路由进入业务包装后，先尝试登记原 ID，再运行工作；此后不能把异常解释为“尚未受理”。服务端也为符合条件的前置拒绝补写原 ID 证据：

- 已通过认证、`Origin` 在允许集合中、携带有效原 UUID，且路径属于表中的跟踪操作时，CSRF、角色、参数等前置拒绝可登记 `REJECTED + NOT_APPLIED`，不执行业务回调。
- 在上述条件成立且登记成功时，可信来源的 CSRF 失败也会记录拒绝；**不会因登记而绕过 CSRF 执行业务**。修复令牌后不能用已拒绝 ID 重新执行；取得原拒绝证据后，新的明确意图使用新 UUID。
- 无有效会话、来源不可信、缺少／非法 UUID，或请求在更早的请求体大小等层被拒绝时，不保证登记回执。账户目标路径本身无有效 UUID时也不能保证建立该账户操作记录。
- 若同一 ID 已经绑定内容，拒绝登记也不能覆盖它；指纹不匹配时可能发生冲突，不保证响应附上原回执。原 ID 的现有回执仍是原操作证据。
- 工作在 `REGISTERED` 阶段抛出明确的 4xx `BusinessError`，可直接形成 `REJECTED/NOT_APPLIED`；无法证明未应用的故障保留 `UNKNOWN`。已经提交的终态不会被随后异常倒退。

**登记输入的路径差异**：带 JSON 业务参数的操作在前置拒绝登记时，对请求 JSON 的原始解析值生成指纹，未经过对应的 Zod 校验、修剪或默认值处理；解析失败取 `null`。正常执行则使用路由通过 Zod 校验后的输入（任务控制取其中的 `action`）。账户检查／同步／核对及订单撤单在前置登记和正常执行时均固定使用 `{}`。这里的“原始”指 JSON 解析值而非 HTTP 字节：对象键按规范顺序处理，但输入字符串等值不会因此自动归一化。

例如，管理员对存在且有权访问的账户 PATCH `/admin/accounts/:id`，请求体为 `{"adminTradingBlocked":true,"adminBlockReason":"  风控  "}`。若可信来源下因缺 CSRF 而前置拒绝且成功登记，指纹中的原因保留两侧空格；修复 CSRF 后以同一身份、原 UUID 和相同请求体到达正常执行时，Zod 的 `trim()` 将原因变为 `"风控"`，指纹因而不同，可能返回 409 `OPERATION_KEY_CONFLICT`，而非直接返回保存的拒绝。已通过独立公开 schema 探针确认 trim；此冲突是依据当前源码的推断，**未做真实 HTTP + PostgreSQL 全链路重现**。

恢复首选 GET `/operations/:原UUID`，核对原身份和回执；不能把冲突或 404 当成原请求未执行的证明，更不能为消除冲突而自动换 ID 重发未知写入。只有取得相关原操作的可信终态、并确认不存在其他未解决阻塞后，用户提出新的明确意图时才使用新 UUID。

### 3.3 `error.operationAccepted`、`details` 与顶层 `operation`

- `error.operationAccepted` 当前只会显式出现 **false**，表示**这一次 HTTP 请求**在跟踪执行入口前遭拒。它不是“回执一定不存在”，也不证明同 ID 的较早请求未执行。
- 进入可能登记的阶段后该属性省略，**省略不等于 true，也不等于成功**。普通无回执接口通常也没有这个标记，不能把它们自动视为“已受理”。
- 前置拒绝响应可能同时保留 `operationAccepted:false`，又附上已登记的 `REJECTED` 回执；若 ID 已存在且指纹匹配，附回的也可能是更早的原回执。指纹冲突时不保证附回执。按原 ID 判读顶层 `operation`，不要仅由 false 清除旧的未解决记录。
- 本次新 ID 因目标繁忙被拒绝时，顶层 `operation` 是**本次被拒绝的回执**；`error.details.blockingOperation` 才是**阻塞它的旧回执**。后者只能向有读取权限者返回。不要拿本次 `NOT_APPLIED` 去解除旧操作的保护。
- `details` 是可选诊断信息，不保证存在，也不是字段校验问题列表或新的业务结果对象。未知字段安全忽略；校验错误主要通过 `code/message` 表达，不回显敏感输入。
- 有 T 时同时呈现 HTTP 错误和回执结论；例如“暂停已应用，但后续订单核对被限流”。不要隐藏真实错误，也不要把成功回执改写成失败。

公开客户端声明不是全局错误的穷尽联合：部分分支把 `error.details` 静态推断为 null，但实际目标冲突响应可以带上述 `blockingOperation` 对象。消费者应先把非预期错误响应作为未知 JSON 检查，再用公开 `operationReceiptSchema` 校验其中的回执；不要因静态类型未列出就丢掉阻塞原 ID，也不手工维护第二套错误 DTO。

### 3.4 冲突范围不是全站总锁

未解决集合是 `PROCESSING/UNKNOWN/CONFLICT`。服务端对同一个 `targetType:targetId` 保留一个未解决占位；另一 UUID 的同目标请求会登记新的 `REJECTED/NOT_APPLIED`，不会执行工作。

| 范围 | 互斥操作／额外影响 |
| --- | --- |
| `ORDER:订单ID` | 该订单的跟踪撤单；不同订单的 operation 不因此互斥 |
| `TASK:任务ID` | 所有任务控制动作共用范围；任务编辑也检查该未解决保护 |
| `ACCOUNT:账户ID` | 连接检查、资金同步、账户核对、管理员限制共用范围；交易员账户编辑也检查保护。账户 A 未解决不阻断账户 B 的相应操作 |
| `USER:用户ID` | 此目标的管理员用户修改 |
| `PLATFORM:platform` | 全部平台设置修改 |

这只是 operation 冲突范围，**不是“有一个账户操作就冻结该账户全部 API”**。订单未知、费用、库存、资金守恒、权限、平台急停和 Worker 就绪另有业务门禁；不要由未命中 operation 锁推断允许交易。

## 4. 全部 status、phase、outcome 的含义

### 4.1 `status`

| 值 | 含义与消费者处置 |
| --- | --- |
| `PROCESSING` | 原执行者仍可能执行；保持防重复，只读查询，不并发另发新意图 |
| `UNKNOWN` | 暂无可信终态，可能已部分应用或发送外部请求；保留 ID、范围保护和已有占用，按原 ID 核对 |
| `CONFLICT` | 公开契约保留的未解决状态；与前两项同样保留保护。当前普通 HTTP 409／`OPERATION_KEY_CONFLICT` 不会自动把回执改为此状态 |
| `REJECTED` | 此原操作已证明未应用；通常 `outcome=NOT_APPLIED`。不是原目标没有其他未知写入。需改变条件／意图时另建新 ID，不让旧 ID重新执行 |
| `SUCCEEDED` | 该 kind 定义的本地应用／核对流程完成；仍需解释 outcome 与 result。不是“官方连通、资产可用、订单已撤／已成交、任务已完成”的统一同义词 |

### 4.2 当前阶段字符串

`phase` 在公开 schema 中是字符串而非封闭枚举；以下是基线实际使用的全部阶段，未知新值仍按 `status` 保守处理。

| 阶段 | 适用情形与限制 |
| --- | --- |
| `REGISTERED` | 已登记，尚无原子业务提交或持久发送／核对开始证据。检查／同步网络读取期间也可能停留此阶段，不能按时间自行判定未执行 |
| `CANCEL_INTENT` | 原订单撤单意图或既有撤单开始已绑定；保留原 `clientOrderId`。不等于本次已发送或已撤成功 |
| `EXTERNAL_STARTED` | 撤单将进入外部发送链；即使响应超时也不能凭等待时长解锁 |
| `RECONCILE_STARTED` | 任务核对开始；或账户已保存原核对计划。账户的 result 此时是计划，不是终态核对记录 |
| `LOCAL_APPLIED` | 本地业务结果与原回执已原子提交；包括管理修改、检查／同步、账户核对、任务控制、确定未发送意图的本地终止 |
| `CONFIRMED` | 原撤单终态证据已绑定，或恢复的任务核对已经完成。须结合 outcome，不能把所有该阶段都显示为“撤单成功” |

确定本次撤单在发送前被本地门禁阻止时，服务端可以撤回自己的撤单开始标记并回到 `REGISTERED`；这是服务端持有的“本次未发送”证据，不是浏览器从 429 猜出的结论。

### 4.3 当前结论字符串

| `outcome` | 可作的陈述 |
| --- | --- |
| null | 尚无已保存结论；不补默认成功／拒绝 |
| `NOT_APPLIED` | 此原操作未应用；须与旧阻塞操作分开 |
| `CONTROL_APPLIED` | 本地控制已提交，如任务状态、用户、账户限制、平台配置；不是后续外部读取全成功 |
| `ACCOUNT_CHECK_COMPLETED` | 本次检查结果已保存；检查可为 `ERROR` |
| `ACCOUNT_SYNC_COMPLETED` | 本次钱包同步结果／失败标记已保存；不保证取得新钱包 |
| `RECONCILIATION_COMPLETED` | 本次任务或账户核对流程已完成；账户记录可以是差异、不可用或部分核对 |
| `CANCEL_CONFIRMED` | 原订单已有 `CANCELED` 且释放条件已满足的证据 |
| `TARGET_TERMINAL_OTHER` | 目标已是其他终态，例如撤单前已成交、过期或拒绝；不可显示为“成功撤单” |
| `LOCAL_INTENT_ABORTED` | 确定未向交易所发送的原本地意图已终止并释放本地预留；不是一次官方撤单 |

## 5. GET 与原 ID reconcile 的恢复协议

### 5.1 三个入口

| 入口 | 返回与允许的行为 |
| --- | --- |
| `GET /operations` | `{ data: OperationReceipt[] }`；枚举当前可读、扫描时未解决的记录，不分页，不提供完整终态历史。读取过程中可能刚把某项终结，因此结果中可以含刚结束的回执；没有某项不等于它未执行 |
| `GET /operations/:原UUID` | `{ data: OperationReceipt }`；恢复首选。**不访问官方，不重执行业务**。可依据已经持久化的事务／原订单证据推进回执，不是纯静态缓存读取 |
| `POST /operations/:原UUID/reconcile` | `{ data: OperationReceipt }`；无需新 key、不携新 action；200 仍可能 `PROCESSING/UNKNOWN/CONFLICT`。调用自身失败时保留原 UUID，再 GET 原回执，不把恢复 HTTP 错误当原操作拒绝 |

GET 会与原执行者及业务事务互斥取证：

- 原执行者仍持有执行保护时，不抢跑判定未应用。
- 原执行者结束、事务已提交／回滚后，若仍只有 `REGISTERED` 而无业务或外部开始证据，可原子终结为 `REJECTED/NOT_APPLIED`，错误码 `OPERATION_NOT_APPLIED`。
- 原撤单已绑定同一 `clientOrderId`，且本地已有满足条件的可信终态，可据此完成原回执。
- 已有更深阶段却证据不充分时保持未知；不会把最新账户／任务外观、HTTP 超时或“很久没更新”当未应用证明。

### 5.2 谁能读、谁能继续

**读取权限**：原执行者可读自己的回执；管理员可读；对于 `ORDER/TASK/ACCOUNT` 目标，当前资源所有者也可读相应回执。针对 `USER` 的修改不是“目标用户本人必然可读”，仍遵守原执行者／管理员规则。

原操作不存在及存在但无权读取均返回 404 `OPERATION_NOT_FOUND`，但 `message` 不同：前者为“尚未找到原操作，不能据此判定未执行”，后者为“原操作记录不存在或无权读取，不能据此解除保护”。两种错误均不返回回执业务正文，**不等于无法通过消息差异推断记录存在性**；不能把状态码相同视为存在性隐藏保证。账户、订单、任务的不存在与越权还使用不同错误码，见[查询与响应](query-and-response-contracts.md#21-每个公共-filter-路由的真实映射矩阵)。任何 404 都不能解除未知操作保护。

**重放权限**：能读不等于能以业务接口复用 ID。若到达登记层，跨执行者重放原 UUID 会返回 `OPERATION_KEY_CONFLICT`，管理员也不能冒充原执行者；请求也可能先被权限等门禁拒绝。

| kind | POST 原 ID reconcile 实际能做的事 |
| --- | --- |
| `ORDER_CANCEL` | 对原 `targetId` 执行原订单核对，再依据原绑定 `clientOrderId` 与终态证据完成回执；**不重新发送人工撤单**。其他有权读者可核对，但不能改原订单身份 |
| `TASK_CONTROL` | 对原任务执行 `reconcile`，不是再次执行原 `start/resume/pause/stop`。核对已有订单，按原配置处理到期自动撤单，不新增订单；原核对处于 `RECONCILE_STARTED` 时可完成原核对回执 |
| `ACCOUNT_RECONCILE` | 恢复原上下文与原冻结范围；**仅原 `actorUserId` 可继续未解决的流程**，其他管理员或所有者只有读取权，继续时 409 `OPERATION_KEY_CONFLICT` |
| `ACCOUNT_CHECK/ACCOUNT_SYNC` | 不重新发起官方读取。GET 依据原原子结果确认终态／未应用；需要一次新读取时，待原回执解决后使用新 UUID |
| `USER_UPDATE/ACCOUNT_RESTRICT/PLATFORM_UPDATE` | 不再次修改对象。原业务与回执原子提交；GET 读取原结论，不能用当前对象快照替代原结果 |

`TASK_CONTROL` 绑定的是原任务与原 action 的指纹，不像 `ACCOUNT_RECONCILE` 那样保存冻结的 `orderIds/taskIds/historyTo` 计划。恢复核对列出该 `taskId` 当前关联的已有订单，逐一保持各自原订单身份；不因此补发原控制动作或生成新订单。

任何 kind 的终态回执再次 reconcile 都只返回该终态，不重新跑副作用。因此：暂停已成功而后续读取失败时，对**已成功的暂停回执** reconcile 不会重做该外部读取。要追踪当前订单可调用订单核对；要单独核对任务，可提交新的、明确 `{ action: 'reconcile' }` 意图并用新 UUID，而不是重发 `pause/start`。

若原账户核对执行者无法再次登录，其他管理员不能用新身份接管该未解决 UUID；当前公开 API 没有强制接管、删除回执或跳过保护的接口。应保留证据、由运维排查原身份与后端状态，不能在客户端伪造终态或换 ID 绕过。

### 5.3 永远不能据此解锁的信号

- 原 ID GET 404：可能尚未登记、读者无权、目标权限变化或请求未到达；不是原操作未执行证明。
- 目标 GET 404、目标被停用／不可见、某分页没有该对象：不解除旧 ID 的未知保护。
- 清除客户端存储、切换页面、关闭标签页、浏览器 Abort／网络超时：不取消服务端工作或外部请求。
- 超过 30 秒、超过执行窗口、订单显示终态但费用／库存未确认：不允许客户端释放资金或补单。30 秒本地未发送租约只由后端结合“无发送开始、无官方订单号、零成交”等证据处理。
- 官方查询暂时查无单、重复 ID、限流或超时：不代表原提交／撤单未发生；只核对原单。
- 新请求得到 `REJECTED/NOT_APPLIED`：只证明新请求未应用，不能覆盖旧的 `blockingOperation`。
- 急停解除、用户重新启用、平台账户限制解除：不自动恢复任务，不重置订单身份或占用。

## 6. 账户三种原操作与冻结结果

### 6.1 `ACCOUNT_CHECK`

执行一次官方规则、私有连接与钱包读取，再把账户状态和安全投影、审计、`ACCOUNT_CHECK_COMPLETED` 回执一起提交。`result` 是**该次提交时的安全账户投影**，后续改名、同步或开关变更不会改写它。

- 官方读取失败可保存 `connectionStatus=ERROR`、`connectionMessage`、`walletSyncError`；operation 仍 `SUCCEEDED`，因为已完成检查并保存真实结果。
- 可能已有部分钱包读取成功，但只要检查未整体通过，就不能仅凭余额把连接显示为可交易。
- 不启用 `tradingEnabled`，不代签声明，不保证当次资金或具体证券可卖量满足下单。
- 原事务与成功回执不能一起提交时，不能拿当前账户证明本次检查完成；原执行者结束后 GET 可据原事务证据判为 `NOT_APPLIED`。

### 6.2 `ACCOUNT_SYNC`

只读取真实钱包，再原子保存本次钱包快照或失败标记、安全投影、审计及 `ACCOUNT_SYNC_COMPLETED` 回执。

- 成功时 `lastSyncAt` 更新为取得本次快照的时间。
- 外部读取失败时可保留旧 `walletSnapshot/lastSyncAt` 作历史证据，同时保存 `walletSyncError`；`assetsAvailable=false`、`availableCash=null`，不能把旧钱包重新解释为当前可用资金。
- 保存完成后才把真实读取错误返回给 HTTP。因此可能收到 `{ error, operation: { status:'SUCCEEDED', error:null, result:… } }`，不含 `data`；应从回执读取冻结结果并同时说明同步失败。
- GET 同 UUID 读取原冻结结果；即使后续官方已恢复，也不会自动产生一次新同步。

### 6.3 `ACCOUNT_RECONCILE`

该 kind 不是“读当前账户然后显示已核对”：

1. 在逐单写入前保存 `RECONCILE_STARTED` 计划，`result` 包含 `exchangeAccountId`、`orderIds`、`taskIds`、`historyTo`。
2. 只继续计划内的本地订单和任务，按原订单 ID／`clientOrderId` 获取最新可信证据；中断前已提交的逐单结算保留，不重发原单。
3. 官方订单／成交历史查询沿用原 `historyTo`，不把恢复时刻替换成新的截止。
4. 读取钱包后，账户钱包状态、核对记录、相应审计和成功回执一起提交；`result` 此时替换为原核对记录。

冻结的是**本地对象集合与历史查询上界**，不是冻结官方余额或成交快照。后来创建的本地订单／任务不作为该原计划的逐项核对对象；恢复仍会取得原对象的最新证据。不能把后来新增订单、当前账户快照或新 `historyTo` 塞入旧 ID。冻结计划缺失、结构不符或账户不符时返回 `OPERATION_EVIDENCE_INVALID` 等错误并保留保护，不自动“重建为当前范围”。

中途失败可以留下部分订单已结算、原 operation 仍 `UNKNOWN` 的状态。GET 只能读已有证据，不做外部请求；原执行者 POST `/operations/:原ID/reconcile` 才继续原计划。同账户新的检查／同步／核对／限制被阻断，无关账户仍可操作。

完成回执的 `result` 是核对记录，至少按公开契约理解 `id/ownerUserId/exchangeAccountId/status/details/createdAt`。其业务 `status` 与 operation status 不同：

| 核对记录 `status` | 基线判定 |
| --- | --- |
| `DIFFERENCE` | 原范围仍有未知／未释放／卖出库存待核对订单，或官方历史存在不属本地已知订单的订单 |
| `UNAVAILABLE` | 没有可用资金钱包，或官方历史读取失败；前项差异优先于此项 |
| `PARTIAL` | 上述已查部分完成，但并不声明完整官方股票总持仓及现金结算已核实 |

当前账户核对不会生成“全量一致”结论。`details` 中可用于解释的字段包括：`assetsAvailable`、`walletSnapshot`、`walletError`、`unresolvedOrderIds`、`unmanagedExchangeOrderIds`、`exchangeTradeHistoryTotal`、`historyError`、`message/note`。`cashBalance`、`officialPositions` 保持 null；外部历史订单不自动补成本地交易意图，也不自动导入其成交。`SUCCEEDED + DIFFERENCE/UNAVAILABLE/PARTIAL` 表示记录已完成，不代表这些差异消失。

## 7. 下单、撤单、任务控制的金融恢复边界

### 7.1 三类订单共用同一提交键规则

- 限价单绑定账户、证券、方向、价格、股数、交易时段和有效期。
- 市价买入绑定账户、证券、方向、类型、**本金 `notional`** 和 DAY；不接受价格或股数替代本金。
- 市价卖出绑定账户、证券、方向、类型、**股数 `quantity`** 和 DAY；不接受本金代替股数。
- 同所有者、原键与持久业务内容相同返回既有订单；十进制等值内容按业务值比较，不因 `1`／`1.0` 产生第二单。账户、类型、方向、数量／本金等实质改变则 `IDEMPOTENCY_CONFLICT`，不可换一个 key 自动续发。

保存订单意图、唯一 `clientOrderId`、本地资金／库存预留及预留账本后，服务端才允许进入外部发送；外部提交前还要再次校验。买单预留含估算费用，卖单预占原股数；估算费用不是实际费用。

**登记前失败没有订单回执**：schema、权限、当次资金／库存／规则等前检可能在订单插入前拒绝，提交键此时未必有持久记录。后续相同 key 再 POST，若仍无订单，可能是一次真实的新执行；它不是纯 GET 恢复操作。

恢复次序：

1. 已知本地订单 ID：GET `/orders/:id`，需要最新官方证据时 POST `/orders/:id/reconcile`。
2. 只知原提交键：可在本人订单分页结果中按返回的 `idempotencyKey` 精确核对；没有专用按 key 的 GET／筛选。列表搜索无结果不能证明未插入。
3. 服务端支持以**同执行者、同 key、同业务内容**再 POST `/orders` 找回已存在订单，命中时不再次 dispatch。但这不是无副作用查询：若原意图从未保存且条件已改变，可能真的下单。仅在用户仍明确要继续该原意图时受控采用，不装进无条件网络重试器。
4. 一旦拿到原订单，后续未知只围绕原 ID／`clientOrderId` 核对；不得再换 key 提交“同一单”。

订单 key 按所有者隔离，不能把旧用户 key 搬给新用户作为恢复。当前用户失效或失去账户权限时，即使订单已存在，重复业务接口也可能在抵达去重层前被拒；保留原证据并恢复正确身份，不改账户来试探。

### 7.2 撤单不是“按按钮即释放”

1. 完全未发送的本地意图可以由后端确定终止，形成 `LOCAL_INTENT_ABORTED`；不伪造官方撤单。
2. 已进入提交链的原订单先核对。`UNKNOWN/SUBMITTING/PLANNED`、无官方订单号或 `tradeEvidencePending` 等不满足条件时，不发送新撤单。
3. 合格原挂单先持久化 `CANCELING/cancelStartedAt` 与原订单身份，再进入官方撤单调用。已有撤单开始标记时不再发第二次。
4. 撤单响应、超时或官方查无单都不直接释放预留；需要同一原 `clientOrderId` 的可信终态及完整成交／费用证据。
5. 原回执完成时可能是 `CANCEL_CONFIRMED`，也可能是 `TARGET_TERMINAL_OTHER`；例如撤单前已成交不能显示“已取消”。

原撤单回执不能被任意订单快照解锁：必须绑定同一 `clientOrderId`，原订单为 `CANCELED/FILLED/EXPIRED/REJECTED` 且 `reservationReleased=true`，并有原确认阶段、足够新的核对时间或确定本地终止证据。客户端不自行套用时间比较替服务端结案。

### 7.3 费用、库存与任务门禁独立存在

- 订单终态不等于可释放；`reservationReleased`、`tradeEvidencePending`、`fee`、`feePending`、`feeFinalized` 分别表达不同证据。累计费用存在不等于最终费用已确认，缺费不能填 0。
- 已有成交的实际费用未齐、原订单未知／撤单中、任务预留找不到原订单出处或账户／任务预留不守恒时，后端阻止新增意图；前端不能用估算费替代实际费去放行。
- 卖出成交还需具体证券的官方可用库存下降核对，`sellInventoryVerifiedAt` 为空时保留相应门禁。下降检查不是把本地名义持仓变成可卖库存，也不保证新单可卖量；每次卖单仍读官方当次库存。
- 撤单 operation 已成功不自动证明卖出库存门禁已解除，应读取原订单及账户／任务的当前证据；不要只由回执的 `SUCCEEDED` 启用“再次卖出”。
- 任务 `pause/stop` 的本地状态与回执同事务完成后，会继续核对相关订单；后续 429／读取失败不撤销已应用控制，也不释放未知占用。
- `pause` 停新增，不延长原执行窗口；原配置的超时撤单仍可到期执行。`stop` 保存永久停止意图，可能先 `STOPPING/RECOVERY_REQUIRED`，不承诺立即 `STOPPED` 或立即撤光。
- `start/resume` 会重新校验当次规则、资金／库存、已有订单、费用、预留、权限与 Worker；保存配置或旧预检成功不能代替这些条件。即使成功回执返回 `RUNNING/SCHEDULED`，也不是某一批订单已经受理。
- 恢复、编辑、进程重启不能延长已开始的原截止；`USER_STOP` 不能靠 resume 清除。管理员不能启动／恢复或以恢复名义生成交易意图。

## 8. 没有统一回执的写入：承认恢复上限

### 8.1 账户创建与编辑

创建成功只表示凭据已加密保存，账户为未验证、交易关闭。丢失响应后，先重新读取本人账户列表与安全字段；至多一个活动账户只能减少重复创建，不证明该账户由本次请求创建，也不验证 Secret。

编辑响应丢失，GET 可核对 `label/status/tradingEnabled/connectionStatus/hasCredentials/apiKeyLast4` 等当前公开字段；但：

- 不能从 `hasCredentials`、末四位或后来连接成功证明本次具体 Key／Secret 对已写入。
- 不返回完整 Key、Secret 或密文，不能靠读回比对恢复；客户端不得自制“保存回执”。
- 更换凭据必须同时给非空 Key 与 Secret；都不提交才是保留原凭据，不用空字符串代表“不改”。
- 真实换凭据会使连接未验证、关闭交易并清空对应钱包就绪信息；有未完成订单、未释放占用、待确认费用／卖出库存或未终结任务时不能换凭据切断核对链。
- 账户禁用／关闭交易保留原挂单，任务转安全停机；不自动撤单。重新启用也不自动恢复任务。

处置为“保存结果尚未确认；当前可见配置如下”，核对事件／审计和公开字段。若仍不能确定敏感字段是否保存，保留未知、先恢复读取条件或由运维核对；不要自动再次写凭据，也不要为了消除提示替用户开交易。需要再保存时是新的明确编辑，且仍过全部门禁，不是假定上一请求未执行。

### 8.2 任务创建与编辑

- 名称、配置和提交时间不构成唯一请求标识；创建响应丢失后再次创建可得到第二个真实任务。
- 先列出本人任务，比较账户、证券、方向、类型、完整配置及事件；有多个相同候选时不能猜哪一个是原请求，不自动启动其中一个，也不自动删除其他候选。
- 创建／编辑保存本身不下单，但不能因此把不明确的保存当成功继续 start。首次响应取不到 ID 时，等待人工确认已有配置，而非自动补建。
- `PATCH /tasks/:id` 提交完整配置，只允许相应可编辑状态；已启动后身份字段、原预约开始及窗口有不可变限制，目标不得低于已成交及未结委托承诺量。
- GET 当前任务能证明当前配置，不证明本次 PATCH 曾提交；并发编辑可能已覆盖。没有版本条件头或统一原 ID 回执可用，不虚构客户端乐观锁或“最后一次请求一定获胜”。

### 8.3 用户创建与改密

**用户创建**：用户名唯一。丢失响应后由有权管理员查询该用户名及角色／状态／管理权限和审计；已有同名用户只能证明当前存在，不能证明其密码或创建者就是本次意图。`USERNAME_EXISTS` 不等于本次成功；不自动改用户名重建、替换密码或宣称已有用户可用。修改用户接口也没有密码重置字段，不能编造管理员重置流程。

**改密**：成功事务会同时改密码、撤销全部会话并写审计，随后清 Cookie。响应丢失或随后 401 都不能单独区分“改密已完成”“原会话另因禁用／权限变化失效”与请求未到达。当前无按原 ID 查询、读回密码、忘记密码或管理员密码重置接口。

正确做法是停止自动重发改密、清理内存中的密码，提示重新认证。用户主动使用新密码成功登录，可以确认当前凭据可用，但不能伪造原请求回执；失败也不自动试旧密码、批量探测或重复改密以撞限流。仍无法认证时走现有运维／身份恢复渠道，不让客户端宣称已改／未改。

### 8.4 其余无回执接口

登录、退出、预检、单订单核对、端点测速都没有统一原 ID。预检／测速可以在用户仍需要时重新读取，但它们会消耗外部配额、写审计并受限流，不缓存成未来交易授权。订单核对可以继续针对已知原单取得证据，不能改成创建新单；认证接口按当前会话结果处置，不伪造历史执行证明。

## 9. 按 kind 使用 `result`，不拼第二套 DTO

以下列的是**解释入口与关键字段**，完整字段和类型仍从公开契约取得。读取 operation 时先检查 `kind/status/phase`，再检查所需 result 字段；未知或缺失值不填 0、不填“已完成”。

| kind | 未解决时可出现的 result | 终态 `SUCCEEDED` 可依赖的语义与关键字段 |
| --- | --- | --- |
| `ORDER_CANCEL` | null 或绑定的原订单快照；关键是 `id/clientOrderId`，不能把其 `status` 当终态证明 | 原安全订单快照：身份、`status/reservationReleased/reason/reconciledAt`、成交累计、费用标记、`sellInventoryVerifiedAt`；终态投影有 `feeCurrency/priceCurrency`。用 outcome 区分撤单、本地终止、其他终态 |
| `TASK_CONTROL` | null；`RECONCILE_STARTED` 也不保证已有任务结果 | 原本地控制／核对完成时的任务快照：`id/status/config`、数量／本金目标与进度、预留、`startedAt/deadlineAt/scheduledStartAt/nextRunAt`、`reason/stopReason`。本地控制结果可能早于后续核对；不是任务详情接口的 `task/orders/events/interruption` 包装 |
| `USER_UPDATE` | 通常 null | 原公开用户字段：`id/username/role/status/canManageAdmins/createdAt/updatedAt`；无密码与会话令牌 |
| `ACCOUNT_RESTRICT` | 通常 null | 原安全账户投影；重点 `id/adminTradingBlocked/adminBlockReason` 及当时交易员自己的 `status/tradingEnabled`，不是“解除限制即恢复交易” |
| `ACCOUNT_CHECK` | 官方读取期间通常 null | 原安全账户投影；重点 `connectionStatus/connectionMessage/walletSyncError/lastSyncAt/assetsAvailable/buyReady/sellReady/tradingReady`，无凭据／密文 |
| `ACCOUNT_SYNC` | 官方读取期间通常 null | 原安全账户投影；重点 `walletSnapshot/walletSyncError/lastSyncAt/assetsAvailable/availableCash/source`；失败标记可和旧快照同时存在 |
| `ACCOUNT_RECONCILE` | `RECONCILE_STARTED` 时为 `exchangeAccountId/orderIds/taskIds/historyTo` 原计划 | 原核对记录：`id/ownerUserId/exchangeAccountId/status/details/createdAt`；不是账户投影，也不是原计划；详见第 6 节 |
| `PLATFORM_UPDATE` | 通常 null | 原平台配置：`id/environment/emergencyStop`、数量／本金上限、费用预留政策、`updatedBy` 和时间；不是 GET `/admin/system` 的 `settings/heartbeats/events/environment/endpoints` 包装 |

`REJECTED` 不保证 result 为 null；例如确定本次撤单未发送时可能保留阶段快照。非空 result 不推翻 `NOT_APPLIED`。回执不公开原请求输入，尤其不能仅从任务 `result.status` 猜出原 action；客户端应自己保留无敏感信息的原意图描述。

## 10. 框架无关的原 ID 生命周期与实例

### 10.1 最小实现规则

1. **身份确定后、发送前**产生一次 key／UUID；为该意图记录原用户、方法、路径、目标、无敏感信息的有效请求内容与原 ID。按钮点击、请求超时、刷新不重新生成 ID。
2. 同一意图只能有一个发送入口；本地同步禁用重复动作、跨标签页恢复同一记录。前端防连点是体验保护，服务端原 ID 才是重复副作用边界。
3. 在收到可信终态前记录“请求结果待核对”；关闭弹窗／取消等待只取消显示等待，不宣称取消交易或清除保护。
4. 响应有 `operation` 时先核对它是否对应记录中的原 ID／kind／target，再解释该回执；有 `blockingOperation` 时另保留旧阻塞 ID。
5. 页面恢复时先 `/auth/me` 确定当前身份，再 GET 已知原 ID，并结合 `/operations` 找回可读未解决项；GET 当前资源用于显示最新状态，不用于替代原操作结案。
6. `PROCESSING/UNKNOWN/CONFLICT` 保持原 ID；只按第 5 节允许的规则核对，不加自动新 key 重试、超时解锁、客户端释放库存或虚拟成功。
7. 终态后保留原结果与本次 HTTP 错误说明；确有新意图才生成新 ID。不能把 `REJECTED` 的旧 UUID 改参复活。
8. 注销／身份切换时停止旧身份的待发写队列、隔离缓存和恢复记录；重新登录原用户后再恢复。不要把密码、API Key、Secret、Cookie 或 CSRF 令牌写入持久恢复日志；新会话重新取得令牌。

### 10.2 可直接据此实现的分支示例

以下是协议场景，不是实盘执行报告；UUID／提交键仅为示意，不是凭据。响应只描述判读字段，不替代完整公开 DTO。

| 场景 | 请求／观察 | 正确处置 |
| --- | --- | --- |
| **成功，首次响应丢失** | 管理员以 `Idempotency-Key: 11111111-1111-4111-8111-111111111111` PATCH `/admin/users/22222222-2222-4222-8222-222222222222`，内容 `{ "status": "DISABLED" }`；客户端没收到响应；GET 原 operation 得 `SUCCEEDED/CONTROL_APPLIED`，result 为该用户禁用快照 | 显示“禁用已应用”，刷新当前用户／任务；不再执行 PATCH。原用户后来被重新启用也不改写此原结果 |
| **业务已应用，后续读取失败** | UUID `33333333-3333-4333-8333-333333333333` 控制任务 `pause`，HTTP 429，顶层 error 为外部限流，但 operation 为 `SUCCEEDED/LOCAL_APPLIED/CONTROL_APPLIED`，result.status 为 `PAUSED` | 显示“暂停已应用；订单核对被限流，原占用保留”。不要重新 pause，更不能自动 resume；通过原订单核对／新的明确任务 reconcile 追踪证据 |
| **同步失败状态已保存** | UUID `44444444-4444-4444-8444-444444444444` 资金同步，HTTP 502 + operation `SUCCEEDED/ACCOUNT_SYNC_COMPLETED`，result 有 `walletSyncError`、`assetsAvailable=false` | 原同步流程已结案，但未取得可用新资金。展示真实失败和旧快照时间；要再同步是新的明确操作，用新 UUID，不把旧快照恢复成可用 |
| **未知撤单** | UUID `55555555-5555-4555-8555-555555555555` 撤单，HTTP 429／503 或断连；GET 原回执 `UNKNOWN/EXTERNAL_STARTED` | 保留原 UUID，不再发送 cancel；冷却后 POST `/operations/55555555-5555-4555-8555-555555555555/reconcile`。只有后端原回执终结才结束等待；若订单已成交，展示 `TARGET_TERMINAL_OTHER`，不是“撤单成功” |
| **新 ID 与旧未知冲突** | 新 UUID `66666666-6666-4666-8666-666666666666` 对同订单撤单，409；顶层 operation 为新 ID 的 `REJECTED/NOT_APPLIED`，`error.details.blockingOperation.id` 指向上一行旧 ID | 新请求结案为未应用；旧 ID 继续未知保护。恢复旧 ID，不连续生成更多 UUID |
| **明确前置拒绝** | 可信登录用户以 UUID `77777777-7777-4777-8777-777777777777` PATCH `/admin/system`，缺 CSRF；403 + `error.operationAccepted=false`，附 `REJECTED/NOT_APPLIED` | 先确认这是相同原 ID 的拒绝证据，再刷新令牌；确认相关旧操作已解决且无其他未知阻塞后，用户明确提出新意图时才使用新 UUID。旧 UUID 不得用于再次执行；需要查询时 GET 原回执，不能依赖重复写必然返回拒绝。若回执并非此 ID，保留原未知 |
| **404，不是拒绝证据** | 已发出的 UUID `88888888-8888-4888-8888-888888888888` GET 得 `OPERATION_NOT_FOUND`，或刚切换身份读不到 | 说明“暂未取得原操作记录或当前身份无权读取，结果不能确定”。保留原 ID与原用户，不清除保护、不换 ID 发同一意图 |
| **订单 key 恢复** | 交易员下单使用 `Idempotency-Key: manual-intent-001`，丢失响应，只记得提交内容；列表找到相同 key 的订单，其 status 为 `UNKNOWN` | 保存其订单 ID／`clientOrderId`，GET／核对原单。不能用 `manual-intent-002` 复制原请求；若需同 key POST 找回，先确保仍明确继续原意图，并接受“尚无原订单则会真的执行”的边界 |
| **账户核对中断** | UUID `99999999-9999-4999-8999-999999999999` 为 `UNKNOWN/RECONCILE_STARTED`，result 是原计划，部分订单已经结算 | 原执行者 POST 原 ID reconcile，沿原对象集合和 `historyTo` 继续。不能 GET 当前账户后自行判成功，也不能由另一管理员另发新 ID 接管 |
| **身份切换** | 用户 A 尚有未知写入，浏览器改以用户 B 登录；B 的 `/operations` 不含 A 的记录，或 A 的原 ID GET 404 | 隔离 A 的恢复日志，不向 B 自动提交 A 的内容。B 可操作自身有权范围，但不能借新身份结束 A 的未知；需要恢复 A 的正确身份或按有权读取规则处理 |

判定的核心是**原身份、原意图、持久证据与业务门禁**，不是“2xx 成功、4xx 可重试、5xx 一定没执行”。

## 11. 审计来源

以下实现位置用于维护者复核本文事实；消费者实现上述行为不需要自行阅读函数：

- [公开校验及 operation 契约](../../backend/contracts/validation.ts)、[HTTP 客户端契约](../../backend/contracts/client.d.ts)。
- [全部业务写路由](../../backend/src/server/business.ts)、[账户写路由](../../backend/src/server/accounts.ts)、[管理写路由](../../backend/src/server/admin.ts)、[认证写路由](../../backend/src/server/auth.ts)。
- [跟踪响应与前置拒绝登记](../../backend/src/server/operations.ts)、[请求错误／认证／CSRF](../../backend/src/server/context.ts)、[HTTP 中间件顺序](../../backend/src/server/app.ts)。
- [原操作登记、冲突、读取与恢复](../../backend/src/services/operations.ts)、[订单及账户执行流程](../../backend/src/services/trading/engine.ts)、[账户检查／同步原子结果](../../backend/src/services/trading/account-assets.ts)。
- [订单身份比较](../../backend/src/domain/orders/identity.ts)、[意图预留](../../backend/src/services/trading/reservations.ts)、[结算与释放](../../backend/src/services/trading/settlement.ts)、[任务保存／控制](../../backend/src/services/trading/tasks.ts)、[卖出库存后验](../../backend/src/services/trading/sell-inventory.ts)。
