# 前端技术架构与后端实现兼容性审查报告

- 状态：已完成的只读审查；所有修复/选型建议均未实施。
- 审查基线：backend/package.json版本3.0.0，dev分支HEAD 6fa779e；输入资料日期2026-11-09。本轮取证跨2026-11-09/10。
- 交付范围：仅本文件frontend-architecture-feasibility-review.md；不修改业务代码、契约、数据库、迁移、Worker、安全机制或提案，不创建前端、不安装依赖、不提交/推送。
- 工作区保护：开始时dev较origin/dev领先9提交，只有现有提案未跟踪；报告文件原先不存在。未覆盖或删除该提案。
- 输入核验：完整读取工作区提供的docs/integration/project-and-backend-overview.md（342行）及量化交易平台前端技术架构与实现可行性分析.md（1415行）。用户指定的字面文件名“@量化交易平台前端技术架构与实现可行性分析.md”实际不存在；经本轮询问，用户明确同意使用不带@的现有文件。本报告没有创建、重命名或替代提案。

## 第一章：总体审查结论

### 1.1 结论先行

**整体有条件可行，但不能按原提案原样冻结、不能立即开放真实交易写入。** 当前后端已经提供交易执行与管理前端的大部分必要能力；React/TypeScript/Vite、REST+SSE、Query、RHF/Zod、精确十进制方案适配。主要风险不在框架品牌，而在三套状态混淆、未知操作恢复、契约不完整、资产真实性、异步缓存/会话竞态和 UI 输入精度。

可以进入**不连接真实资金的协议适配/交互原型阶段**；必须先冻结错误/回执/恢复/金融数值规范，完成本报告P0门禁，再进入认证和交易全链路联调。API/Worker实际3.0.0部署、正式资金交易及Safari实机并未在本轮验收，不以类型检查代替。

独立技术建议是：**React19+TypeScript+Vite；生产主UI优先MUI而非直接冻结Astryx；保留TanStack Router/Query/Table、RHF/Zod、Fetch、EventSource、decimal.js和Intl；暂缓Zustand、国际化运行库和Sentry启用；为IANA编辑增加精确时间适配。** 这不是默认沿用旧项目UI，也不是认定Astryx做不了；其0.7.11已有实质组件/表格能力，Beta及高精度适配仍需项目原型。完整选择理由见第三、九、十一章。

### 1.2 五项最高优先级回答

|重点|结论|必须采取的边界|
|---|---|---|
|P0-1 SSE/Query一致性|业务流是PG摘要轮询后的资源提示；无补播，存在合并/漏提示边界，回执不在资源联合|Query只作读取缓存；身份代次、资源依赖映射、尾随重读、定期REST收敛；业务流慢写撤权需后端加固|
|P0-2 未知下单跨刷新|订单自身幂等与operations不同；能按UUID详情或列表search精确核对原key，通用精确lookup尚缺|发送前持久保留原ID；下单与控制分两条恢复链；永不换ID重发未知订单/撤单|
|P0-3 契约完整性|52路由均有声明入口，但错误/details/null/流/请求头/回执result不完整|补明确公共投影和错误联合；Fetch可保留，hc/OpenAPI都不自动修复这些缺口|
|P0-4 金融真实性|已有字段可保守区分当前未知/历史快照/已确认零，但ready不是交易许可、PnL默认零不是已计算|分来源/币种/时间及统计范围，拆生命周期与费用/库存闭环，金融输入字符串，计划时间保留config原串|
|P0-5 会话/权限|Cookie/CSRF/角色隔离已实现；失效旧会话401有固定名删Cookie路径；管理员不是交易员|后端处理迟到删除，前端清缓存/流并隔离代次；治理存在性错误与失效原操作者恢复权限|

### 1.3 事实等级与验收边界

- **已验证事实**：明确当前源码/公开契约或本轮实际命令证据；“源码存在分支”不等于生产已触发。
- **技术推断**：从上述路径推导的风险或设计建议，使用该标记；不冒称已经复现。
- **待验证事项**：缺少浏览器原型、PG集成、容量、代理或实盘证据，并给出后续验证方法。
- **外部技术判断**：依据本轮读取的官方文档/已发布包；不等于与本项目组合运行已通过。

默认第二、四、五、六、七、八章的“实际/定义/实现”为源码事实；“应/建议/风险/可能”为技术推断；第三、九、十一章的技术取舍为独立设计判断。第十三章明确列出本轮执行和未执行项。P0清单混合“真实后端风险”和“前端实现必须遵守的门禁”，**不将全部P0宣传成已复现后端漏洞**。

### 1.4 输入文档与源码的差异/补充

|输入位置|源码核对结果|处理|
|---|---|---|
|提案:486-492“查询原订单及回执”|POST /orders无通用回执，/operations不含ORDER_CREATE|拆订单寻回与回执寻回，见6.7|
|提案:672-680“查看原始参数”|公开回执无原请求JSON，DB只存指纹，不可逆恢复参数|当前只能展示目标/阶段/结果；若必须展示历史参数需新增脱敏摘要协议|
|概览:322/提案:418-423“先REST快照”|后端rules后REST和WS并发，第一条quote可能WS，晚REST会丢弃|不要依赖严格REST-first，也不要制造双缓存竞争|
|概览:254、:340静态契约缺SSE|client.d.ts确实不描述流消息；但validation.ts已有refresh与quote/status schema|不是从零新增全部SSE类型，只补业务错误等联合|
|提案:326/989所有写请求CSRF|登录无CSRF token要求，仍校验Origin；GET回执/审计可能内部写DB|按HTTP方法与登录例外实现，不混淆内部副作用|
|提案:567-588任务状态|13枚举中VALIDATING/READY/FAILED当前无业务写入|支持识别但不强行设计必经流程|
|提案:592-602完整PATCH|正确，但省略带默认字段会重置；SCHEDULED须先暂停；startedAt决定冻结|完整有效分支+原config，不是TaskRow或dirty-fields|
|提案:934-948六位时间|精度限制在服务层；顶层时间可能Date截断，config原串才是编辑基线|保存未改原串；不以Date往返|
|概览:336-340已知边界|预算缺口需精确措辞：已有本金目标/守恒，无含费总支出硬预算/整任务融资保证；历史导出字节异常本轮未重跑|不说“没有市价预算”，也不说导出问题已修复|
|提案:912-918 Position示意|原文已注明示意，实际API是本地名义仓，估值/PnL多为空，realizedPnl为未计算默认值|不是文档bug，但禁止照示意字段实现真实收益展示|


## 第二章：后端实际架构分析

### 2.1 实际目录和职责

用户列举的backend/server、backend/api等实际都位于backend/src下；Worker目录是单数worker。

|真实路径|源码证明的职责/边界|
|---|---|
|backend/src/server/app.ts|createApp组合认证、CORS、64KiB请求限制、Origin/CSRF、路由及统一错误；不是静态站点服务器。:28-75、:105-165|
|backend/src/server/{auth,accounts,business,admin,market,operations}.ts|HTTP用例入口与查询投影；业务handler调用交易服务或直接组织简单授权查询，不要求每个查询都额外套Service|
|backend/src/server/{events,quote-stream}.ts|分别轮询业务资源摘要、转发报价relay；不是同一业务消息流|
|backend/src/services/trading/engine.ts|createTradingEngine组织准备、发送、原单核对、任务推进、账户核对与恢复；:209-728、:934-1143、:1214-1274|
|backend/src/services/trading/{context,reservations,settlement,tasks,market,sell-inventory,account-assets,streams}.ts|真实事务/锁、意图预留、逐笔结算、任务配置与边界、资金库存当次预检、SELL闭环、资产证据和私有流生命周期|
|backend/src/services/operations.ts|原操作执行锁、对象互斥、冻结回执、查询收敛及恢复；:44-258、:319-591|
|backend/src/services/{market-catalog,market-quote-relay,equity-holdings,account-projection}.ts|账户/凭据绑定的证券缓存、行情中转、官方候选持仓读取、账户公开脱敏投影|
|backend/src/domain/orders|identity/observation/status/settlement/nominal-position定义订单身份、纯证据核验及成本重放；不调用SDK/SQL|
|backend/src/domain/tasks|execution.ts决定目标占用、批次、间隔、原窗口和状态边界；scheduled-start.ts精确比较UTC原串|
|backend/src/domain/{funding,securities,shared}|费用预留、证券准入、库存证据及decimal精度；不是可以搬到浏览器替代服务端门禁的规则包|
|backend/src/api|Stocks/Wallet SDK适配、归一化、传输/错误/限流、节点、公开/私有流；签名和官方凭据留在服务端|
|backend/src/database|Drizzle schema、Bun SQL池、迁移资源校验和正式库标识；不是前端共享模块|
|backend/src/worker/{index,task-scheduler}.ts|独立进程启动恢复、循环tick、25ms不重叠调度通道、独立心跳及关闭|
|backend/src/{security,config,validation,utils}|密码/令牌/加密；环境配置；公开输入契约；脱敏日志/诊断|
|backend/contracts|生成的client.d.ts、validation.ts，不是独立前端工程或可直接运行的客户端|
|backend/migrations|16项历史SQL，0000至0015_market_orders；本轮仅阅读，未执行迁移|
|backend/tests|HTTP/安全/SDK纯测试与trading领域测试；*.integration.test.ts及databaseTestsEnabled分支需临时PG|
|backend/scripts|启动、setup/迁移、构建、契约导出、隔离DB测试、日志与诊断入口；不能把dev当模拟交易环境|

依赖版本以backend/package.json:1-45为准：Bun运行，Hono4.13.13、Drizzle0.45.4、Zod4.6.7、decimal.js10.6.0、Stocks1.0.6、Wallet22.2.7；TypeScript7.0.2。PostgreSQL18.6是项目运行基线，本轮未连接数据库重新核验服务器版本。

### 2.2 HTTP→事务→官方SDK→结算

[已验证事实：源码] 单笔请求不是“handler直接转发官方下单”。POST /orders先按owner/key找原意图；没有时在取证后持锁复查幂等并保存PLANNED和预留；dispatch再次取证、持久化SUBMITTING/submitStartedAt，再发送。后续按原clientOrderId读取完整官方证据，以唯一executionId入账。相关位置：backend/src/services/trading/engine.ts:325-483、:952-989；backend/src/services/trading/reservations.ts:30-174；backend/src/services/trading/settlement.ts:264-649。

transaction()真实调用session.transaction，进入原操作事务上下文，业务结果与回执由recordOperationTransactionResult处理；账户、订单、任务分别SELECT FOR UPDATE，owner还使用pg_advisory_xact_lock。不是内存锁或空仓储壳。backend/src/services/trading/context.ts:27-67、:307-309；backend/src/services/operations.ts:187-258。

官方网络取证在财务短事务外完成，事务内复核账户/凭据/修订/时效及资金守恒；浏览器不能复制一份规则就跳过服务端核验。backend/src/services/trading/market.ts:109-154、:183-300。

StocksGateway是应用用例需要的端口；实现统一在api/binance-stocks.ts与binance-wallet.ts。SDK配置timeout8000、retries0；提交/取消使用单请求证据，不因前端超时重发。Stocks的S/F只是请求回执，不等于订单终态。backend/src/services/trading/ports/stocks-gateway.ts:54-83；backend/src/api/rest-configuration.ts:7-25；backend/src/api/binance-stocks.ts:194-244、:314-325。

### 2.3 数据库是共享事实，不是消息队列

[已验证事实：源码] API/Worker各有进程和SQL连接池，共用相同DATABASE_URL。订单、交易、账本、账户、任务及回执靠PG事务/锁协调；没有已实现的PG LISTEN/NOTIFY业务总线。业务SSE通过查询已提交表状态发现变化。backend/src/database/index.ts:9-13；backend/src/server/events.ts:159-215。

|持久化对象|关键约束与前端含义|源码|
|---|---|---|
|users/sessions/exchange_accounts|角色、会话撤销、所有权、加密凭据、连接与钱包快照；前端拿脱敏投影|backend/src/database/schema.ts:40-100；backend/src/services/account-projection.ts:9-53|
|trade_tasks|完整JSONB config、实际起止时钟、目标与真实累计、预留、lease；不是仅存前端草稿|backend/src/database/schema.ts:126-175|
|orders|clientOrderId唯一；owner+idempotencyKey部分唯一；提交/取消开始证据、费用与SELL库存闭环字段|backend/src/database/schema.ts:177-259|
|trades|账户+exchangeTradeId唯一，正价格/股数；逐笔费用可null|backend/src/database/schema.ts:261-290|
|positions/account_ledger_entries|本系统名义仓、成本及USD名义流量；不提供全账户现金结算/PnL保证|backend/src/database/schema.ts:292-338；backend/src/services/trading/settlement.ts:375-528|
|order/task events、systemEvents、auditLogs|推进记录、业务日志、操作者审计分别持久化；均不替代官方成交证据|backend/src/database/schema.ts:339-404|
|reconciliation_records|status为text、details为JSON；当前仅DIFFERENCE/UNAVAILABLE/PARTIAL|backend/src/database/schema.ts:373-384；backend/src/services/trading/engine.ts:1102-1124|
|operation_receipts|UUID、actor、目标、hash、scope、阶段、冻结result/error；未解决scope部分唯一|backend/src/database/schema.ts:444-477|
|service_heartbeats/exchange_rate_limits/platform_settings|Worker健康、API/Worker共用官方冷却、平台限额与急停|backend/src/database/schema.ts:405-439；backend/src/api/rate-limit-store.ts:10-61|

迁移启动会在保留连接持有advisory lock，校验已执行前缀/哈希后执行缺失迁移，失败阻断；所以本轮没有启动API/Worker来“只看页面”，以免自动迁移或接入正式节点。backend/src/database/migrations.ts:169-193、:206-300；backend/src/server/index.ts:105-111。

### 2.4 Worker与界面生命周期

Worker先recover()，再tick()，并有25ms独立schedule通道；每5秒及周期末写心跳。recover不下新单，但核对可执行交易员已授权的自动撤单。关闭页面、退出登录不停止任务，停止进程不证明挂单已撤。backend/src/worker/index.ts:114-159、:205-216、:303-305；backend/src/worker/task-scheduler.ts:8-29；backend/src/services/trading/engine.ts:693-727、:1224-1261。

私有流仅将官方订单ID放入进程内notice集合，仍须读取完整订单/逐笔证据；公开quote只供行情显示。两者都不能直接让前端计算成交、释放预留或结束UNKNOWN。backend/src/services/trading/streams.ts:67-95；backend/src/services/trading/engine.ts:770-825。

## 第三章：前端技术选型审查

### 3.1 全部选型逐项评估

以下是独立设计判断，不是前端已验收结论。UI、路由、表单和测试库不直接改变HTTP兼容性；真正的约束是Cookie/CSRF、精确字符串、完整任务配置、原ID恢复及错误协议。版本为本轮官方资料/公开npm元数据观测值，不代表已安装或已完成组合构建。表中“后端无”只指该库本身不要求改后端，公共协议缺口另见第四、十章。

