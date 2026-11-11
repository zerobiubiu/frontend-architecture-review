# 全部公开接口目录

- 状态：现状参考；后端3.0.0，源码基线`596849a`。
- 范围：当前显式注册的52个方法／路径组合；不包含并不存在的应用页面、任意SQL或交易所直连入口。
- 阅读：先读[接入总览](README.md)，字段和边界分别见[业务与动作](backend-model-and-actions.md)、[查询与响应](query-and-response-contracts.md)、[HTTP与事件](http-and-events.md)、[写入与恢复](write-and-recovery.md)。

## 1. 路径、权限与原操作标识

表中路径是后端内部路径。客户端配置完整API访问基址；用户代理可在外部加路径前缀，但不得同时在基址和请求路径重复拼接`/api/v1`。`/healthz`不在`/api/v1`下。除公开健康、元数据和登录外，均须有效会话；登录本身仍须满足来源检查。

- **登录范围**：交易员只能读取本人授权账户及关联业务；管理员读取跨用户数据时受管理授权、目标存在性和审计约束。写明“本人”不表示只在客户端筛选，API执行所有权检查。
- **`F`**：公共`filterSchema`的参数集合；各资源真正使用的字段、忽略项、排序和分页必须按查询文档，不因类型中有`page`就渲染虚构的分页。
- **`O`**：订单提交的`Idempotency-Key`，必需、1–200位且不含控制字符；与订单原意图绑定，不等于通用操作回执ID。
- **`U`**：必需UUID `Idempotency-Key`，受持久原操作回执保护。相同ID只用于原主体、目标及参数；不得用新ID重试未知原操作。
- **`R`**：按路径中的原操作ID继续原核对，不生成新业务请求；不是再次执行原动作。
- **`—`**：没有该类原ID要求；不代表幂等、可自动重试或已经具备持久原终态查询。

所有POST／PATCH的来源、CSRF、请求体、限流与错误规则见HTTP文档。成功响应通常以`data`包裹；持久操作的`operation`和“已应用但后续读取失败”响应必须按恢复文档一起消费，不能只检查HTTP是否2xx。流式GET不是JSON响应。

## 2. 公开运行面与身份

|接口|访问范围|输入|原ID|成功主体／用途|
|---|---|---|---|---|
|`GET /healthz`|公开；CORS只对允许来源开放|无|—|`data.status/database/worker/environment/time`；健康200、降级503，不是交易授权|
|`GET /api/v1/meta`|公开；受API来源规则约束|无|—|`data.environment/label/apiVersion/capabilities/buySupported/sellSupported/tradingReady/availability/blockers`；版本来自后端包版本，能力不等于账户可交易|
|`GET /api/v1/overview`|登录范围|无查询参数|—|当前角色范围的业务汇总、账户、任务、订单、事件与Worker事实；无账户、无心跳须按查询文档处理|
|`POST /api/v1/auth/login`|未认证调用；可信来源|JSON：`username/password`|—|`data.user/csrfToken`并设置HttpOnly会话Cookie；不把Cookie令牌交给脚本持久化|
|`GET /api/v1/auth/me`|有效会话|无|—|`data.user/csrfToken`；以此恢复当前权威身份，不从旧缓存推断会话|
|`POST /api/v1/auth/logout`|有效会话|无业务JSON|—|`data.loggedOut=true`并清除Cookie、撤销当前会话；不停止Worker或取消已受理业务|
|`POST /api/v1/auth/password`|有效会话|JSON：`currentPassword/newPassword`|—|`data.changed=true/reauthenticate=true`，撤销旧会话；没有原请求持久终态查询|

`user`的公开身份字段为`id/username/role/canManageAdmins`。账号状态、创建时间等用户管理字段来自管理查询，不从身份对象捏造。创建管理员、管理其他管理员以及最后有效管理者保护见业务与动作资料。

## 3. 账户、官方历史与市场

