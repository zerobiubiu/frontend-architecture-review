# 0071 第三阶段：只读业务页面与本地契约生成迁移

- 状态：已执行；本地 Mock／协议桩验收通过，真实后端未联调，等待独立审查。
- 范围：契约包装工具、前端只读业务、对应回归与文档；没有交易或管理写业务。
- 前置：[0066 底座](0066-frontend-bootstrap.md)、[0067 修复](0067-frontend-bootstrap-review-fixes.md)、[0068 审查](0068-frontend-bootstrap-independent-review-round2.md)、[0069 最终准入](0069-frontend-r2-01-identity-fix/0002-fix-and-targeted-verification.md)、[0070 第二阶段](0070-frontend-stage2-app-shell-rpc-session/0002-implementation-and-verification.md)。这些历史记录均未改写。
- 输入与分阶段证据：[0071 归档索引](0071-frontend-readonly-business-features/README.md)。

## 1. 结论与边界

**第三阶段本地只读实现完成，可交付独立审查。** 完整单元／集成 588 项、Chromium 65 项通过；浏览器最终轮为 `--retries=0`，没有跳过或以重试后通过代替通过。类型、Biome、契约、主题、覆盖率及生产构建通过。

这不是生产／实盘认证：没有启动或联调真实后端、Worker、数据库、官方 SDK 或资金账户。R2-02、R2-03、R2-04 和历史时间编辑透传继续登记，未因只读页面通过而关闭。第四阶段、完整 Operation Recovery 和交易写操作均未开始。

实施中发现的新权限拒绝复活、UUID 大小写、嵌套 main、表格双层滚动裁切、NodeNext 类型入口及懒加载权限包装问题均已处理并复验；本轮已观察范围内没有尚未处理的新增 P0／P1。实施期源码核验不冒充下一轮正式独立审查。

## 2. Git 与验收基线

| 项目 | 实际记录 |
|---|---|
| 分支 | `astryx-dev`，未切分支 |
| 开工 HEAD | `0427627f3637b4363a51b5c1a79de65791237783`，不能冒充包含全部第一／第二阶段工作区实现 |
| 开工工作区 | 27 个已跟踪修改、29 组未跟踪项；暂存区为空，原始规模记录见 3-A 验收 |
| 第一／第二阶段保存 | `86174ee3624a0f9e93a761540fe7a10275ea1d2d`，保存已验收身份修复与会话应用基线 |
| 3-A 提交 | `c725768555421133573cd8e6d4b563bc1764c585`，契约迁入后端及异地重建 |
| 3-B 提交 | `cc2fe89de53c19d9c9ed23a1c9d622522c2a4079`，会话作用域只读基础设施 |
| 拒绝锁定提交 | `d5674a6676bd8c26ce6345960d29966f1bfba35f`，阻止失败核对复活旧数据 |
| 写总报告前 HEAD | 上述 `d5674a6…`；剩余只读 Feature／回归／本报告当时属于已验证工作区，不以该 HEAD 冒充全部第三阶段版本 |
| 最终版本识别 | 包含本报告及其源码的后续本地提交为本阶段完整交付；SHA 以实际 Git 提交结果为准，不在自身正文伪造自身哈希 |

用户随后明确要求“及时提交项目修改到 Git”，覆盖早期附件的“不提交”；本轮依已验收逻辑本地提交，**没有推送授权，也没有推送**。未执行 checkout、reset、clean、stash、rebase 或改写历史。原有修改先保存再继续，没有覆盖或丢弃。

## 3. 契约生成体系迁移

### 3.1 结构与命令

