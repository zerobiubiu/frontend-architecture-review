# 查询、筛选与响应语义

- 状态：现状参考。
- 基线：后端 **3.0.0**，提交 **d9d758f**。
- 适用范围：现有全部读取类 GET 的筛选、分页、响应容器与业务字段语义；不新增接口或改变后端行为。
- 消费者入口：本资料与 [`backend/contracts/client.d.ts`](../../backend/contracts/client.d.ts)、[`backend/contracts/validation.ts`](../../backend/contracts/validation.ts)。这两份公开契约是静态类型与校验 schema 的唯一来源，不保证穷尽运行时空值或错误分支；本文不建立另一套 DTO。文末源码只作审计来源，实施客户端不需要回源猜协议。

完整方法／路径目录见 [API 目录](api-catalog.md)；会话、错误和 SSE 传输见 [HTTP 与事件](http-and-events.md)；交易规则与状态见 [业务模型与动作](backend-model-and-actions.md)；写入及原 ID 恢复见 [写入与恢复](write-and-recovery.md)。

## 1. 先区分四种读取结果

|结果|含义|客户端处理|
|---|---|---|
|HTTP 成功且 `data.items=[]`／`data=[]`|本次授权范围、筛选和页码下没有记录|只对该查询显示空结果；不是请求失败，也不能证明官方资产为零|
|数值字符串 `"0"`（也可能带小数尾零）|该字段确实返回了一个零值|按该字段的来源和单位展示；不要使用字符串是否为空来判断零|
|字段为 `null`|未知、未返回、不适用或尚未核实，具体由下文逐对象定义|显示未知／未核实／不适用，不填零、不转换为空对象|
|非成功 HTTP 或 SSE 错误／不可用状态|本次读取失败或流不可用|保留错误和最后成功时间；如展示旧值，必须显式标旧，不能当成本次成功结果|

金额、价格、数量按公开契约使用十进制**字符串**；计数、页码使用数字。不得把财务字符串先转成 JavaScript `number` 再计算，也不得把 USD 报价、USDC 资金和无币种字段相加。业务时间通常为 ISO 字符串；证券规则的上市／退市时间是毫秒数字；报价流另有毫秒时间字段。

所有 JSON 成功响应均以 `data` 包装，但 **`data` 不总是分页对象**。健康检查返回 HTTP 503 时仍是 `data` 健康对象，不是普通业务错误外壳。两个 SSE GET 不返回 JSON `data` 列表。错误分支不能直接强转为成功类型。

### 1.1 静态声明不是运行非空保证

HTTP 载荷应先作为 `unknown` 检查外壳和所需字段，再使用公开类型。以下是当前基线需要显式处理的非空推导偏差，不是要求消费者另造 DTO：

|读取路径|精确 JSON 路径|何时为 `null`|必须怎样处理|
|---|---|---|---|
|`/api/v1/overview`、`/api/v1/admin/overview`|`$.data.worker.lastSeenAt`|没有匹配的正式 Worker 心跳行；此时 `online=false`、`status="UNKNOWN"`|显示“未见心跳”，不解析为日期、不伪造当前时间。两处公开推导声明目前为 `string`|
|`/api/v1/admin/overview`、`/api/v1/admin/system`|`$.data.settings`|读取不到 `id="platform"` 的平台设置行|显示配置缺失／不可用，不解引用配置、不生成默认安全设置。公开推导声明目前未包含 `null`|
|`/api/v1/overview`|`$.data.today.buyAmount`、`$.data.today.sellAmount`、`$.data.today.quoteCurrency`|实现保留“未取得聚合结果行”的防御分支，该分支返回这三个 `null`；公开推导声明为字符串|若出现该分支，金额与币种应视为不可用。**正常 PostgreSQL 聚合即使没有成交也返回一行，金额为零、币种为 USD；无成交不是该空值分支的含义**|

另有已在公开类型正确声明的常见空值：`overview` 的 `$.data.account` 在本角色范围内没有账户时为 `null`；`/healthz` 的 `$.data.worker.lastSeenAt` 可为 `null`；`admin/system` 的 `$.data.endpoints` 在本 API 进程未成功保存测速结果时为 `null`。调用方也必须分别处理，不能因为同类页面的声明不同而忽略空值。

## 2. 公共 filter：通过校验不代表生效

`filterSchema` 是多个资源共用的**输入形状**，不是“每个资源支持全部字段”的承诺。除下面专用查询外，共用它的 GET 使用下列校验：

|字段|缺省|校验／范围|通用匹配方式|
|---|---|---|---|
|`symbol`|不限制|可选字符串；这里**不使用** `symbolSchema`，不自动修剪或转大写|仅对支持此字段的资源做精确匹配；例如本地列表应传规范证券码而非期望大小写模糊匹配|
|`status`|不限制|可选字符串；不是统一枚举校验|映射到资源指定列后按文本精确匹配；合法字符串但不存在的值通常得到空集，不是参数错误|
|`ownerUserId`|见角色规则|可选 UUID|通常对应业务所有者；用户列表与审计有不同映射，见矩阵|
|`accountId`|不限制|可选 UUID|只对支持它的资源生效；不总是先读取／授权账户|
|`from`、`to`|均不限制|可选 `datetime()` 字符串，使用 UTC ISO 8601 `Z` 表达；不是 Unix 毫秒或本地时间|本地资源均过滤各自的 `createdAt`，`>= from`、`<= to`，包含边界；不按最后更新／成交／计划窗口时间过滤|
|`search`|不限制|可选字符串，最长 100 字符；公共 filter 不修剪|支持它的列之间为 OR，大小写不敏感的包含匹配；`%`、`_`、反斜杠按字面转义，不提供通配／正则搜索|
|`page`|`1`|数字转换后为整数且至少 1，未设业务页数上限|只在真分页资源生效；偏移 `(page-1)*pageSize`|
|`pageSize`|`25`|数字转换后为 1–100 的整数|只在真分页资源生效|

- 支持的各个筛选条件彼此按 AND 组合；`search` 内的多列按 OR。
- 进入公共筛选器时，`from > to` 返回 `422 / DATE_RANGE_INVALID`。日期格式、UUID、页码等校验失败返回 `422 / VALIDATION_ERROR`，不会因该字段对资源无效而绕过输入校验。
- `symbol`、`status`、`search` 的空字符串在公共筛选器中不增加条件；`ownerUserId=`、`accountId=`、空日期和空页码不能借此表示省略。没有值应删除 query key。
- 未在对应查询 schema 中定义的 key 被剥离，不提供隐含功能。例如 `side`、`orderType`、`taskId`、`orderId`、`sort`、`q`、`limit` 不能代替现有参数；`status=FILLED,CANCELED` 也不是多选语法。
- 不要发送同名多值或数组来表达批量筛选。公开 Hono 请求推导中的个别 `string | string[]` 不是“支持多个账户／多个页码”的业务契约。

### 2.1 每个公共 filter 路由的真实映射矩阵

以下路径均省略 `/api/v1`。`忽略` 表示字段通过该资源的输入校验后不参与查询。管理员专用路径不能由交易员调用。所有 `from/to` 均包含边界。

