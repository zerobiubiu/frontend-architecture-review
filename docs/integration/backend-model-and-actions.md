# 后端概念模型、表单与状态动作

状态：**现状参考**  
基线：后端 **3.0.0**／`dev` **596849a**。本文描述该基线已实现的业务，不表示该版本已经部署或完成真实资金交易验收。

## 1. 消费者应从哪里开始

本文与本目录资料、[公开客户端类型](../../backend/contracts/client.d.ts)、[公开校验规则](../../backend/contracts/validation.ts)共同构成消费者入口。**读者不需要阅读服务端函数才能实现下述功能**；各节源码链接仅供审计规则来源。请求和响应字段的唯一类型源是这两个公开契约文件，不应把本文另抄成一套 DTO，也不应从前端导入 `backend/src/`。

- 本文：对象归属、两角色能力、表单规则、交易及任务动作。
- [HTTP 与事件](http-and-events.md)：认证、Cookie、CSRF、请求头、错误和 SSE。
- [查询与响应](query-and-response-contracts.md)：列表、详情、来源、空值、金额与诊断字段。
- [写入与恢复](write-and-recovery.md)：下单幂等、原操作 ID、回执恢复和冲突互斥。
- [API 目录](api-catalog.md)：精确路由、方法与公开类型入口。
- [接入与验收](bootstrap-and-acceptance.md)：运行前提、集成顺序和可执行验收边界。

产品范围以 [PRODUCT](../../PRODUCT.md) 为准；旧变更记录仅保留原轮证据，不覆盖此处现状。

## 2. 进程、对象与事实来源

### 2.1 谁负责执行

| 层 | 职责与消费者边界 |
| --- | --- |
| 外部客户端 | 通过本站 API 和 SSE 登录、查询、提交明确意图、恢复原结果；不保存交易所 Secret，不签名、不直连官方私有流，也不靠浏览器定时器执行批次。 |
| API 进程 | Hono HTTP 接口、认证和服务端授权、输入校验、查询投影、写入回执；单笔下单可在请求内经统一交易引擎准备和派发，任务启动则登记状态，由 Worker 推进。API 不托管静态前端。 |
| 独立 Worker | 启动先恢复原订单，再持续核对成交、费用和库存，推进任务与已配置自动撤单、维护官方私有流及账户执行健康。客户端关闭、退出登录不会停止它；Worker 离线或账户未完成核对会阻止新交易。 |
| 统一交易服务／官方 SDK 适配器 | API 与 Worker 共用交易用例和 Stocks／Wallet 防腐层；统一官方请求、正式节点选择、共享限流、证据归一化。不是让消费者直接调用 SDK 的代理通道。 |
| PostgreSQL | 持久化身份、加密凭据、意图、唯一客户订单 ID、任务时钟、预留、去重成交、账本、事件、原操作回执与心跳；事务和锁保护所有权、资金守恒及安全设置。进程内存和 SSE 连接都不是业务事实库。 |

