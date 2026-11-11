# 独立接入、请求示例与验收

- 状态：现状参考；后端3.0.0，源码基线`596849a`。
- 前置：[总览](README.md)、[HTTP与事件](http-and-events.md)、[写入与恢复](write-and-recovery.md)。
- 本文描述如何消费现有后端，不指定前端框架、页面布局或状态管理库；不提供运行时模拟交易开关，也不授权真实交易。

## 1. 契约交付与独立项目

新调用方只需要公开API访问地址、业务资料和两份公开文件：

|材料|使用方式|
|---|---|
|`backend/contracts/client.d.ts`|仅类型导入`ApiClient`；由Hono推导每个方法的请求与响应，不运行声明中的`contract`|
|`backend/contracts/validation.ts`|运行时使用Zod schema及公开状态／标签／精度规则；不改写为第二份DTO|
|本目录及`PRODUCT.md`|业务意义、权限／状态、传输、错误／恢复与已知运行空值规则；不能只依赖静态类型|
|公开API根地址|只给客户端公开地址与可选部署挂载前缀，不给数据库、主密钥或交易所凭据|

后端显式运行`bun run contracts:export`生成快照、`bun run contracts:check`检查过期。客户端将这两个文件作为发布时明确同步的输入，正常安装、构建和运行不得启动后端导出器、导入服务内部源码或借用父目录依赖。

当前公开依赖版本为Hono 4.13.13、Zod 4.6.7；已使用TypeScript 7.0.2核对声明。该版本记录不是所有工具链的兼容保证。新项目按自己的依赖清单与锁文件安装公开库，独立类型检查；任何框架或编译器升级都应重新验证消费结果，而不是加`any`掩盖不兼容。

以下是类型化请求的完整调用示例，不含自动重试、凭据持久化或未知结果裁决。`apiRoot`例如`https://service.example.invalid`，若代理挂载于`/binance`则为`https://service.example.invalid/binance`；都不再包含`/api/v1`，因为Hono公开路径已经含有该段。

```ts
import { hc, type InferRequestType } from 'hono/client';
import type { ApiClient } from './contracts/client';

type NewOrder = InferRequestType<ApiClient['api']['v1']['orders']['$post']>['json'];

export function createApi(apiRoot: string): ApiClient {
    return hc(apiRoot, {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
            fetch(input, { ...init, credentials: 'include' }),
    }) as unknown as ApiClient;
}

export async function sendOriginalOrder(
    apiRoot: string,
    input: NewOrder,
    csrfToken: string,
    originalKey: string,
): Promise<{ response: Response; body: unknown }> {
    const response = await createApi(apiRoot).api.v1.orders.$post(
        { json: input },
        { headers: { 'X-CSRF-Token': csrfToken, 'Idempotency-Key': originalKey } },
    );
    const body: unknown = await response.json();
    return { response, body };
}
```

返回值仍保留HTTP状态和`unknown`载荷，是为了按HTTP／恢复资料核验普通错误、可信回执及原身份，不能因为`.json()`的静态类型而先写入“成功”。非JSON、连接中断和超时也不能替换为成功或空业务结果。

使用原生fetch／EventSource时，必须保留代理挂载前缀；`new URL('/api/v1/...', apiRoot)`会丢弃基址中的挂载前缀。可以统一使用以下路径构造，不把来源白名单误填成含路径的URL：

```ts
export function apiUrl(apiRoot: string, internalPath: string): URL {
    const root = apiRoot.endsWith('/') ? apiRoot : `${apiRoot}/`;
    return new URL(internalPath.replace(/^\/+/, ''), root);
}
```

`apiUrl(apiRoot, '/api/v1/auth/me')`用于身份读取；`apiUrl(apiRoot, '/healthz')`仍是同一挂载下的健康路径。API来源配置本身只包含协议、主机、端口；客户端访问基址可以另含代理挂载路径，两者职责不同。

## 2. 从首次打开到功能就绪