|GET 路径|`ownerUserId`／角色范围|`accountId`|`symbol`|`status`|`from/to`|`search`|`page/pageSize`|
|---|---|---|---|---|---|---|---|
|`/accounts`|账户 `ownerUserId`；交易员强制本人|账户 `id` 精确匹配|忽略|账户 `status`|账户 `createdAt`|`label`、`apiKeyLast4`|**忽略，返回全量数组**|
|`/orders`、`/admin/orders`|订单 `ownerUserId`；普通路径交易员强制本人|`exchangeAccountId`，先授权账户|订单 `symbol`|订单 `status`|订单 `createdAt`|`clientOrderId`、`idempotencyKey`、`symbol`、`reason`|分页|
|`/tasks`、`/admin/tasks`|任务 `ownerUserId`；普通路径交易员强制本人|`exchangeAccountId`，先授权账户|任务 `symbol`|任务 `status`|任务 `createdAt`，**不是计划开始／执行窗口**|`name`、`symbol`、当前 `reason`；不搜索任务 ID、`stopReason` 或历史原因|分页|
|`/positions`|持仓行 `ownerUserId`；交易员强制本人|`exchangeAccountId`，先授权账户|持仓行 `symbol`|忽略|持仓行 `createdAt`|忽略|分页|
|`/ledger`、`/admin/ledger`|流水 `ownerUserId`；普通路径交易员强制本人|`exchangeAccountId`，先授权账户|经 `orderId` 关联订单的 `symbol`；无关联订单的流水不会命中|**流水 `type`，不是订单状态**|流水 `createdAt`|`type`、`description`|分页|
|`/reconciliations`|核对记录 `ownerUserId`；交易员强制本人|`exchangeAccountId`，先授权账户|忽略|核对记录 `status`|记录 `createdAt`|忽略|**忽略，返回全量数组**|
|`/logs`|各来源事件的 `ownerUserId`；交易员强制本人|任务／订单通过所属对象账户；系统事件按 `details.accountId` 精确匹配；先授权账户|任务／订单通过所属对象证券；系统事件按 `details.symbol` 精确匹配|各事件 **`type`**|各事件 `createdAt`|各事件 `message`、`type`|合并后三来源统一分页|
|`/admin/users`|**用户 `id`**，可精确选择用户，不是查询其业务记录|忽略|忽略|用户 `status`|用户 `createdAt`|`username`、`role`|分页|
|`/admin/accounts`|账户 `ownerUserId`，不强制管理员本人|账户 `id` 精确匹配|忽略|账户 `status`|账户 `createdAt`|`label`、`apiKeyLast4`|分页，**不同于 `/accounts`**|
|`/admin/audit`|**操作者 `actorUserId`**，不是被操作对象所有者|**`targetId` 精确匹配**；不限定 `targetType`，也不搜索 `details.accountId`|仅 `details.symbol` 精确匹配|**审计 `result`**|审计 `createdAt`|`action`、`targetType`、`targetId`；不搜索 `details` 全文|分页|

权限的细微区别必须保留：

1. 普通公共列表的交易员 owner 条件由服务端强制；省略 `ownerUserId` 仍只能看本人，显式传其他人的 UUID 返回 `403 / FORBIDDEN`。管理员在允许的普通业务 GET 上省略 owner 时是跨用户查询；`/admin/orders|tasks|ledger` 与对应普通路径复用同一查询。
2. 矩阵标“先授权账户”的路径，在 `accountId` 指向不存在或不可访问账户时返回 404，而非空页。`/accounts` 只按 `id AND 本人 owner` 筛选，所以别人的／不存在的 `accountId` 可以得到空数组；`/admin/accounts` 的不存在 ID 得到空页。
3. 账户、订单、任务详情及复用对应授权查询的路径先按 UUID 找对象，再检查归属。不存在时分别返回 404 `ACCOUNT_NOT_FOUND`、`ORDER_NOT_FOUND`、`TASK_NOT_FOUND`；对象存在但交易员无权访问时返回 404 `NOT_FOUND`，消息为“资源不存在或无权访问”。业务错误的代码和消息会原样进入错误响应，因此**不返回业务正文不等于无法从错误码推断资源存在性**，不可宣称当前接口隐藏了存在性。管理员跨所有者读取留审计，但取得读取权不产生交易提交权。
4. 无论上述哪种 404，都不可当作“已删除所以写操作未执行”或解除原未知操作保护的证据；原操作恢复首选 GET 原 UUID，详见[写入与恢复](write-and-recovery.md)。

### 2.2 不共用 filter 的 GET

|读取场景|实际参数／范围|公共 filter 的处理|
|---|---|---|
|`/accounts/:id`、`/orders/:id`、`/tasks/:id`|路径 `id` 必须 UUID；交易员仅本人，管理员可跨用户读取|不读取 query，不支持以公共 filter 限制详情内数组|
|`/accounts/:id/exchange/orders`、`.../trades`|路径 UUID；仅 `symbol/from/to/page/pageSize`，详见第 6 节|`ownerUserId/accountId/status/search` 等额外 key 被剥离；账户由路径确定|
|`/market/symbols`|必需 `accountId`；独立 `search/page/pageSize/refresh`，详见第 5 节|没有公共 symbol/status/owner/date 筛选|
|`/market/holdings`|必需 UUID `accountId`；交易员仅本人，管理员可跨用户读取|其他 key 被剥离；无证券、状态、关键词、分页|
|`/market/quotes`|必需 `symbol`；可选 UUID `accountId`|其他 key 被剥离；一次一只证券，不是批量或分页|
|`/market/quote-stream`|必需 UUID `accountId` 与 `symbol`|其他 key 被剥离；一次一账户一证券|
|`/operations/:id`|路径为原操作 UUID|不读取 query，不按公共 filter 改变原回执|
|`/operations`|无参数，返回本次挑选的未闭环回执，详见第 9 节|不读取 query，不支持分页、状态或 owner 查询|
|`/overview`、`/admin/overview`、`/admin/system`|无参数；各自固定统计／截取范围，详见第 8 节|query 不参与统计或筛选|
|`/auth/me`、`/meta`、`/healthz`|无参数；`meta`、`healthz` 免登录，其余需有效会话|query 不参与结果计算|
|`/events`|无业务筛选参数；按会话角色确定通知范围|不支持 owner/account/symbol/history/cursor 筛选；不是事件历史 API|

## 3. 容器、排序和分页

### 3.1 真分页与全量数组

下面是**结构说明用的合法空结果形状，不是本轮运行输出**：

```json
{"data":{"items":[],"total":0,"page":1,"pageSize":25,"source":"LOCAL_LEDGER"}}
```

该壳用于本地订单、任务、账本及其管理员对应列表。`positions` 另有顶层 `assetsAvailable:false`、`unavailableReason`；证券目录另有 `source:"BINANCE_STOCKS"`、`fetchedAt`、`expiresAt`；官方历史有 `items/total/page/pageSize`，**没有** `source`；`admin/users`、`admin/accounts`、`admin/audit`、`logs` 的分页壳也没有 `source`。

```json
{"data":{"items":[],"total":0,"page":1,"pageSize":25}}
```

以下读取直接返回数组，不要访问 `data.items` 或虚构 `total`：

```json
{"data":[]}
```

- `/accounts`：所有命中账户，虽接收并校验 `page/pageSize`，却不截页。
- `/reconciliations`：所有命中核对记录，虽接收并校验 `page/pageSize`，却不截页。
- `/operations`：本次读取的授权回执数组，不是完整操作历史。
- `/market/quotes` 也是 `data` 数组，但成功时固定为**一个 Quote**；报价失败走错误，不用空数组伪装成功。

本地与目录分页的 `total` 是相同筛选条件下的记录数，不是当前页长度；越界页可以 `items=[]` 而 `total>0`。总数为零只表示本次读取无命中。页码从 1 开始，不提供游标、快照版本或客户端指定排序；并发新增／更新时不同页不是数据库同一历史快照。

### 3.2 固定排序