|技术|业务适配与接口兼容性|替代方案及复杂度|版本/环境、未确认前置条件|后端配合与决策|
|---|---|---|---|---|
|React 19|适合多角色管理SPA；无需SSR或新BFF|Vue同样能消费接口；没有证据支持为换框架增加成本|观测19.3.1；StrictMode下流必须正确清理；未做UI原型|无；保留|
|TypeScript|适合三类交易输入、状态联合与契约提取|纯JS丢失静态边界；TS不能校验网络JSON|观测7.0.2，与后端现有编译器一致；前端独立tsconfig需验证|修正公共类型；保留strict|
|Vite|适合独立静态SPA和开发代理|Next.js/TanStack Start引入无当前需求的服务端运行层|观测8.3.7；官方Node要求20.19+/22.12+，综合测试链建议Node24 LTS；Bun可作包管理，不视为已验所有插件|无；保留。部署方提供静态托管/SPA回退|
|Astryx|基础组件可实现；并非无表格、无弹窗；高精度输入需专门适配|MUI及Chakra可行；Beta升级成本和金融表单适配不能靠组件数量消除|0.7.11仍Beta；React>=19、StyleX ^0.19；主题精确匹配core。缺本项目原型|无；有条件可行，但不选为本报告生产默认，建议MUI替代|
|Tailwind v4|与Astryx官方bridge兼容，不是后端依赖|MUI主题/sx或普通CSS已覆盖布局；双样式系统非必需|官方最低Chrome111/Safari16.4/Firefox128；需验证层顺序、portal、暗色|无；最终MUI基线删除。若改选Astryx则可保留|
|Astryx CSS Variables|可统一语义色和主题，但不能独立解决组件状态语义|最终使用MUI CSS Variables作为唯一来源；不保留两套主题拥有者|Astryx 0.7有CSS选择器迁移；不能把任意旧token当稳定公共API|无；随主UI替换|
|Tabler Icons|状态、操作、导航均够用；按名导入|MUI Icons/Lucide也可；不需第二套图标库|观测3.51.0，React>=16；Astryx可映射语义图标或SVG，具体TS适配未编译|无；保留，图标不代替文字/可访问名称|
|TanStack Router|URL承载账户、筛选、页码；角色守卫仅改善交互|React Router同样可行；不要为TanStack品牌引入Start/Store/Form|观测1.170.46；React>=18、Node>=20.19；loader只协调Query，不再养一份业务缓存|无；保留|
|TanStack Query|适合REST权威读取+SSE失效提示；不保证跨资源事务一致|RTK Query、SWR可行，均需相同身份/时序保护；无现存Redux，没必要新增其全套状态|观测5.107.1支持React18/19；必须消费AbortSignal，默认行为不能代替恢复协议|公共缺口需补，缓存层保留并增强|
|Zustand|不是必需；订单/账户/任务不能复制进第二Store|URL+局部state/context+Query足以起步；高频独立行情可用vanilla store或useSyncExternalStore|观测5.1.0；无实测性能证据证明需行情Store|无；简化，暂缓引入|
|React Hook Form|适合完整任务配置、条件字段和可编辑限制|TanStack Form可行，但当前配置不是动态策略图；两套表单库不并存|观测7.91.0；使用Controller适配控件，禁用字段不得意外从完整PATCH消失|无；保留|
|Zod|现有公开模块只依赖Zod，适合复用输入与流解析|Valibot会形成第二套规则；不能复制整个服务端domain/数据库schema|后端4.6.7；RHF resolver须选支持Zod4者；区分z.input/z.output与默认值/transform|补齐缺失协议定义；保留公开schema而非内部规则|
|TanStack Table|适合只读订单/账本/监管表；需业务表格外壳|AG Grid适合真正Excel式交互；MUI X也是候选；目前不需编辑交易事实单元格|当前发布9.3.1要求Node>=20、React>=18；不能照抄v8 useReactTable教程当v9 API|无；保留单一headless表格引擎|
|Native EventSource|Cookie鉴权GET流可直接使用；无自定义CSRF头需求|Fetch streaming可读握手状态/自定义退避；WebSocket增加后端协议和运维成本，不能自动补播|跨源withCredentials；无法直接读取握手401/429响应正文；需管理重连和配额|现有协议可用，补通知覆盖可独立实施；保留并增强管理|
|Native Fetch|覆盖全部现有HTTP方法/JSON与AbortSignal|hc是现成可行选择，Axios无必须收益；Fetch不会对HTTP错误自动reject|跨源credentials:include；解析data/error/operation必须独立于response.ok|公共契约补齐；保留，不自动重试写操作|
|Backend Contracts|已导出Hono推导声明和公开Zod模块，避免手写另一套DTO|hc可复用；OpenAPI适合多语言/外部合作场景但并非当前前置|声明含Hono类型依赖；没有独立契约包版本和完整统一错误联合|需要调整导出类型与空值，不强制改路由或workspace|
|decimal.js|金额/股数计算、比较与排序需要精确十进制|直接字符串适合存储；Number不能替代，BigInt需另管scale增加成本|后端10.6.0；前端应明确精度和舍入，仅展示舍入，不改提交值|无；保留，小范围使用|
|Native Intl API|适合语言化数字、UTC/纽约/本地时间展示|date-fns不是微秒序列化或IANA反向转换方案|旧引擎NumberFormat字符串可能先转Number；须能力测试，展示不能回写原值|无；保留用于展示|
|IANA Time Zone|纽约交易时间跨DST，不能固定UTC-5|只输入UTC最简单；本地墙钟输入需明确歧义策略|浏览器tzdata需验；本报告新增Temporal适配，缺原生支持时polyfill|无；保留America/New_York及UTC|
|i18next/react-i18next|后端码与前端标签分离有益；当前没有明确多语言交付范围|先集中中文文案与状态映射即可；Intl不负责消息翻译|观测27.0.1/18.0.1，Node>=22；服务端中文message不可凭空自动翻译|无；暂缓运行依赖，保留可替换文案边界|
|Vitest|适合解析、缓存时序、金融展示与表单映射|后端bun:test不等于前端组件环境；无需统一测试runner|观测5.1.0；Node22.12/24/26范围、Vite6.4/7/8兼容声明；未安装前端|无；保留开发依赖|
|React Testing Library|验证可见状态、禁用条件、键盘/表单行为|只测实现快照价值低；Browser Mode可补真实DOM|观测16.3.3支持React18/19；需DOM环境或浏览器模式、@testing-library/dom|无；保留开发依赖|
|Playwright|必须用于Cookie、跨标签、迟到响应、SSE和刷新恢复|单元mock不能证明浏览器Cookie顺序；Cypress也可但无迁移理由|观测1.65.0，Node>=20；浏览器二进制需另行授权安装，WebKit不等于真Safari|需隔离联调环境而非生产账户；保留|
|MSW|可模拟空值/错误/迟到REST与流，开发不碰正式交易|协议夹具服务可补SSE；mock不是SQL/SDK真实性证据|观测3.0.4，Node>=22.12、TS>=5.9；不能照旧版API假定EventSource行为|无；保留开发用途，关键流用真实隔离HTTP验收|
|Sentry|可收集前端故障，不应收集交易凭据、请求体和资金快照|先结构化本地错误与人工反馈，或自托管遥测；不能未经批准外送数据|观测11.11.0支持React19；React Router peer是optional，不能因此换路由；需DSN/数据驻留/脱敏策略|无必须；暂缓上线启用，禁默认Replay/敏感breadcrumbs|

第三方依据见第十三章外部资料索引；MUI/Astryx适配证据详见第九章。以上没有安装任何新依赖。

### 3.2 争议项的反向比较

比较中的性能是架构性判断，不是本项目benchmark；任何库都不能补出后端没有的事件、状态证据或授权。社区成熟度用于评估维护路径，不以star数量作为交易正确性证据。

|候选组合|后端兼容/功能覆盖|交易正确性与一致性|性能/开发及定制成本|TypeScript、生态/版本稳定和长期维护|后端改造与结论|
|Astryx+Tailwind / MUI / Chakra|三者均消费相同REST；Astryx已有丰富基础与表格插件，MUI有完整管理表单组件，Chakra提供组合式控件|三者均需字符串金融输入、精确时间和恢复面板；换库不解决后端风险|Astryx预编译CSS、可swizzle；MUI默认Emotion有运行时样式成本；Chakra组合及管理表格封装量需原型比较|均TS；Astryx公开Beta及0.7选择器迁移增加升级成本；MUI/Chakra已有成熟发布路径也非零风险|均无需改API。选择MUI作生产默认，Astryx保留条件候选，不以“无关键组件”否决|
|TanStack Query / RTK Query / SWR|三者能接REST/SSE；Query现成按key失效/取消最贴近当前通知粒度|都不能保证多接口原子快照、补播或未知操作恢复；必须有身份代次与定期对账|Query少一层Redux；RTK tags集中但引入store/slice；SWR轻巧，复杂恢复仍须自建|均有TS与成熟用例；Query与Router整合便利但不是采用理由|无需改传输；保留Query，不宣称invalidate即强一致|
|Native EventSource / Fetch流 / WebSocket|前两者直接接现有两条GET；WS须新增后端协议|均不自动保证持久/补播；本业务写经HTTP原ID，单向状态提示足够|EventSource简单但握手状态不可读；Fetch流需解析/重连；WS双向管理更复杂|原生API无库升级；Fetch流解析器需严格测试；WS生态成熟不等于当前必要|保留EventSource+受控恢复；若握手退避需求无法满足再替换传输，不为多证券先上WS|
|Query+局部state/URL / Zustand vanilla / 自写useSyncExternalStore|均可表达选中账户、连接状态与单证券快照|只有一个行情数据拥有者；不能Query和Zustand双写同一REST对象|当前单证券不需要新全局依赖；vanilla适合日后独立高频订阅；自写需处理不可变快照/订阅清理|Zustand和React外部store API均有明确TS接口；自写长期生命周期成本不为零|暂缓Zustand；不是为了少依赖转而手写大型store|
|TanStack Table / AG Grid / Astryx Table插件|读取型列表均可；AG更适合范围选择、Excel粘贴、复杂编辑；Astryx已有排序/固定列/列宽|交易事实不允许单元格直接改写；分页/金额比较仍由业务定义|headless多一些视觉/键盘封装，AG内建虚拟化但引擎/主题/许可复杂；不叠加两个排序分页引擎|均TS；Table9要按9版文档；AG Enterprise高级能力需许可；Astryx随Beta升级|当前保留Table，若真正要求Excel式交互重新选AG，后端分页优先于虚拟滚动|
|RHF+Zod / TanStack Form+Zod|完整任务配置和条件分支均可实现；RHF Controller可接第三方控件|都必须构造完整PATCH、清理不适用字段、保留不可改字段与时间原串|RHF局部订阅/现成resolver足够；TanStack Form有细粒度和异步校验，但没有证据使迁移收益超过成本|RHF7及TanStack Form均TS；不能只因Router/Query已选TanStack就再选Form|保留RHF，异步预检是后端操作，不复制进前端领域校验|
|Fetch+类型提取 / hc+同一契约 / OpenAPI生成|Fetch/hc均可调用现有接口；当前client.d.ts本来就是hc推导结果|hc也不自动推导全局onError，任何客户端都要保留operation及未知结果|Fetch需小型路由函数和错误边界；hc减少路径拼写；OpenAPI需维护生成链与流/回执扩展|前两者可直接复用TS声明；OpenAPI利于跨语言但当前没有此消费者需求|选Fetch+公开DTO别名/错误定义；hc是等价可行备选，绝不为此重构后端|

没有性能数据证明AG Grid、Zustand或WebSocket是必需，也没有证据证明Astryx绝对不可用。选择依据是当前可用接口、真实交互复杂度和减少长期自维护风险。

## 第四章：API契约分析

### 4.1 明确结论

**Native Fetch可以实现当前全部52个接口的客户端；不需要重构成Hono RPC。现有两份contracts不能原封不动当作完整、无差异协议。** 需补通用错误/流内错误、可空投影、原操作结果边界和请求头约束，客户端增加派生DTO别名与按领域请求函数。若“整个前端”包含精确寻回任意历史下单key、全局本地成交页或原请求参数展示，还存在真实API/证据缺口，不能用Fetch或hc解决。

client.d.ts是hc<AppType>展开出的ClientRequest代理类型，最后导出ApiClient，并非OrderDTO等具名集合（:2-15、:4157）。只import type，不能运行时import其中声明的contract值。可用Hono的InferRequestType/InferResponseType从ApiClient['api']['v1']各方法派生；Hono可仅作类型依赖，不强制hc运行时。动态JSON仍须边界解析，泛型fetchJson<T>不会校验网络响应。

### 4.2 全部52个显式接口覆盖

下表业务路径省略/api/v1，只有/healthz是原路径。D<T>={data:T}；P<T>={items,total,page,pageSize}；R<T>为{data:T|null,operation}或{error,operation}。R均需UUID Idempotency-Key，正常200/202；错误可同时有已成功回执。全部错误仍经过4.4公共出口，不把表内列出的错误当封闭枚举。

Request缩写：ID=UUID路径参数；F=filterSchema（symbol/status/ownerUserId/accountId/from/to/search/page/pageSize）；H=官方历史symbol/from/to/page/pageSize；OC=orderCreateSchema；TC=taskCreateSchema完整三分支；无表示没有额外JSON/query schema，不表示绕过认证/CSRF。

|#|方法/路径|实际Request|实际Response及关键边界|源码位置|
|---|---|---|---|---|
|1|GET /healthz|无|D<status,database,worker,environment,time>；200或503，503仍有data|backend/src/server/app.ts:76-104|
|2|GET /meta|无|D<publicEnvironment>；公开版本/能力，不是账户交易许可|backend/src/server/app.ts:105；backend/src/server/queries.ts:192-203|
|3|POST /auth/login|loginSchema.strict|D<user,csrfToken>+Cookie；LOGIN_FAILED/401、429|backend/src/server/auth.ts:28-72|
|4|GET /auth/me|无|D<user,csrfToken>，不续会话|backend/src/server/auth.ts:73-75|
|5|POST /auth/logout|无JSON schema|D<loggedOut:true>，撤当前会话|backend/src/server/auth.ts:76-86|
|6|POST /auth/password|passwordSchema再加currentPassword≤128并strict|D<changed,reauthenticate>；PASSWORD_INVALID/400、PASSWORD_UNCHANGED/422、SESSION_CHANGED/401|backend/src/server/auth.ts:87-120|
|7|GET /accounts|F|D<safeAccount[]>；不是分页|backend/src/server/accounts.ts:77-94|
|8|POST /accounts|accountCreateSchema.strict；交易员|D<safeAccount>/201；ACCOUNT_LIMIT/409、创建失败500|backend/src/server/accounts.ts:95-131|
|9|PATCH /accounts/:id|ID+accountUpdateSchema.strict；交易员|D<safeAccount>；无统一回执；空更新/凭据不成对422、未结/限制等409|backend/src/server/accounts.ts:132-298|
|10|GET /accounts/:id|ID|D<safeAccount>；不存在/无权404|backend/src/server/accounts.ts:299-301；backend/src/server/queries.ts:71-80|
|11|POST /accounts/:id/check|ID+UUID原操作；交易员|R<safeAccount>，ACCOUNT_CHECK|backend/src/server/accounts.ts:302-326|
|12|POST /accounts/:id/assets/sync|ID+UUID原操作|R<safeAccount>，ACCOUNT_SYNC；管理员可用|backend/src/server/accounts.ts:327-338|
|13|POST /accounts/:id/reconcile|ID+UUID原操作|R<ReconciliationRow>，不是Account DTO|backend/src/server/accounts.ts:339-350|
|14|GET /accounts/:id/exchange/orders|ID+H|D<P<ExchangeOrder>>，历史窗口非法400/证据非法502|backend/src/server/accounts.ts:351-363；backend/src/api/binance-stocks.ts:39-74、:329-344|
|15|GET /accounts/:id/exchange/trades|ID+H|D<P<ExchangeTrade>>，逐笔fee为null|backend/src/server/accounts.ts:364-376；backend/src/api/binance-stocks.ts:345-361|
|16|GET /admin/overview|无|D<counts,worker,settings,recentEvents>；settings可null|backend/src/server/admin.ts:72-141|
|17|GET /admin/users|F|D<P<PublicUser>>|backend/src/server/admin.ts:142-167|
|18|POST /admin/users|userCreateSchema.strict|D<PublicUser>/201；权限422/403、用户名409、创建500|backend/src/server/admin.ts:168-244|
|19|PATCH /admin/users/:id|ID+userUpdateSchema.strict+UUID|R<PublicUser>；最后管理者409，管理权限403|backend/src/server/admin.ts:245-373|
|20|GET /admin/accounts|F|D<P<safeAccount>>|backend/src/server/admin.ts:374-411|
|21|PATCH /admin/accounts/:id|ID+adminAccountUpdateSchema.strict+UUID|R<safeAccount>；只改平台限制|backend/src/server/admin.ts:412-507|
|22|GET /admin/tasks|F|D<P<Task+lastInterruption>+source>|backend/src/server/admin.ts:508-510；backend/src/server/business.ts:116-137|
|23|GET /admin/orders|F|D<P<safeOrder>+source>|backend/src/server/admin.ts:511-513；backend/src/server/business.ts:95-115|
|24|GET /admin/ledger|F|D<P<LedgerRow>+source>|backend/src/server/admin.ts:514-516；backend/src/server/business.ts:138-166|
|25|GET /admin/audit|F|D<P<脱敏AuditRow>>|backend/src/server/admin.ts:517-548|
|26|GET /admin/system|无|D<settings,heartbeats,events,environment,endpoints>；settings/endpoints可null|backend/src/server/admin.ts:549-565|
|27|PATCH /admin/system|platformUpdateSchema.strict+UUID|R<PlatformSettings>；空更新422、配置/环境503|backend/src/server/admin.ts:566-624|
|28|POST /admin/endpoints/benchmark|query accountId?:UUID，不是JSON|D<results,selected,measuredAt>；每管理员1次/60秒|backend/src/server/admin.ts:62-63、:625-633|
|29|GET /market/quotes|query symbol必需、accountId可选|D<Quote[]>，当前恰好单条|backend/src/server/business.ts:59、:169-175|
|30|GET /overview|无|D<account,counts,today,recentOrders,issues,worker,environment及来源/可用性>；身份范围统计，不按选中账户|backend/src/server/business.ts:176-282|
|31|POST /orders/preflight|OC；交易员|D<PreflightResult>；无订单/预留/持久批准|backend/src/server/business.ts:283-288|
|32|POST /orders|OC+1–200字符Idempotency-Key；交易员|D<safeOrder>/201；没有operation；201也可能为原单重读|backend/src/server/business.ts:289-298；backend/src/services/trading/engine.ts:952-992|
|33|GET /orders|F|D<P<safeOrder>+source>|backend/src/server/business.ts:95-115、:299-301|
|34|GET /orders/:id|ID|D<order,trades,events,source>|backend/src/server/business.ts:302-320|
|35|POST /orders/:id/cancel|ID+UUID；交易员|R<safeOrder>，ORDER_CANCEL|backend/src/server/business.ts:321-328|
|36|POST /orders/:id/reconcile|ID|D<safeOrder>；不是新回执|backend/src/server/business.ts:329-332|
|37|GET /tasks|F|D<P<Task+lastInterruption>+source>|backend/src/server/business.ts:116-137、:333-335|
|38|POST /tasks|TC；交易员|D<Task>/201，保存不启动，无回执|backend/src/server/business.ts:336-338|
|39|PATCH /tasks/:id|ID+完整TC；交易员|D<Task>，非partial，无回执|backend/src/server/business.ts:339-350|
|40|GET /tasks/:id|ID|D<task,lastInterruption,source,orders,trades,events,summary>|backend/src/server/business.ts:351-402|
|41|POST /tasks/:id/control|ID+taskControlSchema.strict+UUID|R<Task>；管理员仅pause/stop/reconcile|backend/src/server/business.ts:403-433|
|42|GET /positions|F|D<P<名义仓投影>+source/assetsAvailable/unavailableReason>|backend/src/server/business.ts:434-484|
|43|GET /ledger|F|D<P<LedgerRow>+source>|backend/src/server/business.ts:138-166、:485-487|
|44|GET /reconciliations|F|D<脱敏核对记录[]>，非分页|backend/src/server/business.ts:488-507|
|45|GET /logs|F|D<P<TASK/ORDER/SYSTEM三源业务事件>>，非运行日志下载|backend/src/server/business.ts:508-603|
|46|GET /market/holdings|equityHoldingsQuerySchema，accountId必需|D<EquityHoldingsSnapshot>；读取前后校验，证据非法502|backend/src/server/market.ts:17-19；backend/src/services/equity-holdings.ts:100-149|
|47|GET /market/symbols|marketSymbolQuerySchema|D<SymbolPage>；过期/刷新失败不伪空成功|backend/src/server/market.ts:20-22；backend/src/services/market-catalog.ts:28-37、:338-458|
|48|GET /market/quote-stream|quoteStreamQuerySchema，accountId+symbol|SSE quote/status；建流前错误为JSON，超限429|backend/src/server/quote-stream.ts:19-44、:74-143|
|49|GET /operations|无query schema|D<OperationReceipt[]>，只从未解决候选读取|backend/src/server/operations.ts:134-135；backend/src/services/operations.ts:352-367|
|50|GET /operations/:id|OID={id:z.uuid()}|D<OperationReceipt>；404不能证明未执行|backend/src/server/operations.ts:136-138|
|51|POST /operations/:id/reconcile|OID，无新幂等键要求|D<OperationReceipt>；恢复原操作|backend/src/server/operations.ts:139-156|
|52|GET /events|无query schema|SSE refresh/error/注释；超限429|backend/src/server/events.ts:54-85、:142-262|