1. 读取公开元数据与健康。版本、服务可达、Worker健康、账户准备度和当次可交易是不同事实；健康失败不伪装无订单或零资产。
2. 用带凭据的`GET /api/v1/auth/me`恢复身份；未认证才进入登录流程。登录从返回的`user/csrfToken`建立当前身份范围；旧会话的迟到结果不能直接覆盖当前内存状态，但浏览器仍可能处理旧401的清Cookie响应，删除新Cookie。可观察到旧代401时须暂停写入、重新读取当前身份，见[HTTP与事件](http-and-events.md)第3.3节。
3. 按角色读取账户及对应概览。没有账户时保留“未配置”事实，不生成虚构账户、资金或持仓。
4. 交易员经账户接口提交凭据、执行带UUID原ID的连接检查／资产同步，再按业务规则启用交易；连接检查成功不是官方交易资格或资金证明。
5. 分别获取官方证券目录、报价、Funding资金、官方持仓候选与本地业务记录；买入全市场目录与卖出库存候选不合并为同一准入白名单。
6. 根据角色、当前状态、未解决回执、费用／库存门禁及窗口决定可发起动作；客户端判断不能取消服务端当次校验。
7. 建立业务SSE与当前账户／证券的行情SSE。资源提示后读取权威数据；重连重新对齐，不把流连接成功当成交易健康。
8. 启动高风险动作前保存非敏感原操作身份；结果不确定后按同一ID恢复。退出、重新登录、账户切换和停止等待不等于后台业务撤销。
9. 管理员使用监管、用户、平台限制与急停接口；管理权限不允许直接买卖、启动／恢复交易任务或直接撤单。

具体可编辑字段、模式、状态动作和原ID要求分别见[业务资料](backend-model-and-actions.md)、[接口目录](api-catalog.md)及恢复文档，不从旧调用方习惯推导。

## 3. 可校验的订单与任务请求

以下账户UUID为虚构测试标识；示例用于理解和校验请求，不是可在真实账户发送的交易指令。数量／价格／本金是字符串；任务间隔、窗口与随机整数边界是JSON数字。示例只传对应模式适用的字段；省略字段的默认值见业务资料。

### 3.1 LIMIT订单：`orderCreateSchema`

```json
{
  "accountId": "00000000-0000-4000-8000-000000000001",
  "symbol": "AAPL",
  "orderType": "LIMIT",
  "side": "BUY",
  "price": "100.00",
  "quantity": "2",
  "tradingSession": "RTH",
  "timeInForce": "DAY"
}
```

### 3.2 MARKET BUY订单：`orderCreateSchema`

```json
{
  "accountId": "00000000-0000-4000-8000-000000000001",
  "symbol": "AAPL",
  "orderType": "MARKET",
  "side": "BUY",
  "notional": "100.123456789012345678",
  "timeInForce": "DAY"
}
```

### 3.3 MARKET SELL订单：`orderCreateSchema`

```json
{
  "accountId": "00000000-0000-4000-8000-000000000001",
  "symbol": "AAPL",
  "orderType": "MARKET",
  "side": "SELL",
  "quantity": "2.5",
  "timeInForce": "DAY"
}
```

### 3.4 LIMIT任务：`taskCreateSchema`

```json
{
  "accountId": "00000000-0000-4000-8000-000000000001",
  "name": "限价股数目标示例",
  "symbol": "AAPL",
  "orderType": "LIMIT",
  "side": "BUY",
  "targetQuantity": "20",
  "quantityMode": "FIXED",
  "fixedQuantity": "5",
  "priceRule": "FIXED",
  "fixedPrice": "100.00",
  "priceRounding": "REJECT",
  "tradingSession": "RTH",
  "timeInForce": "DAY",
  "executionWindowSeconds": 3600,
  "scheduledStartAt": null,
  "executionMode": "SERIAL",
  "globalIntervalSeconds": 5,
  "intervalMode": "FIXED",
  "fixedIntervalSeconds": 5,
  "autoCancelMode": "KEEP",
  "remainderPolicy": "EXACT"
}
```

### 3.5 MARKET BUY任务：`taskCreateSchema`

```json
{
  "accountId": "00000000-0000-4000-8000-000000000001",
  "name": "市价本金目标示例",
  "symbol": "AAPL",
  "orderType": "MARKET",
  "side": "BUY",
  "targetNotional": "1000",
  "notionalMode": "FIXED",
  "fixedNotional": "100",
  "timeInForce": "DAY",
  "executionWindowSeconds": 3600,
  "executionMode": "INTERVAL",
  "globalIntervalSeconds": 5,
  "intervalMode": "FIXED",
  "fixedIntervalSeconds": 5,
  "autoCancelMode": "KEEP",
  "remainderPolicy": "FIXED"
}
```

### 3.6 MARKET SELL任务：`taskCreateSchema`