|接口|访问范围|输入|原ID|成功主体／用途|
|---|---|---|---|---|
|`GET /api/v1/accounts`|登录范围|查询`F`；实际支持及全量数组特征见查询文档|—|脱敏账户列表；凭据存在、连接与资金准备度分开|
|`POST /api/v1/accounts`|交易员本人|JSON：`label/apiKey/apiSecret`|—|201，`data`为脱敏账户；初始交易关闭且连接未验证，不是新建官方账户|
|`GET /api/v1/accounts/:id`|交易员本人／有权管理员|路径账户UUID|—|`data`为指定脱敏账户，包含来源与时间，不返回Key／Secret明文|
|`PATCH /api/v1/accounts/:id`|交易员本人|路径UUID；JSON为实际变动的`label/apiKey/apiSecret/status/tradingEnabled`|—|更新后脱敏账户；更换凭据、启用交易和活动账户限制各自校验|
|`POST /api/v1/accounts/:id/check`|交易员本人|路径UUID；无业务JSON|U|`ACCOUNT_CHECK`原回执与冻结账户结果；执行官方只读连接检查，不声明实盘资格|
|`POST /api/v1/accounts/:id/assets/sync`|交易员本人／有权管理员|路径UUID；无业务JSON|U|`ACCOUNT_SYNC`原回执、账户与同步结果；同步错误可能已经持久化|
|`POST /api/v1/accounts/:id/reconcile`|交易员本人／有权管理员|路径UUID；无业务JSON|U|`ACCOUNT_RECONCILE`；冻结原订单／任务范围并核对，不新建订单或手动重发撤单|
|`GET /api/v1/accounts/:id/exchange/orders`|交易员本人／有权管理员|路径UUID；查询`symbol/from/to/page/pageSize`|—|官方订单历史，来源／上游分页与本地订单列表不同|
|`GET /api/v1/accounts/:id/exchange/trades`|交易员本人／有权管理员|路径UUID；查询`symbol/from/to/page/pageSize`|—|官方成交历史，不补造本地成本、费用或币种|
|`GET /api/v1/market/symbols`|指定账户的有权读者|查询`accountId`必需，`search/page/pageSize/refresh`可选|—|`data.items/total/page/pageSize/source/fetchedAt/expiresAt`；官方证券目录及规则，不是手工白名单|
|`GET /api/v1/market/holdings`|指定账户的有权读者|查询`accountId`必需|—|`data`为本次官方Funding股票候选快照；不等于本地名义持仓或完整资产认证|
|`GET /api/v1/market/quotes`|登录范围；传账户时校验其所有权|查询`symbol`必需、`accountId`可选|—|单次报价；USD价格、报价时间及可用性不替代下单预检|
|`GET /api/v1/market/quote-stream`|指定账户的有权读者|查询`accountId/symbol`均必需|—|鉴权SSE，默认`message`帧中的`quote/status`载荷；不是RPC推导的空JSON对象|

账户保存应使用差量PATCH：只改名就只发送`label`，不能从旧快照顺带回写开关和状态；更换凭据不得把被保护的未完成业务抹掉。市场目录、候选库存和报价属于读取证据；实际交易仍需当前规则、资金／库存、费用、权限及订单检查。

## 4. 订单、任务与本地账本