|资源|排序／截取|
|---|---|
|订单、任务、账本、管理员用户、管理员账户、审计|`createdAt DESC, id DESC`，按页截取|
|`/accounts`|`createdAt DESC`，不截页|
|名义持仓|`symbol ASC, id ASC`，按页截取；不自动过滤零股数行|
|核对记录|`createdAt DESC`，不截页|
|合并业务日志|三个事件源合并后 `createdAt DESC, id DESC`；合并 ID 是文本，不能按其数值大小还原跨源顺序|
|证券目录|`symbol ASC`，按页截取|
|官方订单／成交历史|保留官方当前页的返回顺序；本站不重新排序或把页拼成完整历史|
|订单详情|`trades` 按 `filledAt ASC`；`events` 按 `createdAt ASC`|
|任务详情|`orders` 按 `createdAt DESC`；`trades` 按 `filledAt ASC`；`events` 按 `createdAt ASC`|
|操作回执列表|没有承诺排序，也没有分页|

详情数组没有页长参数或截断标记；不能把普通列表的 `pageSize=25` 套到它们上面。除明确有 `id` 次序的地方外，同一时间记录的相对顺序不要当交易所先后证据。

## 4. 账户、资金与本地名义持仓

### 4.1 账户对象及脱敏

账户列表元素、账户详情 `data`、`overview.data.account` 和 ACCOUNT_CHECK／ACCOUNT_SYNC 的冻结结果使用同类安全账户投影；ACCOUNT_RECONCILE 返回独立核对记录，不是账户对象。

|关键字段／字段组|来源与语义|
|---|---|
|`id/ownerUserId/exchange/label/status`|本地账户身份、归属、标签与状态；资金和订单都应展示／保持其真实账户归属|
|`hasCredentials/apiKeyLast4`|前者只表示两项加密凭据存在，后者是 Key 后四位；任何角色均收不到 Key、Secret 或密文。缺凭据不等于外部账户无资产|
|`tradingEnabled`、`adminTradingBlocked/adminBlockReason`|交易员账户开关与独立平台限制；不能互相覆盖或合并成一个可写开关|
|`connectionStatus/connectionMessage`|持久化的最近连接检查结论，常见 `UNVERIFIED/CONNECTED/ERROR`；不是本次 GET 实时探测|
|`tradingRevision`|服务端交易安全修订；不是账户余额或交易次数，不是任意写接口的通用版本参数|
|`buyReady`|存在本次投影认可的 Funding USDC 快照，并有凭据、ACTIVE、交易开关开启、无管理员阻止、最近连接为 CONNECTED|
|`sellReady/tradingReady`|上述账户连接／凭据／开关条件，不依赖 Funding USDC 是否存在；**不证明某证券有可卖股数**|
|`walletSnapshot`|上次成功保存的 `AccountAssets`；可为 `null`，也可能在后续读取失败后保留旧对象|
|`walletSyncError`|最近保存的资产读取／连接错误；存在时安全投影不把旧 Funding 余额继续当作可用|
|`lastSyncAt`|成功保存资产快照时的本地时间；失败保留此前成功时间。`updatedAt` 变化不能代替成功同步时间|
|`source/assetsAvailable/assetMessage`|没有错误且快照有 Funding USDC 明细时为 `BINANCE_WALLET/true`；否则为 `UNAVAILABLE/false` 并给原因。`true` 不是新鲜度或可下单承诺|
|`cashBalance`|固定 `null`，不把 USDC 钱包免费余额冒充美元现金|
|`availableCash`|投影认可的 Funding `free`，币种 USDC；**尚未扣本地待提交意图**，不是最终买入预算|
|`reservedCash`、`localSnapshot.reservedCash`|本地订单预留的同一账户汇总；不是另一个钱包、实际现金扣款或可再次相加的两份预留|
|`localSnapshot.cashBalance/availableCash`|均为 `null`；不提供本地虚拟现金余额|
|`externalSnapshot`|`source/receivedAt/availableCash` 指向钱包快照；`cashBalance/positions` 为 `null`。错误时仍可能保留旧 `receivedAt`，必须同时看 `source` 与错误|
|`quoteCurrency/settlementCurrency`|固定为 USD／USDC；用途不同，不是两个可互换币种标签|

`walletSnapshot.funding` 包含 `walletType="CARD"`、`asset="USDC"`、`free/locked/freeze/withdrawing/receivedAt`。`freeze/withdrawing=null` 是上游未给，不等于零。成功钱包响应未返回 USDC 行时 `funding=null`，不能补一条 `free="0"`。

`walletSnapshot.spotUsdc` 只读展示 Spot USDC 的独立余额，缺失／未激活时可为 `null`，**不并入 Funding 买入预算**，后端不会自动转账或换币。`permissions` 各布尔值的 `null` 是上游未返回可验证值，不是已获权限，也不应改成 `false` 来伪造确定结论。

### 4.2 四个量不能混用

|量|读取来源|不能拿来替代什么|
|---|---|---|
|钱包资金|账户保存快照；新交易的当次资金由服务端重新读 Funding USDC|不能以旧快照证明当次买入可用；不能把 Spot USDC、USD 名义金额混入预算|
|官方股票候选／库存|`market/holdings` 当次 Funding；特定卖单最终以预检／执行的当次证据为准|不能用本地 `positions` 推导可卖；不能把全部资金钱包资产当股票|
|本地名义持仓|`positions`，只由本系统确认的逐笔成交重放|不是全账户证券库存、税务成本、外部资产或官方估值|
|本地预留|账户／订单／任务 `reservedCash/reservedQuantity`|不是额外资产或实际费用；同一订单在账户／任务汇总中出现，不能重复累计|

买入预检的 `availableCash` 与账户 GET 的同名字段语义不同：预检使用当次有效 Funding `free`，仅扣尚未开始提交的本地 `PLANNED` 意图 `localPendingCash`；已被交易所冻结的资金不从 `free` 重复扣除。`estimatedFee/estimatedTotal` 属于 `RESERVE_POLICY` 费用预留估算，实际费用只能读订单确认费用／账本。不得自行用账户 GET 的 `availableCash - reservedCash` 复刻执行预算。

卖出预检的 `sellInventory` 给来源、证券、资产码、请求／收到时间、官方 `availableQuantity` 与本地未提交 `localPendingQuantity`；顶层 `availableQuantity` 是预检后的量。候选列表本身不包含这些交易门禁全部证据，也不构成执行授权。预检是 POST，参数与完整写流程见 [写入与恢复](write-and-recovery.md)。

### 4.3 名义持仓对象

`positions.data.items[]` 的关键字段：

- `quantity`：本系统已确认买卖成交重放后的已跟踪股数；`notionalCost`：该部分剩余名义成本；`averageCost`：剩余成本／股数的展示均值。后端按真实成交时间和执行 ID 确定性重放，卖出只冲减已跟踪部分，不给外部股票补造成本。
- `reservedQuantity` 与 `localAvailableQuantity=max(0,quantity-reservedQuantity)` 仅表示本地名义记录；`availableQuantity/exchangeQuantity/exchangeReservedQuantity` 固定为 `null`。
- `source="LOCAL_LEDGER"`、`assetsAvailable=false`，列表级同样为 false 并给 `unavailableReason`。即使数量非零，也不是官方当前可卖股数。
- `markPrice/unrealizedPnl/quoteTimestamp` 固定为 `null`，`valuationEstimated=false`；不提供行情估值。`realizedPnl` 是保留的本地存储字段，当前名义重放**不计算全账户实现盈亏**，不能把其值当成已核实的完整盈利。
- USD 报价／USDC 结算标签仍明确区分。零股数记录可以保留且出现在列表中；列表为空不是官方无持仓证明。