52不包含自动OPTIONS/HEAD、404、onError等框架行为。所有/admin路由先requireAdmin（backend/src/server/admin.ts:70-71）。账户/订单/任务读取的所有权仍由服务端执行，不能仅路由分区。

### 4.3 输入Schema可复用的精确边界

|输入域|实际约束/注意点|定义|
|---|---|---|
|登录/改密|username1–64、登录password1–128；创建/新密码10–128；改密路由另限旧密码128|backend/src/validation/contracts.ts:127-144；backend/src/server/auth.ts:87-92|
|用户|创建username正则3–64、role、canManageAdmins默认false；更新只有status/canManageAdmins可选，不改role/密码|backend/src/validation/contracts.ts:131-140|
|账户|label trim1–80，apiKey trim1–256，apiSecret trim1–512；PATCH另有status/tradingEnabled；凭据成对等在路由/服务|backend/src/validation/contracts.ts:145-157；backend/src/server/accounts.ts:142-235|
|订单三分支|LIMIT=price+quantity，可DAY/GTC/RTH等；MARKET BUY=notional；MARKET SELL=quantity，二者仅DAY且禁止限价/时段字段；分支strict|backend/src/validation/contracts.ts:158-205|
|任务|完整三分支、随机区间交叉校验、固定价必填；默认值不等于PATCH保留原值|backend/src/validation/contracts.ts:206-317；第六章|
|任务控制|action只能start/pause/resume/stop/reconcile|backend/src/validation/contracts.ts:318-320|
|平台|可选急停、股数整数上限、单笔名义额、费率/最低预留；空更新路由拒绝；无maxTaskNotional|backend/src/validation/contracts.ts:321-330；backend/src/server/admin.ts:566-624|
|通用列表|F中的分页数字coerce、默认1/25、最大100；search最多100；普通symbol不自动大写|backend/src/validation/contracts.ts:331-341；backend/src/server/queries.ts:42-63|
|市场目录|accountId必需、search trim≤128、page1/size25 max100、refresh=true/false|backend/src/services/market-catalog.ts:28-37|
|官方历史/报价/benchmark|路由内局部schema；不全部以同名runtime schema公开导出|backend/src/server/accounts.ts:35-37；backend/src/server/business.ts:59；backend/src/server/admin.ts:63|
|持仓/行情流|公开account UUID及symbol规范化schema可直接复用|backend/src/validation/contracts.ts:409-432、:644-668|

contracts/validation.ts仅import zod（:2），使用标准Date/Set/BigInt，无Bun/DB/SDK依赖；在现代支持BigInt浏览器可复用。不要导入src/services或domain当公共包。公共schema尚不完整表达服务层“六位有效小数时间/已开始字段冻结/当次库存/权限/预留守恒”，前端验证不能替代服务端。

区分z.input（提交前可省默认字段）、z.infer/z.output（解析后完整值），RHF条件字段要匹配严格分支。建议将最终无I/O请求schema集中导出，保持现有strict/default行为，非另写一份近似规则。

### 4.4 所有错误出口与客户端处理

正常JSON通常D；错误是{error:{code,message,requestId,operationAccepted?:false,details?:unknown}}，部分附operation。errorBody与validationHook在backend/src/server/context.ts:50-88。VALIDATION_ERROR/422只给经过筛选的字段路径摘要消息，**没有承诺原始Zod issues数组**；不要靠解析中文message提取字段错误。

|类别|实际状态/表达|客户端要求|
|---|---|---|
|认证/来源/CSRF|UNAUTHENTICATED401、ORIGIN_FORBIDDEN/CSRF_INVALID403|区分身份与权限，不能自动重放写入|
|输入/请求体|VALIDATION_ERROR422；BODY_TOO_LARGE413；无效JSON可HTTP_ERROR400|64KiB是请求体上限，不是响应限制|
|角色/资源|TRADER_REQUIRED/ADMIN_REQUIRED等403；缺失/无权404|UI动作限制只是辅助；404不是未知操作未执行证明|
|业务/领域|BusinessError按自身code/status，默认400；DomainError409|保留code、message、requestId；不把所有409当普通表单错误|
|DB约束|23505→CONFLICT409；23514→DATA_CONFLICT409|不能据此释放原占用或忽略回执|
|SDK/服务|429/502/503等由用例透传；其后可附SUCCEEDED回执|HTTP、原操作、当前对象三维分开|
|未处理异常|INTERNAL_ERROR500；最外层Bun异常也可能无operation|保留未知，不写假失败|
|健康例外|/healthz 503仍为data|健康专用分支，不强制解析成error|
|流例外|HTTP200后message中error/status不可用|不等同网络onerror或成功业务对象|

证据：backend/src/server/app.ts:64-72、:117-165；backend/src/server/index.ts:150-166；utils/errors.ts:3-11；backend/src/server/operations.ts:16-47。

### 4.5 具体类型差异与最小修正

|编号|静态与运行差异|证据|最小修正|
|---|---|---|---|
|C01|client声明没有全局onError完整错误联合；登录只推导成功体|backend/contracts/client.d.ts:135-156；backend/src/server/auth.ts:44-53；backend/src/server/app.ts:117-165|公开ApiErrorBody/schema及可选operation，不重构路由|
|C02|tracked error.details声明为null，实际可为{blockingOperation}|backend/contracts/client.d.ts:538-543、:2343-2349；backend/src/server/operations.ts:31-38|errorBody显式JSON兼容类型/错误DTO后重导出|
|C03|tracked声明错误必带operation，缺UUID/未认证/Origin拒绝却可不带|backend/src/server/operations.ts:21-23、:54-60；backend/src/server/context.ts:314-376|公共错误operation可选；不能依声明断言必有|
|C04|overview/admin overview的worker.lastSeenAt声明string，源码可null；healthz声明正确|backend/contracts/client.d.ts:1449-1453、:2824-2827、:4142-4145；backend/src/server/queries.ts:190|显式WorkerState返回类型，不以全仓编译选项变更替代定向修正|
|C05|admin overview/system的settings声明非空，构造为首行??null|backend/contracts/client.d.ts:1454-1467、:1496-1508；backend/src/server/admin.ts:137、:558|明确nullable投影；这是源码分支，不声称本轮运行遇到缺设置|
|C06|流响应在RPC声明output:{}，业务流错误不在eventRefreshSchema|backend/contracts/client.d.ts:5-11、:4036-4047；backend/contracts/validation.ts:24-30；backend/src/server/events.ts:142-149|复用已有quoteStreamEventSchema，并补BusinessStreamMessage联合|
|C07|原回执kind有枚举，result是可空字典；中间阶段与最终结果不同|backend/src/validation/contracts.ts:694-708；backend/src/services/operations.ts:121-163|按kind/phase/outcome定义真实结果投影并缩窄；不强转|
|C08|必需幂等/CSRF请求头未进入声明input|backend/src/server/business.ts:290-296；backend/src/server/operations.ts:21；backend/src/server/context.ts:362-373|公开头约束、前端方法必传原ID，由HTTP层统一CSRF|
|C09|大量默认200被推导为ContentfulStatusCode，错误status联合甚至含2xx|backend/contracts/client.d.ts:154-155、:567、:651|不要只靠状态泛型提取成功DTO；显式HTTP状态/类型可改善导出|
|C10|请求schema部分路由strict/extend/局部查询未统一公开|backend/src/server/auth.ts:87-92、backend/src/server/accounts.ts:35-37、backend/src/services/market-catalog.ts:28-37|集中最终浏览器安全schema，保留行为|
|C11|query声明可出现string[]/boolean，实际路由要求单值UUID/证券|backend/contracts/client.d.ts:235-247、:3954-3962；backend/src/validation/contracts.ts:409|URLSearchParams明确单值编码，不能据类型推导支持重复key|
|C12|当前snapshot无自身版本/hash manifest|backend/scripts/export-contracts.ts:9、:41-43；backend/src/server/queries.ts:202|绑定backend3.0.0+源码版本，发布时生成manifest/检查，不强制workspace|

不能整体宣称DTO退化any；当前大部分订单/资产字段有具体类型，动态details/result刻意宽化。也不能把本轮typecheck通过当运行时null分支正确的证明。修补上述投影和导出主要不需DB迁移、不应改变交易规则。

### 4.6 发布、包与客户端最小方案

现有export-contracts.ts以tsconfig.contracts声明导出，--singleThreaded生成，白名单只允许Hono公共模块及重写后的validation；直接复制公开validation。可作为独立契约包/制品发布，但目前不是已发布npm包，也没有共享workspace。建议固定契约制品版本、source commit、schema版本、Hono/Zod兼容范围；普通前端安装不得依赖服务端目录或导入AppType。backend/scripts/contract-entry.ts:1-6；backend/scripts/export-contracts.ts:5-59。

前端仅需：统一HTTP传输（credentials/CSRF/requestId/AbortSignal）、公开类型派生、各领域短请求函数、完整结果/错误模型、事件parser和会话/原操作恢复协调。不要生成一套新交易规则或层层request/response/client/session/manager壳。