| 项目 | 迁移结果 |
|---|---|
| 旧位置 | 根 `api-contracts/` 已移除，不保留脚本别名或独立项目 |
| 同步脚本 | 原 `api-contracts/scripts/sync.ts` 逻辑迁至 `backend/scripts/contracts-sync.ts`，继续使用公开导入白名单和逐字节核对 |
| 源契约 | `backend/contracts/client.d.ts`、`validation.ts` 保持受版本控制且原文不变 |
| 原生成器 | `backend/scripts/contract-entry.ts` 与 AppType 导出保持原实现；未为本轮执行后端运行入口 |
| 本地包 | 自动生成 `backend/api-contracts/{package.json,index.d.ts,client.d.ts,validation.ts}`，不作为独立应用维护 |
| 准备 | `bun run --cwd backend contracts:prepare` |
| 后端只读检查 | `bun run --cwd backend contracts:check` |
| 前端消费检查 | `bun run contracts:check` 实际调用 `../backend/scripts/contracts-sync.ts --check --consumer` |
| 前端依赖 | `@project/api-contracts: file:../backend/api-contracts`；Hono 精确 4.13.13 |
| 忽略规则 | `backend/.gitignore` 的 `/api-contracts/` 命中生成包；生成目录不纳入 Git，也不参与后端 Biome 格式化 |
| 锁文件 | 仅迁移本地包解析目标；没有批量更新其它依赖或引入根 Workspace |

prepare 通过脚本自身 URL 定位 backend，不以 process.cwd 作为唯一依据；只包装现有公开快照，不运行 HTTP、Worker、数据库或 SDK。真正后端 API 改动仍由获准的后端工作更新公开快照；既有源实现一致性检查保留为 `contracts:source:check`，没有混为新只读包检查。

### 3.2 实测而非路径推断

[3-A 独立记录](0071-frontend-readonly-business-features/0002-contract-migration-verification.md)已记录：根、backend、frontend 三个 cwd 都落到同一生成目录；生成目录缺失时 check 非零，prepare 可从零创建；陈旧入口与安装副本均被拒绝；成功及失败 check 的内容／mtime 均未改变；`git check-ignore -v backend/api-contracts/package.json` 命中 backend 第 5 行，目录没有新增 Git 项。

业务夹具进入 NodeNext 编译后，又发现扩展名缺失使根类型推导落入 never。生成入口已改为 `./client.js`；不改公开声明原文、不扩大 tsconfig 路径映射、不关闭严格检查。[0006 接续记录](0071-frontend-readonly-business-features/0006-nodenext-contract-entry-verification.md)包含定位与复验。前端继续只 `import type { ApiClient }`；没有把展开后的客户端当 AppType 传入 hc。

契约入口修正后的完整业务快照另在仓库外新目录复验：无 node_modules、无生成包、没有复制 backend 运行源码，仅复制 backend 清单、生成脚本和两份公开快照；执行 prepare → frozen 安装 → 消费副本检查 → 完整类型 → build，均退出 0，安装 294 个锁定包。该快照先于最终权限 HOF 预加载修复；预加载修复另由当前工作区的完整门禁验证。临时目录随后清理。此处证明契约重建不依赖原仓库绝对路径或已安装副本，不把异地快照冒充最终逐字节源码版本。

Bun 1.4.4 普通 frozen 安装已成功刷新本次本地入口。文件依赖可能共享 inode，陈旧副本要按开发说明显式重装再检查，不能手改副本或忽略检查失败。

### 3.3 正式工作流

```bash
cd backend
bun install
bun run contracts:prepare
cd ../frontend
bun install
bun run contracts:check
bun run typecheck
```

后端快照更新后重做 prepare、前端安装与消费检查。日常 backend 可只执行 `bun run contracts:check`；前端同名命令同时检查实际消费副本。生成物不发布 npm、不进入 Git。

## 4. Feature 与统一边界

复用唯一 `rpc.request`／原生传输、Session Manager、QueryClient、BusinessSseManager 和 QueryConvergence。Feature 没有直接 fetch、独立 hc、CSRF、epoch 或回执分类副本。

