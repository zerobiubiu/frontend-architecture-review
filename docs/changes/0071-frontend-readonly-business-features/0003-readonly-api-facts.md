# 第三阶段只读接口事实

- 状态：参考；用于 Feature 实施与最终覆盖表，不表示这些页面已全部完成
- 来源：实际 server/accounts、market、business、admin、operations、events、quote-stream、queries 及其 services/validation/database；公开 ApiClient 叶子交叉核对
- 静态分母：31 个真实 GET，29 JSON + 2 SSE；别名按路径计数，不按重复声明片段增加

## 输入与权限

公共 F：可选 symbol/status/ownerUserId/accountId/from/to/search，page 默认1，pageSize默认25且最多100。实际有效字段因接口不同；没有通用 sort/side/orderType/taskId/role/level、多选或重复键数组语义。日期过滤为各资源 createdAt 的包含边界，不冒充成交/计划/更新时间。公共 symbol/status/search 不自动 trim/大写。

专用 symbolSchema 会 trim/大写并拒控制符；目录 search 会 trim。官方历史 H 仅 symbol/from/to/page/pageSize，默认 to=now、from=to前7天，七天不是最大跨度；可分享分页应固定显式时间窗口。

普通业务读：TRADER 本人，ADMIN 可跨所有者；admin.* 仅ADMIN。普通ADMIN可读管理员用户，canManageAdmins 是专项管理写能力而非读取列表的额外条件；本阶段无管理写入口。对象404或操作列表漏项不能解除原 unknown。

## 全部 GET

以下除 /healthz 外省略 /api/v1。F 的字段并非全部生效。

| API | 实际结果/分页 | 事实与计划消费面 |
|---|---|---|
| /healthz | data健康对象，200/503 | 公开；503数据需保留，不当success；系统/连接信息 |
| /meta | 实现能力/版本 | 公开静态能力，不是实时账户许可 |
| /auth/me | user+csrfToken | 既有Session唯一拥有者，不另建业务身份查询 |
| /accounts | 安全账户全量数组 | owner/account/status/创建时间/search有效；page被忽略 |
| /accounts/:id | 安全账户详情 | owner或ADMIN，余额/来源/连接均从同一投影取得 |
| /accounts/:id/exchange/orders | 官方历史P | H；非本地订单UUID，不导入外部订单 |
| /accounts/:id/exchange/trades | 官方成交P | H；逐笔fee为null，不分摊订单费 |
| /overview | 固定角色范围概览 | 无账户/日期筛选；默认一个账户、真实本地统计/问题项 |
| /market/symbols | 目录P+source/fetchedAt/expiresAt | accountId必填，search/page/pageSize/refresh；规则在item内，无独立detail |
| /market/holdings | 官方Funding候选数组快照 | accountId必填；无分页；并非全账户估值或任意缺行零股数 |
| /market/quotes | 单个Quote的数组 | symbol必填，accountId可选；前端明确账户；接收时间非交易所时间 |
| /market/quote-stream | quote/status SSE | accountId+symbol；与业务refresh解析不同 |
| /orders | 本地P+LOCAL_LEDGER | F中owner/account/symbol/status/from/to/search有效；创建时间倒序 |
| /orders/:id | order/trades/events/source | 详情内嵌，无子分页，不把FILLED等同费用/库存闭环 |
| /tasks | 本地P+lastInterruption | F有效字段同任务模型；创建时间倒序 |
| /tasks/:id | task/summary/orders/trades/events/lastInterruption | 配置预约原文才是计划权威值，summary非可新增委托预算 |
| /positions | 本地名义P | owner/account/symbol/from/to有效；status/search忽略；代码升序 |
| /ledger | 本地P | status映射type，symbol经关联订单；不是官方现金结算 |
| /reconciliations | 全量记录数组 | owner/account/status/创建时间有效；分页参数被忽略 |
| /logs | TASK/ORDER/SYSTEM合并P | status为事件type，不是level；不是JSONL文件日志 |
| /operations | 授权未解决扫描数组 | 无query、分页或完整历史保证；读可按持久证据收敛 |
| /operations/:id | 服务端OperationReceipt | data内回执；不能反构expected原身份；不是recovery写操作 |
| /admin/overview | 平台统计/worker/settings/recentEvents | ADMIN；settings和worker.lastSeenAt实际可null |
| /admin/users | 安全用户P | ownerUserId实际映射users.id；search搜用户名/角色 |
| /admin/accounts | 安全账户P | ADMIN真实分页，与普通/accounts数组不同 |
| /admin/tasks | queryTasks别名 | 可由普通/tasks在ADMIN作用域复用；最终表记录是否未使用 |
| /admin/orders | queryOrders别名 | 同上，不重复造业务能力 |
| /admin/ledger | queryLedger别名 | 同上，不重复造业务能力 |
| /admin/audit | 审计P | owner为actorUserId，accountId映射targetId，status为result |
| /admin/system | settings/heartbeats/events/environment/endpoints | 最近进程测速缓存，不主动测速；settings/endpoints可null |
| /events | 业务refresh/error SSE | 现有BusinessSseManager，九资源、无可靠补播 |