|接口|访问范围|输入|原ID|成功主体／用途|
|---|---|---|---|---|
|`POST /api/v1/orders/preflight`|交易员本人|JSON：三类订单输入之一|—|`data`为预检结果；没有提交交易订单，但会读取官方证据；不能代替真实提交时复核|
|`POST /api/v1/orders`|交易员本人|JSON：LIMIT／MARKET BUY／MARKET SELL输入之一|O|201，`data`为本地脱敏订单；受理不等于成交，超时只核对原标识|
|`GET /api/v1/orders`|登录范围|查询`F`|—|本地订单分页；含类型、请求量／本金、真实成交和核对状态|
|`GET /api/v1/orders/:id`|订单有权读者|路径本地订单UUID|—|`data.order/trades/events/source`；订单字段在`data.order`下，不在`data`根部|
|`POST /api/v1/orders/:id/cancel`|交易员本人|路径本地订单UUID；无业务JSON|U|`ORDER_CANCEL`原回执；记录取消开始并推进原单，终态未知不释放占用|
|`POST /api/v1/orders/:id/reconcile`|订单有权读者|路径本地订单UUID；无业务JSON|—|`data`为原订单核对后的投影；不新发原交易或撤单，没有新增通用回执|
|`GET /api/v1/tasks`|登录范围|查询`F`|—|任务分页及最新仍相关的受阻／核对说明|
|`POST /api/v1/tasks`|交易员本人|JSON：完整任务输入，按LIMIT／MARKET SELL／MARKET BUY分支|—|201，`data`为持久草稿；保存不等于启动，不承诺资金或成交|
|`GET /api/v1/tasks/:id`|任务有权读者|路径任务UUID|—|任务、配置、订单、成交、执行事件及诊断；字段见查询文档|
|`PATCH /api/v1/tasks/:id`|交易员本人|路径UUID；JSON为完整任务配置，不是任意差量PATCH|—|更新后的任务；状态、已启动身份、目标、窗口和精确时间限制见动作矩阵|
|`POST /api/v1/tasks/:id/control`|交易员本人；管理员仅允许`pause/stop/reconcile`|路径UUID；JSON：`action=start/pause/resume/stop/reconcile`|U|`TASK_CONTROL`原回执；动作有状态前置条件，且可能推进已授权自动撤单策略|
|`GET /api/v1/positions`|登录范围|查询`F`|—|本地名义持仓和成本；不是官方当次可卖股数|
|`GET /api/v1/ledger`|登录范围|查询`F`|—|本地账本分页；`status`在此映射流水类型，不是订单状态|
|`GET /api/v1/reconciliations`|登录范围|查询`F`；实际字段及数组特征见查询文档|—|核对记录，不是原操作回执查询或交易终态证明|
|`GET /api/v1/logs`|登录范围|查询`F`|—|任务／订单／系统业务事件的统一分页；不是服务器JSONL文件检索接口|

订单提交使用`accountId/symbol`及模式对应字段：LIMIT为`side/price/quantity/tradingSession/timeInForce`；MARKET BUY为`side=BUY/notional`；MARKET SELL为`side=SELL/quantity`。市价禁止价格和时段，只有DAY。任务公共字段、各分支默认／互斥、随机区间、尾量、自动撤单和精确时间的完整规则在业务资料中，不按字段名字猜默认行为。

## 5. 持久原操作与实时通知

|接口|访问范围|输入|原ID|成功主体／用途|
|---|---|---|---|---|
|`GET /api/v1/operations`|当前身份有权读取的未解决回执范围|无查询参数|—|`data`原回执数组；恢复保护不代表已执行交易所查询|
|`GET /api/v1/operations/:id`|原回执有权读者；不把其他操作者回执当自己发起|路径原操作UUID|R|`data`原回执；可依据持久证据推进回执本身，不重放业务动作|
|`POST /api/v1/operations/:id/reconcile`|原回执有权读者；继续未解决的ACCOUNT_RECONCILE仅限原操作者|路径原操作UUID；无业务JSON|R|按kind继续允许的原核对，返回原回执；不是用新Key重试原动作，也不自动替换原意图|
|`GET /api/v1/events`|有效会话，按角色隔离资源变化|无查询参数|—|业务SSE；首次和重连全资源提示，后续按变化范围通知；无事件补播保证|

原回执可见性、冲突对象、`SUCCEEDED/REJECTED/UNKNOWN/CONFLICT/PROCESSING`、结果冻结和终态判定完整见恢复资料。任务／订单业务状态与原回执状态是不同枚举，不能相互替代。

## 6. 管理员面

以下所有接口都要求管理员。`canManageAdmins`只控制相应管理员管理操作，不赋予交易员身份或买卖权限；交易员不能通过传`ownerUserId`进入管理面。