- 静态请求／响应从 ApiClient 与 Hono 推导；公开 schema 复用，展示所需字段用运行时投影验证。泛型 data as T 不当运行时验证。
- 各模块 query-keys.ts 唯一定义 key，沿用 `['session', epoch, userId, accountId, resource, ...参数]`。全角色视图 accountId=null；UUID 详情无独立可信账户前不凭 URL 猜账户。
- URL 只有已应用筛选／分页；草稿仅是输入状态。应用筛选／页长回第一页，账户切换不使用上一账户 placeholderData；加载中或迟到结果不污染新范围。
- GET 只传实际有效参数。没有排序字段的接口不渲染虚假排序按钮，不对金融字符串做字典序排序。数组不伪造分页。
- QuerySurface 区分未选范围、首次加载、空结果、普通失败保留陈旧值、访问拒绝以及最后成功缓存时钟。缓存时钟不是上游更新时间，通知连接不是同步或交易许可。
- 访问拒绝锁定随精确 Query 实例保留；503、网络失败或重新挂载不解除，只有成功读取且运行时解析成功才解除。WeakMap 不持久化、不保存响应全文，缓存回收后释放。
- 显式核对内仍遵从既有只读失败最多两次重试；不能把一次逻辑读取误写成只能一次物理 GET。拒绝未解除时，窗口／SSE 不自动恢复读取。交易写不自动重试的原边界不变。

### 4.1 实现模块与测试

表中路径相对于 frontend/src/features。所有只读页使用现有 AppShell；共 21 个业务路由（含工作台）。未机械创建不用的文件。

| Feature／页面 | RPC API 入口 | Query key 工厂 | 运行时 Schema／来源 | 权限、资源与分页 | 对应集成测试 |
|---|---|---|---|---|---|
| dashboard/page.tsx 工作台 | readOverview + 共享 readAccountsList，最多两组查询，不加聚合接口 | dashboardKeys.overview、accountQueryKeys.list | dashboard/schemas.ts、账户投影 | workspace；accounts + orders/tasks/ledger/worker；概览固定角色范围，不受其它页账户筛选伪装 | dashboard-readonly.test.tsx |
| accounts 列表／detail-page.tsx | readAccountsList、readAccountDetail | accountQueryKeys.list/detail | accounts/schemas.ts，含钱包历史与当前认可投影 | TRADER 本人／ADMIN；accounts；普通数组、管理员真实 P | accounts-readonly.test.tsx |
| securities 目录／已加载规则 | readSecurities | securitiesKeys.catalog | securities/schemas.ts 与公开规则 | workspace，必选账户；accounts；真实目录 P，无虚构详情 GET | market-readonly.test.tsx |
| market 买一／卖一与连接 | readQuotes；公开 quote-stream | marketKeys.quotes | market/schemas.ts；quoteStreamEventSchema | workspace，显式账户／证券；REST 依赖 accounts，独立 quote/status 流；无分页 | market-readonly.test.tsx、market-quotes.test.ts |
| orders 列表／详情 | readOrders、readOrder | orderKeys.list/detail | orders/schemas.ts | workspace；列表 orders，详情加 ledger/events；真实 P／嵌套详情不伪分页 | orders-tasks-readonly.test.tsx |
| tasks 列表／详情 | readTasks、readTask | taskKeys.list/detail | tasks/schemas.ts，配置历史原串 | workspace；tasks + events，详情加 orders/ledger；真实 P | orders-tasks-readonly.test.tsx |
| positions 两源／已加载详情 | readPositions、readOfficialHoldings | positionKeys.local/holdings | positions/schemas.ts、公开 equityHoldingsSchema | workspace；名义 ledger + orders/accounts，官方 accounts + orders/ledger；名义 P／官方数组 | positions-trades-readonly.test.tsx |
| trades 官方历史／已加载详情 | readOfficialTrades | tradeKeys.official | trades/schemas.ts，专用显式固定 UTC 窗口 | workspace，账户权限以后端为准；accounts + orders/ledger；真实 P | positions-trades-readonly.test.tsx |
| ledger 流水／已加载详情 | readLedger | ledgerKeys.list | ledger/schemas.ts | workspace；ledger + accounts/orders；真实 P，无 ledger/:id | ledger-reconcile-operations-readonly.test.tsx |
| reconciliations 核对／差异 | readReconciliations | reconciliationKeys.list | reconciliations/schemas.ts，公开证据投影 | workspace；accounts；完整数组，无假分页 | ledger-reconcile-operations-readonly.test.tsx |
| operations 未解决回执／UUID 查询／业务事件 | readUnresolvedOperations、readOperation、readBusinessEvents | operationKeys.unresolved/detail/businessEvents | operations/schemas.ts，receipt 三态且剔除 raw | workspace；回执 events + accounts/orders/tasks/users/settings，事件 events + orders/tasks/accounts；回执数组、事件 P | ledger-reconcile-operations-readonly.test.tsx |
| administration 概览／用户及详情／管理账户／审计／系统健康 | readAdminOverview/Users/Audit/System/Health；复用账户适配 | administrationKeys.overview/users/audit/system/health | administration/schemas.ts；健康保留 503 data | 仅 ADMIN，不把 canManageAdmins 当普通管理读前提；users/audit/settings/worker 等有限登记；用户／审计／管理账户真实 P | administration-readonly.test.tsx |