## 5. 证券目录、官方持仓候选和报价

### 5.1 `/market/symbols`

参数：必需 `accountId` UUID；`search` 可选、修剪后最长 128 字符，仅按证券代码做大小写不敏感包含匹配，不搜名称／行业；`page=1`、`pageSize=25`（1–100）；`refresh` 可省略，查询串只使用 `true`／`false`。`refresh=false` 不是“禁止过期刷新”，只有 `true` 表示要求本次主动刷新成功。

响应为 `data.items/total/page/pageSize/source/fetchedAt/expiresAt`。`items[]` 是公开 `EquityRule`：

|字段|含义／空值|
|---|---|
|`symbol/tradability`|官方代码及交易方向／可交易规则；不自行翻译成白名单。`tradability=null` 不是无限制|
|`extendedSession/overnightSupported/fractionable/fractionableEh`|官方时段与碎股能力，缺失为 `null` 而非默认支持|
|`listingTime/delistingTime`|官方时间的毫秒数字；缺失为 `null`，不是本地抓取时间|
|`maxNumOrders`|官方同证券挂单上限；缺失／无法验证为 `null`|
|`stepSize/minQuantity/maxQuantity/minNotional/maxNotional`|官方数量步进和上下限；十进制字符串，缺失保留 `null`，不自行补最小值、最大值或零|

目录包含账户官方 `exchangeInfo` 返回的**全部受支持证券**，包括股票、ETF 等；不按品类过滤，也没有管理员手动审批目录。`total` 是搜索过滤后的真实数量，不受当前页影响。

目录按账户与凭据摘要隔离缓存 5 分钟，提前 1 分钟刷新；后台／自动提前刷新失败且原窗口仍有效时，允许返回该仍有效窗口，响应时间不会伪装为刷新成功。过期且无法重新验证时必须报错，不返回可用的过期目录。`refresh=true` 失败或正在被其他刷新占用时明确报错，不能静默回旧缓存。凭据改变、账户不可用或读取期间到期也不能把旧规则混入新响应。`fetchedAt/expiresAt` 是当前有效目录窗口，不是当前 HTTP 响应时刻；目录可读不跳过新订单的官方规则复核。

### 5.2 `/market/holdings`

每次使用指定账户的正式凭据读取 Funding 全资产列表，**不读本地 positions、不提供缓存回退或分页**。`data` 的完整容器是：

|JSON 路径|形状／含义|
|---|---|
|`$.data.accountId`|本次已授权账户 UUID|
|`$.data.source`|`BINANCE_FUNDING_WALLET`|
|`$.data.requestedAt/receivedAt`|本地发起／收到本次响应的 ISO 时间，不是交易所数据更新时间|
|`$.data.sourceUpdatedAt`|固定 `null`；官方没有提供可用的源更新时间|
|`$.data.items`|当次可验证的非零股票候选数组，最多 10,000 项，不承诺排序|
|`$.data.items[].symbol/stockTicker/assetCode`|必须精确满足 `stockTicker=symbol`、`assetCode="EQ_"+symbol`，股票码本身不能以 `EQ_` 开头；不是从前缀猜出的映射|
|`$.data.items[].fundingFreeQuantity/lockedQuantity`|官方独立可用／锁定股数的十进制字符串；可用量不加入锁定、冻结或提取中数量，也不再次扣交易所挂单|
|`$.data.items[].freezeQuantity/withdrawingQuantity`|官方冻结／提取中数量，未返回可为 `null`|

候选只要求至少一项已验证余额非零，因此 `fundingFreeQuantity="0"` 且锁定量非零的证券也可能出现，不能因“在候选中”就启用提交卖出。全部已给字段为零的已核实行不进入候选；若无法确认是否非零（例如 free/locked 为零而冻结字段缺失），返回 `EQUITY_HOLDINGS_UNVERIFIABLE`，不谎称无持仓。

本次成功的 `items=[]` 只说明本次没有返回可进入该候选集的记录；不能据此给任意证券补一个已确认零库存。股票身份缺失、重复、冲突、精度错误或网关不可用走错误，不以部分候选／旧缓存降级成成功。读取后会再次核对用户、账户身份、凭据、连接状态和交易修订，变化返回 `ACCOUNT_CHANGED`。账户需要 ACTIVE 且有凭据；读取候选不要求先开启交易开关，也不等于正式卖出验收完成。

### 5.3 `/market/quotes` 与 `/market/quote-stream`

REST 必需 `symbol`，按公开 `symbolSchema` 修剪、转大写、限制 1–128 字符并拒绝控制字符；`accountId` 可选。显式指定账户时先校验所有权；省略时取当前范围内**创建最早的 ACTIVE 账户**：交易员限本人，管理员可以是跨用户最早活动账户。没有可用账户返回 `ACCOUNT_REQUIRED`，并非公共匿名行情。为避免管理员看到非预期账户的报价范围，客户端应明确发送所选 `accountId`。

REST 成功固定 `data=[Quote]`。先确认官方规则包含该证券，再读取官方最新盘口：

|Quote 字段|语义|
|---|---|
|`symbol/bid/ask`|证券码与买一／卖一 USD 价格字符串；不是成交价格承诺，也没有 Last、K 线或深度列表|
|`bidSize/askSize`|盘口数量；缺失为 `null`，不是零手数|
|`source`|`BINANCE_STOCKS`，不回退本地伪报价|
|`timestamp/timestampSource`|REST 的 `timestamp` 是本地收到响应时间，`timestampSource="LOCAL_RECEIPT"`；不是交易所行情发生时间|
|`tradingStatus`|当前 REST 适配器返回 `UNKNOWN`；不能从“有报价”推断正在交易或未停牌|

报价流必需 `accountId+symbol`，同样按账户授权，不接受多证券列表。其 SSE 数据使用公开 `QuoteStreamEvent`：`kind="quote"` 时含 `accountId/symbol/value`；`value` 是 `QuoteStreamSnapshot`，含 `quote/receivedAt/eventTimestamp/sourceTimestamp/transport`；`kind="status"` 时含 `status`，并可含 `code/retryable`。REST 快照的官方时间字段保持 `null`；WEBSOCKET 的事件时间与本地收到时间分开，不伪造源时间。`snapshot/live/waiting/reconnecting/unavailable` 等状态不能合并成“持续有效实时报价”；详见 [HTTP 与事件](http-and-events.md)。

## 6. 官方订单与成交历史：不是本地账本的另一个分页入口

`/accounts/:id/exchange/orders` 与 `.../trades` 使用路径账户，交易员限本人，管理员可跨账户并留审计。接受的查询只有：

|参数|默认／映射|
|---|---|
|`symbol`|可省略；提供时使用 `symbolSchema` 修剪和大写，与公共 filter 的 `symbol` 行为不同|
|`to`|本次查询时刻；映射为官方 `endTime` 毫秒|
|`from`|最终 `endTime` 前七天；映射为官方 `startTime` 毫秒。只给 `from` 时结束仍是当前时刻，只给 `to` 时开始为该 `to` 前七天|
|`page/pageSize`|1／25；页长 1–100，映射为官方 `current/size`|

时间必须可解析成安全毫秒整数，开始不得早于 Unix epoch，也不得大于结束；无效窗口为 `HISTORY_QUERY_INVALID`（400），输入字符串格式错误则先在 HTTP 校验层为 422。**HTTP 历史接口没有另行设置“最长七天／不得未来”的本地限制**；七天是省略开始时间的默认，不要把独立诊断 CLI 的限制套到这里。可用时间跨度、可追溯范围、排序及官方进一步限制仍由上游决定。