P表示真实 `{items,total,page,pageSize}`；其它数组不能包装成虚构分页。当前查询均只有后端固定排序，无用户可指定服务端排序字段。

## 金融、时间与真实性

- SafeAccount cashBalance恒为null；availableCash只认Funding USDC free，walletSyncError时来源不可用。reservedCash是本地预留，不重新减成“可执行资金”。Spot USDC不当买入Funding。连接正常不证明资金/库存充足。
- overview today是UTC当日本系统成交名义额，cashFlowVerified=false；不是利润、费用或完整USDC现金流。overview不接受账户筛选，不能把其全局计数改标题冒充所选账户。
- 本地positions source=LOCAL_LEDGER；available/exchangeQuantity/markPrice/unrealizedPnl等不可用，不把localAvailableQuantity当官方可卖。realizedPnl存储字段不证明全账户实际利润。
- 官方holdings只提供候选及free/locked/freeze/withdrawing；sourceUpdatedAt=null，时间为本地请求/接收。缺行/空数组不证明任意证券零持仓，冻结等不相加为可卖。
- 订单feePending/feeFinalized/tradeEvidencePending/reservationReleased/sellInventoryVerifiedAt独立。MARKET BUY以本金而非股数目标；MARKET无价格/时段，DAY；官方ID不可当本地UUID。
- 任务原计划取 `task.config.scheduledStartAt`，顶层Date DTO仅毫秒。历史九位小数必须原串展示；R2-02/03/04不在本阶段宣称关闭。
- 核对当前服务端只产生 DIFFERENCE/UNAVAILABLE/PARTIAL，不产生全量一致。操作SUCCEEDED也可能核对PARTIAL；记录details不保存原historyTo，不能用createdAt补造截止时钟。
- ledger RESERVATION/RELEASE为本地占用，TRADE_*为USD名义流量，ORDER_FEE为已确认费用增量；balanceAfter=null，不累计为权威余额。
- DTO静态声明与实际nullable有缺口：overview worker.lastSeenAt、admin settings、部分today防御性分支需运行时允许null，不能填假默认。

## SSE 事实与依赖

业务仅有 accounts/orders/tasks/ledger/events/users/audit/settings/worker。派生视图按实际查询加入有限次级依赖：概览依赖accounts/orders/tasks/ledger/worker；名义持仓/成交视图依赖ledger/orders；核对/操作可依赖accounts/orders/tasks/events。没有 market/positions/trades/reconciliations/operations 资源名。

行情流默认message：quote 包含 accountId/symbol/value{quote,receivedAt,eventTimestamp,sourceTimestamp,transport}；status含connecting/waiting/live/snapshot/reconnecting/unavailable、可选code/retryable。使用公开 quoteStreamEventSchema，不用业务refresh parser。retryable=false必须终止；EOF/断流不把旧价格标live；REST timestampSource=LOCAL_RECEIPT。后端约5秒REST fallback不是报价有效期保证。

业务+行情共享每用户每进程6条活跃流；各自建流30/min。不能在每个单元格建流，不能叠加原生与自建重连。外部账户活动无业务SSE完整通知保证，人工/有限补读仍必要。

## 真实缺口，不造接口

无独立证券详情GET；目录搜索为包含匹配且分页，页一未出现不证明证券不存在。无全局本地成交分页/详情GET；本地成交在订单/任务详情，官方成交用账户历史。无ledger/:id、用户/:id读取；流水展开已加载行，用户详情用真实用户列表ownerUserId精确过滤。无按target查完整回执历史；服务端新发现receipt只显示报告状态，缺独立原身份时intent仍unknown。

GET目录可写服务端缓存，管理员读取和报价/历史会记审计，operation GET可收敛记录。它们仍是本阶段可使用的查询接口；**前端不发起业务写不等于数据库绝无写入**。本轮均用明确Mock测试，不据此宣称真实后端联调。