所有模块同时由 tests/e2e/readonly.spec.ts 实测。管理员概览的有限附加依赖是 accounts/tasks/orders/settings/events/worker；系统依赖 settings + worker/events，健康依赖 worker；不是无差别 invalidate 全业务。

## 5. 全部真实 GET 覆盖

静态分母为 31 个 GET：29 JSON + 2 SSE，按真实路径而非声明交叉片段重复计数。当前消费者使用 26 条；未用 5 条有明确原因。除 /healthz 外，下表路径省略 /api/v1。

| API | Feature | 使用情况 | 运行时校验 | 测试／证据 |
|---|---|---|---|---|
| /healthz | administration | 使用；200/503 信息均可消费 | 健康投影 + 明确 HTTP 状态，非业务 success | administration 集成、管理员系统 E2E |
| /meta | 无新增消费者 | 未用；系统页面已有 environment，不重复取静态信息 | 未消费 | 源契约核对，不冒充已调用 |
| /auth/me | 既有 auth／Session | 使用，唯一会话拥有者 | 既有公开认证 schema | auth、session、stage2 E2E |
| /accounts | accounts／dashboard | 使用，TRADER 数组，不发送假页码 | 账户数组投影 | accounts 集成、E2E |
| /accounts/:id | accounts | 使用，真实详情 | 账户投影 + UUID 同身份核对 | 大小写正例／真实错配反例、E2E |
| /accounts/:id/exchange/orders | 无专页 | 未用；本阶段订单以本地 order/detail 为主，不假冒导入官方订单 | 未消费 | 源能力记录 |
| /accounts/:id/exchange/trades | trades | 使用；固定显式 UTC 窗口 | 官方历史投影 | 集成、真实分页 E2E |
| /overview | dashboard | 使用；角色范围固定，不发送假账户筛选 | 概览投影 | 集成、工作台 E2E |
| /market/symbols | securities | 使用；搜索／分页／已加载规则 | 目录及公开规则 | 集成、E2E |
| /market/holdings | positions | 使用；官方 Funding 候选，不是完整估值 | 公开候选 schema | 集成、E2E |
| /market/quotes | market | 使用；单证券数组 REST | Quote 投影 | 集成、SSE 竞争 E2E |
| /market/quote-stream | market | 使用；独立原生 EventSource | 公开 quote/status schema | 单元、集成、原生流 E2E |
| /orders | orders | 使用；实际筛选、固定服务端排序 | 订单 P | 集成、E2E |
| /orders/:id | orders | 使用；order/trades/events | 订单详情及来源 | 集成、E2E |
| /tasks | tasks | 使用；真实进度／历史受阻分开 | 任务 P | 集成、E2E |
| /tasks/:id | tasks | 使用；配置／summary／orders/trades/events | 任务详情 | 九位计划与市场任务 E2E |
| /positions | positions | 使用；LOCAL_LEDGER 名义持仓 | 名义持仓 P | 集成、账户隔离 E2E |
| /ledger | ledger | 使用；type 与关联 symbol 真实语义 | 流水 P | 集成、E2E |
| /reconciliations | reconciliations | 使用；数组，保留不完整性 | 核对公开证据 | 集成、三类状态 E2E |
| /logs | operations | 使用；TASK/ORDER/SYSTEM 业务事件，不是 JSONL 文件 | 事件 P | 集成、E2E |
| /operations | operations | 使用；仅授权未解决扫描，不承诺完整历史 | 三态回执数组 | 集成、E2E |
| /operations/:id | operations | 使用；data 中服务端报告，不构造 expected | 三态回执 + URL 身份核对 | 缺失／畸形／错配及终态展示回归 |
| /admin/overview | administration | 使用 | 管理概览投影，允许实际 nullable | 集成、admin/owner E2E |
| /admin/users | administration | 使用；列表及 ownerUserId 精确定位已公开用户 | 用户 P | 集成、专项能力／可空字段 E2E |
| /admin/accounts | accounts／administration | 使用；管理员真实分页 | 账户 P | 集成、E2E |
| /admin/tasks | 无独立消费者 | 未用别名；ADMIN 复用普通 tasks 授权读 | 未消费别名 | 复用路径有测试，不冒充别名已调用 |
| /admin/orders | 无独立消费者 | 未用别名；ADMIN 复用普通 orders 授权读 | 未消费别名 | 同上 |
| /admin/ledger | 无独立消费者 | 未用别名；ADMIN 复用普通 ledger 授权读 | 未消费别名 | 同上 |
| /admin/audit | administration | 使用；actor/result/target 与筛选不混淆 | 审计 P | 集成、E2E |
| /admin/system | administration | 使用；settings／heartbeats／events／environment／测速缓存 | 系统投影 | 集成、E2E |
| /events | 既有 BusinessSseManager | 使用，不另建业务 SSE Manager | 既有 refresh/error 解析与九资源白名单 | 单元、集成、原生 SSE E2E |