每个请求只读取官方指定的一页，返回 `data.items/total/page/pageSize`，不自动翻页、不把窗口外历史或整个账户历史补到本地。`total` 必须来自上游可验证的数字／bigint 总数，缺失总数／行数组或总数非法返回 `EXCHANGE_EVIDENCE_INVALID`，不能用当前页长度冒充总数。客户端翻页应固定相同的显式 `from/to`，避免每页默认“现在”使窗口漂移；官方数据本身也可能在分页期间变化。

|对象|关键字段来源与不可误读点|
|---|---|
|官方订单 `ExchangeOrder`|`exchangeOrderId` 来自官方 `orderId`；`orderType` 只接纳 LIMIT／MARKET；`status` 保留官方状态字符串，**不是本地 OrderStatus 归一枚举**。`price/quantity/averagePrice/notional/filledTotal/fee/createdAt/updatedAt` 未给时保持 `null`|
|官方订单的币种|`priceCurrency="USD"`；`quoteCurrency` 保留官方 `quote` 或 `null`；`notionalCurrency` 固定 `null`，不对订单 `notional/filledTotal` 猜币种；费用给出时 `feeCurrency="USD"`，未给费用时同时为 `null`|
|官方成交 `ExchangeTrade`|`exchangeTradeId` 来自官方 `executionId`，`exchangeOrderId` 来自官方订单 ID；正 `price/quantity` 与 `filledAt` 为必需可验证证据；`notional` 来自官方 `total`，可为 `null`；`priceCurrency/notionalCurrency="USD"`|
|官方逐笔费用|当前适配器不提供逐笔费用分摊，`ExchangeTrade.fee` 固定 `null`。不能把订单累计费平均摊到各成交后声称是官方实际逐笔费用|

这些对象没有本站的订单 UUID、任务 UUID、owner、幂等键或本地预留。不能拿 `exchangeOrderId` 直接调用 `/orders/:id`；该详情要求本地 UUID。官方历史能含本系统之外的订单／成交，读取不会自动导入外部订单、持仓成本或完整现金结算。历史为空、官方暂查无记录或单页读取成功均不终结本站未知写入。

## 7. 本地订单、任务、成交、账本与诊断

### 7.1 订单与订单详情

列表 `data.items[]` 直接是安全订单对象。**详情不是同一位置的订单对象**：

|详情 JSON 路径|含义|
|---|---|
|`$.data.order`|与列表元素同类的安全订单|
|`$.data.trades`|该本地订单全部已确认、按执行 ID 去重的逐笔成交数组|
|`$.data.events`|该订单事件数组；`details` 经过脱敏|
|`$.data.source`|`LOCAL_LEDGER`|

|订单关键字段|含义／空值|
|---|---|
|`id/clientOrderId/exchangeOrderId`|分别为本地 UUID、提交给官方的原客户订单 ID、已取得的官方订单 ID；官方 ID 为 `null` 不能证明从未发送|
|`taskId`|批量任务关联；单笔订单为 `null`|
|`idempotencyKey/requestHash`|原请求幂等关联／内容摘要，不是凭据、可重置开关或官方执行证据|
|`orderType/side/price/quantity/notional/tradingSession/timeInForce`|LIMIT 有价格／请求股数；MARKET BUY 按本金，`price/quantity/tradingSession=null`；MARKET SELL 按股数，`price/notional/tradingSession=null`。MARKET 只 DAY；不能把 `null` 回填 0 后提交 LIMIT 字段|
|`filledQuantity/filledNotional/averagePrice`|本系统已确认成交累计量／USD 成交名义额／均价，均为字符串。未成交均价可能保留零，不能把它当可执行市场价；MARKET BUY 没有预先承诺股数|
|`fee/feeCurrency`|已确认累计实际订单费用；未知为 `null/null`，不是免费。`feeCurrency` 给出时固定 USD，不跟 `quoteCurrency` 推测|
|`feePending/feeFinalized`|已知累计费用与最终费用证据分开：已有 `fee` 不代表最终确认；新成交缺费仍可 `feePending=true`。零成交可信终态不必等待可能缺失费用|
|`tradeEvidencePending`|已明确受理后的官方累计与有界逐笔证据未对齐；不是未成交，也不是提交结果未知。此时费用／库存应表达未核实，不因本地尚未入账显示“不适用”|
|`reservedCash/reservedQuantity/reservationReleased`|原本地资金／股票预占及是否已按可信证据释放；订单终态不必然表示立即可用。不能在客户端因超时／取消按钮完成而清零|
|`sellInventoryBaseline/sellInventoryVerifiedAt`|SELL 发送前官方库存基线／终态成交后库存下降核实时间；缺失／未核实为 `null`，不能用本地持仓补齐|
|`submitStartedAt/submittedAt`|开始外部提交／取得已受理证据；不能将这两个阶段合并，前者存在而后者为空可能结果未知|
|`cancelStartedAt/waitDeadlineAt/reconciledAt`|撤单开始证据／已配置的等待截止／最近原单核对时间；空值分别可能为未开始、不适用或尚未核对，不是自动失败|
|`reason/status`|当前业务状态与受控说明，不能只解析自然语言判断终态或释放；状态及动作门禁见业务模型|

本地 `trades[]` 有本地 ID、owner、账户、任务／订单关联、`exchangeTradeId/symbol/side/price/quantity/fee/filledAt/createdAt/updatedAt`；当前结算写入不虚构逐笔费用，`fee` 可为 `null`。累计成交不能合成虚拟逐笔记录；详情 `trades=[]` 在 `tradeEvidencePending=true` 时不证明官方零成交。现状没有独立 `/trades` 本地分页 GET；全账户官方逐笔查询使用第 6 节，任务内／订单内已记账逐笔使用详情。

### 7.2 任务与任务详情

任务列表在**每个任务对象内**增加 `lastInterruption`；详情中则位于 `data` 的同级字段，而不是 `data.task.lastInterruption`。

|任务详情 JSON 路径|形状／语义|
|---|---|
|`$.data.task`|本地任务行，含当前状态、目标、规范化 `config`、时钟和预留|
|`$.data.lastInterruption`|最近尚未被开始／继续解除的历史受阻解释，或 `null`|
|`$.data.orders/trades/events`|任务全部本地订单／逐笔成交／脱敏任务事件数组；不是三个分页对象|
|`$.data.source`|`LOCAL_LEDGER`|
|`$.data.summary`|目标、已成交、剩余量和订单分类计数，见下文|

任务 `orderType/side` 决定唯一目标维度：MARKET BUY 的 `targetNotional` 有值、`targetQuantity=null`；LIMIT 和 MARKET SELL 的 `targetQuantity` 有值、`targetNotional=null`。`filledQuantity/filledNotional` 是真实已确认累计成交，手续费不计本金目标。`config` 是相应模式的规范化配置，不同模式字段互斥；编辑时不能把另一分支的字段机械补零。旧任务／订单保持 LIMIT，不按“字段存在”猜成 MARKET。

时钟字段分别为 `scheduledStartAt`（计划）、`startedAt`（实际开始）、`deadlineAt`（原窗口结束）、`endedAt`（终结）、`lastFilledAt`、`nextRunAt`；`null` 按尚未发生／未设定／不适用处理，不能按加载页面时间补齐。`leaseOwner/leaseUntil` 是后台调度租约，不是用户身份、下次运行承诺或客户端可释放锁。

`summary` 的含义必须与执行预算分开：