```json
{
  "accountId": "00000000-0000-4000-8000-000000000001",
  "name": "市价股数随机批次示例",
  "symbol": "AAPL",
  "orderType": "MARKET",
  "side": "SELL",
  "targetQuantity": "20",
  "quantityMode": "RANDOM",
  "randomQuantityMin": 1,
  "randomQuantityMax": 3,
  "timeInForce": "DAY",
  "executionWindowSeconds": 3600,
  "executionMode": "SERIAL",
  "globalIntervalSeconds": 5,
  "intervalMode": "RANDOM",
  "randomIntervalMin": 5,
  "randomIntervalMax": 10,
  "autoCancelMode": "AFTER_TIMEOUT",
  "orderTimeoutSeconds": 30,
  "remainderPolicy": "EXACT"
}
```

schema通过只证明输入结构和公开校验，不能证明该证券允许碎股、资金足够、库存可卖、时段有效或订单会成交。完整配置更新须保留未编辑的原UTC字符串和小数精度，不从展示Date重建JSON；新的或真实修改的计划时间超过6位有效小数仍会被服务端拒绝。

## 4. 安全隔离与验证命令

后端现有`bun run test:db`或`bun scripts/test-db.ts`从唯一`DATABASE_URL`取得同实例连接参数，在本次专用`equity_test_*`临时库迁移和运行测试，结束后清理该库；正式业务表不作为夹具。维护账号须有连接维护库、建库权限；这不是另设测试数据库配置。

已存在的定向入口可在`backend/`运行：

```sh
bun run contracts:check
bun scripts/test-db.ts tests/server.test.ts tests/operations-http.integration.test.ts tests/sell-http.integration.test.ts tests/trading/market-orders.integration.test.ts
```

这些命令验证后端和契约，不是新前端已经通过验收。新调用方的交互／集成测试应使用本次临时库、合成用户及隔离官方网关，或仅进行明确只读的授权检查；不得启动带真实凭据的Worker后为制造成功而下单。不得伪造`TRADING_ENV`、Testnet或本地模拟产品模式，也不得把外部网络拦截结果当真实交易所认证。

## 5. 新调用方完整验收清单

每项都要记录实际环境、身份／对象范围、输入、HTTP／事件／权威结果、未覆盖项和清理结果；本表是验收要求，不是本轮运行结果。

|编号|场景|必须验证的消费者行为|
|---|---|---|
|A01|首次访问、登录、身份恢复与退出|匿名／有效／失效会话区分；Cookie与CSRF按协议；退出不被描述成交易撤销|
|A02|两角色和所有权|交易员不能访问管理面或他人账户；管理员可监管但不获得买卖、启动／恢复或直接撤单能力|
|A03|身份变化和迟到响应|重新认证、权限变化、凭据变化后，旧结果不得直接污染新内存范围；可观察到旧代401时暂停写入并重读当前身份，按结果恢复或重新登录；按表后专项场景核查Cookie竞争，不能保证新Cookie不被清除|
|A04|无账户、无心跳、空列表和读取失败|遵守查询文档已知运行空值；无数据与错误分开，不虚构资金或持仓|
|A05|全部列表／详情／概览|覆盖接口目录中全部读取功能；语义等价的管理员／公共别名可选其一并记录映射，不重复建页面。筛选、排序、有效分页、数组与`data.order`等层级正确|
|A06|账户创建／差量更新／凭据替换|只发实际变动字段；未完成业务、活动账户和连接准备度限制不被绕过；敏感值不进入缓存／日志|
|A07|三类订单与三类任务输入|LIMIT、MARKET BUY、MARKET SELL不混传；价格、股数、本金精度及适用参数均符合公开schema和服务端规则|
|A08|预检、资金与库存|预检成功不提前声明成交；Funding、Spot、本地账本、可卖库存和未知来源独立表达。任务启动的单批／来源预检不冒充整份目标的资金需求评估|
|A09|任务状态与动作|创建、编辑、启动、暂停、继续、停止、核对以及管理员动作严格按矩阵；终态与人工门禁不误自动恢复|
|A10|目标、尾量、时钟与撤单|受理不当成交；FIXED不足批次等原窗口；EXACT不凑目标；暂停／重启不重置窗口，原自动撤单策略独立推进|
|A11|精确时间更新|未编辑／精确等价保留原值；真实改时的有效小数、已启动窗口与完整更新限制按契约执行|
|A12|订单与操作的不同原ID|订单Key、持久操作UUID和原回执路径ID不混用；错误／超时后不换新ID重发未知原动作|
|A13|回执成功、已应用但读取失败、未知、冲突、明确拒绝|同时核验HTTP、原主体／对象／参数和可信回执；404、旧快照、时间或删除记录不能解锁|
|A14|没有持久终态的写入|账户／任务保存、用户创建、改密的能力限制如实处理，不用本地成功标记或登录结果伪造原终态|
|A15|用户和管理员权限管理|角色不可变、管理员管理权限、最后有效管理者和并发降权检查有对应拒绝与恢复处理|
|A16|平台急停／限制／限额／费用政策|限额输入、冲突回执、停新意图与存量业务核对正确；解除不自动恢复任务，不直接取消全部订单|
|A17|业务SSE|默认message、全资源首帧／重连、增量资源、保活／配额／失效帧正确；不等待并不存在的命名事件或补播|
|A18|行情SSE|quote/status解析、全部状态、来源时间／服务端接收时间、REST／WS先后和不可重试终止正确|
|A19|HTTP边界和代理路径|Origin、跨源凭据、CSRF、JSON错误、body上限、限流、非JSON与断线均按协议；代理挂载路径不丢失|
|A20|账本／官方历史／核对／业务事件／审计|数据来源与币种、可空费用、名义成本、审计及服务器运维日志的不同读取面不混同；不泄露敏感字段|
|A21|桌面与移动端适配|两角色核心流程在目标桌面和移动设备上可操作，关键内容与控件不被遮挡；记录设备、浏览器、视口和未覆盖项。具体版本、断点、无障碍等级与性能门槛须另行确定|