没有独立证券详情、全局本地成交分页／成交详情、ledger/:id、users/:id GET；证券／流水／官方成交展开已加载记录，用户详情通过实际用户列表精确筛选。没有按 target 查询完整操作历史的接口，不伪造。

## 6. 金融数据与时间真实性

| 数据 | 展示与限制 |
|---|---|
| 金额／股数 | 保留 API 十进制字符串，展示不回写；拒绝正在消费字段中的金融 number；没有前端聚合、乘除或利润推算 |
| 账户余额 | cashBalance 仍 null／未知；认可资金仅 Funding USDC free。连接正常不证明资金充足，本地 reservedCash 不重新计算成可执行资金 |
| 历史钱包 | 当前 UNAVAILABLE 与已保存历史快照分开；Spot USDC 不冒充买入 Funding，历史 free 不覆盖当前同步错误 |
| 名义持仓 | LOCAL_LEDGER 本地重放，不冒充官方完整持仓；localAvailableQuantity 不冒充官方可卖量 |
| 官方候选 | Funding free/locked/freeze/withdrawing 各自保留，真实字符串零和 null 区分；缺行不补任意证券零持仓；sourceUpdatedAt=null 不用接收时钟替代 |
| 订单／成交 | FILLED 不等于费用、库存、资金闭环；股数／本金目标分支分开；逐笔 fee=null 不自行分摊；官方大 ID 保留字符串，不当本地 UUID |
| 账本 | USD 名义成交、USDC 预留／释放、已确认费用增量分开；balanceAfter=null 不补零，不把流水累计为官方余额 |
| 核对 | DIFFERENCE／UNAVAILABLE／PARTIAL 分开，SUCCEEDED 回执不等于账户全量一致；没有原 historyTo 时不以 createdAt 冒充截止时间 |
| 操作 | 服务端 SUCCEEDED/REJECTED 只是报告；缺独立完整 OriginalOperationIdentity 时原意图仍 unknown。没有从回执反构 expected，也不启动恢复／核对／重放 |
| 原始 UTC | 原串权威；任务计划读取 config.scheduledStartAt，历史九位小数不被 ORM 毫秒列替代。不可安全转换时显示原文与限制 |
| 查询窗口 | 官方成交固定明确 from/to 原串，跨页不漂移；公共日期筛选 createdAt，不冒充成交／计划／更新时间 |
| 展示时钟 | Intl 明确 UTC／IANA；Date/epoch 毫秒只用于允许的展示与辅助时钟，不承诺微秒精确相等，也不重新序列化权威时间 |

R2-02 的输入接受范围、聚合规模和计算闭包仍需在真实金额聚合／乘除前确认；50 位 Context 不是无限精度。R2-03、R2-04 和历史时间编辑透传不在本轮重做，只读降级展示不等于这些编辑问题被修复。