技术依赖及运行入口见 [package.json](../../backend/package.json#L6-L44)；执行与恢复来源见 [交易引擎](../../backend/src/services/trading/engine.ts#L291-L548)、[Worker](../../backend/src/worker/index.ts)、[共享交易门禁](../../backend/src/services/trading/context.ts#L95-L228)。

### 2.2 必须分开的对象

| 对象 | 实际含义 |
| --- | --- |
| 平台用户／`Actor` | 本站登录身份，角色只能为 `TRADER` 或 `ADMIN`；不是 Binance 身份。`canManageAdmins` 是管理员的专项权限，不是第三种角色。 |
| 交易账户 | 绑定 `ownerUserId` 的本站账户记录，服务端加密保存 Binance 凭据。用户 ID、本站账户 ID、官方订单 ID、客户订单 ID不能混用。订单、任务、成交与账本均保留账户和所有者归属。 |
| 官方证券目录／报价 | 官方 `exchangeInfo()` 返回的全部证券及规则，包括普通股、ETF 等；不按类别另设白名单或管理员审核。报价不是成交价承诺。目录按账户和凭据缓存 5 分钟，提前 1 分钟刷新；过期又无法验证时不能拿旧目录冒充可用目录。 |
| 官方钱包／股票库存 | Funding USDC 是买入资金来源；Funding 的精确股票身份和 `free` 是可卖股数来源。Spot USDC 只读展示，不拼入预算、不自动划转或换币。 |
| 本地订单意图 | 本系统先持久化、再发送的委托及其原 `clientOrderId`；受理仅证明委托存在，不证明成交。官方历史中的外部订单不自动变成本地意图。 |
| 本地逐笔成交与名义持仓 | 只依据本系统核实的执行 ID、成交价格与股数入账／重放；不导入外部钱包股数或补造外部成本。名义持仓不是官方总持仓，也不能据它判定可卖量。 |
| 本地账本与预留 | 预留是执行占用，不是交易所额外现金；USD 成交名义流量、USD 实际费用、USDC 钱包资金分开表达。释放预留不是额外收入，账本不是完整官方现金结算。 |
| 任务 | 在原执行窗口内创建一系列订单的服务器配置和进度；任务状态、各订单状态、费用和库存闭环是不同维度。任务结束不等于所有原挂单已撤。 |
| 事件／审计／日志／回执 | 事件解释业务推进，审计记录操作者和权限，运行日志用于排障；都不能替代官方成交证据。原操作回执回答“某次原指令的结果”，当前对象快照不能替代它。 |

来源：[公开 Actor 与枚举](../../backend/contracts/validation.ts#L4-L59)、[账户投影](../../backend/src/services/account-projection.ts)、[目录策略](../../backend/src/services/market-catalog.ts#L19-L100)、[PRODUCT 的资产与账本边界](../../PRODUCT.md#L23-L34)、[账户核对范围](../../backend/src/services/trading/engine.ts#L1044-L1142)。字段级来源和币种解释见[查询与响应](query-and-response-contracts.md)。

### 2.3 明确没有的能力

只连接 Stocks 正式环境；没有本地撮合、虚拟资金、Testnet／Demo、加密货币、衍生品或代币化交易，没有 K 线、指标、研究、回测或选股。没有自动资金划转、换币、外部成本补录、前端代签股票免责声明或绕过资格审核的功能。官方支持证券不代表某账户、地区或某时刻一定可以交易。当前 3.0.0 尚未部署；真实交易、成交费用、撤单和故障恢复仍须单独授权验收，不能用工程支持冒充实盘验收。[来源：PRODUCT](../../PRODUCT.md#L13-L34)、[未验边界](../../PRODUCT.md#L74-L84)。

## 3. 两角色授权与管理边界

### 3.1 功能与允许动作

下表中的“自己”均指服务端按 `ownerUserId` 判定，不是前端当前选中的账户。

| 功能 | 交易员 `TRADER` | 管理员 `ADMIN` |
| --- | --- | --- |
| 登录、退出、修改本人密码 | 可以 | 可以 |
| 查看账户、资金、名义持仓、订单、成交、账本、任务、核对记录及相关业务事件 | 仅自己的数据 | 可跨所有者读取，跨用户读取／查询记审计 |
| 官方目录、报价、官方订单／成交历史、Funding 股票候选 | 自己账户 | 可按账户跨用户读取；仍受凭据及来源可验证条件约束 |
| 创建账户、改标签／凭据、自停账户及交易开关、连接检查 | 仅自己账户 | 不可代交易员创建或修改这些交易员配置，也不能执行交易员专用连接检查 |
| 资产同步、账户核对、订单核对 | 自己账户／订单 | 可跨账户／订单处理；不是买卖权限 |
| 单笔预检、LIMIT／MARKET 下单、明确撤单 | 仅自己账户／订单 | **均不可**；管理员也不能直接调用订单撤单入口 |
| 新建／编辑任务、`start`、`resume` | 仅自己任务 | **均不可** |
| 任务 `pause`、`stop`、`reconcile` | 自己任务 | 可跨用户处理；停止仍服从原挂单策略，不产生任意撤单权 |
| 用户创建、交易员启停 | 不可 | 可以；角色创建后不能修改 |
| 创建管理员、管理管理员状态／`canManageAdmins` | 不可 | 仅当前仍有 `canManageAdmins=true` 的管理员 |
| 账户平台限制、平台急停与全局风险设置、系统心跳／端点测速、管理审计 | 不可 | 可以；端点测速不是股票权限或可交易证明 |

来源：[HTTP 角色和所有权中间件](../../backend/src/server/context.ts#L379-L424)、[交易服务二次授权](../../backend/src/services/trading/context.ts#L69-L82)、[账户路由](../../backend/src/server/accounts.ts#L95-L350)、[下单／撤单／任务路由](../../backend/src/server/business.ts#L283-L433)、[管理路由](../../backend/src/server/admin.ts#L168-L372)。

列表查询由服务端强制限于交易员本人；交易员显式传其他 `ownerUserId` 会被拒绝。详情或动作跨所有者访问也会被拒绝，通常以不存在表达，不能用猜 ID 探测。管理员的“可跨用户读”不扩展为“可代下单”。当前用户每次请求及关键事务均重新核对活动状态和角色，不能靠缓存角色或隐藏按钮替代服务端授权。[来源：查询范围](../../backend/src/server/queries.ts#L42-L91)、[认证](../../backend/src/server/context.ts#L314-L349)、[交易动作授权](../../backend/src/services/trading/context.ts#L69-L82)。

### 3.2 `canManageAdmins` 与最后管理者

- 普通管理员即使能列出管理员，也不能创建或修改管理员；包括不能通过修改自己获得该权限。
- 交易员不能拥有该权限；创建交易员时设为 `true`、更新交易员为 `true` 均拒绝。角色不可通过更新字段改变，不能把交易员“升级”为管理员。
- 保护对象是最后一位 **`role=ADMIN && status=ACTIVE && canManageAdmins=true`** 的用户，不是简单的“最后一个 ADMIN”。不能禁用该用户，也不能撤销其管理权限；并发请求在安全事务锁内再次计数。
- 禁用用户或变更其管理员管理权限会撤销该用户会话；本人被禁用／改权时当前 Cookie 也会清除。重新启用用户不会自动恢复任务。
- 公开接口没有管理员代改用户密码、修改用户名、删除用户或切换用户角色的动作。

来源：[创建管理员权限检查](../../backend/src/server/admin.ts#L168-L218)、[更新与最后管理者保护](../../backend/src/server/admin.ts#L245-L369)、[公开用户 schema](../../backend/contracts/validation.ts#L128-L145)。

## 4. 用户、账户与平台表单

### 4.1 通用输入规则

下述“默认”指**字段省略**时由公开 schema 提供的值，不表示允许传 `null`。布尔和数字必须发 JSON 布尔／数字，金额和股数必须发十进制字符串。不要把空字符串、`NaN`、科学计数、千分位或本地化小数格式送入金融字段。只有明确标注的字段可为 `null`；写入对象不接收未声明字段。

| 输入族 | 精确约束与用途 |
| --- | --- |
| `symbol` | 字符串，去首尾空白后长度 1–128，不含控制字符，转换为大写；这只是语法归一化，是否受支持仍须官方规则。不要把 `EQ_` 钱包资产码当成证券代码提交。 |
| `quantitySchema` | 1–7 位整数字符，可有 1–10 位小数；正数且不超过 `1000000` 股。去无意义前导零／小数尾零，不舍入。用于单笔股数、任务目标和固定每批股数。 |
| `priceSchema` | 正价格字符串，最多 9 位整数、2 位小数；整数非零部分不接收前导零，低于 1 时使用 `0.xx`。实际最小可表达正值为 `0.01`，最大为 `999999999.99`。用于限价，也用于平台金额上限／费用最低预留表单。 |
| `notionalSchema` | 正本金字符串，1–12 位整数、最多 18 位小数，归一化前导零／小数尾零；不套用限价两位小数规则。用于 MARKET BUY 本金及对应任务目标／批次。 |
| UUID | 所有账户／对象参数采用契约声明的 UUID；不能用证券代码、用户名或官方订单 ID代替本站对象 ID。 |

来源：[公开基础 schema](../../backend/contracts/validation.ts#L60-L103)、[账户和对象参数](../../backend/contracts/validation.ts#L146-L162)、[原始官方身份校验](../../backend/src/api/equity-balance.ts#L28-L41)。

### 4.2 身份与账户表单

| 场景 | 字段、默认与拒绝边界 |
| --- | --- |
| 登录 | `username` 1–64 字符，`password` 1–128 字符；没有 schema 自动 trim／大小写转换，不能把创建账号规则误套到既有账号登录。禁用账号不能登录。 |
| 创建用户（管理员） | `username` 为 3–64 位 `A-Z a-z 0-9 _ . -`，必须未占用；`password` 10–128 字符；`role` 必填 `TRADER/ADMIN`；`canManageAdmins` 默认 `false`，受上一节权限约束。新用户状态为 `ACTIVE`。 |
| 更新用户（管理员） | 非空部分更新，仅允许 `status: ACTIVE/DISABLED`、`canManageAdmins`；不接收用户名、密码或角色字段。 |
| 修改本人密码 | `currentPassword` 请求实际限制 1–128 字符，`newPassword` 10–128 字符；校验原密码，新旧不能相同。成功撤销本人全部会话并要求重新登录。 |
| 创建交易账户（交易员） | `label` trim 后 1–80 字符；`apiKey` trim 后 1–256，`apiSecret` trim 后 1–512。不能用空凭据先建账户。新账户 `ACTIVE`，但 `tradingEnabled=false`、`connectionStatus=UNVERIFIED`；创建不验证连接或资金、不下单。 |
| 更新本人账户 | 非空部分更新；允许上述三个字段及 `status: ACTIVE/DISABLED`、`tradingEnabled: boolean`。只改标签可省略凭据；换凭据必须同时提供非空 Key 和 Secret，不能单边更新或用空值表达保留。 |
| 管理员账户限制 | `adminTradingBlocked` 布尔必填；`adminBlockReason` 可省略、`null` 或 trim 后最多 200 字符（schema 允许空字符串，不额外宣称必填）。开启限制未给原因时保留原原因或用服务端默认原因；解除时原因清空。管理员不能在这里改交易员自己的账户开关。 |

来源：[公开身份／账户 schema](../../backend/contracts/validation.ts#L128-L158)、[身份路由](../../backend/src/server/auth.ts#L27-L119)、[用户管理](../../backend/src/server/admin.ts#L168-L372)、[账户创建／更新](../../backend/src/server/accounts.ts#L95-L297)、[平台账户限制](../../backend/src/server/admin.ts#L412-L506)、[新用户／账户默认](../../backend/src/database/schema.ts#L40-L98)。

账户业务入口按一个交易员一个活动账户使用；实际服务端与数据库约束是 **最多一个 `ACTIVE` 账户**，不是禁止保留多个历史 `DISABLED` 记录。已有活动账户时新建或重新启用另一账户会拒绝。没有分组或跨账户分配能力。[来源：活动账户检查](../../backend/src/server/accounts.ts#L56-L74)、[唯一索引](../../backend/src/database/schema.ts#L70-L98)。

### 4.3 账户接入、准备度与换凭据

1. 保存凭据后执行连接检查。检查读取官方规则、私有订单连接和钱包；成功可成为 `CONNECTED`，失败记录 `ERROR` 与脱敏说明。连接成功不等于已开交易、不等于有 USDC、不等于某证券有库存，也不证明地区资格、免责声明或真实下单通过。
2. 需要时同步资产；同步会保存成功快照或失败状态，不自动打开交易。读取失败不能继续把旧余额显示为“当前可用”。原操作可能已经保存失败状态，即使请求表现为错误；恢复细节见[写入与恢复](write-and-recovery.md)。
3. 交易员显式开启 `tradingEnabled`。服务端要求当前凭据存在、连接为 `CONNECTED` 且无管理员限制；账户还须 `ACTIVE` 才能新增交易。即使开关修改被接受，用户／平台／Worker／当次资金及证券库存门禁仍独立生效。
4. 买入读取当次 Funding USDC，卖出读取当次具体证券库存；不要用“账户已连接”一次性放行所有交易。
5. 主动关闭交易或禁用账户会停止新增意图并安全中断活动任务，保留原挂单及占用；重新开启不会自动继续任务。
6. 真正更换凭据前，必须先用原凭据闭环所有未终态订单、未释放占用、待确认成交费用、SELL 库存门禁和非终态任务。仅 `CREATED` 的未终结任务也会阻止换凭据。更换后清除钱包快照／同步状态、连接变 `UNVERIFIED`、交易关闭；不能同一请求换凭据并开交易，须重新检查再开。

`tradingReady`、`sellReady` 只是“凭据存在＋账户活动＋交易员开关开＋无管理员限制＋连接成功”的账户投影；`buyReady` 再要求有可用 Funding 快照，**不要求该快照余额足够本单，也未包含平台急停、所有者状态、Worker 或订单证据门禁**。`sellReady=true` 从不代表任意证券有股可卖。`cashBalance` 为 `null`，`availableCash` 是可用快照中的 Funding USDC，不是完整美元现金；同步失败时不能补零。[来源：连接和同步](../../backend/src/services/trading/account-assets.ts#L34-L157)、[开关与凭据守卫](../../backend/src/server/accounts.ts#L137-L266)、[准备度投影](../../backend/src/services/account-projection.ts)。

### 4.4 平台风险设置表单

`PATCH /admin/system` 是非空部分更新；以下字段均可省略，省略表示保留当前值，而不是恢复默认。表中初始值为新平台数据库默认，运行时以当前查询结果为准。

| 字段 | 输入约束 | 新平台初始值／作用 |
| --- | --- | --- |
| `emergencyStop` | 布尔 | `false`；开启后禁止新订单及任务启动／继续，安全中断活动任务；解除不自动恢复任务。 |
| `maxOrderQuantity` | 整数 1–1000000 | `10000` 股；用于有请求股数的单笔及批次，不用预估股数限制 MARKET BUY。 |
| `maxTaskQuantity` | 整数 1–1000000 | `100000` 股；用于股数目标任务的保存／编辑。 |
| `maxOrderNotional` | `priceSchema` 正金额，最多两位小数 | `1000000` USD；限制单笔名义额。MARKET BUY 按本金，MARKET SELL 按当次买一估算，不保证最终成交名义额。 |
| `feeReserveRate` | 非负十进制字符串语法：1–12 位整数、最多 10 位小数；另要求 `0 < 值 <= 1` | `0.001`；费用预留比例，不是官方费率。 |
| `feeReserveMinimum` | `priceSchema` 正金额，最多两位小数 | `0.35`；最低费用预留，不是实际最低收费承诺。 |

买入估算费用为 `max(本金 × feeReserveRate, feeReserveMinimum)` **向上取到美分**，资金须覆盖本金与该费用预留。实际费用只按官方证据入账。当前没有公开可写的 `maxTaskNotional`、平台最小间隔或股票白名单字段；不要自造这些设置。任务的 `globalIntervalSeconds` 是每份任务自身的间隔下限，见下节。[来源：公开平台 schema](../../backend/contracts/validation.ts#L322-L331)、[默认值](../../backend/src/database/schema.ts#L411-L431)、[费用公式](../../backend/src/domain/funding/buy-reserve.ts)、[实际平台更新](../../backend/src/server/admin.ts#L549-L624)。设置／账户／用户返回字段的权威对应见[查询与响应](query-and-response-contracts.md)。

## 5. 单笔订单：三种互斥输入与执行边界

### 5.1 表单模式

三种模式共用 `accountId`（UUID）、`symbol`；对象均为严格 schema，**不适用字段应省略，不能发 `null` 或前一种模式遗留值**。单笔没有 `priceRule`、`priceRounding` 或自动撤单输入字段。

| 模式 | 必填专属字段 | 可省略默认 | 禁止混入 |
| --- | --- | --- | --- |
| LIMIT BUY／SELL | `side`、`price`、`quantity` | `orderType=LIMIT`；`tradingSession=RTH`（可选 `EXTENDED/24H`）；`timeInForce=DAY`（可选 `GTC`） | `notional` 及任何未声明字段 |
| MARKET BUY | `orderType=MARKET`、`side=BUY`、`notional` | `timeInForce=DAY`，只能 DAY | `quantity`、`price`、`tradingSession` |
| MARKET SELL | `orderType=MARKET`、`side=SELL`、`quantity` | `timeInForce=DAY`，只能 DAY | `notional`、`price`、`tradingSession` |

`price/quantity/notional` 精度见第 4.1 节。MARKET BUY 的本金不包含费用、不承诺指定股数；MARKET SELL 指定股数，以当次买一估值用于门禁，不承诺成交价。MARKET 不传时段不等于承诺全天可成交。手工 LIMIT 价格不会被服务端静默舍入。[来源：公开三类订单 schema](../../backend/contracts/validation.ts#L159-L206)、[预检估值](../../backend/src/services/trading/market.ts#L156-L181)、[PRODUCT](../../PRODUCT.md#L36-L44)。

### 5.2 预检、创建与再次检查

- 预检使用与创建同一份三模式输入，返回逐项 `checks` 以及估算本金／费用／总占用和来源；不创建订单、不预留资金、不锁定价格或库存。`ok=true` 只是这一时刻通过，不保证稍后的创建、官方受理或成交。
- 提交订单后，后端先持久化意图、唯一 `clientOrderId` 和本批预留，再在发送前重读并重检；不提前为整份任务锁定全部目标资金。创建 HTTP 请求被接受与订单 `ACCEPTED` 均不等于成交成功。
- `PLANNED` 且确定从未开始发送的本地意图，30 秒准备租约结束后可安全终结；一旦开始发送，超时、重复客户 ID 或查无单都不能证明“没发出”。不得因等待时间过去而释放或重发。
- 只有明确官方拒单证据或可信发送前中止才安全释放原本地预留；拒绝与未知必须分别展示。下单幂等和重进客户端的恢复方式见[写入与恢复](write-and-recovery.md)。

来源：[预检返回契约](../../backend/contracts/validation.ts#L434-L459)、[准备意图](../../backend/src/services/trading/reservations.ts#L20-L195)、[发送前复核与未知处理](../../backend/src/services/trading/engine.ts#L291-L548)、[未发送租约](../../backend/src/services/trading/engine.ts#L209-L242)。

### 5.3 不能由表单静态校验替代的门禁

每次新增交易独立要求：活动交易员所有者、活动账户和交易开关、无管理员限制、平台未急停、连接成功、正式 Worker 心跳新鲜且该账户可执行；账户没有结果未知／提交中／撤单中／成交待同步订单，没有未核实成交费用或无出处／不守恒预留。页面上的 `tradingReady` 或一个全局“系统在线”标志不能替代这些检查。

官方规则还要求：

- 证券已上市且未到下架时间，`tradability` 明确允许方向。
- 有请求股数时符合官方正 `stepSize`；官方实际给出的 `minQuantity/maxQuantity` 分别生效。缺少其中一个边界保持“未提供”，不虚构默认值，也不单因该边界缺失拒单；但矛盾上下界会拒绝。
- 官方 `minNotional/maxNotional` 必须都可核实且符合范围；缺失不能作为通过。MARKET BUY 直接校验本金，不用估算股数承诺官方股数上界，也要求官方明确支持 `fractionable`。
- 小数股要求 `fractionable=true`；LIMIT 扩展／隔夜的小数股另需 `fractionableEh=true`。LIMIT `EXTENDED` 需 `extendedSession=true`，`24H` 需 `overnightSupported=true`。小数股 GTC LIMIT 不能用 RTH，须 EXTENDED 或 24H；整股 GTC 不因此被禁。
- 官方 `maxNumOrders` 和当次挂单数必须可核实，连同本地尚未发送的同证券意图不超限。
- BUY 只用当次 Funding `CARD/USDC` 的 `free`，扣本地**尚未发送**意图，不把 Spot／名义现金加入，也不重复扣官方已冻结资金；再覆盖本金和费用预留。
- SELL 只用当前凭据与账户修订绑定、精确 `symbol/stockTicker/EQ_资产码` 一致的当次 Funding `free`；不合并 locked／freeze／withdrawing，不用本地名义持仓。仅扣本地未发送股票意图；同账户同证券已发送卖单须先闭环，不因 INTERVAL 模式放开库存重复使用。

资金证据按本地接收时间、卖出库存按本地请求时间控制在 15 秒策略窗内，并校验时间顺序与账户修订；这不是 Binance 原子同步或数据更新 SLA。创建及实际发送仍会复核，官方可以最终拒绝。[来源：统一账户门禁](../../backend/src/services/trading/context.ts#L95-L228)、[预检检查](../../backend/src/services/trading/market.ts#L109-L352)、[证券规则](../../backend/src/domain/securities/admission.ts#L25-L174)、[库存时效](../../backend/src/domain/securities/sell-inventory.ts#L25-L58)。

## 6. 批量任务：完整输入与时钟

### 6.1 三类任务输入

任务创建与 `PATCH /tasks/:id` 都使用完整 `taskCreateSchema`，**PATCH 不是部分配置合并**。编辑时应组装当前模式的完整有效配置；省略带默认的字段会应用默认，不表示保留原值。保存不自动启动。

| 模式 | 目标／批量字段与默认 | 价格、时段及禁止字段 |
| --- | --- | --- |
| LIMIT BUY／SELL | `targetQuantity` 必填；`quantityMode=FIXED`（可 RANDOM）；`fixedQuantity='10'`；`randomQuantityMin=1`、`randomQuantityMax=10`（数字整数，各 1–1000000） | `orderType=LIMIT`；`side` 必填；`priceRule=ASK_1`（可 BID_1/FIXED）；`fixedPrice=null`，FIXED 时必须有效价格；`priceRounding=REJECT`；`tradingSession=RTH`（可 EXTENDED/24H）；`timeInForce=DAY`（可 GTC）。禁止本金目标和所有本金批量字段。 |
| MARKET SELL | `targetQuantity` 必填；股数批量字段与 LIMIT 相同 | `orderType=MARKET`、`side=SELL`；仅 `timeInForce=DAY`。禁止本金字段及 `priceRule/fixedPrice/priceRounding/tradingSession`。 |
| MARKET BUY | `targetNotional` 必填；`notionalMode=FIXED`（可 RANDOM）；`fixedNotional='100'`；`randomNotionalMin='1'`、`randomNotionalMax='100'` | `orderType=MARKET`、`side=BUY`；仅 `timeInForce=DAY`。禁止股数目标／批量字段及所有限价／时段字段。 |

目标／固定股数使用 `quantitySchema`；本金目标、固定及随机上下界使用 `notionalSchema`。随机股数常规批次取**整数**，不是任意小数；只有 EXACT 最终不足一股尾量才按实际小数处理。仅对应 RANDOM 模式要求其下限不大于上限；即便某字段当前不参与计算，只要提交，仍须符合其字段类型与范围。LIMIT 非 FIXED 时 `fixedPrice` 不参与取价，可保留 `null`；若给非空值仍须合法。

来源：[任务各模式公开 schema](../../backend/contracts/validation.ts#L212-L318)、[股数／本金批次选择](../../backend/src/domain/tasks/execution.ts#L23-L77)。

### 6.2 全部任务共用字段

| 字段 | 范围、默认与语义 |
| --- | --- |
| `accountId`、`name`、`symbol` | 账户 UUID；name trim 后 1–100 字符；symbol 规则同单笔，三者均必填。 |
| `executionWindowSeconds` | 必填数字整数 1–604800 秒。不是从页面打开起算，也不因暂停或重启延长。 |
| `scheduledStartAt` | 可省略／`null` 表示无预约；非空必须是带完整秒的 UTC `Z` 日期时间，年 0001–9999，不能用本地无时区字符串或其他偏移表达。新建或真实改时最多 6 位**去尾零后的有效小数秒**，超出拒绝、不截断舍入。 |
| `executionMode` | 默认 `SERIAL`，或 `INTERVAL`。SERIAL 等前单终态、费用及必要库存闭环后开始批次间隔；INTERVAL 从前单确认受理起计时，不等成交，可保留多笔已确认挂单。SELL 仍不得突破同证券库存门禁。 |
| `globalIntervalSeconds` | 默认 `5` 秒；这份任务的间隔下限，不是管理员平台设置。实际固定／随机间隔至少为它。 |
| `intervalMode` | 默认 `FIXED`，或 `RANDOM`。 |
| `fixedIntervalSeconds` | 默认 `5` 秒。 |
| `randomIntervalMin/Max` | 默认 `3/10` 秒；RANDOM 时下限不大于上限。以上四个秒数字段均为 0.1–86400，最多 3 位小数。若固定间隔填 0.1 但 global 下限仍 5，实际不会按 0.1 秒发单。 |
| `autoCancelMode` | 默认 `KEEP`，可 `AFTER_TIMEOUT/AT_TASK_END`；含义见第 6.5 节。 |
| `orderTimeoutSeconds` | 默认 `30`，数字整数 1–3600 秒；只在 AFTER_TIMEOUT 策略参与计时，其他策略提交此字段也仍须合法。 |
| `remainderPolicy` | 默认 `EXACT`，可 `FIXED`；不足一批时是否裁剪到剩余目标，不是允许超过目标的开关。 |

来源：[公开共用字段及区间校验](../../backend/contracts/validation.ts#L207-L317)、[间隔与不可延长截止](../../backend/src/domain/tasks/execution.ts#L79-L98)、[精确预约时间](../../backend/src/services/trading/tasks.ts#L368-L385)。频率仍受当次校验、Worker、网络、共享限流和官方每 UID 200 次／分钟限制；配置不是持续吞吐承诺。[产品约束](../../PRODUCT.md#L46-L57)。

### 6.3 LIMIT 任务取价

- `FIXED` 使用合法 `fixedPrice`，不使用盘口舍入策略修改手工价。
- `BID_1` 使用当次买一，`ASK_1` 使用当次卖一；两种选择均可用于 BUY／SELL，不会因方向自动替换用户所选一档。
- 盘口转换为两位限价的策略：`SIDE_SAFE` 买向下／卖向上；`TRUNCATE` 截断；`HALF_UP` 四舍五入；`CEIL` 向上；`REJECT`（默认）拒绝丢弃部分含非零值的超两位报价。处理后为零或超价格范围也拒绝。
- 预检、预留和发送使用同一个处理后限价；原始报价、成交价、平均价和账本不被修改。MARKET 不接受这些参数。

来源：[公开 `quoteLimitPrice`](../../backend/contracts/validation.ts#L102-L126)、[任务订单生成](../../backend/src/services/trading/tasks.ts#L73-L131)。

### 6.4 保存、启动、编辑与进度

**保存／编辑：** 后端验证当前官方证券、报价、挂单上限、适用批次及步长／名义额／GTC 尾量规则；股数目标还受 `maxTaskQuantity` 限制。只保存配置，**不验证整份目标所需资金、不锁资金、不生成订单**。即使配置已保存，账户开关、急停、Worker 和资金仍可能阻止启动。没有用总本金反推 `maxTaskQuantity` 的规则，也没有独立平台总本金上限字段。[来源：保存](../../backend/src/services/trading/tasks.ts#L147-L298)、[创建](../../backend/src/services/trading/tasks.ts#L388-L429)。

**启动／继续：** 只限交易员；须重读当次资金或库存及规则，检查任务自身未结证据和预留守恒，再通过账户／平台／Worker 门禁。立即启动、尚有剩余量且不处于既有卖单等待分支时，以剩余目标与固定批量或随机最小批量中的较小值做单批预检，不等于评估整份目标的预计资金需求；预约、余量已占满或等待已有卖单时先核查来源、规则和基本门禁，实际执行再预检。立即启动登记 `RUNNING`，未来预约登记 `SCHEDULED`；不代表第一笔订单已经发送。预约不提前占款或执行。没有实际开始的预约在真正开始时记 `startedAt`；已经开始的任务始终保留原 `startedAt/deadlineAt`。[来源：控制](../../backend/src/services/trading/tasks.ts#L550-L702)、[预约实际启动](../../backend/src/services/trading/tasks.ts#L863-L891)。

**编辑：** 仅 `CREATED/READY/PAUSED`。已经开始的任务不能换账户、证券、方向或订单类型，不能真实改变计划开始时间，不能延长配置执行窗口；可以缩短窗口，截止只取原截止与新计算截止的较早者。未修改的计划字符串须原精度保留；比较只在 UTC Z 下去小数尾零判精确等价，不能先经 JavaScript Date 截成毫秒。目标不得低于“真实累计成交＋全部活动订单剩余股数／本金”。编辑不重置状态、不自动继续、不撤换原挂单；若修改自动撤单策略，现有活动订单的超时截止会按其**原受理时间**重算，不从编辑时重新计时。[来源：编辑完整守卫](../../backend/src/services/trading/tasks.ts#L431-L538)、[时间等价规则](../../backend/src/domain/tasks/scheduled-start.ts)。

**进度：** MARKET BUY 用 `filledNotional` 对 `targetNotional`，费用不算本金进度；其他模式用真实成交股数。可新委托量＝目标－真实已成交－全部非终态订单未成交部分。活动委托占满目标时等待结算，不把受理量记完成；终态未用本金／股数重新成为剩余量。只有实际目标完成、订单／费用／必要库存已闭环且预留可解释，任务才正常完成。[来源：目标与活动敞口](../../backend/src/domain/tasks/execution.ts#L100-L169)、[终态安全检查](../../backend/src/services/trading/tasks.ts#L307-L348)。

### 6.5 尾量、间隔与挂单策略

- `EXACT`：最后一批最多裁剪到剩余目标，不能向上凑。尾量／余款仍须满足官方最小量、步长、金额、碎股和 GTC 时段规则；非法会拒绝保存或在执行时明确暂停，不将差额伪记成交。MARKET BUY 执行中余款低于官方最小金额会暂停并说明。
- `FIXED`：剩余量不足本次批量时不生成超目标订单，**保持等待原窗口结束，不直接完成，也不因此自动暂停**。在 RANDOM 组合中同样不强行裁剪本次抽取批量。没有未结订单时窗口结束为 `EXPIRED`；有未结证据则保留恢复状态。
- SERIAL 在后端首次确认前单全部闭环后设置一次间隔；人工暂停期间可建立该时钟，但不能覆盖暂停原因或自动恢复。INTERVAL 从前单确认受理计时；停机／暂停期间不补发错过的周期。
- `KEEP`：默认保留原挂单，人工暂停、停止或窗口结束本身不要求撤单。交易所仍可按 DAY 等官方规则使其失效。
- `AFTER_TIMEOUT`：从每单原确认受理时间起 1–3600 秒；暂停后仍继续执行已授权超时撤单。
- `AT_TASK_END`：窗口到期或明确 `stop` 时按策略处理原挂单；普通 `pause`、账户自停、用户禁用、管理员限制或平台急停本身不是这项“任务结束撤单”的触发。窗口后来实际到期仍按原策略处理。
- 自动撤单先核对原单并持久化开始证据；未知取消只核对、不重复发撤单。停进程不是撤单，自动撤单依赖服务与官方可用。单笔订单无此任务策略；不要把详情中的等待时间字段解释为单笔必定自动撤单。

来源：[批次与策略判断](../../backend/src/domain/tasks/execution.ts#L52-L88)、[自动撤单触发](../../backend/src/domain/tasks/execution.ts#L171-L188)、[FIXED 等待和非法余款](../../backend/src/services/trading/tasks.ts#L838-L862)、[串行间隔](../../backend/src/services/trading/tasks.ts#L789-L815)、[受理后间隔](../../backend/src/services/trading/engine.ts#L446-L516)、[原策略执行](../../backend/src/services/trading/engine.ts#L550-L727)。

## 7. 全部公开任务状态与动作矩阵

动作输入仅为 `start/pause/resume/stop/reconcile`，不能直接 PATCH `status`。表中“可”仍须通过所有权、当前身份、原操作冲突及具体证据守卫；不是可保证成功的静态能力字段。管理员只可使用其中的暂停、停止、核对。

| 状态 | 消费者解释 | start | resume | 编辑 | pause | stop | reconcile |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `CREATED` | 配置已保存，未启动、未锁资金 | 可 | 否 | 可 | 否 | 可 | 可 |
| `VALIDATING` | 公开预检中状态，不代表订单受理 | 否 | 否 | 否 | 否 | 可 | 可 |
| `READY` | 待启动；不是已受理订单 | 可 | 否 | 可 | 否 | 可 | 可 |
| `SCHEDULED` | 已登记未来开始；到时重新预检 | 否 | 否 | 否 | 可 | 可 | 可 |
| `RUNNING` | 在窗口内推进，也可能等待间隔、结算或 FIXED 尾量 | 否 | 否 | 否 | 可 | 可 | 可 |
| `PAUSED` | 停止新增批次；原挂单及原截止保留 | 否 | 可 | 可 | 可 | 可 | 可 |
| `RECONCILING` | 原订单证据核对中；自动资格看 `stopReason` | 否 | 否 | 否 | 可 | 可 | 可 |
| `RECOVERY_REQUIRED` | 未知、硬冲突、未闭环或安全停止后的人工门禁 | 否 | 否 | 否 | 可，可能仍保留本状态 | 可 | 可 |
| `STOPPING` | 永久停止意图已登记，原订单／占用仍需处理 | 否 | 否 | 否 | 否 | 可，不代表重复撤单 | 可 |
| `COMPLETED` | 目标真实成交且原订单闭环的正常终态 | 否 | 否 | 否 | 否 | 否 | 可 |
| `EXPIRED` | 原窗口结束，目标未完成且原订单已闭环 | 否 | 否 | 否 | 否 | 否 | 可 |
| `STOPPED` | 永久停止后原订单闭环的终态 | 否 | 否 | 否 | 否 | 否 | 可 |
| `FAILED` | 失败终态，不可当作可重启配置 | 否 | 否 | 否 | 否 | 否 | 可 |

公开枚举均应可展示，但**当前创建直接返回 `CREATED`**，没有要求消费者先调用某个“验证完成／置 READY”接口；也没有任意设 VALIDATING、READY 或 FAILED 的公开入口。[来源：公开状态和标签](../../backend/contracts/validation.ts#L31-L59)、[控制 schema](../../backend/contracts/validation.ts#L319-L321)、[创建](../../backend/src/services/trading/tasks.ts#L388-L429)、[编辑和动作守卫](../../backend/src/services/trading/tasks.ts#L431-L726)、[终态枚举](../../backend/src/domain/tasks/execution.ts#L5-L21)。

### 7.1 动作可用不只看状态

- `start` 只接受 CREATED／READY；`resume` 只接受 PAUSED。`RECONCILING/RECOVERY_REQUIRED` 不能直接继续，须核对后由后端判断是否回到 RUNNING 或 PAUSED。
- 有 `UNKNOWN/SUBMITTING/PLANNED/CANCELING`、未确认取消、成交待同步、费用／库存未核实或不守恒预留，不能继续。**不是所有已确认挂单都禁止恢复**：无阻断证据的 ACCEPTED 挂单可保留；SERIAL 或 SELL 仍等待原单闭环，INTERVAL BUY 才可能继续新批次。
- `stopReason=USER_STOP` 是永久停止意图，不能恢复。终态除核对外不能重复控制；“再跑一次”须由交易员创建新任务，不能清除原 ID／时钟伪装未启动。
- 已到原截止的请求不会重开窗口：可闭环时为 EXPIRED，有未结订单时为 RECOVERY_REQUIRED；若真实目标已完成且全部闭环，可结为 COMPLETED。不要以按钮名称断言一定返回 RUNNING。
- `pause` 只停止新增意图，不撤销原挂单；RECOVERY_REQUIRED 上暂停不强行变成可继续的 PAUSED。对 EVIDENCE_PENDING 的人工暂停取消自动继续资格。
- `stop` 先登记 STOPPING／USER_STOP，随后按原策略核对；仍有原订单／费用／库存时可为 RECOVERY_REQUIRED，闭环后才 STOPPED。若目标已真实全部完成，终态仍可为 COMPLETED，而不是抹掉真实完成结果。
- `reconcile` 本身不赋予启动资格、不重置窗口、不重发未知写入。订单／账户核对不新增撤单；**任务控制中的 reconcile、pause、stop 会核对任务原单，并可能执行已经配置且到期的自动撤单授权**，不是新的任意撤单指令。

来源：[启动／继续条件](../../backend/src/services/trading/tasks.ts#L550-L702)、[暂停／停止](../../backend/src/services/trading/tasks.ts#L704-L724)、[边界优先级](../../backend/src/domain/tasks/execution.ts#L203-L268)、[任务控制后续处理](../../backend/src/services/trading/engine.ts#L1023-L1034)、[任务原订单策略](../../backend/src/services/trading/engine.ts#L693-L727)、[账户核对](../../backend/src/services/trading/engine.ts#L1044-L1065)。

## 8. 全部公开订单状态与动作

订单没有公开“重试提交”“编辑委托”“强制成交”“强制释放”动作；只可查询、按权限核对，或由交易员明确撤单。核对适用于全部状态，是否还需外部读取由服务端判断。管理员只能核对，不能调用下表中的明确撤单。

| 状态 | 消费者解释 | 交易员明确撤单的实际边界 |
| --- | --- | --- |
| `PLANNED` | 本地意图与预留已落库，不代表已发送 | 若确定尚未发送、无官方 ID 且零成交，可本地终结；结果为带 LOCAL_ABORTED 原因的 REJECTED，不是伪造官方 CANCELED。 |
| `SUBMITTING` | 提交开始已持久化，结果尚未完全确认 | 先按原 ID 核对；未确认受理不能发送撤单，也不能重发下单。 |
| `ACCEPTED` | 已确认官方受理，尚无已入账成交或尚待证据对齐 | 先核对；有官方 ID、无成交证据待同步、无既有取消开始时才可新发一次撤单。 |
| `PARTIALLY_FILLED` | 已核实部分逐笔成交，剩余委托仍可活动 | 同上；不能把已成交部分撤回或当作全额释放。 |
| `CANCELING` | 撤单开始已持久化，原单终态未确认 | 只核对，不能再发送撤单；确认前保留剩余占用。 |
| `UNKNOWN` | 提交／取消／官方状态或证据冲突未核实 | 只核对原客户订单，未取得可信受理证据前不能撤单；不按重试次数或时间解锁。 |
| `FILLED` | 委托成交终态 | 调用撤单只返回／确认原结果，不发送新撤单；仍可能追费或核实 SELL 库存。 |
| `CANCELED` | 官方已撤销剩余委托，可已有部分成交 | 同上；成交不被撤销，费用／库存仍独立闭环。 |
| `REJECTED` | 明确官方拒单，或可信本地未发送中止，具体看原因 | 无新撤单；不是 UNKNOWN 的替代标签。 |
| `EXPIRED` | 订单按官方规则失效，可已有部分成交 | 无新撤单；这里是订单失效，**不是任务“窗口结束未完成”**。 |

终态订单也可能 `feePending=true`、`feeFinalized=false`、`reservationReleased=false` 或 `sellInventoryVerifiedAt=null`，不能只看 status 隐藏“待核对”。若已记录 `cancelStartedAt`，即使后续快照看见 ACCEPTED／PARTIALLY_FILLED，也不能自行当作可再次撤单。明确证明此次请求在发送前被本地冷却阻断时，服务端才可撤回自己的取消开始标记；真实超时或官方限流不构成该证据。[来源：公开订单枚举](../../backend/contracts/validation.ts#L46-L59)、[订单终态](../../backend/src/domain/orders/status.ts)、[明确撤单与只读核对](../../backend/src/services/trading/engine.ts#L991-L1019)、[唯一取消开始与发送前阻断](../../backend/src/services/trading/engine.ts#L550-L690)、[终态结算门禁](../../backend/src/domain/orders/settlement.ts#L220-L250)。回执和未知操作恢复见[写入与恢复](write-and-recovery.md)。

## 9. 正常证据等待、人工门禁与卖出库存

### 9.1 正常证据等待可以自动继续，但不是倒计时重试

满足“本地已确认官方 ID 和受理时间、原状态为 ACCEPTED／PARTIALLY_FILLED、无取消开始”等前提时，官方累计量与去重逐笔快照暂未对齐可以标为 `tradeEvidencePending`。后端保留原已核实累计、不增加猜测成交、不释放占用、不把暂未入账叫作未成交。正在运行的任务进入 `RECONCILING + stopReason=EVIDENCE_PENDING`。

只有全部阻断的成交、费用和库存证据实际闭环，且仍在原窗口、没有人工／安全限制时，后端才按原时钟自动回 RUNNING；不是等固定秒数或重读 N 次后放行。串行还要遵守前单闭环后的间隔。

身份、官方订单 ID、执行 ID 内容、成交数量／本金越界、终态、币种、费用或精度冲突是硬问题，不能包装成普通等待；会保留人工门禁。原未知已核实后一般先回 PAUSED，等待交易员明确继续，而不是自动重启。旧的 RECONCILING 没有本次 EVIDENCE_PENDING 标识也不会自动取得资格。

来源：[有界成交快照等待前提](../../backend/src/services/trading/settlement.ts#L241-L302)、[身份／数量／执行／币种／费用冲突](../../backend/src/domain/orders/settlement.ts#L50-L219)、[硬未知任务门禁](../../backend/src/services/trading/settlement.ts#L34-L91)、[自动与人工恢复分支](../../backend/src/domain/tasks/execution.ts#L233-L266)。

### 9.2 费用和 SELL 库存不能“显示为零即可继续”

- 官方实际费用缺失是未知，不是零、免费或不适用；估算预留不得代替它。BUY 可在可信订单终态释放本地预留并继续后台追费，但未核实成交费用仍阻止账户新增交易。
- SELL 有成交时，终态最终费用未核实前保留剩余股票预占；零成交可信终态不等待可能缺失的费用。最终费用闭环后，还要通过成交后的库存下降检查，才解除同证券库存门禁。
- 下降检查要求当次官方可用量不高于“发送前保存的库存基线－已确认成交股数”，且读取发生在原终态核对之后；它只阻止重复使用未下降旧余额，**不推算新的可卖量，也不证明订单与钱包原子同步**。
- 全部卖出后官方记录消失仍不能补成零；外部入库可能让下降检查保守不通过。不能靠延时、刷新次数、管理员开关或手工置零绕过。已确认订单终态不会因后续追费／库存读取失败回退为 UNKNOWN，但其独立门禁和任务人工状态仍可能保留。

来源：[费用终态与预留释放](../../backend/src/domain/orders/settlement.ts#L220-L250)、[库存下降检查](../../backend/src/services/trading/sell-inventory.ts#L19-L102)、[已确认终态不回退](../../backend/src/services/trading/settlement.ts#L64-L91)。

卖出证券选择应读取所选账户当次官方 Funding 股票候选；候选需可验证股票身份与独立非零余额，可能包含 free 为零但 locked／freeze／withdrawing 非零的记录，故“候选存在”仍不等于“当前可卖股数大于零”。目录全市场不能替代卖出候选，本地名义持仓也不能替代。读取失败、无可验证记录、空快照或无匹配不能当作已确认零库存；每次执行仍重新读取。[来源：官方候选构建](../../backend/src/api/equity-balance.ts#L163-L209)、[候选读取权限／账户状态](../../backend/src/services/equity-holdings.ts#L99-L147)、[公开候选字段](../../backend/contracts/validation.ts#L615-L669)。

### 9.3 诊断显示不能改执行含义

展示以当前任务状态、当前原因和门禁为先；`lastInterruption` 仅追溯最近未恢复的暂停／核对原因。EXPIRED／STOPPED 可以同时保留此前受阻说明，应区分“历史为什么受阻”和“现在为什么终结”，不能据历史文案自动开启 resume。诊断不改变时钟、订单、占用或自动资格。[来源：只读中断投影](../../backend/src/server/task-interruptions.ts)、[公开 TaskInterruption](../../backend/contracts/validation.ts#L671-L678)。

## 10. 安全动作的端到端结果

| 安全场景 | 立即保护 | 原订单／恢复规则 |
| --- | --- | --- |
| 交易员关闭 `tradingEnabled` 或设账户 DISABLED | 阻止该账户新交易，安全中断其活动任务 | 保留原挂单／占用；不把自停等同 AT_TASK_END。重新启用／开交易不自动继续。 |
| 管理员禁用用户 | 撤销该用户会话，阻止其账户新增交易，安全中断所属活动任务 | Worker 不因用户退出或禁用就忘记原单；原凭据仍用于核对，重新启用不自动恢复。 |
| 管理员设置 `adminTradingBlocked=true` | 独立于交易员自停开关，交易员不能自行解除 | 解除只清平台限制，不打开交易员自停开关，也不恢复任务。 |
| 平台 `emergencyStop=true` | 平台范围禁止新增订单／启动／继续，安全中断活动任务 | 不是“全撤单”或“资金已解锁”；原订单继续核对，原已授权超时／窗口结束策略仍可触发。解除急停不自动继续。 |
| API／Worker 停止或重启 | 不再开始新的提交；重启先核对持久化原单 | 不重发结果未知订单、不重置已开始窗口、不补发错过周期；已配置自动撤单恢复执行，未知取消仍只读。 |

安全中断会按未结订单／费用／库存或预留决定 `RECOVERY_REQUIRED`，否则通常 PAUSED；永久 USER_STOP 不被覆盖，EVIDENCE_PENDING 自动资格被撤销。其活动状态集合不含仅保存的 CREATED；CREATED 配置可以保持原状，但启动仍被安全条件阻止。安全措施不会抹掉订单或释放未知占用，也没有管理员“强行放行费用／库存”的接口。[来源：安全中断转换](../../backend/src/server/queries.ts#L112-L158)、[账户自停](../../backend/src/server/accounts.ts#L238-L266)、[用户禁用](../../backend/src/server/admin.ts#L319-L354)、[独立账户限制](../../backend/src/server/admin.ts#L412-L506)、[平台急停](../../backend/src/server/admin.ts#L566-L618)、[Worker 恢复](../../backend/src/services/trading/engine.ts#L1214-L1273)。

客户端实施时应分别呈现：意图是否受理、对象当前状态、原订单是否闭环、实际成交量／本金、费用是否核实、库存是否核实、是否允许新增交易、原窗口是否结束。任何一个“成功”提示都不能代替其他维度；具体响应字段按[查询与响应](query-and-response-contracts.md)，原指令终态按[写入与恢复](write-and-recovery.md)处理。