- `targetQuantity/filledQuantity/remainingQuantity` 与 `targetNotional/filledNotional/remainingNotional` 均给出；不适用的目标及剩余值为 `null`。
- 两个 `remaining` 是 `max(0,目标-已确认成交)`，**没有扣活动订单尚未成交量**。不能直接拿这个展示剩余值再次提交；实际调度会扣全部活动订单剩余量。
- `submittedOrders` 计 `submittedAt` 非空；`filledOrders` 计状态 FILLED；`canceledOrders/rejectedOrders` 计各自状态；`partialOrders` 是已成交大于零、但尚未达到该单股数／本金的订单数，**不限定当前状态为 PARTIALLY_FILLED**，因此可与撤销等计数重叠。它们不是互斥饼图分类，也没有单独 EXPIRED 计数字段。

读取诊断按以下优先级呈现：

1. 当前 `status + stopReason + reason` 是当前结论；例如 `RECONCILING + EVIDENCE_PENDING` 表示仅核对原单，证据闭环且原窗口仍有效时可自动继续，不是固定倒计时解锁。`RECOVERY_REQUIRED`、人工暂停、停止、到期及安全限制不能被这条说明覆盖。
2. `lastInterruption` 只补充历史受阻原因，包含 `eventId/status/reason/stopReason/occurredAt`，不参与执行授权、不改变原时钟。任务已经 EXPIRED／STOPPED 时可以保留此前未解除的暂停说明，但界面必须区分历史原因和当前终态。
3. `lastInterruption=null` 不表示“从未异常”：没有可匹配历史、已 START／RESUME／恢复运行解除、同时间矛盾事件、或两次读取间任务快照变化都可能不投影。不能自行按随机 UUID 排出同时间事件先后。
4. 订单层同时展示 `tradeEvidencePending/feePending/feeFinalized/reservationReleased/sellInventoryVerifiedAt`，不要仅凭任务目标进度判定资金／库存已解除。原操作是否完成另查回执，不能用任务快照替代。

现状没有额外“任务诊断 GET”或独立解释 DTO；上述任务详情、订单证据与事件就是公开读取面。客户端可按 [业务模型与动作](backend-model-and-actions.md) 组织说明，但不生成伪执行结论或后台原本不存在的统计。

### 7.3 账本与核对记录

账本行的 `type/amount/currency/balanceAfter/description/orderId/tradeId` 是关键证据；`orderId/tradeId/currency/balanceAfter` 均可能为 `null`。金额可正可负，按类型解释：

|`type`|金额与含义|
|---|---|
|`RESERVATION`|BUY 是本地资金预留（USDC，包含估算费用）；SELL 的股票数量在订单保存，不把它伪装现金，币种可为空|
|`RESERVATION_RELEASE`|原本地预留的反向释放，不是额外现金收入或官方可用资产|
|`TRADE_BUY/TRADE_SELL`|确认逐笔的 USD 成交名义流量，BUY 负、SELL 正；不是已核实的现金结算|
|`ORDER_FEE`|官方订单累计 USD 费用已确认增量，费用支出为负；不伪造逐笔分摊|

当前这些记录的 `balanceAfter` 保持 `null`，不能自行逐行累加后称为官方余额或完整资金净值。`ledger?status=ORDER_FEE` 是按流水类型筛选费用；`status=FILLED` 不会筛出全部成交订单流水。

核对记录 `data[]` 含 `id/ownerUserId/exchangeAccountId/status/details/createdAt`，没有统一 `updatedAt`。当前账户核对可能产生：`DIFFERENCE`（未解订单或发现非本系统挂单）、`UNAVAILABLE`（资金或历史读取不足）、`PARTIAL`（已查询部分完成，仍不宣称官方总持仓／完整结算）。`details` 为脱敏记录，可包含来源、钱包快照／错误、`unresolvedOrderIds/unmanagedExchangeOrderIds/exchangeTradeHistoryTotal/historyError` 和范围说明。`PARTIAL` 不是完整无差异对账；`officialPositions/cashBalance` 为空也不能补造。

## 8. 概览、管理用户与系统读取

### 8.1 普通 `/overview`

无查询参数。交易员统计本人业务；管理员调用时统计跨用户业务，但它**不是单账户切换型概览**：

|`data` 字段|固定取数范围|
|---|---|
|`account`|本角色范围内 ACTIVE 优先、再按创建时间最新选一账户；没有账户为 `null`。管理员的这一账户不能代表平台总资金|
|`recordSource/assetsAvailable/assetMessage`|记录源为 LOCAL_LEDGER；资产标志／原因取所选安全账户，或提示先绑定账户|
|`counts.runningTasks`|任务状态 RUNNING／SCHEDULED／RECONCILING 的数量|
|`counts.openOrders`|PLANNED／SUBMITTING／ACCEPTED／PARTIALLY_FILLED／CANCELING／UNKNOWN 的数量；不只计算已在交易所挂出的单|
|`counts.positions`|本地名义持仓 `quantity>0` 的行数，不是官方证券种类总数|
|`counts.recoveryRequired`|状态 RECOVERY_REQUIRED 的任务数，不含所有暂停或核对中任务|
|`today`|UTC 当日起点以来，本系统确认逐笔的买／卖股数及 `price*quantity` 名义额；`quoteCurrency="USD"`、`source="LOCAL_TRADE_NOTIONAL"`、`cashFlowVerified=false`。不含实际费用，不是 USDC 净现金流；正常空成交聚合给零|
|`recentOrders`|最近创建的 10 笔本地安全订单，创建时间倒序|
|`issues`|RECOVERY_REQUIRED／FAILED／STOPPING 的最近更新 20 项任务，含各自 `lastInterruption`；不是所有异常与 PAUSED 列表|
|`worker/environment`|见下文公共运行状态；不是账户当次交易预检|

### 8.2 管理员概览与用户

`/admin/overview.data` 含 `counts/worker/settings/recentEvents`：

- 用户计数：`traders/admins` 按角色统计，`activeUsers/disabledUsers` 按状态统计，不要求二者同时成立；`accounts` 是全部账户行数，不限活动账户。
- 任务计数：`runningTasks` 同普通概览；`recoveryRequired` 只 RECOVERY_REQUIRED；`totalTasks` 全部任务；`completedTasks/failedTasks/expiredTasks/stoppedTasks` 各按对应终态；`unfinishedTasks` 是不属于上述四个终态的任务，包含待启动、暂停和核对等状态。
- `openOrders` 使用上述六种活动状态；`unknownOrders` 是其中 UNKNOWN 子集，不是两份可以相加的总数。
- `settings` 为平台设置或 `null`，必须处理第 1.1 节的声明偏差。
- `recentEvents` 最多 5 条，筛系统事件 `level` 为 WARN／ERROR、类型 ORDER_UNKNOWN，或 `details.status/details.to` 为 RECOVERY_REQUIRED／FAILED，按 `createdAt DESC`；不是完整告警历史，也不保证每个任务问题都产生一条这样的系统事件。

`/admin/users.data.items[]` 仅含 `id/username/role/status/canManageAdmins/createdAt/updatedAt`，不返回密码哈希、会话令牌或密码。`canManageAdmins` 是管理员管理权限，不代表可以提交交易；交易员只能为 false。`/auth/me.data` 是 `{user,csrfToken}`，其中 `user` 为公开 `Actor`（`id/username/role/canManageAdmins`），没有用户列表的状态／创建时间等字段。当前没有 `/admin/users/:id` GET；用户详情可从授权列表条目取得，不能猜测一个不存在的详情接口。

### 8.3 `/admin/system`

`data` 固定含 `settings/heartbeats/events/environment/endpoints`：