## 7. 实时收敛与离线边界

- 沿用已有九资源 accounts/orders/tasks/ledger/events/users/audit/settings/worker。没有凭空添加 market、positions、trades 或 operations 资源名。
- 活动查询按登记范围失效；在途通知记录 dirty/version，原读取不因 refresh 被取消重启，完成后有限尾随补读。非活动缓存只 stale，不额外读取。
- 会话推进 epoch 后旧请求／消息不能进入新身份；账户／筛选换 key 不展示旧占位。对象访问拒绝持续封存旧显示，SSE 不能自行解除。
- 业务 SSE 每标签至多一条；原生自动重连关闭后按既有预算退避，恢复／聚焦不突破暂停。连接状态、最后成功缓存时间与数据来源分开。
- 报价使用另一个已确认公开协议及单一 MarketQuoteStore，不是第二套 BusinessSseManager；每标签只选择一个账户／证券，回调校验 epoch/generation/订阅。与业务连接共用连接预算策略。
- WS 在 REST 请求期间更新后，晚到 REST 不能覆盖它。EOF/unavailable 后旧价仅历史参考；live 状态本身不能刷新报价时钟，15 秒只是客户端展示参考，不是交易 TTL。
- SSE 不是可靠事件日志，不直接把订单、任务或未解决操作改成终态。外部账户活动未必有完整业务 SSE 通知，仍保留明确 REST 读取。
- 既有敏感写 fail-fast、发送前完整身份、receipt 三态、attempt/intent 分离以及发送后超时／断网／取消按未知结果处理均保留。新 Feature 没有交易 Mutation、离线排队或重放机制。

## 8. 本轮发现并修复的问题与测试可信度

| 问题 | 修复与实际证据 |
|---|---|
| 权限拒绝后失败核对复活旧缓存 | 精确 Query 拒绝锁定；旧实现新增行为用例红（自动多读），修复后单元及原生浏览器成功→403→503→卸载→通知→显式成功通过。见 0005 |
| UUID 大小写误拒绝同一账户 | 账户详情、名义持仓和官方候选按有效 UUID 大小写无关比较；新大写请求／小写数据库标识用例先红后绿，真实不同 ID 仍拒绝 |
| 只读页嵌套 main／重复 SkipLink | AppShell 唯一主地标，ReadPage 改命名 section；实际认证壳回归从 2 个 main 红到 1 个绿，不保留仅复制 props 的测试 |
| 表格双层 overflow 裁切 | Astryx Table 自带容器留白和可聚焦滚动；移除外包 overflow，使用原生滚动、48rem 最小表宽，列菜单 end 对齐；真实表头排序、列隐藏、320/390px 键盘横滚通过 |
| Chrome 可见锚定菜单被自动 scrollIntoView 滚走 | 轨迹显示菜单已可见后整页跳转并关闭，人工原生点击可用。测试校验可见、完整视口及 elementFromPoint 命中后发送真实 mouse 事件，不 force、不改 DOM、不延长 timeout、不跳过；两个菜单共用同一小 helper |
| 权限 HOF 丢失 Router preload | 原先 65 绿仍有 React conditional-use 控制台错误；新增非 HTTP console.error/pageerror 门禁后冷启动红。withAccess 使用 RouteComponent 并动态保留 preload，遵从加载后清空，冷启动及最终完整浏览器门禁绿；没有升级库或建立第二套懒加载 |
| NodeNext 根入口未解析 | 生成入口改 client.js，夹具 ESM 导入规范，公开源原文不改，完整类型及异地构建通过；见 0006 |
| 协议桩／旧测试假设 | REST 闸门不再堵住独立报价流；流水换页不强求内部选择状态文案；初始 SSE 可有一次有限收敛，不把总 GET 数写死成物理两次；管理旧占位菜单断言迁为实际只读权限行为 |

没有以“全部 unknown”规避终态能力，没有把已拒绝 attempt 当原意图未执行。原 api-errors/api-client/身份类型正负例继续编译和通过。新增测试覆盖真实状态转换、权限／账户隔离、分页／筛选、未知金额、来源、精度和在途收敛，不只比较辅助函数输出或源码字面量。