hc是可行替代：减少路径拼写且保持Fetch Response；仍需相同错误/回执处理。OpenAPI适合将来多语言消费或外部集成，当前无必要先维护第二份协议。共享workspace只是代码分发方式，不增加运行时正确性。Hono官方也明确全局错误不会自动进入RPC推导：[RPC文档](https://hono.dev/docs/guides/rpc)。

本轮未运行contracts:export/--check：该命令会创建并删除.contract-build，用户限定仅报告文件写入。已逐路由校对静态快照并运行tsc --noEmit，但**未声称当前client.d.ts与新导出逐字一致或独立前端构建已通过**。

## 第五章：SSE可行性分析

### 5.1 业务流真实协议

[已验证事实：源码] GET /api/v1/events没有账户或资源订阅参数；按当前身份/所有权过滤，管理员跨用户。正常帧是默认message，不存在event:refresh。正常JSON字段如下（结构由源码确认）：

```text
kind: refresh
resources: [orders, tasks, accounts, ledger, events, settings, users, audit, worker]
at: 服务端发出提示的ISO时间
requestId: 本次HTTP建流请求ID
```

公开eventRefreshSchema把resources/at/requestId设为可选，当前生产者总会填；兼容解析缺resources时可做全范围失效，不能将undefined当“无变化”。JSON不含实体ID、accountId、实体version或持久sequence。SSE帧有id=服务端毫秒时间-连接内递增计数、retry:3000；id里的计数每连接从0开始，不是可补播游标。源码：backend/src/validation/contracts.ts:11-29；backend/src/server/events.ts:123-125、:218-234。

依据源码构造的消息示例：

```text
data: {"kind":"refresh","resources":["orders","tasks"],"at":"1970-01-01T00:00:10.000Z","requestId":"11111111-1111-4111-8111-111111111111"}
id: 10000-1
retry: 3000

```

该示例不是本轮抓包。客户端以JSON字段kind分派，不能addEventListener('refresh')代替onmessage。鉴权失效也是message内的error={code:'UNAUTHENTICATED',message,requestId}，内部故障为EVENT_STREAM_UNAVAILABLE，然后关流；与EventSource.onerror网络事件分开处理。backend/src/server/events.ts:142-149、:241-259。

### 5.2 事件从何而来：不是写入点主动发布

每个连接查询以下摘要；每轮末尾sleep1500，还要加SQL/写流时间。首次previousVersions=null，因此所有9类都提示；重连重新如此。约15秒无业务帧时写keep-alive注释。没有Last-Event-ID读取、历史游标或中间事件必达。backend/src/server/events.ts:127-239。

|资源|比较值/隔离|对应事实源|
|---|---|---|
|orders|最大updatedAt+count；交易员owner|订单准备/受理/结算/取消/核对事务|
|tasks|最大updatedAt+count；交易员owner|配置、控制、Worker推进、结算|
|accounts|最大updatedAt+count；交易员owner|凭据/开关/限制/连接/同步及预留|
|ledger|最大createdAt+count；交易员owner|结算/费用/释放账本|
|events|最大systemEvents.id；交易员owner，不含owner=null全局事件|订单/任务事件的业务日志投影|
|settings|平台updatedAt|平台控制|
|users|最大updatedAt+count；交易员仅自己|用户状态/权限|
|audit|最大createdAt+count；交易员actor；排除ADMIN_QUERY、ADMIN_READ、MARKET_QUOTES_QUERY|写行为审计，避免读→审计→重复刷新循环|
|worker|仅online:status|选定的聚合Worker健康；不比较lastSeenAt/details|

完整来源：backend/src/server/events.ts:151-215；持久事件写入：backend/src/services/trading/context.ts:231-305、backend/src/worker/index.ts:151-155。没有operations/positions/trades/reconciliations/symbols/holdings直接资源提示。

[技术推断] 同一轮内多次变化会合并，重连又会重复提示；max+count可漏掉未改变最大时间的更新、同刻更新或较早事务晚提交，systemEvents最大自增ID也不是提交序。ledger还存在只改updatedAt的币种补齐，createdAt摘要不变（backend/src/services/trading/settlement.ts:530-541）。因此SSE不能承担交易账本或唯一变化检测器。业务源读取也不在统一快照事务内，REST间没有全局revision屏障。

### 5.3 行情流真实协议与首帧竞态

GET /api/v1/market/quote-stream?accountId=<UUID>&symbol=<证券代码>：两参数必需，symbol trim/大写/最长128；一个连接一个证券，不解析逗号、不支持重复symbol数组、不提供订阅变更消息。切证券或账户必须close旧流再建新URL。REST /market/quotes?symbol=...&accountId=...返回data:[Quote]，只是单证券数组；accountId虽可省略，前端应显式传，避免与SSE选中范围不一致。backend/src/validation/contracts.ts:60-66、:409-432；backend/src/server/business.ts:59、:169-175；backend/src/services/trading/engine.ts:157-181。

公开联合已经存在，不需从零手写：

- quote：{kind:'quote',accountId,symbol,value:{quote,receivedAt,eventTimestamp,sourceTimestamp,transport}}
- status：{kind:'status',accountId,symbol,status,code?,retryable?}
- status取值：connecting/waiting/live/snapshot/reconnecting/unavailable。
- quote含symbol、bid/ask十进制字符串、bidSize/askSize可null、timestamp、timestampSource:'LOCAL_RECEIPT'、source:'BINANCE_STOCKS'、tradingStatus；实际适配器给tradingStatus:'UNKNOWN'。
- receivedAt为服务端接收毫秒；quote.timestamp是其ISO表示。WS eventTimestamp来自E，sourceTimestamp来自可缺T；REST两者为null。不得把收到时刻称为交易所更新时间。

源码：backend/src/validation/contracts.ts:342-432；backend/src/api/stocks-quote-stream.ts:10-46；backend/src/api/binance-stocks.ts:152-171。

依据源码构造的行情帧：

```text
data: {"kind":"quote","accountId":"22222222-2222-4222-8222-222222222222","symbol":"AAPL","value":{"quote":{"symbol":"AAPL","bid":"199.990000000100000000","ask":"200.000000000000000000","bidSize":"10","askSize":null,"timestamp":"1970-01-01T00:00:10.000Z","timestampSource":"LOCAL_RECEIPT","source":"BINANCE_STOCKS","tradingStatus":"UNKNOWN"},"receivedAt":10000,"eventTimestamp":1000,"sourceTimestamp":900,"transport":"WEBSOCKET"}}
retry: 3000

```

这类帧没有event名、id、requestId或序号。status例如{kind:'status',accountId,symbol,status:'unavailable',code:'ACCOUNT_CHANGED',retryable:false}；终止状态必须主动关闭EventSource。

**首个quote不保证是REST。** relay先发送connecting、检查证券规则，再并发readSnapshot和startConnect；WS先到则晚REST被wsRevision保护丢弃。提案“先REST再SSE”是可实现的前端设计，不是后端严格执行顺序；后端自己已经发REST快照，前端不必重复请求一次初始报价。若页面先取REST，订阅上线后必须禁止该旧HTTP结果覆盖新WS。backend/src/services/market-quote-relay.ts:144-165、:246-264。

|机制|实际行为/边界|源码|
|---|---|---|
|静默补读|无stream或距最近有效WS>=5秒，达到nextRest才补；单个REST在途；不是5秒市场更新保证|backend/src/services/market-quote-relay.ts:18、:144-165、:289-297|
|上游重连|1/2/4/8/16/30秒封顶；generation+AbortController丢旧回调；有效quote才重置失败计数|同文件:167-218|
|WS顺序|拒绝E/T倒退；同时间不同报价可接收；指纹含时间/价格/size；非每条必达|同文件:133-142、:185-218|
|REST时序|请求期间有新WS则不覆盖；REST无市场时间，不能按收到顺序推断市场快照更新|同文件:144-158|
|慢消费者|队列每kind仅留最新一条，主动合并中间quote/status；写/心跳3秒超时|backend/src/server/quote-stream.ts:74-78、:108-140|
|权限巡检|独立1.5秒guard检查会话/账户，终止时丢积压quote；1秒abort兜底|同文件:79-107；backend/src/services/market-quote-relay.ts:270-286|
|账户变更|账户ACTIVE/凭据/owner变化终止；交易开关关、管理员禁止交易不必关闭只读行情|backend/src/services/market-quote-relay.ts:36-62、:273-279|
|上游复用|每条SSE独立relay/gateway/上游订阅；没有按symbol共享连接|backend/src/services/market-quote-relay.ts:65-90、:302-315|

### 5.4 连接管理与账户/多标签

- 两流合计**每用户每API进程6条**；connections是内存Map，不是集群全局计数。业务/行情分别30次/60秒建流限制，另有认证请求1000次/60秒。backend/src/server/events.ts:23-37、:58；backend/src/server/quote-stream.ts:26-38；backend/src/server/context.ts:347。
- 同源EventSource可直接带会话Cookie；跨源必须withCredentials:true和精确CORS。GET无写CSRF头需求。HTTP/1浏览器每域并发连接限制与后端6条是两套限制；HTTP/2不会解除后端限额。[MDN SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- 当前每活动标签1业务+1行情，3个标签就可能占满6条；组件不得各自建流。账户切换不需重建身份级业务流，但必须关闭旧账户行情、取消旧查询并切generation。登录身份变化关闭全部旧流。
- 初期采用“每标签至多两流、非当前行情关闭、429/终止后停止重连并给提示、降级REST”；如果确需不限标签共享，另验BroadcastChannel+Web Locks/SharedWorker选主与失效接管。不把复杂leader协议列为无条件依赖。
- Native EventSource无法直接读取握手HTTP状态/body。onerror后做受控身份/状态探测及退避，不盲目快速new EventSource；必要时改Fetch流以读取握手状态，但不得双重重连。
- 没有业务需求证明必须多证券实时自选列表；当前单证券页面可实现。若以后要求同时N证券，以1条业务+N条行情会迅速触顶，届时需有界多证券订阅/上游复用设计，不能仅提高6这个数字。

### 5.5 完整Query失效与恢复规范

下面是建议的前端协议，不是已有实现。所有key先隔离sessionEpoch/user/role，再含account、resource、id、完整筛选/页码。业务事件没有accountId，不能伪装成精确账户级提示。

|提示|应失效/重读的授权资源|
|---|---|
|orders|订单列表/详情、admin/orders；活动任务详情的订单/成交；positions、ledger/admin ledger、overview/admin overview、相关logs；外部holdings/history按页面需要限频读取|
|tasks|tasks列表/详情、admin/tasks、两个overview、任务事件/诊断|
|accounts|账户列表/详情/admin账户、overview、reconciliations；检查当前订阅凭据/状态，变更时废弃该账户行情/目录/持仓/官方历史|
|ledger|普通/admin账本；另保留orders→ledger依赖，补原地更新漏提示|
|events|logs、活动订单/任务事件、admin system/overview|
|settings|admin/system、overview；使预检结果过期，但不自动继续任务|
|users|auth/me、admin/users、admin/overview；撤权以会话终止错误为准|
|audit|admin/audit；禁止因此每次全站重读/重新请求报价|
|worker|overview、admin/system/overview、healthz；不是任务自动恢复命令|
|初连/重连/重新聚焦|上述相关资源+operations未解决列表+正在跟踪的原ID；按TTL重读目录/外部时效数据|
|quote/status|只更新当前account+symbol+generation的行情和连接状态，不改订单/账本|
|写响应|无论HTTP是否2xx，先消费operation，再按kind刷新依赖；不等SSE|

收敛规则：短窗口合并同资源提示，只主动重读正在展示/恢复中的query，非活动query标stale；若GET在途收到提示，保留dirty并在结束后尾随重读，不能因为fetching就丢通知。consume AbortSignal并校验作用域代次，避免旧账户/旧登录返回入新缓存。避免每条quote都invalidate全部行情REST。Query的invalidate会标stale并重取活动query，但不是提交日志或全局事务屏障。[Query失效](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation)、[取消](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation)

operations需要独立有限轮询/主动查询；Worker同状态详情、目录TTL、外部holdings、午夜UTC“今日”变化也不能只依赖现有资源提示。缺事件版本号不是必须上WebSocket的理由；可新增明确协议version与operations等资源，但它们不等于持久游标。资源revision/可靠补播只有在确有可靠增量流需求时才另行设计。

### 5.6 后端建议与验证边界

必须在真实联调前验证业务流慢写撤权：它把会话检查与writeSSE放在同一循环，没有行情流的独立guard/写截止（backend/src/server/events.ts:127-239）。建议复用已有行情模式，非另建通知框架。可增强operations通知、ledger updatedAt和Worker细节比较，但保留REST恢复。

普通HTTP入口设置no-store；Hono streamSSE会改为no-cache，不能声称最终SSE一定no-store。X-Accel-Buffering:no只是响应提示，未证明实际代理不缓冲。源码及安装Hono实现证据见backend/src/server/context.ts:251-252、backend/src/server/events.ts:79-80、backend/node_modules/hono/dist/helper/streaming/sse.js:42-54。本轮只执行内存配额/报价归一化安全用例，未运行PG建流集成、代理或真实浏览器重连。

## 第六章：业务状态与操作恢复分析

### 6.1 本地订单：10个状态与实际转换

[已验证事实：源码] 枚举见backend/src/domain/orders/status.ts:1-14、backend/src/validation/contracts.ts:45-58。状态更新由prepareOrder/dispatch/markUnknown/rejectOrderAttempt/settleObservation及官方状态归一化共同完成，并不是一张仅允许相邻节点的线性状态表。不得让前端自行“补齐必经状态”。

|状态|实际进入与后续转换依据|前端展示/动作边界|
|---|---|---|
|PLANNED|prepareOrder插入原意图/预留；backend/src/services/trading/reservations.ts:113-140；dispatch可转SUBMITTING|尚未证明发送；明确未发送中止写REJECTED|
|SUBMITTING|dispatch先写submitStartedAt再调用SDK；backend/src/services/trading/engine.ts:397-432|结果不确定，禁止重新提交；可核对到受理/成交/终态，异常转UNKNOWN|
|ACCEPTED|有效ack含exchangeOrderId且无取消标记；backend/src/services/trading/engine.ts:460-483；官方NEW/PENDING_NEW也归一化|官方受理不等于有实际成交；另看tradeEvidencePending|
|PARTIALLY_FILLED|官方部分成交经逐笔核验/结算；backend/src/api/normalize.ts:71-72、backend/src/services/trading/settlement.ts:583-609|可仍有挂单；部分量/费用不能由报价推算|
|CANCELING|取消发送前保存cancelStartedAt；backend/src/services/trading/engine.ts:601-626；官方PENDING_CANCEL同义|不再发第二次取消；只核对原单|
|UNKNOWN|markUnknown或官方无法识别/证据冲突；backend/src/services/trading/settlement.ts:64-92|不是失败；保留占用、原标识和恢复入口|
|FILLED|官方终态及完整执行证据；backend/src/domain/orders/settlement.ts:195-250|市价买入可以少花本金；费用/SELL库存仍可能待核实|
|CANCELED|仅完整官方明细结算，非取消ack；backend/src/services/trading/settlement.ts:583-649|已成交部分有效，不能显示为“从未成交”|
|REJECTED|有证据未发送或明确拒绝；backend/src/services/trading/settlement.ts:178-238，或官方拒绝归一化|显示reason区分本地中止/官方拒绝；不是通用网络错误|
|EXPIRED|官方EXPIRED归一化后结算；backend/src/api/normalize.ts:80-81|不是任务窗口到期；30秒本地准备租约过期实际写REJECTED|

全部十态都有源码写入路径。外部状态由backend/src/api/normalize.ts:64-86映射；planSettlement保护累计成交不倒退、终态不回非终态、不同终态冲突、取消标记不被普通观察抹除（backend/src/domain/orders/settlement.ts:107-110、:221-250）。只有本次取消明确ExchangeRequestNotSent且marker匹配，才能清除本次标记并回ACCEPTED/PARTIALLY_FILLED（backend/src/services/trading/engine.ts:647-689）；超时不能这么做。

订单详情GET /orders/:id返回{order,trades,events,source}，safeOrder是行投影加币种：本地UUID/owner/account/task、clientOrderId/exchangeOrderId/idempotencyKey/requestHash、三分支委托、filledQuantity/filledNotional/averagePrice、fee/feePending/feeFinalized/tradeEvidencePending、reservedCash/reservedQuantity/reservationReleased、sellInventoryBaseline/sellInventoryVerifiedAt、提交/取消/核对各时间、reason。成交和事件是该单全部本地记录，无独立分页。backend/src/server/business.ts:302-320；backend/src/server/queries.ts:93-102；backend/src/database/schema.ts:177-224。

### 6.2 订单终态不等于财务闭环

必须显示独立维度：订单生命周期、逐笔证据是否待齐、费用是否最终确认、预留是否释放、SELL库存是否核实。

- 成交以账户+executionId去重；同ID内容冲突不覆盖，不用累计量伪造成交。SDK observe按原clientOrderId读明细，并按exchangeOrderId补齐逐笔历史。backend/src/api/binance-stocks.ts:246-310；backend/src/database/schema.ts:285；backend/src/domain/orders/settlement.ts:111-185。
- 逐笔trades.fee为null，订单fee是累计官方费用；feeDelta另入USD ORDER_FEE，不猜逐笔分摊。backend/src/services/trading/settlement.ts:375-457、:517-528。
- BUY证据齐全终态可先释放、继续追费；有成交SELL须最终费用核实才释放，之后还验证官方可用股数下降。零成交可信终态不强等费用。backend/src/domain/orders/settlement.ts:227-250；backend/src/services/trading/sell-inventory.ts:19-101。
- 新意图仍受未知、未确认取消、费用/成交证据等待、预留异常、SELL库存门禁约束。不得仅凭FILLED/CANCELED把“再买/再卖”解锁。backend/src/services/trading/context.ts:103-124、:194-206；backend/src/services/trading/market.ts:199-217。

### 6.3 批量任务：13态、角色与按钮

[已验证事实：源码] 枚举完整13态，但当前无业务写入VALIDATING、READY、FAILED的路径；它们仍须可识别，不能删类型或设计为必经流程。依据backend/src/validation/contracts.ts:30-44及tasks.ts/settlement.ts/server/queries.ts全部状态写入路径。

下表“允许”是可请求，不保证服务端当次准入通过。编辑/start/resume只交易员；pause/stop/reconcile管理员也可。所有操作仍受目标权限及原操作冲突约束。

|状态|实际来源|编辑|start|pause|resume|stop|reconcile|
|---|---|---|---|---|---|---|---|
|CREATED|createTaskIn保存配置|是|是|否|否|是|是|
|VALIDATING|仅兼容定义，当前不写入|否|否|否|否|是|是|
|READY|当前不写入，但编辑/start接受|是|是|否|否|是|是|
|SCHEDULED|尚未实际开始且预约未来|否|否|是|否|是|是|
|RUNNING|即时/预约实际启动、明确软等待恢复|否|否|是|否|是|是|
|PAUSED|人工/安全暂停、一般执行错误、核对后等待继续|是|否|是|是|是|是|
|RECONCILING|运行中证据待齐，EVIDENCE_PENDING|否|否|是|否|是|是|
|RECOVERY_REQUIRED|硬UNKNOWN、未闭环停止/到期、无来源预留、安全停机|否|否|是但保持恢复直到核对|否|是|是|
|STOPPING|永久停止意图已登记|否|否|否|否|是|是|
|COMPLETED|真实目标完成且原单/预留闭环|否|否|否|否|否|是|
|EXPIRED|窗口结束且未完成，原单已闭环|否|否|否|否|否|是|
|STOPPED|永久停止且原单已闭环|否|否|否|否|否|是|
|FAILED|公开终态兼容，当前不写入|否|否|否|否|否|是|

按钮及来源证据：backend/src/services/trading/tasks.ts:388-427、:461-532、:542-724、:764-936；backend/src/domain/tasks/execution.ts:203-267；backend/src/server/business.ts:403-432；backend/src/server/queries.ts:122-158。

关键转换条件：

1. taskBoundary先判真实完成，再永久停止、窗口到期、硬UNKNOWN、软等待；停止过程中全部成交并闭环可最终COMPLETED，而不是强制STOPPED。backend/src/domain/tasks/execution.ts:203-243。
2. 仅RECONCILING+EVIDENCE_PENDING在阻塞解除后可回RUNNING；无该标记/人工恢复通常到PAUSED。人工pause、安全停止、硬冲突不会自动解除。backend/src/domain/tasks/execution.ts:245-265；backend/src/services/trading/settlement.ts:34-91。
3. start只CREATED/READY，resume只PAUSED，USER_STOP不可恢复；检查原预留守恒、当前资金/库存/规则、用户/账户/平台/Worker。未来预约不提前预留，实际开始再预检。backend/src/services/trading/tasks.ts:542-699。
4. pause不延长窗口，stop永久禁止新增但原挂单可能保留。KEEP不主动撤；AFTER_TIMEOUT从原submittedAt计时，暂停后仍有效；AT_TASK_END只明确停止/实际窗口结束触发，普通暂停不触发。backend/src/domain/tasks/execution.ts:171-187。
5. pause/stop/reconcile以及启动恢复可核对并执行已授权自动撤单；**不是全部只读**。有cancelStartedAt则只核对，不重复取消。backend/src/services/trading/engine.ts:693-727、:1023-1034、:1224-1261。
6. 临时网络/证据陈旧/限流可能延后nextRunAt，其他领域错误通常PAUSED，未预期异常使Worker降级，不统一FAILED。backend/src/services/trading/tasks.ts:904-936。
7. 异常损坏数据下，无活动订单却有预留的检查先于终态返回；不能向用户保证“任何数据状态下终态永不变化”。正常路径的终态守恒由changeState保证。backend/src/services/trading/tasks.ts:334-345、:764-780。

### 6.4 完整任务表单及编辑限制

PATCH /tasks/:id复用完整taskCreateSchema，不是dirty-fields补丁。完整指提交完整有效分支；有默认值的字段遗漏会被重置为默认，不保留旧值。

- 共通：accountId/name/symbol/executionWindowSeconds/scheduledStartAt、executionMode、globalIntervalSeconds、固定/随机interval字段、autoCancelMode/orderTimeoutSeconds、remainderPolicy。
- LIMIT和MARKET SELL：targetQuantity、quantityMode、fixedQuantity、randomQuantityMin/Max；不能混入本金字段。
- LIMIT另有side、priceRule、fixedPrice、priceRounding、tradingSession、timeInForce。
- MARKET BUY：side=BUY、targetNotional、notionalMode、fixedNotional、randomNotionalMin/Max；禁止股数字段；所有MARKET禁止priceRule/fixedPrice/priceRounding/tradingSession，只DAY。
- 当前默认SERIAL、global/fixedInterval=5秒、randomInterval=3–10、KEEP、timeout30秒、EXACT；LIMIT默认ASK_1/REJECT/RTH/DAY。表单必须明确展示，不把服务端默认猜成方向智能取价。

定义：backend/src/validation/contracts.ts:211-316。保存/编辑会读官方规则/报价/挂单数量，不是完全离线草稿（backend/src/services/trading/tasks.ts:234-297、:395-405）。

仅CREATED/READY/PAUSED可编辑，SCHEDULED也要先暂停。冻结按startedAt是否非空，不是“曾点击启动”：账户/证券/方向/orderType固定；预约只能精确等价；窗口只能缩短；目标不得低于已成交+活动委托剩余。原单不撤换，新超时策略仍从原submittedAt算。名称、合法目标/批次/间隔/执行模式/策略等仍可按规则编辑。backend/src/services/trading/tasks.ts:461-536。

RHF中不可改字段采用只读展示+保留原配置，不能因disabled字段被省略破坏完整PATCH。切订单类型要删掉不适用字段；提交前不依靠旧preflight锁定资金，最终服务端拒绝应重新读取并解释。

### 6.5 任务详情能展示什么

完整返回本地task/config、lastInterruption、orders/trades/events、summary（backend/src/server/business.ts:351-402）。不是一份原子多表快照，task先读，数组后并发读；没有数组页长上限。

summary.remaining=target-filled，**没有扣活动委托**，不能显示为“还能再下的数量/本金”。执行规则的remaining另扣活动订单暴露（backend/src/domain/tasks/execution.ts:157-169）。partialOrders按已成交但未达原量/本金判断，不等同status=PARTIALLY_FILLED，可能与filledOrders/canceledOrders重叠，不能相加当互斥分布。lastInterruption=null也不证明从未发生故障（backend/src/server/task-interruptions.ts:43-89）。

已有targetNotional及已成交+活动委托不超目标的本金守恒；缺少的是整任务含费总支出硬预算、平台maxTaskNotional和全周期资金保证。不能说“市价任务没有预算”，也不能说“保存/启动已锁足全部资金”。backend/src/database/schema.ts:139-173、:411-432；backend/src/services/trading/reservations.ts:92-101、:175-192；backend/src/services/trading/tasks.ts:625-667。

### 6.6 原操作回执：独立状态与冻结结果

公开字段实际叫id/actorUserId/kind/targetType/targetId/status/**phase/outcome/result**/error/createdAt/updatedAt/finishedAt。没有stage/conclusion/frozenResult同名字段，也没有公开actorRole、原请求JSON或requestHash。DB保存requestHash/scopeKey，publicReceipt经Zod白名单剥离。backend/src/validation/contracts.ts:679-709；backend/src/services/operations.ts:44-82；backend/src/database/schema.ts:444-477。

|回执状态|实际含义/来源|禁止解读|
|---|---|---|
|PROCESSING|登记且执行者可能仍持锁；backend/src/services/operations.ts:430-450|不能认为请求失败或可再发|
|UNKNOWN|没有可信完成证据，可能部分应用；:489-533|不能认为未应用|
|CONFLICT|枚举/约束/未解决门禁保留；当前未发现写入者|HTTP409不自动等于这条回执状态|
|REJECTED|原操作已证明未应用，或被目标占用拒绝；:331-345、:441-446、:511-525|不证明目标没有其他未知操作|
|SUCCEEDED|该类操作定义的本地应用或核对流程完成|不等于交易/撤单/资产读取成功|

|kind|SUCCEEDED及outcome的真实含义|源码|
|---|---|---|
|ORDER_CANCEL|CANCEL_CONFIRMED、LOCAL_INTENT_ABORTED或TARGET_TERMINAL_OTHER；最后一种可实际FILLED|backend/src/services/operations.ts:231-245、:275-313|
|TASK_CONTROL|CONTROL_APPLIED仅本地控制已提交；reconcile可为RECONCILIATION_COMPLETED；不代表目标任务完成|backend/src/services/operations.ts:201-258、:481-487；backend/src/services/trading/tasks.ts:542-724|
|USER_UPDATE|用户/会话撤销/必要安全暂停及审计已提交；不等于撤掉挂单|backend/src/server/admin.ts:245-367|
|ACCOUNT_RESTRICT|平台限制已提交；解除不自动恢复开关/任务|backend/src/server/admin.ts:412-505|
|ACCOUNT_CHECK|ACCOUNT_CHECK_COMPLETED；result.connectionStatus可以ERROR|backend/src/services/trading/account-assets.ts:99-156|
|ACCOUNT_SYNC|ACCOUNT_SYNC_COMPLETED；读取失败标记也可已保存，HTTP502并存|backend/src/services/trading/account-assets.ts:80-97；backend/src/server/operations.ts:27-46|
|ACCOUNT_RECONCILE|冻结范围处理已完成，result可DIFFERENCE/UNAVAILABLE/PARTIAL|backend/src/services/operations.ts:121-163；backend/src/services/trading/engine.ts:1044-1143|
|PLATFORM_UPDATE|CONTROL_APPLIED，急停/限额已保存；保留原单及占用|backend/src/server/admin.ts:566-624|

phase是自由字符串，实际包括REGISTERED/LOCAL_APPLIED/CANCEL_INTENT/EXTERNAL_STARTED/RECONCILE_STARTED/CONFIRMED；result是可空字典，不可因kind直接强转为最终对象。中途账户核对result可能承载冻结范围而非最终记录。后续对象变化不改原回执。

### 6.7 两条恢复链路，不得合并

**A. 单笔下单**

- 原Idempotency-Key是1–200字符，禁控制字符；作用域owner+key，不是account+key或session+key。未见TTL；30秒是未发送准备租约，不是key有效期。backend/src/database/schema.ts:227-229；backend/src/server/business.ts:289-297；backend/src/services/trading/engine.ts:155、:229-250、:952-989。
- 持久化订单含原key、clientOrderId及本地UUID；同key按原业务字段/Decimal等值检查，匹配直接返回原单，不再次dispatch。backend/src/domain/orders/identity.ts:58-108。
- 已知UUID：GET /orders/:id。只知key/clientOrderId：GET /orders?search=...，取消无关状态/日期筛选，逐页精确核对完整key、owner/account。search是转义后的ILIKE包含、最长100，非精确lookup。key可200这一边界真实存在。backend/src/server/queries.ts:42-63；backend/src/server/business.ts:72-115；backend/src/validation/contracts.ts:338。
- **POST /orders不写operation_receipts；不能通过/operations恢复下单。** 发送前拒绝可能连订单行也没有。列表空/404仍不能证明未执行。新前端可统一生成UUID订单key减少搜索歧义；不意味着可以把未知订单换新UUID重发。通用恢复所有合法历史key宜新增owner范围精确GET，复用现有唯一索引，无需新增表。

**B. 八类原操作**

- UUID全局主键，绑定actor/kind/target/input指纹；不同ACCOUNT kind共享同目标未解决scope互斥。backend/src/services/operations.ts:384-465。
- GET /operations仅未解决候选集，无分页/排序，不是历史；逐个readOperation可能收敛候选为终态再返回。已完成ID丢失后不能靠列表找全。:319-367。
- GET /operations/:id是读取原证据，必要时在执行锁下收敛孤立REGISTERED或原撤单结果；不是绝无DB副作用，但不会重发下单/撤单。:275-350。
- POST /operations/:id/reconcile按原kind核对：ORDER_CANCEL读原单；TASK_CONTROL执行reconcile而非重放原start/stop；ACCOUNT_RECONCILE继续原orderIds/taskIds/historyTo，仅原actor；其他类型不重新做检查/同步/控制。backend/src/server/operations.ts:139-156；backend/src/services/operations.ts:547-591。
- 未解决ACCOUNT_RECONCILE的原actor被禁用后，管理员能看但不能代续。必须先定义有审计的恢复授权流程；不允许新ID绕过scope或伪装原actor。

**没有统一持久回执的动作：**账户创建/保存、任务创建/保存、用户创建、登录/退出/改密、benchmark、preflight；订单提交走订单自身幂等；原订单reconcile无新回执。它们失联不能套统一回执协议，更不能由通用mutation自动重试创建。路由证据见第四章。

### 6.8 跨刷新恢复的前端约束

发送前持久保存最小非敏感定位元数据：用户ID、账户ID、操作种类、目标ID、原订单key/原operation UUID、发起时间及本地待核对标记。不要保存Cookie、CSRF、API凭据或整份账户资产。已有订单UUID及时补记。身份恢复成功后只展示该身份授权记录；本地定位记录是线索，不是业务权威。

|场景|必须做|必须禁止|
|---|---|---|
|刷新/关闭/重开|同身份按原ID读取，持久待核对不因组件卸载丢失|生成新ID重发；把AbortError当服务端撤销|
|重新登录|新CSRF/会话代次，旧原ID仍查；不自动恢复mutation|401后自动重发写入；把登录当原操作未执行|
|账户切换|新query scope；保留原账户未解决定位，关闭旧行情|把原key改绑新账户；用前账户placeholder显示当前资金|
|用户切换/禁用|取消请求、关闭流、清业务缓存；记录按用户隔离|读取/展示另一用户恢复信息；用403/404确认未执行|
|SSE断线|标非实时，REST收敛原对象/回执|自动释放未知、显示交易已失败|
|HTTP超时/429/502|保留status/error/operation；没有终态时只查原ID|按非2xx统一判未应用；换key撤单/下单|
|旧GET晚到|session/account generation隔离，尾随重读；操作保护独立于旧快照|用旧ACCEPTED清除cancelStarted保护；用当前对象覆盖冻结回执|
|原结果未知|恢复面板显示原ID/目标/phase/outcome，按类型允许核对|按倒计时、查无记录、最新价格或余额解锁|
|无回执创建失联|查询已存在对象、提示不能确认原请求，人工核查差异|假造operation ID或自动二次创建|

不持久化整个Query缓存；退出可清敏感内容，但不能把原待核对定位误当“已失败”清除。无回执动作若产品要求和交易指令一样的精确跨刷新恢复，需要新增后端证据协议，不能靠客户端猜测。

## 第七章：安全与权限分析

### 7.1 会话/Cookie/CSRF事实

Cookie在HTTPS API_ORIGIN下名为__Host-equity_production_session，否则无__Host前缀；HttpOnly、HTTPS时Secure、Path=/、无Domain、SameSite默认strict。Cookie和DB会话寿命均8小时，/auth/me不滑动续期。登录返回{data:{user,csrfToken}}，user含id/username/role/canManageAdmins，不含会话token/有效期/status。数据库保存token和CSRF摘要。backend/src/server/context.ts:27-48、:314-348；backend/src/server/auth.ts:55-75；security/index.ts:20-36。

登出只撤当前会话；改密事务内核验旧密码和当前身份、撤全部会话，返回reauthenticate:true，不发新会话。禁用用户或修改canManageAdmins撤该用户全部会话；重新启用不恢复任务。backend/src/server/auth.ts:76-118；backend/src/server/admin.ts:291-354。

Origin按API_ORIGIN+FRONTEND_ORIGINS精确匹配；不允许通配/路径尾斜杠。写方法必须可信Origin；**登录是CSRF token例外，不是Origin例外**。其余POST/PATCH包括preflight/reconcile/check/benchmark/退出/改密均需X-CSRF-Token。GET流不需该头。CORS允许credentials，预检在认证前；认证在来源检查前，匿名受保护请求可能先401。backend/src/server/app.ts:28-36、:62-75；backend/src/server/context.ts:350-376；backend/src/validation/config.ts:5-35。

### 7.2 迟到401：源码已确认路径，浏览器竞态未在本轮复现

失效但格式合法的旧token经过查询无结果后，authenticate调用clearSessionCookie，再抛401。clearSessionCookie删除固定cookieName/Path；新登录也是同名同Path写入。源码：backend/src/server/context.ts:39-40、:314-342；backend/src/server/auth.ts:70。

[技术推断] 旧A请求响应迟于新B登录到达时，删除响应可能删除B。无Cookie/格式非法的401分支不删除，不能说所有401都会删。当前测试backend/tests/server.test.ts:637-640还断言撤销后401含Max-Age=0；该DB分支本轮跳过，不是浏览器复现。

**最小后端修复建议：**去掉authenticate无效会话分支自动清Cookie，只返回401；失效token仍被DB撤销/过期判定拒绝，不降低认证安全；更新相反旧断言并验证新旧响应乱序。无数据库迁移，但改变Set-Cookie行为。

**别漏掉其他删除路径：**logout、password以及管理员自禁用/自改权限仍显式清固定名Cookie（backend/src/server/auth.ts:84、:117；backend/src/server/admin.ts:363-368）。只修401不能宣称所有跨标签Cookie竞态根治。还需统一“旧请求不能删除新会话Cookie”的策略：可评估统一以服务端撤销为权威、避免这些旧响应再清固定名Cookie，或由有审计的会话协议保证顺序；必须验证登录A/B与退出/改密交错，不用比较请求token冒充浏览器条件删除。

**前端可做：**sessionEpoch、consume AbortSignal、忽略旧响应、跨标签广播登录/退出，串行认证流程；**前端不能做：**拦截浏览器应用HttpOnly Set-Cookie，或保证abort一定挡住已到达的删除头。不得401后自动重试危险写请求。

### 7.3 角色矩阵

|动作|交易员|普通管理员|有canManageAdmins管理员|证据|
|---|---|---|---|---|
|读取账户/订单/任务|本人|跨用户|跨用户|backend/src/server/queries.ts:42-91|
|登记账户、改凭据/自用开关|本人|禁止|禁止|backend/src/server/accounts.ts:95-161|
|账户check|本人|禁止|禁止|backend/src/server/accounts.ts:302|
|账户sync/reconcile|本人|允许|允许|backend/src/server/accounts.ts:327-349|
|preflight/下单/直接撤单|本人|禁止|禁止|backend/src/server/business.ts:283-327|
|订单核对|本人|允许|允许|backend/src/server/business.ts:329-331|
|任务创建/编辑/start/resume|本人且状态允许|禁止|禁止|backend/src/server/business.ts:336-350、:403-420|
|任务pause/stop/reconcile|本人|允许|允许|backend/src/server/business.ts:409-432|
|用户创建/启停交易员|禁止|允许|允许|backend/src/server/admin.ts:168-215、:269-290|
|创建/管理管理员及专项权限|禁止|禁止|允许且最后管理者受保护|backend/src/server/admin.ts:183-201、:293-315|
|平台限制/急停/设置/benchmark|禁止|允许|允许|backend/src/server/admin.ts:412-633|
|读回执|原actor或目标ORDER/TASK/ACCOUNT的owner|允许|允许|backend/src/services/operations.ts:70-82|
|接续未解决ACCOUNT_RECONCILE|仅原actor|仅自己发起|仅自己发起|backend/src/services/operations.ts:553-572|

角色创建后不可修改；无改用户名/删除用户/管理员重置密码API。保护最后一位ACTIVE且canManageAdmins=true的ADMIN，不是保护所有ADMIN总数；事务锁防并发撤权。UI不能把管理员当超级交易员，也不能把普通管理员误成完全无管理权。backend/src/database/schema.ts:51-53；backend/src/validation/contracts.ts:137-140；backend/src/server/admin.ts:261-315。

管理员pause/stop/reconcile可能推进旧自动撤单授权，必须说明影响，不标纯只读。账户、用户、平台安全限制保留原挂单/占用，解除不自动resume。backend/src/server/queries.ts:122-158。

### 7.4 缓存与授权撤销

Query key至少包含当前身份/角色/会话代次、账户、资源及参数；身份切换清内存敏感数据，关闭两流，取消在途；账户切换不使用另一账户的keepPreviousData。只在同一账户、同一筛选族翻页时保留前页占位，并标明正在加载。

两流复验会话；行情另验账户归属/凭据/ACTIVE。禁用/权限变化撤session后会终止，但不能保证严格1.5秒内关闭所有连接；业务慢写可能延迟复验，见第五章。HTTP no-store不等于Query自动清缓存。错误中的operationAccepted:false只说明本次尝试登记前拒绝，不证明同ID过去尝试未应用；新会话查原ID后再判断。backend/src/server/context.ts:239-252；backend/src/server/operations.ts:99-130。

### 7.5 存在性差异与最小修补

[已验证事实：源码] ownedAccount/Order/Task先查存在，再验证所有权。不存在返回ACCOUNT_NOT_FOUND/ORDER_NOT_FOUND/TASK_NOT_FOUND，存在但无权返回NOT_FOUND，均404但code/message不同。回执不存在/无权的OPERATION_NOT_FOUND消息也不同。backend/src/server/queries.ts:71-91；backend/src/server/context.ts:407-410；backend/src/services/operations.ts:70-82、:319-323；backend/src/server/app.ts:118-120。

[技术推断] 已知候选UUID可由响应识别对象是否存在；这**不是已证实可读取内容或容易大规模枚举UUID**。最小后端修补统一公开缺失/无权码和消息，内部保留审计，维持404不能证明原操作未执行的说明。前端统一文案无法掩盖网络响应差异。

登录另有条件性信号：仅真实用户有login-user 12次/15分钟桶；其他限制未先触发时，正确用户名错误密码与不存在用户名可能呈现不同429时点。backend/src/server/auth.ts:37-53。该项仅源码推断，未实际探测；后端若治理需保留有界限流，不能删除真实账号保护。

### 7.6 同源、跨源与跨站部署

|部署形态|结论及前置条件|
|---|---|
|同源|推荐；外部静态服务/代理把前端和/api放同一Origin，保留写Origin/CSRF。后端本身不托管前端|
|跨源同站|可行；配置精确FRONTEND_ORIGINS，Fetch credentials:include、EventSource withCredentials:true；跨源不自动等于需SameSite=None|
|跨站|只有HTTPS+SameSite=None才可能可行，还受第三方Cookie限制；CORS正确也不保证浏览器放行|
|HTTPS外部、内部HTTP代理|API_ORIGIN必须是公开HTTPS来源，因为cookie名/Secure由它决定；TRUSTED_PROXY_IPS仅影响可信转发地址/限流|
|Vite本地开发|前端独立Vite服务可直接跨源或代理/api；实际浏览器Origin仍须允许，保持同一localhost/127.0.0.1约定。API Base URL只公开地址，不含密钥|

前端可用相对/api同源路径；跨源通过公开构建配置给完整API origin。代理需要SSE不缓冲、合适超时、SPA history fallback，并为前端HTML设置其自身CSP/connect-src；后端给JSON的安全头不等于静态站点已受保护。依据backend/src/server/index.ts:96-111、backend/src/server/app.ts:28-75、:113-116、backend/src/validation/config.ts:27-34。本轮未改部署配置、未实测浏览器Cookie/代理。

## 第八章：数据表格和数据处理分析

### 8.1 列表/分页完整矩阵

F默认page1/pageSize25，最大100；P={items,total,page,pageSize}位于data中。from/to通常过滤createdAt而不是updatedAt，非法时间顺序422；没有通用排序、cursor、updatedSince或增量协议。普通F.symbol不自动大写，search为转义通配符的ILIKE包含。接口接受F不代表使用全部字段。backend/src/validation/contracts.ts:331-341；backend/src/server/queries.ts:34-63。

|列表|分页/响应/默认与上限|有效筛选|排序|忽略字段、数组边界、增量能力|源码位置|
|---|---|---|---|---|---|
|本地/admin订单|P，1/25/max100|F全部；search→clientOrderId/idempotencyKey/symbol/reason|createdAt↓,id↓|无动态排序/增量；search非精确key|backend/src/server/business.ts:72-79、:95-115|
|普通/admin任务|P，1/25/max100|F全部；search→name/symbol/reason|createdAt↓,id↓|无按nextRunAt排序/增量；附lastInterruption|backend/src/server/business.ts:80-87、:116-137|
|admin用户|P，1/25/max100|owner→用户id、status、时间、search用户名/role|createdAt↓,id↓|accountId/symbol忽略；无独立role过滤|backend/src/server/admin.ts:142-167|
|普通账户|数组，无limit|owner/account/status/时间/search标签或Key末四位|createdAt↓|symbol/page/pageSize忽略，但非法页长仍被schema拒绝|backend/src/server/accounts.ts:77-94|
|admin账户|P，1/25/max100|同普通账户|createdAt↓,id↓|symbol忽略|backend/src/server/admin.ts:374-411|
|名义持仓positions|P，1/25/max100|owner/account/symbol/时间|symbol↑,id↑|status/search忽略；无官方可卖值|backend/src/server/business.ts:434-484|
|普通/admin账本|P，1/25/max100|F；status→type、search类型/描述；symbol经订单关联|createdAt↓,id↓|symbol筛选排除无对应订单条目|backend/src/server/business.ts:88-94、:138-166|
|admin审计|P，1/25/max100|owner→actor、status→result、时间/search；account→targetId、symbol→details.symbol|createdAt↓,id↓|accountId不是查该账户所有关联对象的审计|backend/src/server/admin.ts:517-548|
|业务日志logs|三源union的P，1/25/max100|F；status→type，search消息/类型，account/symbol按对应记录|createdAt↓,文本id↓|无level筛选；非服务器运行日志文件|backend/src/server/business.ts:508-603|
|核对记录|数组，无limit|owner/account/status/时间|createdAt↓|symbol/search/page/pageSize忽略|backend/src/server/business.ts:488-507|
|operations|数组，无limit；无query schema|内部未解决候选+读取权限|未指定|无分页/筛选/总数，读取可收敛成终态；非全历史|backend/src/services/operations.ts:319-367|
|官方订单历史|P，1/25/max100；默认最近7天|symbol/from/to/page/pageSize；账户path|上游顺序，无本地保证|非本地订单；7天非最大跨度；size≤100但未再断言上游rows长度；无增量|backend/src/api/binance-stocks.ts:39-74、:329-344|
|官方成交历史|同上|同上；无公开orderId筛选|同上|内部网关按订单过滤不代表HTTP开放；fee固定null|backend/src/api/binance-stocks.ts:345-361；backend/src/api/normalize.ts:113-128|
|本地全局成交|无独立列表API|只订单/任务详情内相关记录|详情filledAt↑|不能用官方成交历史冒充本地已入账成交|backend/src/server/business.ts:302-320、:351-402|
|证券目录symbols|P+source/fetchedAt/expiresAt；1/25/max100|accountId必需、search≤128、refresh|symbol↑|总证券无固定白名单/总条数限额；按页读取不是增量|backend/src/services/market-catalog.ts:28-37、:338-458|
|官方持仓候选holdings|完整snapshot+items，最多10000项，超出拒绝不截断|accountId必需|上游顺序|无分页/search；额外字段不生效；空数组不制造任意证券零库存|backend/src/validation/contracts.ts:644-665；backend/src/services/equity-holdings.ts:23-49|

详情数组：订单trades按filledAt↑、events按createdAt↑均全量；任务orders按createdAt↓，trades按filledAt↑、events按createdAt↑均全量。overview recentOrders≤10、issues≤20；admin overview recentEvents≤5；admin system events≤10、heartbeats无limit。backend/src/server/business.ts:228-244、:304-318、:353-370；backend/src/server/admin.ts:108-115、:551-560。

所有列表都没有稳定增量游标。offset页在持续写入时可移动；前端加载更多可按page实现并以ID去重，但必须标为分页重读，不声称完整一致历史快照。from/to不是订单更新增量。缺结果/空页与请求失败分开处理。

### 8.2 Table、Grid与Virtual的结论

**TanStack Table足以实现当前读取型表格需求，但不是现成DataGrid。** 需要封装数值字符串排序/显示、币种/来源/空值、状态动作列、分页模式、列宽/固定列、键盘/可访问性和错误/陈旧态。每个资源声明真实能力，不统一显示后端不支持的排序/筛选控件；当前页排序必须标“本页”，不能冒充全库排序。

不要求订单/成交/账本任意单元格编辑；没有对应后端写API。若未来要求Excel范围选择、批量粘贴编辑、透视/复杂分组，AG Grid可能比自研合理，且部分能力属Enterprise；必须一起评估授权和真实业务API，而不是现在提前引入。AG社区版已有常规排序/过滤/分页/虚拟化。[AG版本边界](https://www.ag-grid.com/react-data-grid/community-vs-enterprise/)

TanStack Virtual按测量引入：每页25–100行不自动需要虚拟化；10000候选或大详情可降低DOM，但不能减少后端查询/JSON/网络/内存。优先补任务详情子资源分页及需要的本地成交API。新增只读查询未必需要表迁移，索引仍需容量评估。前端切片不是服务端分页。[Table分页](https://tanstack.com/table/latest/docs/framework/react/guide/pagination)

### 8.3 金融数值

|数据|真实表示/精度|前端正确处理|依据|
|---|---|---|---|
|委托限价|正数字符串，最多2小数，最大字面999999999.99|保留原串，非法拒绝；不借报价精度放宽|backend/src/validation/contracts.ts:85-88|
|股数/目标/固定批次|正字符串，≤1000000，最多10小数；随机常规批次为整数|文本输入，Decimal比较；不能parseFloat后提交|backend/src/validation/contracts.ts:70-84、:227-237|
|市价本金/目标/批次|最多12整数+18小数正字符串|与股数分支分开，不推算成确定股数|backend/src/validation/contracts.ts:89-98、:269-284|
|官方价格/费用与DB金额|金额numeric(38,18)、股数numeric(30,10)；Amount精度50/HALF_EVEN，格式18/10位|原始证据保留高精度；显示舍入不回写|backend/src/database/schema.ts:29-30；backend/src/domain/shared/decimal.ts:3-8；backend/src/api/normalize.ts:21-38|
|预留费用|max(本金×费率,最低预留)向上取分，估算|显示“费用预留估算”，不是实际费率/成交费用|backend/src/domain/funding/buy-reserve.ts:7-17|
|实际费用|订单累计fee可null，feePending/feeFinalized独立；逐笔fee可null|不把未知填0，不按比例虚构逐笔费用|backend/src/services/trading/settlement.ts:379-393、:516-527|
|资金余额|Funding USDC free快照；cashBalance恒null，Spot另列|未知/null与明确"0"不同；不与USD名义额相加|backend/src/services/account-projection.ts:9-51；backend/src/api/binance-wallet.ts:51-76|
|可用资金/预留|当次free减尚未发送PLANNED占用；已在交易所冻结不重复扣|不自行用free-reservedCash计算可下单预算|backend/src/services/trading/market.ts:182-198、:238-280|
|名义持仓|本地成交重放份额/成本，不补外部来源|展示LOCAL_LEDGER，非官方总库存或可卖量|backend/src/domain/orders/nominal-position.ts:20-88|
|盈亏|realizedPnl数据库默认0，无当前计算写入；unrealizedPnl/markPrice/quoteTimestamp为null|已实现盈亏标“不提供”，不能把默认0当已确认零收益|backend/src/database/schema.ts:305-307；backend/src/services/trading/settlement.ts:486-499；backend/src/server/business.ts:459-474|
|概览/账本|USD成交名义流量，balanceAfter=null，cashFlowVerified=false|不伪称完整现金结算或官方盈亏|backend/src/services/trading/settlement.ts:440-449；backend/src/server/business.ts:215-227、:270-271|

字符串可以贯穿输入/缓存/协议；仅排序、合计、差额等需要decimal.js。固定两位格式只用于明确金额展示，不将所有原始报价/成交均价截为两位。Intl.NumberFormat现代规范可直接格式化精确字符串，但旧实现可能先Number；目标浏览器能力需验，必要时以Decimal字符串+分组格式化保精度，不绕经Number。[Intl文档](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/format)

### 8.4 时间精度、时区及计划输入

- interval是JSON number，0.1–86400秒、最多3小数；实际取任务globalInterval与本批间隔最大值，随机按整数毫秒抽样。执行窗口整数1–604800秒，超时撤单整数1–3600秒。backend/src/validation/contracts.ts:206-224；backend/src/domain/tasks/execution.ts:79-98、:171-180。
- SERIAL从前单闭环后计时，INTERVAL从受理后计时；暂停/重启不补发过期批次、不延长原截止。backend/src/services/trading/tasks.ts:789-815；backend/src/services/trading/engine.ts:485-502。
- 计划输入要求完整秒UTC Z、合法日历/0001–9999年；去尾零后最多6小数在服务层校验，公共z.string().datetime()并不包含全部限制。.123456000Z可保存，.0000001Z新建拒绝。backend/src/domain/tasks/scheduled-start.ts:7-31；backend/src/services/trading/tasks.ts:368-396。
- **无损编辑使用task.config.scheduledStartAt原串**。顶层scheduledStartAt经PG→Drizzle Date→JSON可能只剩毫秒，不能回填覆盖config。精确等价编辑保留旧原文与时间列，历史更高精度未修改也保留。backend/src/database/schema.ts:148；backend/src/services/trading/tasks.ts:476-519；安装mapper backend/node_modules/drizzle-orm/pg-core/columns/timestamp.js:30-35。
- 6位存储不是6位调度保证：调度读取顶层Date与25ms调度通道，亚毫秒提前边界是待验证推断；若要求绝不早于微秒时刻，应后端用精确时间门槛，不能前端宣称已满足。backend/src/services/trading/tasks.ts:619-623、:679-685、:738-743、:817-825。
- “今日”概览按UTC00:00，不是纽约交易日；市场24H/EXTENDED是准入能力，不是前端固定时段就保证成交。backend/src/server/business.ts:179-180；backend/src/domain/securities/admission.ts:92-171。

**最终时间方案：**原始UTC字符串是唯一提交/恢复事实；Intl只格式化UTC、America/New_York和本地展示。原时间未改直接回传原串。若仅明确UTC文本编辑，专用精确字符串解析器即可，不需要date-fns；若按纽约/用户IANA时区编辑，新增Temporal适配（缺原生时使用经锁版验证的polyfill），拒绝春季不存在时间、对秋季重复时间要求选择明确offset，并展示UTC确认。不能用Intl做反向时区转换，也不能用普通Date/常规日期库承诺微秒往返。[Temporal](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal)

本报告采用后者作为完整IANA编辑建议，但尚未安装/验证polyfill。MUI Picker和Astryx DateTimeInput都必须经原串/精度适配，不为换组件顺手增加dayjs+date-fns+moment多套库。[MUI时区](https://mui.com/x/react-date-pickers/timezone/)

### 8.5 资产真实性表达

safeAccount中walletSyncError存在则funding=null，availableCash=null；保留旧walletSnapshot与lastSyncAt只供历史。明确funding.free="0"仍是成功取得的零，缺Funding项则未知。buyReady不校验余额>0或年龄；sellReady/tradingReady不核验某证券库存，因此只是连接/开关准备条件。backend/src/services/account-projection.ts:12-42；backend/src/services/trading/account-assets.ts:60-66、:139-142。

holdings是当次Funding非零候选，sourceUpdatedAt恒null；空items不能给任意证券制造零库存。可卖证据另校验EQ_身份、free、15秒请求时效及本地占用。locked/freeze/withdrawing不加入可卖；候选与PreflightResult.availableQuantity也不是同一口径。backend/src/api/equity-balance.ts:145-243；backend/src/domain/securities/sell-inventory.ts:25-58；backend/src/services/trading/market.ts:323-352。

账户核对冻结orderIds/taskIds/historyTo；DIFFERENCE优先（本地未闭环或官方非本地订单），其次UNAVAILABLE（资金/历史证据不可用），其余PARTIAL。展示details.walletError/historyError等次级错误；PARTIAL不代表全持仓/现金/费用一致，unresolved筛选也没有单列feeFinalized=false。backend/src/services/trading/engine.ts:1044-1124。

当前字段足以保守区分“最近取得/历史保留/当前未知/已确认零/本地名义”；不足以提供完整资产更新时间或分来源失败时间。walletSyncError还可能来自连接check的规则/私有流失败，即使钱包读取成功，也不能一律翻译“钱包API失败”。需要细化时由后端增加结构化lastAttemptAt/来源结果，不能用updatedAt推算。backend/src/services/trading/account-assets.ts:110-142；backend/src/api/binance-wallet.ts:122-146。

[已验证事实：源码] /overview不接受accountId，账户卡片选择当前身份范围内ACTIVE优先、创建时间倒序的第一条；任务/订单/今日成交等统计按整个授权身份范围聚合，不是该卡片单账户统计。管理员调用时可跨所有用户。前端必须标明“授权范围概览”，不能账户切换后只换标题把它当选中账户报表；如需单账户概览须后端明确支持过滤。backend/src/server/business.ts:176-250。

## 第九章：Astryx可行性分析

### 9.1 已查到什么，尚未证明什么

**[外部技术判断] Astryx能承担基础UI，但本报告不建议现在将它冻结为生产主设计系统。** 本轮读取官方Getting Started、Icons、Styling、Tailwind层顺序、官方仓库Beta说明，以及已发布0.7.11包的Table、Selector、TextInput、NumberInput、DateTimeInput声明和部分源实现。没有安装Astryx，没有运行浏览器原型；可访问性、移动端输入、焦点返回、中文IME、组合性能仍是待验证事项。

不能说“Beta所以不能用于生产”，也不能把Meta内部使用历史当作本仓库公开Beta API已稳定的证明。选择MUI是对当前无前端、以交易管理为主且优先长期维护的工程取舍，不是本项目MUI已通过验收。

### 9.2 逐项业务能力

|需求|证据与结论|必须验证/适配|
|基础按钮、状态、弹窗、抽屉|官方组件目录包含管理UI基本能力，未发现需要另建完整基础库的证据|危险动作的确认、焦点陷阱/归还、Escape、读屏、窄屏滚动；不能仅看目录判通过|
|复杂表格|0.7.11 Table入口导出selection/sortable/pagination/columnResize/stickyColumns/filtering/tree等插件，TableProps同时支持data驱动与children模式|不是“只有样式表格”；选择Astryx插件或TanStack Table之一管理状态。若用后者，只用Astryx展示部件，禁双重排序/分页|
|Select/Combobox|Selector有options、hasSearch、loading、value/onChange、清空/只读/移动表面；导出useCombobox|本地搜索不等于服务端证券搜索。需原型验证外部输入受控、远程分页、IME和大目录；必要时使用专用Typeahead而不是装载全市场|
|RHF适配|TextInput字符串value、onChange(value,event)、ref；Selector为受控值并有htmlName|用Controller映射onBlur/ref/status与空值；DateTimeInput清空给undefined，RHF须转为约定null/空串；不得重复register|
|金融输入|NumberInput的value/onChange是number；已读resolveNumberInputCommit源码将越界值钳制到min/max|**不直接用于金额、价格、股数**。用TextInput+inputMode+公开字符串Schema；错误显式展示，不自动钳制或四舍五入。任务间隔等JSON数字另行验证|
|计划时间|DateTimeInput声明支持YYYY-MM-DDTHH:MM或带秒形式，hasSeconds默认false；combineDateTime仅拼接date+T+time，没有UTC/IANA或微秒语义|不能将后端UTC Z原串直接作为可无损往返的控件值；另建计划时间适配/原串保留，详见第八章；MUI Picker也不自动解决该问题|
|Tabler Icons|官方Icon接受SVG组件，主题icons及registerIcons可覆盖语义名，支持按size映射|用Tabler SVG/元素映射close、warning等；需要编译确认SVG props/ref；不要运行时复制全部图标注册|
|CSS Variables+Tailwind4|官方tailwind-theme.css以@theme reference inline映射同一token；有正式Vite+Tailwind示例|首个CSS必须声明reset/theme/base/astryx-base/astryx-theme/components/utilities层顺序；测试portal、暗色、preflight和自定义token冲突|
|Beta升级|仓库仍标Currently in Beta；0.7样式文档明确移除旧类名/主题选择器；theme-neutral 0.7.11的core peer锁0.7.11|锁完整版本和lockfile；升级core/theme/CLI成组，检查迁移和行为；不能混用Canary文档|
|swizzle|已发布组件预编译，无须消费方StyleX编译；官方明确swizzle复制原StyleX源码后必须有编译插件|不把swizzle作为默认定制路径；优先props/theme/组合。确需fork时明确维护者、上游diff、测试和升级成本|

依据：[Astryx安装](https://astryx.atmeta.com/docs/getting-started)、[样式](https://astryx.atmeta.com/docs/styling)、[层顺序](https://astryx.atmeta.com/docs/styling-libraries)、[图标](https://astryx.atmeta.com/docs/icons)、[Table已发布声明](https://unpkg.com/@astryxdesign/core@0.7.11/dist/Table/index.d.ts)、[TableProps](https://unpkg.com/@astryxdesign/core@0.7.11/dist/Table/Table.d.ts)、[SelectorProps](https://unpkg.com/@astryxdesign/core@0.7.11/dist/Selector/Selector.d.ts)、[TextInputProps](https://unpkg.com/@astryxdesign/core@0.7.11/dist/TextInput/TextInput.d.ts)、[数值提交实现](https://unpkg.com/@astryxdesign/core@0.7.11/src/NumberInput/numberInputCommit.ts)、[日期声明](https://unpkg.com/@astryxdesign/core@0.7.11/dist/DateTimeInput/DateTimeInput.d.ts)、[日期实现](https://unpkg.com/@astryxdesign/core@0.7.11/src/DateTimeInput/DateTimeInput.tsx)。

### 9.3 独立选择与反对理由

本报告选择**MUI常规组件+唯一主题系统+TanStack Table**作实施基线；不引入MUI X DataGrid、MUI X Picker、AG Grid和Astryx并行体系。MUI官方支持React19，Table是可组合的原生表格层，适合让TanStack管理分页/列而由UI库负责显示。默认Emotion增加样式运行时成本，接受该成本换取成熟组件和维护路径；没有实测数据声称它性能更优。[MUI安装](https://mui.com/material-ui/getting-started/installation/)、[Table](https://mui.com/material-ui/react-table/)

Chakra也可行，但当前同样需要管理表格和精确时间适配，官方仍使用Emotion；没有证据使它相对MUI成为本项目更低成本的默认。[Chakra安装](https://chakra-ui.com/docs/get-started/installation/)

若用户保留Astryx：先做三张原型——完整批量任务表单（六位小数时间/条件字段/不可改字段）、订单详情与未知撤单恢复、带远程分页的监管表。验收桌面/手机、IME、键盘、屏幕阅读、主题、连接生命周期及大数据。全部通过后可采用Astryx；不需要为了证明选型而改后端金融规则。

## 第十章：问题及改进清单

优先级：P0在开放真实业务写入前必须闭环；P1正式联调/主体开发前建议解决或明确限制；P2条件性扩展/维护优化。以下全部是建议，未自动实施。相同问题在前文有完整协议分析，这里给出可分派的最小行动。

### 10.1 P0：正确性、安全及恢复门禁

#### P0-001：不能把SSE失效等同于强一致；业务流慢写撤权缺少独立边界

- 问题/实际行为：业务流按max/count提示，缺操作回执等资源；GET在途与提示可交错；业务流复验会话和write在同循环。后两者的陈旧/撤权延迟是技术推断，不是本轮网络复现。
- 源码位置/关键实现：backend/src/server/events.ts:127-239（eventRoutes）；backend/src/services/trading/settlement.ts:530-541（账本原地更新）；对照backend/src/server/quote-stream.ts:79-116（独立guard/写截止）。
- 前端影响：提示漏失/过期GET可能长期陈旧；慢消费者可能延迟失效会话终止，不能仅以连接在线显示“当前真实”。
- 建议：按5.5资源映射、epoch/AbortSignal/尾随重读、有限REST轮询；后端复用行情流的独立授权guard和有界写等待。不能靠加序号或换WebSocket宣称解决。
- 是否需要后端：**是，授权及时终止加固**；缓存收敛由前端完成。数据库变更：否。现有行为影响：超时/撤权连接更早终止，交易规则不变。
- 验证：隔离PG慢读客户端撤权、回执单独变化、在途GET跨提示、ledger仅更新币种；浏览器断线/重连。现有只覆盖部分，不能只测正常首帧。

#### P0-002：下单与回执恢复协议必须拆开，未知保护须跨刷新

- 问题/实际行为：POST /orders只持久订单，自身幂等；/operations只八种控制/管理操作且列表不含全部终态历史。提案统一“查原订单及回执”不够精确。
- 源码：backend/src/server/business.ts:289-332；backend/src/services/trading/engine.ts:952-989；backend/src/services/operations.ts:319-367；backend/src/validation/contracts.ts:679-688。
- 影响：组件重建/退出/401若丢原ID，可被误当新意图；operationAccepted:false或404也不能证明早前同ID未执行。
- 建议：发送前持久最小定位记录；两条恢复链、按原ID只读/核对；未知不换ID、不重复取消、不自动重试无回执创建；明确无回执动作的人工确认边界。
- 后端：现有新前端使用UUID key+分页精确核对可先实现，通用lookup增强另见P1-002。DB：否。行为影响：前端阻止不安全重发，不改交易规则。
- 验证：提交后丢响应、刷新/重登/切账户、完成后响应丢失、列表无结果、旧快照回退；验证SDK实际发送次数而非mock返回次数自证。

#### P0-003：错误/回执/null契约缺失会误判原操作结果

- 问题：声明未包含所有全局错误，details误为null、Worker/settings漏null、必需原ID头未表达；HTTP错误可与SUCCEEDED并存。
- 源码：backend/contracts/client.d.ts:538-567、:1449-1467、:2824-2827；backend/src/server/queries.ts:190；backend/src/server/admin.ts:137、:558；backend/src/server/operations.ts:27-46；backend/src/services/trading/account-assets.ts:80-97。
- 影响：统一throw-on-non2xx后丢operation，可能重复执行已应用控制；静态非空使离线/缺设置页错误。
- 建议：明确ApiErrorBody/可选operation/WorkerState/settings/SSE错误联合；error.details以真实JSON建模；Fetch保留HTTP+error+operation+data，按kind/phase/outcome解析result。
- 后端：**是，公共投影/导出类型**；前端同步解析。DB：否。行为影响：以契约修正为主，不应改业务处理；显式状态码须保持当前HTTP值。
- 验证：无心跳、缺设置、缺原ID、CSRF前置拒绝、blocker回执、502+SUCCEEDED、429+SUCCEEDED/UNKNOWN、health503 data、流内error。

#### P0-004：金融真实性标签不能由ready、终态或默认零推导

- 问题：buyReady不检查余额正值/年龄，sellReady不验证证券库存；realizedPnl默认0却无计算，PARTIAL不是全账户一致；终态也可费用/库存未闭环。
- 源码：backend/src/services/account-projection.ts:12-50；backend/src/database/schema.ts:305-307；backend/src/services/trading/settlement.ts:486-499；backend/src/services/trading/engine.ts:1053-1124；backend/src/domain/orders/settlement.ts:227-250。
- 影响：将未知/历史值显示成当前资产、将名义仓当可卖、将核对完成说成全量一致，可能诱导错误交易。
- 建议：分来源/时间/币种/可用性；禁用“默认零盈亏”展示；订单生命周期与证据/费用/预留/库存独立显示；以当次preflight/服务端准入决定动作。
- 后端：保守UI可不改；建议把未计算realizedPnl公开投影改为null/availability，需同步契约。DB：不必。行为影响：若改投影是消费者字段语义变化，不改账本。
- 验证：明确零、缺记录、旧成功快照、后续失败、部分成交终态、DIFFERENCE伴walletError、PARTIAL但费用待齐。

#### P0-005：迟到401可删除新会话Cookie

- 问题/证据：authenticate无有效行时clearSessionCookie（backend/src/server/context.ts:314-342），固定名删除（:39-40）；backend/src/server/auth.ts:70同名登录写入。
- 实际行为与边界：删除头分支已确认；“旧A响应晚于新B导致B删除”为技术推断，本轮未复现浏览器E2E。不是所有401都删除。
- 影响：新登录被旧响应破坏，多标签/重登录恢复不可靠；前端epoch不能拦Set-Cookie。
- 建议：无效会话认证分支不自动清Cookie；一起审查logout/password/管理员自撤权显式删除与新登录交错，避免局部修复冒称全部解决。
- 后端：**必须**。DB：否。现有行为影响：改变Cookie清理策略，旧token仍被撤销/过期拒绝；同步旧测试断言，不为测试保留竞态。
- 验证：真实浏览器延迟旧401、先完成新登录后释放响应；再测退出/改密/自撤权和跨标签。无前端代替方案。

#### P0-006：无权与不存在对象有可区分响应

- 问题：账户/订单/任务缺失返回专用NOT_FOUND，无权返回另一code/message；回执同码也有不同message。
- 源码：backend/src/server/queries.ts:71-91；backend/src/server/context.ts:407-410；backend/src/services/operations.ts:70-82、:319-323；backend/src/server/app.ts:118-120。
- 实际行为：源码分支直接确认差异；仅证明候选ID存在性信号，不证明数据内容泄露或容易枚举UUID。
- 建议：后端统一对外404码/消息或授权范围内查询，保留内部审计和“404不证明未执行”语义；前端统一文案不能修API。
- 后端：**是**。DB：否。行为影响：错误契约变化，现有消费者依赖错误码需同步。
- 验证：本人/他人/不存在同类对象、回执三组；登录存在/不存在用户名限流时点差异另行核实，不削弱限流保护。

#### P0-007：原操作者失效后的账户核对恢复授权必须先定义

- 问题：未解决ACCOUNT_RECONCILE只能原actor继续，管理员虽可读不能代续；原actor禁用后无公开接管接口。
- 源码：backend/src/services/operations.ts:121-163、:553-572；backend/src/server/admin.ts:319-354。
- 实际行为/影响：这是现有安全门禁，不是可绕过漏洞；可能形成无人可续的账户scope阻断，UI不能假装管理员有恢复按钮。
- 建议：上线前明确有审计的人工恢复流程。若接受重新授权原操作者，由管理流程显式处理并仍按原ID/冻结范围继续；若要求管理员接管，必须单独设计最小授权和审计接口，不能伪装actor或换ID重核。
- 后端：保持原actor流程可不改；**需要管理员接管时必须后端授权实现**。DB：取决于接管审计持久化设计，不预先承诺无迁移。行为影响：新增接管会改变权限边界，须专项批准。
- 验证：原actor被禁用/权限变更/重新授权，管理员GET和POST分离，冻结范围/历史上界不变。

#### P0-008：数值与计划时间输入不得静默丢精度

- 问题：金融数据精确字符串；config计划时间最多六位有效小数。Number/Date及通用UI控件不能直接无损往返。
- 源码：backend/src/validation/contracts.ts:70-98、:206-224；backend/src/services/trading/tasks.ts:368-396、:476-519；backend/src/database/schema.ts:148。外部发布实现：Astryx numberInputCommit会钳制，DateTimeInput无UTC/微秒协议，见第九章。
- 影响：输入本金/股数改变或“未改时间”变成真实修改；DST可落错时刻。
- 建议：字符串金融输入+Decimal；保留config原串；IANA编辑明确Temporal/歧义处理，禁止未授权舍入/钳制；只有展示可舍入。
- 后端：正常前端适配不需；若要求微秒级不早执行，另修精确调度门槛。DB：前者否，后者通常无需改现有时间列。行为影响：前端正确映射；调度门槛修正涉及亚毫秒行为。
- 验证：18位小数本金、10位股数、6位/尾零/历史高精度时间、未改保存、纽约DST重复/缺失时刻、实际目标浏览器Intl。

### 10.2 P1：联调及主体开发准备

|编号/问题|源码与实际行为|影响/最小建议|后端/DB/行为影响|
|---|---|---|---|
|P1-001 前置拒绝指纹归一化不同|backend/src/server/operations.ts:70-82、:99-126用raw；backend/src/server/admin.ts:412-423用parsed；backend/src/validation/contracts.ts:156 trim；backend/src/services/operations.ts:44-58、:394-415比较hash|同ID同JSON仅修CSRF可能误冲突；正常与前置拒绝共用合法输入规范化，非法JSON另定义拒绝指纹，不忽略冲突/覆盖原回执|后端是；DB否；修同意图识别，不重执行业务。HTTP/PG输入对待复现|
|P1-002 缺精确原订单key GET|backend/src/server/business.ts:72-115、:289-297；filterSchema.search≤100而key≤200|新前端用UUID可规避长度但仍模糊；完整历史恢复增加owner范围精确lookup，复用owner/key唯一索引|后端增强；DB无新表，索引已有；只读API扩展|
|P1-003 SSE资源覆盖/摘要不足|backend/src/server/events.ts:159-215无operations等，ledger看createdAt，worker仅online/status|前端先有限轮询；后端补operations资源/ledger updatedAt/必要Worker细节，不宣称持久补播|后端可选增强；DB可不变；增加通知/负载需兼容未知资源|
|P1-004 全局本地成交及大详情分页|backend/src/server/business.ts:302-320、:351-402、:488-507；backend/src/services/operations.ts:352-367|全局本地成交页面无API；大任务数组无界。按真实产品页新增分页子资源/成交查询；普通单账户无需为统一壳强分页|后端是（要完整该页/规模支持时）；DB未必、索引评估；新增查询能力|
|P1-005 任务总预算需求未闭环|backend/src/database/schema.ts:139-173、:411-432；backend/src/services/trading/tasks.ts:625-667；backend/src/services/trading/reservations.ts:175-192|已有本金目标守恒，无整份含费支出/平台maxTaskNotional/融资保证；UI明确边界。原要求整份预计资金评估如保留须后端提供|仅表达不改；新增硬预算需后端/可能迁移；会改交易门禁，不能本轮顺手做|
|P1-006 资产尝试/来源诊断不完整|backend/src/services/trading/account-assets.ts:60-66、:110-142；backend/src/api/binance-wallet.ts:122-146|walletSyncError非严格钱包单源失败；无独立attemptAt。先写“本次证据不可用”，需精细诊断则增加结构化来源结果|后端按需求；新持久字段需迁移设计；增强资产诊断，勿改变旧快照可用性|

P1-001最小可复现输入设计（**未执行HTTP/DB**）：同一活动管理员、同一账户、可信Origin、同一UUID及相同JSON {adminTradingBlocked:true,adminBlockReason:" x "}；第一次缺/错CSRF，raw指纹保存空格；第二次有效CSRF，strict schema将原因trim为x，hash不同。反向顺序亦需验证。安全修复不是在409时自动生成新UUID重做。

### 10.3 P2：条件性扩展与维护成本

|编号/问题|源码/外部依据与影响|最小建议|后端/DB/行为影响|
|---|---|---|---|
|P2-001 原请求参数不可回显|operation_receipts仅requestHash；公开schema无请求JSON，backend/src/database/schema.ts:444-461、backend/src/validation/contracts.ts:694-708|如果保留提案“原参数”功能，增加白名单脱敏requestSummary；不能从hash还原，也不能把result当原请求|需后端才可完整支持；持久摘要新增字段通常迁移；读取契约扩展，不存凭据|
|P2-002 UI Beta与swizzle长期成本|Astryx官方仍Beta，0.7选择器迁移、主题同版要求|默认MUI；若选Astryx先三原型/锁版，默认不swizzle；非“缺组件导致不可实现”|后端/DB均无；前端工具链选择|
|P2-003 多标签/多证券容量|backend/src/server/events.ts:23-37；backend/src/server/quote-stream.ts:19-38；relay每连接独立|先每活动标签两流，明确降级；真实多证券需求再有界复用/多订阅|当前前端即可；未来后端扩展无需当然改DB；限制/负载行为改变|
|P2-004 协议版本与制品可追溯|backend/scripts/export-contracts.ts:9、:41-43仅banner，meta只apiVersion|发布manifest关联版本/commit，验证validation依赖白名单；前端不自动以latest升级|导出工具配合；DB否；不改交易|
|P2-005 可靠增量/补播|backend/src/server/events.ts:123-239没有持久游标|当前REST收敛足够；如未来确需中间事件必达再设计持久提交序/重放，不因SSE id存在就承诺|新能力需后端及可能DB日志；不是当前必需改造|

以上没有建议为了UI库改订单状态机、交易SDK调用或Worker交易规则。需要改变权限、预算或调度的建议必须另行授权实施。

## 第十一章：修订后的最终技术栈

### 11.1 不受原提案约束的最终决策

本表是建议的实施基线，不是本轮已实施结果。保留不等于可以跳过协议/原型验收；版本锁定以随后独立安装与目标浏览器测试为准，不盲目追latest。

|技术|原提案|独立审查结论|最终建议|调整理由|
|---|---|---|---|---|
|React|19|适合业务管理SPA|保留19，同版react-dom/types|后端HTTP无框架绑定，没必要SSR/BFF|
|TypeScript|拟采用|适合状态/输入联合|保留strict，按验证版本锁定|当前后端TS7可作参考，不让类型掩盖网络unknown|
|Vite|拟采用|独立SPA适配|保留；本轮观测8.3.7|只需静态构建/开发代理，不增加应用服务器|
|Astryx|主设计系统|有条件可行，未完成本项目原型，Beta风险真实|**替换主UI为MUI；Astryx暂缓**|成熟管理控件路径优先，不是因组件少或协议不兼容|
|MUI|明确不引入|与React19兼容，常规组件可组合|**新增主UI；本轮观测9.5.0**|减少基础交互自维护；仍须金融输入/时间适配|
|Tailwind CSS|v4|Astryx桥可行，但最终基线非必需|**删除默认依赖**|MUI主题/sx与少量CSS已覆盖；不叠两套重置/主题。若改选Astryx可恢复|
|Design Tokens|Astryx CSS Variables|应只有一个主题拥有者|**替换为MUI CSS Variables+项目语义token**|状态色/间距/暗色单一来源，不保留双主题同步层|
|Emotion|不引入|MUI默认引擎依赖|**新增所选MUI引擎所需依赖**|不是无意增加第二套CSS；不同时采用StyleX自定义编译|
|Tabler Icons|拟采用|SVG可用于两候选UI|保留|按名导入，一套语义图标映射|
|TanStack Router|拟采用|适合URL过滤与角色工作区|保留1.x|loader协调Query，不额外复制服务数据|
|TanStack Query|拟采用|适合但不是强一致引擎|保留5.x并加协议收敛|取消/代次/尾随失效/独立恢复，不乐观记账|
|Zustand|客户端/行情Store|当前没有必须引入证据|**简化并暂缓**|URL/局部state/Query单一拥有者；将来高频实测后再选vanilla store|
|React Hook Form|拟采用|完整条件任务表单适配|保留7.x|Controller+公开输入schema，避免disabled漏字段|
|Zod|拟采用|公开模块可复用，内部规则不可搬|保留4.6.7兼容范围|z.input/output分清；补公开缺口不手抄Schema|
|@hookform/resolvers|未显式列出|RHF与Zod的必要集成辅助|**新增支持Zod4版本**|仅安装所用resolver及Zod，不因optional peers装所有校验库|
|TanStack Table|拟采用|当前只读表足够，需业务外壳|保留；采用9版API/锁版|不同时开启Astryx/MUI Grid第二套表格状态引擎|
|AG Grid/MUI X DataGrid|暂不引入/未列|复杂Excel需求出现时重新评估|暂缓|目前无任意交易事实编辑/透视/Excel粘贴需求|
|TanStack Virtual|按需|只优化DOM，不修API无界响应|暂缓、测量后引入|优先服务端分页；25–100行不预设瓶颈|
|Native EventSource|拟采用|现有Cookie GET SSE可用|保留并增强生命周期管理|不需要自定义鉴权头；补重连/终止/配额/回读|
|Native Fetch|拟采用|覆盖现有接口|保留|完整结果封装、原ID必需参数、禁写重试|
|Backend Contracts|直接复用|来源正确但不完整|**保留并调整**|修错误/空值/流联合/回执结果，派生DTO不导入服务源码|
|Hono RPC|待定|可行备选，不是必要|暂不引入hc运行时；保留类型工具可用|当前已有hc声明，不为Fetch再做后端重构|
|OpenAPI/workspace|未确定|当前非必要|暂缓|多语言/多消费者需求再驱动，不重复维护协议|
|decimal.js|按需|精确展示计算/排序必要|保留10.x；纯转交仍用字符串|不复制交易资金计算权威|
|Native Intl|优先|适合展示，不负责精确序列化|保留|按语言/币种/时区格式化，能力测试防Number损失|
|IANA Time Zone|必须|正确，需DST输入策略|保留UTC/纽约/本地|不硬编码UTC-5|
|Temporal/精确时间适配|未定|IANA墙钟输入+微秒编辑需可靠转换|**新增适配；缺原生时polyfill**|原始UTC字符串仍权威；不同时引入多套日期库|
|date-fns/Day.js/Moment|暂不引入|不自动解决微秒语义|继续不引入默认基线|不为日期控件把原串降级为Date|
|i18next/react-i18next|推荐|多语言需求未确认|暂缓运行库，集中中文文案|Intl保留；以后明确语言范围再引入|
|Vitest|拟采用|适合前端逻辑|保留开发依赖|精度/恢复/解析行为测试，不测复制线缆|
|React Testing Library|推荐|适合组件可见行为|保留，配DOM或浏览器环境|控件适配/错误/权限/键盘状态|
|Playwright|拟采用|浏览器会话/SSE必需|保留开发依赖|Chromium/Firefox/WebKit及真Safari关键验收分开|
|MSW|推荐|安全开发夹具适合|保留开发依赖|不能代替真实隔离API/PG证据|
|Sentry|推荐|有价值但数据外送需批准|暂缓启用|先脱敏/数据驻留/DSN策略，禁默认为金融数据Replay|
|Redux/Socket.IO/图表/React Compiler|明确不引入或暂缓|没有当前必要证据|继续不引入|不因审查扩大为行情研究/框架统一项目|

**新增的真正基础设施不是更多框架：**会话代次协调、原ID定位日志、Operation Recovery、协议解析/错误分型、资源依赖刷新映射、精确时间/金额展示适配、独立契约制品版本。它们是交易客户端必要的小型领域模块，不是通用事件总线或前端交易引擎。

### 11.2 版本与环境冻结方式

本轮公开元数据观测：React19.3.1、Vite8.3.7、TS7.0.2、Router1.170.46、Query5.107.1、Table9.3.1、RHF7.91.0、Zod4.6.7、Tabler3.51.0、Vitest5.1.0、RTL16.3.3、Playwright1.65.0、MSW3.0.4、Temporal polyfill0.5.1。它们是候选版本证据，不是组合已通过证明。

建议Node24 LTS作为前端构建/测试基线，Bun可作包管理；后端继续现有Bun，不要求统一运行时。Vitest5与MSW3对Node的要求比“Vite能启动”更严格；浏览器还要满足BigInt、Intl、所用CSS/组件功能。后续在独立前端目录锁版本，验证安装、类型、构建、浏览器；本轮没有装包或下载测试浏览器。

### 11.3 修订目录与职责

建议目录（设计建议，未创建）：

```text
src/
├── app/                     # router、providers、session及business-sync
├── routes/                  # 路由装配与权限入口
├── features/
│   ├── auth/
│   ├── accounts/
│   ├── market/              # API、单证券stream、显示状态
│   ├── orders/              # 下单意图及订单寻回
│   ├── tasks/               # 完整配置、状态/按钮映射
│   ├── operations/          # 原操作定位、回执与恢复协调
│   ├── reconciliations/     # 核对范围和差异结果
│   ├── positions/
│   ├── ledger/
│   └── administration/     # 用户、监管、审计、系统
├── components/              # 少量共享UI、领域无关表格展示层
├── shared/
│   ├── http.ts              # Fetch及公共响应边界
│   ├── contracts/           # 后端发布制品，类型派生
│   ├── event-source.ts      # 传输生命周期，不拥有业务对象
│   ├── decimal.ts
│   └── time.ts
└── theme/                   # 单一MUI主题与必要CSS
```

与原提案相比：

1. 每个feature就近维护api.ts/query-options.ts/表单映射/页面，只在复杂时拆目录；不同时维护services/api/resources/orders和features/orders/api两份入口。
2. shared/http只传输和解析公共包，不持有业务状态；调用方传当前会话上下文，避免shared反向依赖features。每个领域请求函数显式要求对应原ID。
3. app/session负责代次和登录生命周期；user/账户等服务器对象由Query拥有。不存在auth Store和auth Query双份用户真相。
4. selected account/symbol、分页和筛选优先URL；弹窗/草稿归页面。侧栏等偏好才可非敏感持久化，不预建全局stores目录。
5. business-sync把资源提示映射到query keys；market/stream管理单证券订阅及quote/status。SSE传输和REST传输分开，但共享认证/作用域/错误约定，不能完全割裂成互不知晓的缓存系统。
6. Operations是跨领域原指令证据/恢复；Reconciliations是账户/订单核对过程与结果视图。两者独立业务职责、可相互链接，不重复实现引擎或一个泛化“恢复所有对象”的抽象。
7. 行情初期由一个Query key承载当前快照，status放同领域连接状态；HTTP初始读取与流写入由该领域协调，拒绝旧generation/晚REST覆盖。不是Query保存REST、Zustand另保存WS再竞争渲染。
8. 不预建全局schemas/hooks/utils堆积目录；只有真正跨域且稳定的金额/时间/协议放shared，业务类型从contracts派生，不另拷DTO。


## 第十二章：前后端联调前置条件

### 12.1 必须先完成/明确的工作

|门禁|责任与验收标准|能否边做普通页面边推进|
|---|---|---|
|协议基线|后端修C01–C08等关键错误/空值/原操作边界，导出版本绑定；前端编译消费者真实DTO，不用any掩盖|可先做无交易UI；协议未稳不开放写入|
|Cookie竞态|后端处理无效会话自动删除及其他显式删除路径；真实浏览器证明新Cookie不受旧响应影响|认证联调前必须闭环|
|三状态及金融语义|共同确认状态/按钮、SUCCEEDED含义、部分核对/未知/零/PnL标签；设计不得反向改变后端规则|必须先定，展示可并行实现|
|原ID恢复|前端发送前定位持久化、区分订单与operations、未知只核对；后端明确精确lookup和原actor失效流程|交易表单联调前必须可验证|
|SSE最低协议|确认message而非命名事件、两流6配额、重连全资源重读、无补播、回执轮询；业务流慢写撤权边界|连接层实现前必须确定|
|权限隔离|角色矩阵、缺失/越权响应、用户禁用/会话撤销、多标签清理|认证/管理员功能联调前完成|
|时间/数值|完整config原串、Decimal、DST策略、原值不被UI钳制、UTC今日口径|真实订单/任务提交前完成|
|环境|独立前端依赖/锁文件/Node基线、API Base URL、精确Origin、Cookie same-site策略、代理SSE/SPA/CSP|启动联调前确认，不默认CORS即跨站Cookie可用|
|安全验收环境|独立临时PG、合成用户/账户/注入官方gateway，禁止连接正式资金；需另行授权建库/迁移执行|不得直接运行生产API/Worker来测试UI|
|主UI冻结|MUI或用户坚持的Astryx均需三关键原型，覆盖键盘、IME、移动、精度和恢复|基础视觉可原型；全站铺开前通过|

只有报告完成不是上述门禁通过。本轮没有执行任何修复，不自动转入开发。

### 12.2 前端开发期间可完成的事项

- 读取页面、每资源真实分页适配、错误/空/陈旧态、状态文案与权限入口。
- MSW协议夹具、RHF条件字段、表格列设置、金额显示；所有mock明确标为开发数据，不提供用户Demo交易模式。
- 小范围业务SSE失效合并、当前证券行情、跨标签提示；多证券复用/leader机制仅有实际需求才追加。
- 契约manifest、独立构建探针、响应schema逐步补强；不导入服务端源码。
- 大详情容量测量后确定分页接口优先级；不因先做虚拟滚动取消后端分页需求。
- i18n/Sentry数据治理可后置，不影响核心中文交易界面；启用外部监控前必须授权。

### 12.3 必须覆盖的验收情景

|领域|情景及正确结果|验证层|
|---|---|---|
|请求/契约|缺字段/未知字段、不同分支、null/空数组/错误、缺原ID、health503、blocker details、非2xx+成功回执|现有后端定向契约+独立客户端编译/解析|
|单笔订单|三类输入、预检拒绝、受理/拒绝/部分成交、超时后刷新、原key寻回、取消未知、终态追费/库存|隔离PG+真实HTTP+注入gateway；断言发送与账本不变量|
|任务|完整PATCH、SCHEDULED先暂停、startedAt冻结、缩短窗口、EXACT/FIXED、SERIAL/INTERVAL、旧授权撤单、软等待与人工恢复|领域/DB+浏览器流程；不重开原窗口|
|回执|PROCESSING/UNKNOWN/REJECTED/SUCCEEDED、TARGET_TERMINAL_OTHER、候选列表读成终态、原actor失效、原参数缺失|隔离锁/事务测试+UI恢复面板|
|SSE|初连/重连无补播、重复/遗漏资源、最后报价不新鲜、先WS后REST、慢写撤权、配额满、429建流、账户换凭据|真实隔离流HTTP+浏览器，不能全靠MSW|
|身份|旧401晚到、退出/改密响应交错新登录、跨标签、用户禁用、管理员越权交易、不同用户缓存|Playwright真实Cookie；额外真Safari关键场景|
|资产|未知/明确零/旧快照、Funding/Spot/名义仓分离、readiness不是许可、PARTIAL伴次级错误、PnL未计算|合成可信证据+组件显示断言|
|时间/数值|极限小数、舍入不回写、微秒原串未改保存、纽约春秋DST、UTC今日跨日|纯逻辑+目标浏览器；需要时验证PG微秒|
|表格/容量|不同分页形态、无效筛选不生效、实时offset移动、大任务详情、10000候选、键盘/列固定/滚动|隔离容量测试+UI测量；不编造性能阈值|

尚未定义完整预算/本地全局成交/原参数回显时，必须在产品验收清单写明边界或先补后端能力，不能让前端通过虚构值“做完页面”。

## 第十三章：最终建议

### 13.1 八个明确回答

1. **技术栈现在能否冻结？** 不能把原提案整体冻结。可冻结React/TS/Vite、Fetch+公开契约、REST权威+SSE辅助的方向；建议主UI改MUI、去默认Tailwind、暂缓Zustand/i18n/Sentry，锁版和三原型通过后冻结实现组合。
2. **是否调整API？** 是，先补公共错误/空值/回执边界；精确原key查询、全局本地成交与大详情分页按完整页面需求补。无需为Fetch/hc重构所有路由。
3. **是否调整SSE？** 基本协议可用；业务流慢写撤权应加固。operations、ledger更新和Worker细节通知建议补；版本字段可改善演进，持久补播/多证券不是当前无条件必需。
4. **是否调整状态契约？** 不改交易状态机枚举；明确哪些状态当前不写入、允许动作及订单/任务/回执三维，补回执按kind/phase的结果类型和业务错误。不能SUCCEEDED统一显示“交易成功”。
5. **是否增加后端字段/接口？** 完整历史精确寻回、本地全局成交、详情分页需要相应只读能力；原请求参数回显需脱敏摘要，资产细分尝试需新证据字段。前端不能从hash、旧快照或默认零补造。
6. **哪些完全前端处理？** 原ID定位持久化、两条恢复链、禁止写重试、query作用域/取消/尾随失效、按资源分页、金额字符串、时间原串、状态/来源/空值标签、当前证券连接生命周期和敏感缓存清理。
7. **哪些必须后端解决？** 迟到Set-Cookie、业务慢流撤权、对外存在性响应、实际声明/错误投影不一致、前置拒绝指纹归一化；如要求管理员接管/含费硬预算/新增查询，则必须后端真实实现，不能UI绕过。
8. **哪些共同定义？** 协议版本与部署配套、错误与回执结果语义、原actor失效恢复授权、多标签/多证券容量、资产新鲜度标签、DST输入、无回执动作未知确认、UI库原型与真实联调验收。

### 13.2 本轮执行证据

- 初始只读Git：git status --short --branch与git log -5 --oneline；HEAD 6fa779e，dev领先9，仅现有中文提案未跟踪。没有执行提交/推送/重置/stash/清理。
- 已完整读取两份输入、实际后端模块、52路由/请求绑定/响应及错误出口、公开声明/校验、数据库/迁移结构、Worker/SDK适配、状态/回执/资产与相关现有测试源码。五个只读分工结果由主审合并，关键高风险分支再次直接读取核对。
- LSP状态：本项目未配置语言服务器，使用源码阅读/结构和目标搜索，未冒称获得LSP引用证据。
- 类型检查（backend目录）：bun run typecheck；实际输出“$ tsc --noEmit”，退出成功。
- 定向安全验证：Bun1.4.3，关闭.env自动加载、显式RUN_DATABASE_TESTS=0、LOG_FILE_ENABLED=false，数据库URL仅指向127.0.0.1:1的合成不可用测试地址，使用合成主密钥，不读取真实凭据。执行如下：

```sh
RUN_DATABASE_TESTS=0 LOG_FILE_ENABLED=false \
DATABASE_URL=postgres://review:review@127.0.0.1:1/equity_review_no_connect \
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 \
bun --no-env-file test tests/server.test.ts tests/security-event-stream.test.ts \
  tests/market-quote-relay.test.ts tests/trading/policy.test.ts \
  tests/trading/scheduled-start.test.ts tests/trading/market-orders.test.ts \
  tests/quote-price-rounding.test.ts
```

实际输出：**80 pass，9 skip，0 fail；2090 expect() calls；89 tests across 7 files；288.00ms。** 覆盖无DB HTTP来源/公开合同、内存SSE配额、报价归一化/建连abort、订单/任务纯规则、市价证据、精确时间及价格舍入。9项DB/隔离HTTP/真实流相关分支被跳过；不是89项全通过，也不是前端E2E。

- 第三方：本轮读取官方技术资料和公开已发布包/metadata，仅HTTP读取，无安装。Astryx类型/源码来自0.7.11，不把Canary或main新能力冒充该版本运行结果。
- 未执行：contracts:export/check（写临时目录）、build、全套test:db、迁移、API/Worker启动、正式API或资金账户连接、真实买卖/撤单、前端创建、任何浏览器原型/压力测试。没有用未执行测试的存在冒充通过。
- 残余验证：迟到Cookie/慢流撤权的实际浏览器时序、PG锁/空值HTTP路径、导出字节一致性、前端独立安装/构建、代理SSE、实盘SDK行为、容量、DST及真Safari均待后续授权验证。

### 13.3 外部技术资料索引

以下为本轮已读取资料。外部版本/能力结论以该次读取为依据，后续安装应重新核对锁定版本，不以文档主页的“latest”作为可重复构建约束。

|主题|来源|
|---|---|
|Astryx Beta/架构|[官方仓库](https://github.com/meta/astryx)、[安装](https://astryx.atmeta.com/docs/getting-started)、[图标](https://astryx.atmeta.com/docs/icons)|
|Astryx样式与Tailwind|[Styling](https://astryx.atmeta.com/docs/styling)、[Tailwind桥/层顺序](https://astryx.atmeta.com/docs/styling-libraries)|
|Astryx精确发布包|[core0.7.11 metadata](https://registry.npmjs.org/@astryxdesign/core/0.7.11)、第九章各已发布源码/声明链接|
|MUI/Chakra|[MUI安装](https://mui.com/material-ui/getting-started/installation/)、[Table](https://mui.com/material-ui/react-table/)、[Picker时区](https://mui.com/x/react-date-pickers/timezone/)、[Chakra安装](https://chakra-ui.com/docs/get-started/installation)|
|Query及替代|[失效](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation)、[取消](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation)、[RTK Query tags](https://redux-toolkit.js.org/rtk-query/usage/automated-refetching)|
|Router|[外部数据加载协调](https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading)|
|Table/Grid|[当前Table分页](https://tanstack.com/table/latest/docs/framework/react/guide/pagination)、[AG Community/Enterprise](https://www.ag-grid.com/react-data-grid/community-vs-enterprise/)|
|表单|[RHF Controller](https://react-hook-form.com/docs/usecontroller/controller)、[TanStack Form](https://tanstack.com/form/latest/docs/overview)|
|状态管理|[Zustand createStore](https://zustand.docs.pmnd.rs/reference/apis/create-store)、[React useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)|
|传输/契约|[MDN SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)、[Hono RPC](https://hono.dev/docs/guides/rpc)|
|构建/浏览器|[Vite要求](https://vite.dev/guide/)、[Tailwind兼容](https://tailwindcss.com/docs/compatibility)|
|时间/金额|[Temporal](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal)、[Intl精确字符串格式化](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/format)|
|测试/监控|[RTL设置](https://testing-library.com/docs/react-testing-library/setup/)、[Playwright浏览器](https://playwright.dev/docs/browsers)、[Sentry脱敏](https://docs.sentry.io/platforms/javascript/guides/react/data-management/sensitive-data/)|

包版本/engine/peer证据来自npm公开metadata：
[React](https://registry.npmjs.org/react/19.3.1)、[Vite](https://registry.npmjs.org/vite/8.3.7)、[TypeScript](https://registry.npmjs.org/typescript/7.0.2)、[MUI](https://registry.npmjs.org/@mui/material/9.5.0)、[Router](https://registry.npmjs.org/@tanstack/react-router/1.170.46)、[Query](https://registry.npmjs.org/@tanstack/react-query/5.107.1)、[Table](https://registry.npmjs.org/@tanstack/react-table/9.3.1)、[RHF](https://registry.npmjs.org/react-hook-form/7.91.0)、[Resolvers](https://registry.npmjs.org/@hookform/resolvers/7.0.5)、[Zod](https://registry.npmjs.org/zod/4.6.7)、[Tabler](https://registry.npmjs.org/@tabler/icons-react/3.51.0)、[Zustand](https://registry.npmjs.org/zustand/5.1.0)、[Vitest](https://registry.npmjs.org/vitest/5.1.0)、[RTL](https://registry.npmjs.org/@testing-library/react/16.3.3)、[Playwright](https://registry.npmjs.org/@playwright/test/1.65.0)、[MSW](https://registry.npmjs.org/msw/3.0.4)、[Sentry](https://registry.npmjs.org/@sentry/react/11.11.0)、[i18next](https://registry.npmjs.org/i18next/27.0.1)、[react-i18next](https://registry.npmjs.org/react-i18next/18.0.1)、[Temporal polyfill](https://registry.npmjs.org/@js-temporal/polyfill/0.5.1)。peerDependencies中的optional项不是全部安装清单。

### 13.4 最终验收问题索引

|验收问题|报告答案位置|
|---|---|
|技术栈真正适配吗|第一、三、十一章：有条件可行，独立修订而非全票通过|
|每个业务模块有API吗|第四章52项；全局本地成交/原参数回显等缺口明确列出|
|两条SSE能支撑吗|第五章：单证券和最终快照可行，非可靠增量/补播|
|未知订单能安全恢复吗|6.7–6.8：保原ID，订单和operations分开，查不到不重发|
|三套状态能映射吗|6.1–6.6：完整枚举、实际写入、按钮与闭环区分|
|当前契约够完整吗|4.5 C01–C12：不足以原样全信，补类型而非强换RPC|
|金融/时间精度可处理吗|8.3–8.4：字符串、Decimal、config原串、明确IANA转换|
|权限能隔离吗|第七章：服务端已隔离，Cookie/错误差异等仍须修补|
|Astryx能承担吗|第九章：基础能力有条件可行，主UI默认建议MUI，未冒充UI验收|
|开发前必须解决什么|第十、十二章：P0门禁、最小后端修复和联调条件|

本次交付至审查报告结束。后续后端修补、前端工程或技术选型实施均等待单独指示。