- `settings` 与管理员概览同类，可为 `null`。`emergencyStop` 是平台安全停止；`maxOrderQuantity/maxTaskQuantity/maxOrderNotional` 是全局限制；`feeReserveRate/feeReserveMinimum` 是**估算预留政策，不是币安实际费率**；还有设置 ID、environment、更新者与时间。缺失设置不应用这些字段的建库默认值冒充现状。
- `heartbeats` 是全部服务心跳，按 `lastSeenAt DESC`，每条含 `id/instanceId/lastSeenAt/details`，`details` 脱敏；不只返回当前选中的 Worker，也没有分页。旧行保留不表示进程仍存活。
- `events` 为最新 10 条系统事件，按 `createdAt DESC`，含 `id`（数字）、可空 `ownerUserId`、`level/type/message/details/createdAt`；不同于 `/logs` 合并投影，后者没有 level 字段。
- `endpoints` 是**该 API 进程内存中**最近一次成功保存的端点测速结果：`results[]` 为 `endpoint/ok/latencyMs/error`，另有 `selected/measuredAt`；未保存时 `null`，进程重启会丢失。GET 不发起测速，不提供持久测速历史；每个节点失败时 `error` 有原因、成功时为空，`selected=null` 可表示没有可选节点。测速的 POST 与权限见 API 目录。

### 8.4 Worker、健康与元信息

普通／管理员概览中的 `worker` 与 `/healthz.data.worker` 都来自同一规则：仅选择 `worker:` 前缀且 `details.environment="production"` 的心跳；新鲜门限为 `max(10秒, workerIntervalMs*10)`；优先选新鲜 RUNNING，再新鲜 RECOVERING／DEGRADED，再其他最新行。`online=true` 包含新鲜 RECOVERING／DEGRADED，**不等于完全健康**；无行时 `online=false,lastSeenAt=null,status="UNKNOWN"`。

`/healthz` 免登录，成功／降级都有如下固定路径：`data.status/database.online/database.environmentValid/worker.online/worker.lastSeenAt/worker.status/environment/time`。仅数据库可用、正式环境标识有效、Worker 在线且状态 RUNNING 才返回 `200` 与 `status="ok"`，否则 `503` 与 `status="degraded"`。内部数据库错误不返回连接串／SQL。它不是资金／账户资格或真实交易验收探针。

`/meta` 免登录，返回 `environment/label/tradingReady/availability/buySupported/sellSupported/capabilities/blockers/apiVersion`。本基线固定正式环境，能力含报价、订单、成交、资产、买入和卖出；这里的 `tradingReady=true`、`availability="AVAILABLE"`、空 `blockers` 是实现能力声明，**不是实时服务、平台紧急停止、账户连接、资金或特定证券库存检查**。`apiVersion` 来自后端包版本，不是数据更新时间；不能只看 meta 放开提交。

## 9. 业务事件、审计、原操作与运维日志

### 9.1 HTTP 可读事件与审计

|读取面|记录形状与授权|
|---|---|
|订单／任务详情 `events[]`|对象专属事件，`id/orderId` 或 `taskId/ownerUserId/type/message/details/createdAt`，按时间正序；先授权对象|
|`/logs.data.items[]`|任务、订单、系统事件 UNION ALL 的业务时间线：`id`（统一为字符串）、`ownerUserId`（系统可空）、`resourceType`（TASK／ORDER／SYSTEM）、`resourceId`（系统固定空）、`type/message/details/createdAt`；交易员仅本人事件，不包含 owner 为空的全局系统事件；管理员跨用户|
|`/admin/audit.data.items[]`|管理员专用安全操作审计：`id/actorUserId/actorRole/action/targetType/targetId/result/details/createdAt`；操作者／对象可空，`ownerUserId` 筛的是操作者而非业务 owner|
|`/admin/system.events`、`/admin/overview.recentEvents`|系统事件的固定截取，含 level；不能代替上述分页时间线|
|`/events`|当前授权范围的资源失效通知 SSE，不传完整事件账本，也不提供历史回放|

`details` 是脱敏 JSON 记录，不是有固定全字段保证的业务 DTO；缺 key 与显式 `null` 都不能补出事实。当前 GET 对 `details` 再做脱敏；凭据／令牌不会因为管理员身份变得可读。不要用敏感文本被擦除后的值来推断未发生某操作。

管理员读业务、查询审计等行为本身留审计；`/admin/audit` 先写本次查询审计再读列表，因此本次读取可能看到它自己的记录，重复查询也会增加审计总量。分页总数不是不可变报表快照。

`/events` 初连通知全部公开资源，之后通知变化的 `resources`；公共资源名为 orders、tasks、accounts、ledger、events、settings、users、audit、worker。交易员通知范围由服务端限本人，管理员跨用户。通知只是要求重读相应 GET，不能当成交、回执终态、余额推送或原 ID 已完成证据；无 `Last-Event-ID` 历史补发保证。完整断流、认证失效、刷新策略见 [HTTP 与事件](http-and-events.md)。

### 9.2 原操作读取

`/operations/:id.data` 是公开 `OperationReceipt`，关键字段为 `id/actorUserId/kind/targetType/targetId/status/phase/outcome/result/error/createdAt/updatedAt/finishedAt`。`result/error/outcome/finishedAt` 可空；终态 `result` 是**原操作冻结结果**，未闭环阶段的 `result` 也可能只是原对象绑定等恢复证据上下文，不能直接当作成功结果。它不是每次重新读取的当前业务对象。`phase` 是恢复证据阶段，不能以其字符串或时间自行判定成功。