## 9. 实际执行验证记录

环境：Windows x64 10.0.26300，实际 Bun 1.4.4，本机 Chrome channel、Chromium 158。应用清单仍是原 Bun 版本约定，未升级已有项目依赖。测试仅 MSW／Mock Fetch／显式无交易本地协议桩；5173 及已有后端进程未被复用或终止。Vite 无 backend proxy；测试 dev 独占 5273、协议 18770、生产预览 4173，默认拒绝复用已有服务器。

| 实际命令／检查 | 退出码 | 本轮最终结果 |
|---|---|---|
| `bun run --cwd backend contracts:prepare` | 0 | 生成四文件本地包，未运行后端入口；三 cwd 和从零见 0002，最新异地也通过 |
| `bun install --cwd frontend --frozen-lockfile` | 0 | 本地契约刷新成功；异地无依赖目录安装 294 包成功 |
| `bun run typecheck` | 0 | 全部 TS 项目，含 ApiClient 请求／响应、金融字符串和完整身份负例；不执行非法类型调用 |
| `bun run lint` | 0 | Biome 检查 221 文件，无修复或放宽规则 |
| `bun run contracts:check` | 0 | 公开源、生成包、实际安装副本、Hono／导出路径一致 |
| `bun run theme:check` | 0 | 生成产物与主题源一致，未手改生成 CSS |
| `bun run test:run` | 0 | 32 文件、588 项通过 |
| `bun run test:coverage` | 0 | 同 588 项通过；S 94%、B 86.90%、F 92.97%、L 95.47% |
| `bun run build` | 0 | Vite 8.3.7，9841 模块；主 JS 688.22 kB/gzip 210.74 kB；CSS 303.58 kB/gzip 47.44 kB |
| `PLAYWRIGHT_PORT=5273 bunx --no-install playwright test --retries=0` | 0 | 完整 65 项，2.5 分钟，1 worker，零重试；原 35 项＋新增 30 项，全部通过 |
| 仓库外业务快照重建 | 0 | 契约入口修正后的快照 prepare、frozen、消费检查、完整类型和 build 通过；最终 HOF 改动由当前目录全回归证明；未复制 backend 运行源码，临时目录已清理 |
| `bunx --no-install biome check --config-path ../backend/biome.json ../backend/scripts/contracts-sync.ts` | 0 | 以已有前端 CLI 检查 backend 配置；CLI 2.6.6 对配置 schema 2.6.2 有版本信息，未安装／升级后端工具 |
| Git 边界 | 0 | 相对已保存基线，backend 只有 .gitignore、biome.json、package.json、scripts/contracts-sync.ts；业务源码／源契约及 0066～0070 无差异 |
| 文档本地链接探针 | 0 | 7 份本轮报告／索引／现状文档，137 个本地链接均可解析；没有创建仓库内探针脚本 |

**失败记录没有抹除：** 本轮曾有 UUID 与拒绝锁定红测、完整类型的入口错误、旧测试选择器／请求计数假设，以及 Chrome 菜单自动滚动超时。原先一轮 65 绿仍有 React 控制台错误，后来新增门禁使其明确失败并修复。最终表格取末轮实际结果，不把初轮的重试后通过、局部通过或历史结果当最终绿。

覆盖率未配置数字阈值，仪表盘页面的 Vitest 覆盖也不均匀，不能用 95.47% 推断全路径正确；真实浏览器行为另有上述门禁。构建的 >500 kB chunk 警告保留，没有提高阈值消音。Sourcemap 仍输出供内部排错；对外部署必须禁公开 .map 或单独保管，本轮未实施生产部署。

### 9.1 证据等级与未执行项

- 源码／类型：实际当前公开契约、前后端路由事实、类型正负例与运行时 schema。
- Mock：MSW、Mock Fetch、受控 Promise／时钟及协议桩测试数据，均明确标记。
- 真实浏览器：本机 Chrome 原生 Cookie、CORS、EventSource、HTTP、焦点、计算颜色、窄屏滚动；不是虚构 fetch 回执。
- 真实后端：**未执行／未联调**，没有 DB／Worker／SDK／资金账户证据，不冒充已通过。
- 最终必要前端门禁：无失败、无跳过、无未执行；中间故障轮按上文记录。完整操作恢复、交易／管理写及官方订单历史专页为范围外，不伪称测试跳过后已实现。