### A03 的 Cookie 竞争专项场景

现有证据是后端源码中的清Cookie条件，以及此前临时HTTP服务加浏览器的隔离探针；后者观察到旧请求携带旧Cookie、新Cookie先被接收、旧401迟到后Cookie消失。**尚未在项目API／数据库或跨标签页端到端复现**。以下是待执行的验收场景，不是已通过记录：

1. 使用项目实际API、临时数据库、合成用户和可控网络延迟，分别覆盖单页与同一浏览器Cookie存储分区内的多标签页；记录浏览器、代理和凭据策略，不使用真实交易数据。
2. 让一个受保护的普通GET实际携带旧Cookie发出，在请求到达认证中间件前令旧会话失效；让服务端处理后暂缓其携带清Cookie `Set-Cookie`的401。再完成新登录，确认浏览器已接收新Cookie，最后释放旧401。核对两者使用同一API主机、Cookie名、Path与存储分区；只记录时序和状态，不保存Cookie值、CSRF或密码。
3. 检查旧代结果不直接覆盖新内存态，但可观察到旧401时仍触发身份复核。记录释放前后的浏览器Cookie状态与`/auth/me`结果：读取期间本页身份代次变化时丢弃结果并重查；代次未变且返回200时核对用户与CSRF并按权限重新加载；401时重新登录；网络或响应不可信时保持待核对。一次200只证明服务端校验该请求时的身份，不保证之后Cookie不变。旧流和待发队列不越身份恢复，不确定写入保留原ID。
4. 另覆盖其他读取、会话写入或流请求在途，以及响应不可见等并发情况；记录无法控制或未覆盖的场景。若新Cookie被清除，须如实报告，不能因旧回调已隔离就将Cookie稳定性判为通过。跨标签／并发保障须另作专项验证；如需更强保证，应评估后端协议修复并在实际部署条件下验证。

在新调用方真正完成上述验收前，只能声明“资料与契约可用于实现”，不能声明它已经正确处理了所有网络、身份、交易所或真实资产故障。真实买卖和撤单须另行明确授权；成交、费用及恢复须按实际证据验收，风险声明由用户本人处理，系统不代签。

## 6. 后续修改的同轮同步

|后端变化|应同步的资料与检查|
|---|---|
|增加／删除路由或修改输入输出|接口目录、对应业务／查询／写入章节、重新生成公开契约；按方法＋路径做集合核对|
|角色、状态动作、限额或时钟规则变化|业务与动作矩阵、相关写入恢复规则和A02／A09／A10／A11／A15／A16验收|
|普通错误、Cookie／CSRF／Origin或SSE变化|HTTP与事件正文、错误／会话样例、A01／A03／A17／A18／A19验收|
|查询参数、分页、字段来源或空值变化|查询文档、响应关键字段、A04／A05／A08／A20验收|
|回执、原ID、冲突范围或终态证据变化|写入与恢复矩阵、原ID生命周期及A12／A13／A14验收|

审计来源：[后端命令](../../backend/package.json)、[导出入口](../../backend/scripts/contract-entry.ts)、[导出工具](../../backend/scripts/export-contracts.ts)、[隔离库生命周期](../../backend/scripts/test-db.ts)、[公开校验](../../backend/contracts/validation.ts)、[时间契约](../verification/task-time-contract-review.md)、[产品边界](../../PRODUCT.md)。