|接口|访问范围|输入|原ID|成功主体／用途|
|---|---|---|---|---|
|`GET /api/v1/admin/overview`|管理员|无查询参数|—|跨用户业务计数、Worker、平台设置与事件；运行时空值边界见查询资料|
|`GET /api/v1/admin/users`|管理员|查询`F`|—|公开用户分页；支持字段及`status`含义见查询资料|
|`POST /api/v1/admin/users`|管理员；创建ADMIN另需`canManageAdmins`|JSON：`username/password/role/canManageAdmins`|—|201，`data`为公开用户；不是可任意重放的持久原操作|
|`PATCH /api/v1/admin/users/:id`|有权管理员；有最后管理者保护|路径UUID；JSON：`status/canManageAdmins`实际变动项|U|`USER_UPDATE`原回执；不能改角色、用户名或用户密码|
|`GET /api/v1/admin/accounts`|管理员|查询`F`|—|管理账户列表与所有者信息，始终脱敏|
|`PATCH /api/v1/admin/accounts/:id`|管理员|路径UUID；JSON：`adminTradingBlocked`必需，`adminBlockReason`可选／可空|U|`ACCOUNT_RESTRICT`原回执；不替代交易员的账户凭据或通用交易开关|
|`GET /api/v1/admin/tasks`|管理员|查询`F`|—|与本地任务查询共享语义，按授权跨用户读取|
|`GET /api/v1/admin/orders`|管理员|查询`F`|—|与本地订单查询共享语义，按授权跨用户读取|
|`GET /api/v1/admin/ledger`|管理员|查询`F`|—|与本地账本查询共享语义，不补造外部资金|
|`GET /api/v1/admin/audit`|管理员|查询`F`|—|操作审计分页；不同于业务事件及服务器运行日志|
|`GET /api/v1/admin/system`|管理员|无查询参数|—|平台设置、心跳和事件等系统事实；空值／测速进程缓存边界见查询资料|
|`PATCH /api/v1/admin/system`|管理员|JSON：`emergencyStop/maxOrderQuantity/maxTaskQuantity/maxOrderNotional/feeReserveRate/feeReserveMinimum`实际变动项|U|`PLATFORM_UPDATE`原回执；急停与限额／费用政策同属平台冲突范围，解除不自动恢复任务|
|`POST /api/v1/admin/endpoints/benchmark`|管理员|查询`accountId`可选；无业务JSON|—|官方正式候选节点只读测速结果；每管理员1次／60秒，结果不证明账户资金或交易资格|

## 7. 类型定位与完整性边界

公开Hono入口是`ApiClient`，路径成员示例：

```ts
import type { InferRequestType, InferResponseType } from 'hono/client';
import type { ApiClient } from './contracts/client';

type NewOrder = InferRequestType<ApiClient['api']['v1']['orders']['$post']>['json'];
type OrderDetail = InferResponseType<ApiClient['api']['v1']['orders'][':id']['$get']>;
type AccountDetail = InferResponseType<ApiClient['api']['v1']['accounts'][':id']['$get']>;
```

类型只负责公开成员、字段和请求响应的静态结构。手工读取的请求头、普通中间件错误、SSE传输帧及少数查询推导非空与运行时可空的差异，分别以HTTP与查询正文中的明确规则处理；不能用类型断言跳过运行时信封和身份核验。

本目录按方法＋完整路径去重：

|方法|显式接口数|
|---|---|
|GET|31|
|POST|16|
|PATCH|5|
|合计|52|

公开声明中同一市场读取可能出现重复类型片段，不是额外接口。HEAD／OPTIONS是框架与CORS行为，不另计为产品功能；不存在DELETE、任意文件读取、K线、持仓划转、自动风险声明或前端静态托管接口。

审计来源：[路由装配](../../backend/src/server/app.ts)、[认证](../../backend/src/server/auth.ts)、[账户](../../backend/src/server/accounts.ts)、[管理](../../backend/src/server/admin.ts)、[业务](../../backend/src/server/business.ts)、[市场](../../backend/src/server/market.ts)、[原操作](../../backend/src/server/operations.ts)、[业务事件](../../backend/src/server/events.ts)、[行情事件](../../backend/src/server/quote-stream.ts)、[公开声明](../../backend/contracts/client.d.ts)。这些链接用于追溯；实现客户端所需语义已在本目录给出，不要求重新推导路由代码。