### 9.2 已归档浏览器图片

均来自最终 65 项无重试运行，含明确 Mock 标识。只归档必要 PNG，不提交含会话 Cookie 的 trace 或运行目录。

| 图片 | 验证重点 |
|---|---|
| [工作台](0071-frontend-readonly-business-features/evidence/readonly-dashboard.png) | 身份、真实角色范围、资金来源与不可用指标 |
| [订单浅色](0071-frontend-readonly-business-features/evidence/readonly-orders-light.png) | 真实只读列表与筛选 |
| [订单深色](0071-frontend-readonly-business-features/evidence/readonly-orders-dark.png) | 计算样式与可读数据层级 |
| [320px 订单](0071-frontend-readonly-business-features/evidence/readonly-orders-mobile-320.png) | 导航与原生表格横向键盘可达 |
| [报价终止状态](0071-frontend-readonly-business-features/evidence/readonly-quote-terminal.png) | 终止后不伪装实时 |
| [在途尾随补读](0071-frontend-readonly-business-features/evidence/readonly-sse-revision-tail.png) | 旧快照完成后读取修订结果 |
| [普通管理员系统](0071-frontend-readonly-business-features/evidence/readonly-system-admin.png) | 普通管理读、Worker／设置／降级健康与无写入口 |

## 10. 完整变更范围

- backend 工具范围：.gitignore、biome.json、package.json 脚本、scripts/contracts-sync.ts；旧根包删除迁移。src、数据库 Schema／迁移、交易规则、Worker、SDK、contracts 原文和 contract-entry.ts 未修改。
- frontend 契约配置：package.json/bun.lock 的 file 路径、消费检查命令；Node 共享夹具；没有新 Workspace 或包分发系统。
- frontend 公共只读层：app/business-sync/query-convergence.ts、use-resource-query.ts，lib/read-only，components/read-only，DataTableShell；均在现有边界内扩展。
- frontend 接线：app/router/index.tsx、runtime.ts，ApplicationShell，auth/return-to.ts/login-page.tsx；移除旧 routes/home-page.tsx，全部当前只读路由切到 Feature，无兼容残留。
- frontend 实际模块：accounts、administration、dashboard、ledger、market、operations、orders、positions、reconciliations、securities、tasks、trades。services/realtime 增加独立公开报价状态与共享连接策略，既有业务 manager 只做必要复用。
- 测试：七个只读集成文件、market-quotes 单元、既有授权／Query／表格／类型回归、本地 readonly 协议与纯数据夹具、readonly E2E、既有 playground/stage2 E2E 接续。生产不导入 MSW／协议数据。
- 文档：本报告、0071 任务／事实／分阶段验收、必要截图、docs 索引、现行前端 README/DEVELOPMENT 及本地开发工作流。没有覆盖 0066～0070 或用户输入档案。

## 11. 保留事项与停止点

1. R2-02：Decimal 接受范围、聚合精度／规模及规范化闭包仍未关闭，真实计算接入前必须定界；本阶段只读不做这些计算。
2. R2-03、R2-04、历史时间编辑透传仍未关闭；只读原文／不可转换提示不是编辑链路修复。
3. 真实隔离后端联调未执行。发布前还须确认环境身份、Cookie／CSRF、断网／迟到响应与真实 SSE 限额；不得连接真实资金做冒烟。
4. 只读接口缺口及五个未用 GET 已明确列出；不提供虚构详情／全量历史／资产估值／官方盈亏。
5. Chunk、覆盖率门槛、Sourcemap 部署策略仍按实际限制保留，不宣称优化／部署完成。
6. 没有新增未处理的本轮已知 P0/P1；Jev 在完整事实上的准入判断为 ready_for_independent_review，不是 production_ready。

**停止在第三阶段。** 完成本地提交后等待独立审查；不自动推送、部署、进入第四阶段或实现任何交易、任务控制、账户限制、用户或风控写操作。