- 管理员可读；原操作者可读；交易员也可读取目标为 ORDER／TASK／ACCOUNT 且对象归自己所有的回执。目标 USER／PLATFORM 不因“与我相关”就自动给交易员读取权。
- `/operations` 先选择 PROCESSING／UNKNOWN／CONFLICT，再逐个授权并调用原回执读取；**不是完整历史，不带 total，也无排序保证**。读取过程中原回执可能收敛，因此返回数组中也可能已有 SUCCEEDED／REJECTED，不能在客户端断言所有项仍未闭环。
- GET 可能依据执行者锁与已存原证据收敛回执（例如确认 REGISTERED 阶段未应用），但不会因此重新提交订单／撤单；不是完全不触碰数据库的“纯快照”。可信终态如何解除保护见 [写入与恢复](write-and-recovery.md)。
- 原操作不存在及存在但无权读取均为 404 `OPERATION_NOT_FOUND`，但错误消息不同，不能据此保证存在性不可推断；具体消息及恢复边界见[写入与恢复](write-and-recovery.md#52-谁能读谁能继续)。404、列表漏项、当前对象看起来已变化、客户端清除本地记录、等待一段时间都不能当成原操作未执行或可换 ID 重发。

### 9.3 只有 CLI 的读取面

`/logs` 这个名字**不等于**服务器 JSONL 运行日志下载接口。完整运行日志（HTTP／SDK 传输错误、PID／实例、启动、事务耗时、Worker 周期等）通过服务器已有 `bun run logs` CLI 读取；可按 service/module/event/code/request-id/task-id/order-id/time 过滤。它没有对应 HTTP GET，外部客户端不得猜 `/logs?level=error` 能得到运行异常，也不得要求读服务器文件来完成一般业务页面。

同样，`bun run stocks:diagnose` 是独立资产证据 CLI，报告含有限历史、候选映射和读取完整性；不是 `/market/holdings` 的别名，不存在该报告的 HTTP 下载／诊断路由，不直接解除卖出门禁。运维工具具体用法分别见 [后端日志规范](../operations/backend-logging.md)、[Stocks 资产诊断](../operations/stocks-assets-diagnostic.md)。业务审计和成交证据不能由终端／日志文本替代。

## 10. 公开 Hono 字段索引

下面是**公开契约内的属性路径**，而不是另一份 DTO。前缀 `v1` 表示 `ApiClient["api"]["v1"]`；每行在对应 `$get` 上使用 Hono `InferResponseType` 可读取完整输出类型，输入使用 `InferRequestType`。实际仍须先处理 HTTP 错误、外壳与第 1.1 节运行空值。

```ts
import type { InferResponseType } from 'hono/client';
import type { ApiClient } from './contracts/client';

type OrderListResponse = InferResponseType<ApiClient['api']['v1']['orders']['$get']>;
```

导入位置以独立客户端复制／安装公开契约的位置为准；只导入公开文件，不导入 `backend/src`，不把声明中的 `contract.invalid` 当实际服务地址。

|读取对象／GET|公开 `$get` 属性路径／共享公开类型|
|---|---|
|账户数组／详情|`v1.accounts.$get`；`v1.accounts[":id"].$get`|
|当前身份|`v1.auth.me.$get`；`Actor`|
|普通概览|`v1.overview.$get`|
|订单列表／详情|`v1.orders.$get`；`v1.orders[":id"].$get`|
|任务列表／详情|`v1.tasks.$get`；`v1.tasks[":id"].$get`；`TaskInput/TaskInterruption/TaskStatus`|
|名义持仓／账本／核对记录／业务日志|`v1.positions.$get`；`v1.ledger.$get`；`v1.reconciliations.$get`；`v1.logs.$get`|
|官方订单／成交历史|`v1.accounts[":id"].exchange.orders.$get`；`...exchange.trades.$get`；`ExchangeHistoryQuery/ExchangeOrder/ExchangeTrade`|
|证券目录／候选／REST 报价|`v1.market.symbols.$get`；`v1.market.holdings.$get`；`v1.market.quotes.$get`；`SymbolPage/EquityRule/EquityHoldingsSnapshot/Quote`|
|报价 SSE／失效通知 SSE|`v1.market["quote-stream"].$get`；`v1.events.$get`；流数据使用 `QuoteStreamEvent/QuoteStreamSnapshot/EventRefresh`，不要按 `$get` 的空对象输出推导 JSON 业务体|
|原回执数组／详情|`v1.operations.$get`；`v1.operations[":id"].$get`；`OperationReceipt`|
|管理员概览／用户／账户|`v1.admin.overview.$get`；`v1.admin.users.$get`；`v1.admin.accounts.$get`|
|管理员任务／订单／账本／审计／系统|`v1.admin.tasks.$get`；`v1.admin.orders.$get`；`v1.admin.ledger.$get`；`v1.admin.audit.$get`；`v1.admin.system.$get`|
|元信息／健康|`v1.meta.$get`；根级 `ApiClient["healthz"]["$get"]`|

没有公开 GET 的能力不由客户端伪造：本地全局成交分页、任务独立诊断对象、任意排序／多值筛选、运行 JSONL HTTP 查询、完整官方资产估值／盈亏、证券 K 线／策略图表均不在当前读取契约中。现有页面可以使用上述真实信息完成业务功能，但不能将“自行估算结果”改名为官方字段。

## 11. 审计来源与非空推导差异定位

以下只用于追溯本资料编写依据，不是消费者实施前置：

|规则|当前源码／公开声明定位|
|---|---|
|公共字段校验与状态／行情／资产／回执类型|[`contracts/validation.ts`](../../backend/contracts/validation.ts)：332–342、343–459、488–710；完整路径输出见 [`contracts/client.d.ts`](../../backend/contracts/client.d.ts)|
|owner、精确筛选、日期／搜索与 Worker 状态|[`server/queries.ts`](../../backend/src/server/queries.ts)：42–100、160–204|
|业务列表、详情、概览、合并事件|[`server/business.ts`](../../backend/src/server/business.ts)：58–282、299–402、434–603|
|账户全量列表、路径账户与官方历史参数|[`server/accounts.ts`](../../backend/src/server/accounts.ts)：35–37、76–94、299–376|
|管理员统计、用户／账户／审计分页、系统固定截取|[`server/admin.ts`](../../backend/src/server/admin.ts)：53–166、374–410、508–565、625–633|
|账户资产投影／保留旧快照与错误|[`services/account-projection.ts`](../../backend/src/services/account-projection.ts)：9–53；[`trading/account-assets.ts`](../../backend/src/services/trading/account-assets.ts)：34–95、99–156|
|目录参数、窗口／搜索／分页／刷新|[`services/market-catalog.ts`](../../backend/src/services/market-catalog.ts)：19–37、113–118、339–455|
|候选身份、非零与空／错误语义|[`services/equity-holdings.ts`](../../backend/src/services/equity-holdings.ts)：23–49、99–147；[`api/equity-balance.ts`](../../backend/src/api/equity-balance.ts)：70–98、166–218|
|官方历史窗口、只读一页、字段来源|[`api/binance-stocks.ts`](../../backend/src/api/binance-stocks.ts)：39–74、329–359；[`api/normalize.ts`](../../backend/src/api/normalize.ts)：89–129|
|默认账户、账户核对范围与预检预算隔离|[`trading/engine.ts`](../../backend/src/services/trading/engine.ts)：157–181、1092–1156；[`trading/market.ts`](../../backend/src/services/trading/market.ts)：173–198、233–241、323–350|
|任务历史受阻投影|[`server/task-interruptions.ts`](../../backend/src/server/task-interruptions.ts)：6–90|
|原回执授权、读取收敛与非完整列表|[`services/operations.ts`](../../backend/src/services/operations.ts)：59–82、276–367|
|健康、匿名 meta、会话、业务错误与流|[`server/app.ts`](../../backend/src/server/app.ts)：73–120；[`server/context.ts`](../../backend/src/server/context.ts)：314–347、408–414；[`server/events.ts`](../../backend/src/server/events.ts)：54–268；[`server/quote-stream.ts`](../../backend/src/server/quote-stream.ts)：19–168|

已确认运行空值与静态声明定位，供集成校验逐路径断言：

|精确路径|运行依据|声明现状|
|---|---|---|
|`GET /overview → $.data.worker.lastSeenAt`|`queries.ts:190`，无正式 Worker 行则 `null`|`client.d.ts:2824–2828` 为 `string`|
|`GET /admin/overview → $.data.worker.lastSeenAt`|同上|`client.d.ts:1449–1453` 为 `string`|
|`GET /admin/overview → $.data.settings`|`admin.ts:137`，缺平台行则 `null`|`client.d.ts:1454–1466` 未含 `null`|
|`GET /admin/system → $.data.settings`|`admin.ts:558`，缺平台行则 `null`|`client.d.ts:1496–1508` 未含 `null`|
|`GET /overview → $.data.today.buyAmount/sellAmount/quoteCurrency`|`business.ts:263–269`，无聚合行的防御分支为 `null`；正常空成交聚合不是此分支|`client.d.ts:2664–2671` 为字符串|
|`GET /overview → $.data.account`|`business.ts:250`，本角色范围没有账户则 `null`|`client.d.ts:2601–2654` 已正确含 `null`|
|`GET /healthz → $.data.worker.lastSeenAt`|`app.ts:78,86–88`、`queries.ts:190`，数据库检查失败或无匹配 Worker 行可空|`client.d.ts:4142–4146` 已正确含 `null`|
|`GET /admin/system → $.data.endpoints`|`admin.ts:62,562,631`，API 进程尚无成功保存的测速结果则 `null`|`client.d.ts:1546–1555` 已正确含 `null`|

本轮只核对源码与公开契约并编写现状说明；没有运行服务、数据库、官方请求或实盘操作，不将此文当作 3.0.0 已部署或真实交易验收结果。
