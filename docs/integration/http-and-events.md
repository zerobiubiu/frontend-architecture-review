# HTTP、安全会话与双路 SSE

- 状态：**现状参考**。
- 基线：后端 **3.0.0**，`dev` 提交 **596849a**。
- 消费者入口：本文说明传输与安全语义；[公开客户端契约](../../backend/contracts/client.d.ts)提供实际路由、输入与响应类型，[公开校验模块](../../backend/contracts/validation.ts)提供输入及 SSE 载荷的运行时校验。不要从服务端内部模块导入 DTO，也不要根据本文样例另建一套 DTO。
- 本文是当前规则，不是本轮运行或实盘验收报告。末尾源码链接只供审计，不是要求消费者回源补协议。

其他接入资料：[接口目录](api-catalog.md)、[业务模型与动作](backend-model-and-actions.md)、[查询与响应](query-and-response-contracts.md)、[写入与原 ID 恢复](write-and-recovery.md)、[启动与验收](bootstrap-and-acceptance.md)。

## 1. URL、公开边界与配置

### 1.1 三种地址不要混用

|概念|当前含义|消费者规则|
|---|---|---|
|API 来源|服务端 `API_ORIGIN`，例如 `https://api.example.invalid`；默认本机 `http://127.0.0.1:3020`|这是精确 origin，不是带路径的 API 基址；不包含凭据、路径、查询、片段、末尾 `/`|
|后端内部路径|业务统一 `/api/v1/...`，健康检查为 `/healthz`|下表和公开契约均使用内部路径；后端不会因为前端地址而改变它们|
|客户端可访问基址／代理前缀|部署者可能把上述路径映射至某个外部 origin 或路径前缀|由客户端部署配置显式提供并与代理映射一致；后端没有自动发现或返回外部前缀的接口|

客户端应使用一个集中、可配置的 URL 构造入口：将**部署配置的来源／代理前缀**与**固定内部路径**组合，参数交给 URL 查询编码器处理。不能硬编码旧站点域名、开发端口，也不能假定 `window.location.origin` 就是 API；同源部署可以显式配置成同源。若外部路径有前缀，不要用以 `/` 开头的 URL 解析方式意外丢弃该前缀，也不要重复添加公开契约已经含有的 `/api/v1`。健康路径不属于 `/api/v1`，必须单独映射。

`API_ORIGIN` 与 `FRONTEND_ORIGINS` 只配置来源、安全 Cookie 与 CORS，不负责改写路径。远程运行的 API 来源必须 HTTPS；只有 `127.0.0.1`、`localhost`、`[::1]` 回环允许 HTTP。后端只提供 API，不提供静态网页、SPA fallback 或前端代理配置；未知页面路径也是 JSON 404。

### 1.2 匿名、会话与来源例外

|方法与内部路径|会话|来源／CSRF|响应要点|
|---|---|---|---|
|`GET /healthz`|不要求|不经过业务 Origin／CSRF 拦截；跨源浏览器读取仍只向精确许可来源提供 CORS 授权|`200` 或 `503`，两者都可能是 `{data: ...}`，不是错误信封|
|`GET /api/v1/meta`|不要求|仍经过 Origin 检查；GET 不要求 CSRF|公开正式环境、版本与能力，不返回部署来源／代理前缀|
|`POST /api/v1/auth/login`|不要求旧会话|**必须可信 Origin**；仅免 CSRF，不免来源保护、体积限制、输入校验、登录限流|成功写 Cookie，返回用户与 CSRF|
|其他 `/api/v1/...`|要求有效会话|先认证，再执行相应来源／CSRF 保护|包括 `/auth/me`、登出、修改密码及两路 SSE|
|`OPTIONS /api/*`、`OPTIONS /healthz`|不要求|CORS 在认证前处理|204 预检不表示资源存在、已授权或业务已执行|

业务接口一般按规范路径请求，不自行添加尾斜杠。即使可读取 `/meta` 或 `/healthz`，也不能据此认为登录会话、单个账户、资金、行情、Worker 或当次交易条件均已就绪。

## 2. Origin、CORS 与浏览器凭据

### 2.1 精确来源集合

许可集合是 `API_ORIGIN` 加 `FRONTEND_ORIGINS`。后者为部署配置的逗号分隔来源；配置加载时去掉各项两端空格，之后按字符串**精确匹配**。协议、主机、非默认端口必须一致；不支持 `*`、子域通配、路径前缀、正则、尾斜杠，也不自动放行另一开发端口。`Origin: null` 不属于可配置的合法 HTTP(S) 来源。

对实际 `/api/v1/...` 请求，规则如下；受保护路径可能先因会话无效返回 401，因此不要依赖错误优先级探测权限：

|请求来源情况|GET／HEAD／OPTIONS 的业务来源规则|其他方法的业务来源规则|
|---|---|---|
|`Origin` 存在且精确在许可集合|通过；即使 `Sec-Fetch-Site: cross-site` 也允许|通过来源检查；除登录外还要有效 CSRF|
|`Origin` 存在但不可信|403 `ORIGIN_FORBIDDEN`，不因同站或缺 Fetch Metadata 放行|403 `ORIGIN_FORBIDDEN`|
|缺 `Origin`，且 `Sec-Fetch-Site` 恰为 `cross-site`|403 `ORIGIN_FORBIDDEN`|403 `ORIGIN_FORBIDDEN`|
|缺 `Origin`，且 Fetch Metadata 缺失或不是 `cross-site`|只免来源阻断，不免会话与资源授权|仍是 403 `ORIGIN_FORBIDDEN`，包括登录|

表中的 OPTIONS 是安全检查本身的例外；正常 CORS 预检更早就返回。浏览器负责生成 `Origin`、Fetch Metadata 与 Cookie，前端不得尝试伪造。非浏览器客户端若执行写入，也必须发送部署认可的精确 Origin，并维护真实 Cookie 与 CSRF；不存在另一个 Bearer-token 登录协议。

### 2.2 CORS 具体值

- 挂载范围：`/api/*` 和 `/healthz`。
- 对许可来源回显 `Access-Control-Allow-Origin: <该精确来源>`；不是 `*`。携带 `Access-Control-Allow-Credentials: true`，并按来源区分缓存（`Vary: Origin`）。
- 允许方法：`GET, HEAD, POST, PATCH, OPTIONS`。这只是预检声明，不创造对应的业务路由；没有公开 PUT／DELETE 协议。
- 允许请求头：`Content-Type, X-CSRF-Token, Idempotency-Key`。不要再加 `Authorization`、客户端自造的 `X-Request-Id`、`X-Requested-With` 或自造安全头，否则跨源预检可能失败。
- 不配置 `Access-Control-Expose-Headers`；**跨源 JavaScript 不能依赖读取 `X-Request-Id`**。优先保存 JSON 错误体内的 `error.requestId`；同源或非浏览器可读取响应头。`Set-Cookie` 也不是可供页面读取的令牌返回渠道。
- OPTIONS 由 CORS 直接返回空 204；不可信来源也可能看到 204 或其他 CORS 声明，但**没有匹配的 Allow-Origin 就没有浏览器读取授权**。不要把预检 HTTP 状态当作授权证明。
- 不使用 `mode: 'no-cors'` 绕过失败；不透明响应不能证明业务成功，也不能解析错误。

### 2.3 Cookie 属性与跨站限制

会话完全由 API Cookie 承载：

|API_ORIGIN 协议|Cookie 名称|固定属性|
|---|---|---|
|HTTPS|`__Host-equity_production_session`|`HttpOnly; Secure; Path=/`，不设置 `Domain`|
|本机 HTTP|`equity_production_session`|`HttpOnly; Path=/`，无 `Secure`，不设置 `Domain`|

- `SameSite` 由 `SESSION_COOKIE_SAME_SITE` 配置为 `strict`／`lax`／`none`，默认 `strict`；`none` 必须搭配 HTTPS API 来源。
- Cookie `Max-Age=28800`，数据库会话也在登录后 **8 小时**到期。普通请求和 `/auth/me` 不滚动续期，没有 refresh-token／续期接口。
- Cookie 为 host-only，不把会话令牌交给页面脚本；不要在 localStorage、URL、SSE 查询或日志中复制它，也不要尝试手工拼浏览器 Cookie 头。
- 跨源 fetch（包括登录）使用 `credentials: 'include'`，既为了发送会话，也为了让浏览器接受 API 设置的 Cookie。同源使用该选项也可统一实现。
- 跨源不一定跨站；真正跨站的独立前端通常需要部署方配置 `SameSite=none`。CORS 和 `credentials` **不能覆盖** SameSite、第三方 Cookie 禁用或浏览器存储策略。若浏览器拒收 Cookie，应修正部署／浏览器条件，不改成 URL token 或伪造已登录状态。
- 无效／过期／撤销会话、非 ACTIVE 用户不能通过认证。服务端发现已失效的真实会话时会清 Cookie；缺失或格式不符的 Cookie 也会返回 401，不能依赖它总同时清 Cookie。

## 3. 登录、CSRF 与会话状态机

### 3.1 最小接入次序

1. 读取部署配置；可匿名读取 `/meta` 与 `/healthz`，但不从它们推导个人权限。
2. 页面初始化／恢复时，用携带 Cookie 的 `GET /api/v1/auth/me` 查询当前用户。成功响应为 `data.user` 与 `data.csrfToken`；确认当前身份未认证时进入未登录态。旧代响应不得直接重设当前身份，旧代 401 按第 3.3 节处理。
3. 登录时，用 `loginSchema` 校验用户名／密码，`Content-Type: application/json`，向 `/auth/login` POST。这个请求无需已有 CSRF，但须可信 Origin 与 `credentials: 'include'`。
4. 登录成功且仍属于当前身份代次时，原子替换内存中的用户和 CSRF；随后读取角色允许的数据并建立 SSE。登录成功响应不返回会话令牌本身。
5. 除 GET／HEAD／OPTIONS 和登录外，所有 `/api/v1` 写请求添加 `X-CSRF-Token: <当前会话的 csrfToken>`；包括无 JSON 请求体的登出、账户检查／同步／核对、撤单、恢复核对，以及业务上被称为“预检”的 POST。
6. 登出成功返回 `data.loggedOut: true`：服务端撤销请求所属会话并发送清 Cookie 响应；若仍属当前身份则清用户／CSRF／个人缓存、关闭两路 SSE。修改本人密码成功返回 `data.changed: true, data.reauthenticate: true`：撤销该用户全部会话并发送清 Cookie 响应，被撤销身份须重新登录。旧代回调不得直接清新身份内存；Cookie 仍受浏览器响应处理影响。

本调用方内登录、退出、改密等会话写操作必须串行；不要在旧认证请求仍在途时启动另一次身份切换。这只能约束该调用方能协调的会话写操作，不能单独保证 Cookie 不变，也不能约束其他标签页、普通读取和已发出的请求。身份代次同时约束旧读取、流和待发队列；可观察到旧代 401 时不能只丢弃回调，须按第 3.3 节重新确认当前会话。取消等待不证明服务器没有处理请求，也不并发重放旧认证动作。

无真实令牌的登录成功示意（`<已省略>` 不是可使用的令牌）：

```json
{
  "data": {
    "user": {
      "id": "11111111-1111-4111-8111-111111111111",
      "username": "example_trader",
      "role": "TRADER",
      "canManageAdmins": false
    },
    "csrfToken": "<已省略>"
  }
}
```

### 3.2 CSRF 如何更新与失败恢复

CSRF 与当前会话绑定；服务端既验证其与会话令牌的派生关系，也验证数据库保存的 CSRF 摘要。它不是 Cookie，也不是订单幂等键。`/auth/me` 返回同一有效会话的当前 CSRF；它不是旋转或延长会话的接口。每次新登录都会形成新会话与相应 CSRF，应整体替换；多标签页重新登录造成 Cookie 改变后，旧页内存里的 CSRF 可能过时。

- 收到 `CSRF_INVALID`：停止该次写入链，先 GET `/auth/me` 重新确认身份并更新 CSRF；若变成 401，退出登录态。
- 不要在通用 HTTP 拦截器中“刷新 CSRF 后自动重发所有写请求”。请求若属于原 ID 回执协议，先按原 ID 读取回执；前置拒绝也可能已经留下原 ID 的拒绝回执。是否允许再次表达动作由[写入与恢复](write-and-recovery.md)决定。
- 当前身份确认失效时关闭连接与写入入口，不把旧数据清成伪零或当成新会话数据。重新登录后重新加载角色、数据与流，不继续旧的异步写入链。
- 管理员禁用用户、修改相关权限及改密等操作可能撤销既有会话。两路 SSE 还会巡检用户状态及角色；流已经打开也不保证会话始终有效。

### 3.3 旧会话 401 迟到与新 Cookie 竞争

旧请求可能已经携带格式正确的旧会话 Cookie；服务端处理时若该会话不存在、已过期、已撤销或用户不是 ACTIVE，认证中间件会调用 Cookie 清理，返回的 401 可携带删除 Cookie 的 `Set-Cookie`。若新登录的 Cookie 已先被浏览器接受，且两者属于同一浏览器 Cookie 存储分区、API 主机、Cookie 名和 Path，旧 401 的清理头随后又被浏览器接受，浏览器可能按 Cookie 作用域删除**当前的新 Cookie**，而不是只删除旧令牌。缺失或格式不符的 Cookie 所致 401 不经过这条清理分支，也不是每个 401 都带清理头；凭据和浏览器存储策略也会影响结果。

**证据等级：**[认证中间件与 Cookie 清理源码](../../backend/src/server/context.ts)表明存在上述清理条件。此前临时 HTTP 服务加浏览器的隔离探针确认：旧请求实际携带旧 Cookie，浏览器先收到新 Cookie，旧 401 随后到达后 Cookie 消失。这只是浏览器机制的隔离观察，并未在本项目 API／数据库或跨标签页端到端复现；不能声称后端已修复、项目浏览器验收通过，或断定所有部署都必然发生。

客户端应采取以下保守措施，但不能把它们描述为彻底修复：

1. 对请求、流、缓存和待发队列绑定身份代次，隔离旧代结果，不用旧回调直接覆盖或清空新身份的内存状态；同一调用方内串行化会话写操作。二者都不能阻止浏览器在回调之外处理迟到的 `Set-Cookie`，也不能单独保证新 Cookie 不变。
2. 可观察到旧代 HTTP 401 时，即使不应用其旧业务结果，也要进入“身份待核对”，暂停写入与流的自动重连，并关闭相关流；保留不确定写入的原 ID。不要仅因旧回调被忽略就认为新会话仍有效。
3. 使用当前浏览器凭据重新读取 `GET /api/v1/auth/me`；若本调用方的身份代次在读取期间变化，丢弃该结果并重新核对。代次未变化且返回 200 时，以返回的用户和 CSRF 更新内存身份，再按权限重读数据、恢复流和允许的操作；401 时清除会话态并重新登录；网络或响应不可信时保持待核对，不伪造已登录。未知写入仍按[原 ID 恢复](write-and-recovery.md)，不自动重放旧动作。
4. 本调用方的代次不代表跨标签的 Cookie 事实。一次 `/auth/me` 成功只说明服务端校验该次请求时的身份；其他在途响应仍可能随后改变 Cookie。跨标签、响应不可见或取消等待时，本页可能观察不到全部旧响应。对实际项目 API、跨标签和并发行为的保障须做专项验证；若需要更强保证，应评估后端协议修复并在实际部署条件下验证，不能将现有措施或隔离探针当作修复证明。

## 4. 请求、响应与错误层

### 4.1 编码、体积与校验

- `/api/*` 请求体上限 **64 × 1024 字节**；超限为 413 `BODY_TOO_LARGE`。它在认证／CSRF／业务处理之前执行；不能指望大请求到达业务回执登记。
- 声明 JSON 输入的接口使用 `Content-Type: application/json` 和 JSON 序列化。无体动作按公开契约发送，不随意附加字段。错误／缺失 Content-Type 不是兼容模式：JSON 校验器不会把任意文本当 JSON，所需输入通常因此不通过校验。
- JSON 语法损坏：400 `HTTP_ERROR`，安全消息为“请求格式不正确，请检查 JSON 与请求参数”。通过 JSON 解析但不满足 schema／路径参数／查询校验：422 `VALIDATION_ERROR`。输入校验消息只概括安全字段名，不保证提供逐字段结构化 issues。
- 是否拒绝未知字段由公开 schema 及路由契约决定：订单联合体、严格写入等会拒绝多余字段；不要把“所有对象一律 strict”或“一律忽略多余字段”当成协议。
- 查询值按公开 schema 编码；UUID、时间、数量／金额字符串、默认值及转换规则使用公开校验模块，不把 `null`、`undefined`、空串混写成查询文本。标量查询不要重复同一键；尤其行情流的 `accountId`、`symbol` 不是多值订阅数组。完整查询规则见[查询与响应](query-and-response-contracts.md)。
- 前端校验只帮助用户；权限、账户、资金、官方规则和执行条件仍由服务端当次检查，成功预检不是提交担保。

### 4.2 普通错误信封与请求 ID

HTTP 中间件和应用错误的标准形状如下；这里只给无敏感值的实例，不定义第二套 DTO：

```json
{
  "error": {
    "code": "CSRF_INVALID",
    "message": "安全令牌无效，请刷新页面后重试",
    "requestId": "22222222-2222-4222-8222-222222222222",
    "operationAccepted": false
  }
}
```

- `code` 是程序分支依据；`message` 是服务端安全说明，按文本展示，不作 HTML，也不解析其自然语言或括号内数字来决定重试。
- `requestId` 由服务端为每个 HTTP 请求新建 UUID，并以 `X-Request-Id` 返回。客户端传入的同名头不会成为服务端请求 ID。重试、查询恢复、重新建流各有新请求 ID。
- 一条流的请求 ID 标识整次建流；业务 refresh 和业务流错误帧会在 JSON 内携带它，报价帧不携带。请求 ID 不是订单 `clientOrderId`、`Idempotency-Key`、原操作 ID 或 SSE `id`。
- 普通 JSON 响应设置 `Cache-Control: no-store`；SSE 建流后使用 `no-cache`。不要经 Service Worker／代理把个人响应或流缓存成公共数据。
- `operationAccepted` **仅在相关错误路径可选出现，且公开值只有 `false`**；缺失不是 `true`，也不是“未执行”。`details` 可选，目前高风险错误可能给出 `blockingOperation`，应按回执协议处理。
- 部分高风险响应在顶层另有 `operation`；不能只截取 `{data}` 或 `{error}` 而丢弃回执。公开生成契约不能穷尽中间件错误分支，HTTP 层必须接受以上统一失败信封。
- 最外层运行时故障还有 500 `INTERNAL_ERROR` 的安全 JSON 兜底，带 body 内请求 ID；该兜底不保证有正常中间件的全部头或 `operationAccepted`。代理、连接故障也可能根本没有本应用信封。

### 4.3 HTTP 状态不等于业务终态

|HTTP／响应情况|正确解释|
|---|---|
|200 普通读取|本次返回了数据；不自动证明内容新鲜、官方来源可用或交易获批|
|200 预检|仍检查 `data.ok` 和检查项；HTTP 成功不等于预检通过|
|201 创建订单／任务／账户／用户|创建接口成功；订单不因此等于已成交，任务不因此等于已运行|
|200 或 202 且有 `operation`|200 对应当前高风险包装器的 SUCCEEDED；202 表示其尚未成功终结。仍读回执状态、阶段、结果和业务对象；恢复读取自身的 200 也可能返回未知回执|
|4xx／5xx 且有 `operation`|HTTP 报错可以与已登记、未知甚至已提交业务结果并存；不能仅因状态失败就解除保护或换新 ID|
|`error.operationAccepted: false`|这次请求在该标记覆盖的执行入口前被拒绝；不是“数据库中没有原回执”证明，也不撤销此前同 ID 的结果|
|`operationAccepted` 缺失|没有作前置未接受声明；不能由此判定接受／拒绝，更不能据此自动重发|
|503 `/healthz` 且有 `data`|健康降级报告，不是缺失错误字段的损坏信封|
|204 OPTIONS|只有预检，没有业务数据；不能对空体执行 JSON 成功解析|

前置标记覆盖以下规范方法／路径：`POST /orders/:id/cancel`、`POST /tasks/:id/control`、`POST /accounts/:id/check`、`POST /accounts/:id/assets/sync`、`POST /accounts/:id/reconcile`，以及 `PATCH /admin/users/:id`、`PATCH /admin/accounts/:id`、`PATCH /admin/system`（均在 `/api/v1` 下）。它**不普遍覆盖所有写接口**，尤其不能拿它代替下单原幂等键恢复。

已认证、Origin 可信且原操作 UUID 有效的上述请求，某些 CSRF／参数／权限前置失败会登记原 ID 的拒绝回执再附加 `operation`，因此可同时看到 `operationAccepted: false` 与回执。已有原 ID 的回执也必须优先按其真实内容核对。完整的 key 约束、回执状态、阻塞对象、重放和核对路径见[写入与原 ID 恢复](write-and-recovery.md)，不要由通用 HTTP 层自行发明补偿。

### 4.4 具体错误 code 的消费策略

以下是安全 HTTP 层及两路流必须识别的类别，不是一个封闭的字符串枚举；其他业务拒绝及新增代码仍按安全的未知分支显示并核对。

|代码|常见 HTTP／位置|客户端动作|
|---|---|---|
|`UNAUTHENTICATED`、`SESSION_CHANGED`|401；前者也可在两路 SSE 的终止载荷内出现|停止写入与重连、关闭相关流；旧代结果不直接清新内存态，可观察到旧代 HTTP 401 或无法确认当前身份时按第 3.3 节重读 `/auth/me`；确认未认证后清会话态并重新登录。未知写入保留原 ID，认证确认后恢复|
|`LOGIN_FAILED`|401 登录|显示账号／密码／禁用状态的统一说明，不把它当作现有会话的普通刷新失败，不循环自动登录|
|`PASSWORD_INVALID`、`PASSWORD_UNCHANGED`|400／422|分别修正当前密码、换不同的新密码，不自动重试|
|`ORIGIN_FORBIDDEN`|403|修正 API 来源、前端许可集合或代理／浏览器接入方式；不是清缓存／刷新 CSRF 可以解决|
|`CSRF_INVALID`|403|按第 3.2 节刷新身份及 CSRF；不得无条件重发写请求|
|`FORBIDDEN`、`TRADER_REQUIRED`、`ADMIN_MANAGEMENT_FORBIDDEN`|403|按角色／权限限制入口；管理员身份不授予创建交易意图权利，不尝试调用另一角色接口绕过|
|`NOT_FOUND`、`ACCOUNT_NOT_FOUND`、`ORDER_NOT_FOUND`、`TASK_NOT_FOUND`、`USER_NOT_FOUND`；报价的 `ACCOUNT_FORBIDDEN`|404|资源不存在或无权查看；实际错误码／消息可能区分二者，见[查询语义](query-and-response-contracts.md)。任何404均不能证明未知交易不存在|
|`OPERATION_NOT_FOUND`|404|原回执暂未找到／无权读取，不证明未执行；保留原 ID，走恢复协议|
|`BODY_TOO_LARGE`、`HTTP_ERROR`、`VALIDATION_ERROR`、`EMPTY_UPDATE`、`DATE_RANGE_INVALID`、`CREDENTIALS_PAIR_REQUIRED`、`ADMIN_PERMISSION_INVALID`|413／400／422|修正编码、输入或大小；不要原样循环重试。密码、凭据等不复制进报错遥测|
|`IDEMPOTENCY_REQUIRED`、`OPERATION_ID_REQUIRED`|422|补齐该接口规定的幂等标识；两种协议不是同一种 key 约束，见写入文档|
|`OPERATION_KEY_CONFLICT`、`OPERATION_IN_PROGRESS`、`OPERATION_TARGET_BUSY`、`OPERATION_UNCONFIRMED`；回执中的 `OPERATION_NOT_APPLIED`／`OPERATION_REJECTED`|409／503 或回执错误|保留原请求标识、内容与回执，查询原 ID；不换号绕过阻塞，不由 HTTP 状态判断业务已回滚|
|`RATE_LIMITED`|429|本服务限流，停止高频轮询／重复点击，有界退避；不是交易结果证据|
|`SSE_CONNECTION_LIMIT`|429 建流前|关闭不用的事件／行情连接后再连，不开启并行重连风暴|
|`CONFLICT`、`DATA_CONFLICT`、`USERNAME_EXISTS`、`ACCOUNT_LIMIT`、`LAST_ADMIN_PROTECTED`|409|刷新相应数据、解释唯一性或安全约束；不自动覆盖或解除门禁|
|`ACCOUNT_UNAVAILABLE`、`ACCOUNT_INACTIVE`、`CREDENTIALS_REQUIRED`、`CREDENTIALS_CHANGED`、`ACCOUNT_CREDENTIALS_IN_USE`、`ACCOUNT_RECHECK_REQUIRED`、`ACCOUNT_PLATFORM_RESTRICTED`、`ACCOUNT_NOT_READY`|通常 409|读取账户当前状态并按业务流程处理；不能靠页面开关伪造连接／资金／交易权限|
|`PLATFORM_NOT_READY`、`MARKET_CATALOG_UNAVAILABLE`、`MARKET_CATALOG_REFRESHING`、`QUOTE_UNAVAILABLE`|通常 503|区分平台配置、目录刷新和无报价；只读可退避再读，不生成本地替代规则或价格|
|`EXCHANGE_EVIDENCE_INVALID`、`EXCHANGE_UNAVAILABLE`|通常 502|官方证据不可验证／不可用；保留已有可信记录并标陈旧或不可用，不补零、不伪造成功|
|`EXCHANGE_RATE_LIMIT`|429，也可报价 status code|遵守后端共享冷却，降低前端请求；不要换节点／账户或靠新连接绕过，不自动重发交易|
|`EXCHANGE_PERMISSION_DENIED`|通常 502，也可报价 status code|这是**官方账户权限**失败，不等于本站会话 401；检查账户凭据、IP 白名单、官方权限，不循环登出登录|
|`EXCHANGE_NETWORK_UNCERTAIN`、`EXCHANGE_SERVER_UNCERTAIN`、`EXCHANGE_REQUEST_UNCONFIRMED`|通常 502|读取失败可稍后再读；写入结果不可据此推定未送达，使用原订单／原操作核对|
|`EXCHANGE_ORDER_UNCONFIRMED`、`EXCHANGE_CANCEL_UNCONFIRMED`、`EXCHANGE_STREAM_EXPIRED`|通常 502|查无单／撤单未确认／官方私有流失效都不证明交易终态，不释放未知占用；官方私有流恢复由后端处理|
|`EXCHANGE_ORDER_REJECTED`|409|后端已按真实官方响应及显式白名单确认拒单；客户端仍以订单／回执记录为准，不自行分析官方原始包|
|`EXCHANGE_<官方整数码>`|通常 502 或报价 status code；负数形如 `EXCHANGE_-1121`|动态代码族，不是前端可穷举的枚举；显示安全摘要，按读取／提交／撤单语境处理，不能仅看数字认定确定拒单|
|`INTERNAL_ERROR`、`ACCOUNT_CREATE_FAILED`、`USER_CREATE_FAILED` 或未识别代码|500 或实际返回状态|保存可得的请求 ID；读请求显示失败并允许有界再读，写请求保留不确定性并走恢复，禁止兜底成成功|

DomainError 在 HTTP 层转成 409；其他业务异常按服务端状态返回。错误码不总与唯一 HTTP 状态绑定，同一原回执的再次读取／重放也可能改变包装状态。报价专有流内代码与额外业务流错误帧见后文。

应用未承诺对所有 429 返回 `Retry-After`，也没有公开“下一次必定成功”的剩余额度接口。已有可用响应头时可遵守其等待提示；否则用有上限且有抖动的退避，而不是同步无限重试。

### 4.5 网络、超时、非 JSON 和取消请求

HTTP 层必须区分三件事：**拿到可信应用响应**、**拿到非预期响应**、**没有拿到完整响应**。

- 状态非 2xx 时仍读取安全 JSON 错误体及顶层 `operation`；不能只抛 `statusText` 丢失回执。健康检查另按 `data` 解析。
- 2xx 但非预期 Content-Type、HTML 代理页、空体、JSON 解析失败、必需字段缺失或 SSE 格式不符，都不是业务成功。保留状态、可得请求 ID和安全摘要，不把整页 HTML／请求头／凭据上传日志。
- DNS／TLS／CORS／网络断线／浏览器超时／AbortController 取消／响应体读取中断，均可能让客户端不知道服务器是否已执行。尤其 CORS 报错不等于服务端没收到请求。
- 客户端设置的超时只限制等待；取消 fetch 不会撤销数据库事务、撤销订单或取消任务。没有“超时即回滚”的传输保证。
- 普通 GET 可在认证和来源条件满足后有界重读；写请求不能用通用网络重试器重发。下单使用原幂等标识，高风险动作使用原操作 UUID；其余没有幂等保证的创建／修改也不能从网络失败推导可安全重复。
- 错误提示应保留“结果待核对”而非“肯定失败／未执行”；不要把未知任务／订单立即恢复成可重复操作状态。完整分流见[写入与恢复](write-and-recovery.md)。

## 5. 两路 SSE 的公共传输规格

### 5.1 建流方式与共同限制

|流|内部 GET 路径|输入|目的|
|---|---|---|---|
|业务资源流|`/api/v1/events`|无业务查询参数|提示哪些 HTTP 数据应重新读取，不传业务行或成交明细|
|行情流|`/api/v1/market/quote-stream`|必须 `accountId=<UUID>&symbol=<编码后的证券代码>`|单账户、单证券的标准化报价及中转状态|

两者都是 Cookie 认证、同一 Origin／CORS 规则的 GET，**不要求 `X-CSRF-Token`，也不在 URL 带 CSRF／会话 token／官方 Key／Listen Key**。原生 EventSource 跨源用 `new EventSource(url, { withCredentials: true })`；基于 fetch 的解析器用 `credentials: 'include'`。官方 HTTP／WebSocket、私有订阅凭据全部在后端，前端不直连官方流。

成功响应为 HTTP 200、`Content-Type: text/event-stream`；服务端声明 `Cache-Control: no-cache`、`Connection: keep-alive`、`X-Accel-Buffering: no`，当前 Hono 输出还包含分块传输声明。客户端不能把 Transfer-Encoding 当作跨 HTTP 版本的硬性条件；部署代理须真正转发增量数据，不能缓冲成整包。

**所有业务帧均不设置 `event:`。** 使用默认 `message`／`onmessage` 接收，然后看 JSON 的 `kind` 或 `error`。`refresh`、`quote`、`status` 是载荷分类，不是 EventSource 命名事件；只监听 `addEventListener('refresh', ...)` 或 `addEventListener('quote', ...)` 会漏掉真实消息。当前两条路由也不发送名为 `error` 的应用 SSE 事件；原生 EventSource 的 `onerror` 是连接事件，不能当成后端 JSON 错误体。

### 5.2 配额与生命期

- 同一用户的**业务流与行情流合计最多 6 条活动连接**，两个角色都适用；当前为单 API 进程内共同计数，不是每种流各 6 条，也不是每标签页各 6 条。
- 业务流连接尝试按用户每分钟 30 次，行情流另按用户每分钟 30 次；超出可得到 `RATE_LIMITED`。所有已认证请求另受每用户每分钟 1000 次限制；普通非安全方法通过 CSRF 后每分钟 120 次，管理员路由另有每分钟 300 次限制。
- 登录另有按真实来源地址 15 分钟 30 次、真实账号 15 分钟 12 次、全局每分钟 120 次以及最多 4 个并发密码校验的保护；当前进程内额度不会因为客户端换 token 或页面重连而成为安全重试保证。来源地址只在真实对端可信时采纳转发链，客户端不要自行加转发头。
- 在切换账户／证券、登出、组件销毁时关闭旧流并丢弃其后到异步回调；不要在每次 HTTP 重读时再开一条流。可集中复用页面所需连接，但不能靠增加流覆盖额度。
- 配额在服务端关闭与异步上游清理后释放，不保证前端一调用 close 就能同步占用新名额。建流失败、正常退出和客户端取消都会清理名额。

### 5.3 SSE 帧与框架无关解析步骤

两个路由当前的 JSON 都写在 `data:`，空行结束一帧，`retry: 3000` 是**毫秒**级的连接重试提示。每约 15 秒可发送注释 `: keep-alive`；没有应用 `heartbeat` JSON 类型。保活证明最多只是传输仍有字节，不证明 Worker、官方行情或交易安全条件正常。

使用原生 EventSource 时，浏览器负责 SSE 分帧、UTF-8、注释与 retry；应用只需解析 `message.data` 并按下面步骤分类。需要可靠读取建流失败的 HTTP 状态／JSON 时，使用能暴露它们的 fetch 流实现；原生 EventSource 的 error 回调通常不给出失败响应体。

自实现解析器的最小步骤：

1. 以带 Cookie 的 GET 建连；先检查 HTTP 状态和 Content-Type。非 200／非 SSE 先按 HTTP 错误流程处理，不把错误 JSON当作第一条报价。
2. 使用流式 UTF-8 解码器跨 chunk 保留半个字符及未完成行，处理 LF／CRLF／CR 行结束；不能假定一个网络 chunk 就是一帧或一行。
3. 每帧逐行按第一个 `:` 分成字段和值，去掉值开头最多一个空格；以 `:` 开头的注释不产生消息。拼接多条 `data` 行时用换行连接；空行才结束一帧。忽略未知 SSE 字段；无 data 的保活不交给 JSON 解析。
4. `retry` 的有效整数更新重连等待提示。业务帧的 `id` 可以保存供本地关联，但不作为补播游标；报价帧没有 `id`。不要因为传输连接重新打开就宣布业务恢复。
5. 对完整 data 执行 JSON 解析；业务流**先识别 `{error: ...}`**，然后用 `eventRefreshSchema` 校验 refresh；行情流用 `quoteStreamEventSchema` 校验并确认账户／证券仍匹配当前订阅。未知 kind、损坏 JSON／schema 失败作为协议错误，不能吞掉后继续标健康。
6. 业务帧触发 HTTP 重读，报价帧更新价格／状态；所有异步结果绑定当前会话及订阅代次，旧流／旧账户响应不得覆盖新选择。
7. EOF、读取异常、解析失败或连接错误时进入断开／待核对态。若非主动关闭且仍有有效会话，按退避重新连接；重新连接后执行相应全量重读／等待新报价。收到认证失效或 `retryable: false` 则按终止规则关闭，不让 EventSource 自动无限重连。

当前没有 Last-Event-ID 补播接口：两条路由均不读取它，也不接受历史游标查询。即使原生 EventSource 在重连时自行带了上一条 id，服务端仍按一次新流处理；不要手工给跨源 fetch 增加该自定义请求头或据它跳过重读。SSE 不是无损事件日志，也不是撤单、成交或账本终态的凭据。

## 6. 业务资源流：失效提示，不是业务数据

### 6.1 首帧、资源与版本

有效会话初次连接时，服务端完成会话检查、各资源版本读取和 Worker 状态读取后，发送全资源 refresh。它不是在响应头送出瞬间保证发帧；读取失败可使首个 data 就是错误帧。

正常脱敏首帧示意：

```text
data: {"kind":"refresh","resources":["orders","tasks","accounts","ledger","events","settings","users","audit","worker"],"at":"2026-11-09T00:00:00.000Z","requestId":"22222222-2222-4222-8222-222222222222"}
id: 1794182400000-1
retry: 3000

```

- `kind` 固定 `refresh`。`resources` 取公开 `eventResources` 的九个名称；`at` 为本次服务端发提示的 ISO 时间，`requestId` 是建流请求 ID，不是具体业务变更时间或动作编号。
- 当前服务端每次都写 `resources`、`at`、`requestId`，但公开 `eventRefreshSchema` 把三者声明为可选。消费者须能接受省略：缺 `resources` 时按全资源失效处理；缺时间／请求 ID 不捏造补值或把它当业务发生时间。当前正常服务端不发送空资源列表。
- 后续通常每轮读取后休眠 1500 ms；它是提示轮询节奏，不是硬性最大变更延迟。只发该轮检测出版本变化的资源；没有变化时只有到时的注释保活。
- 每条新连接的上一版本为空，**重连必从全资源 refresh 开始**，不以旧连接的 id／版本续传。客户端也应在重连时主动重读当前角色可见的基准数据，不在等待首帧期间把旧缓存标成最新。

资源名含义与版本检测如下；版本只在服务端内存比较，**不随 refresh 暴露**：

|资源|提示失效的消费范围|当前比较依据|
|---|---|---|
|`orders`|订单列表／详情、订单相关概览与成交显示|可见订单最大 updatedAt 与总数|
|`tasks`|任务列表／详情／进度／汇总|可见任务最大 updatedAt 与总数|
|`accounts`|账户、连接／交易开关、账户相关资产展示|可见账户最大 updatedAt 与总数|
|`ledger`|账本、由账本派生的持仓／统计|可见账户账本最大 createdAt 与总数|
|`events`|系统事件|可见系统事件最大 ID|
|`settings`|平台安全配置及相关可执行性|平台配置最大 updatedAt|
|`users`|当前用户／管理员用户资料与权限|可见用户最大 updatedAt 与总数|
|`audit`|审计记录|可见审计最大 createdAt 与总数，但排除 `ADMIN_QUERY`、`ADMIN_READ`、`MARKET_QUOTES_QUERY`|
|`worker`|Worker 状态及依赖它的概览／动作提示|`online` 与 `status` 的组合，不是每次 lastSeenAt 改变|

交易员的订单、任务、账户、账本、系统事件按自己 owner 范围检测，用户只检测自己、审计按自己 actor 范围；管理员相应检测全范围。平台配置与 Worker 是共享状态。管理员读取流有审计；它不能反向形成“每次重读→审计变化→全站重读”的无限循环。

这些是粗粒度失效提示，不含对象 ID、变更行、之前／之后值或可比较的公开资源版本，也不承诺捕获每个中间变化。某资源变更只通知该资源，**不会自动通知所有派生视图**；客户端应维护自己视图的依赖表。例如订单／账本变化可使概览失效；只收到 audit 变化不应触发全站行情重读。没有独立的 trades／market／operations 资源名；需要的订单明细、成交、原操作回执仍由相关 HTTP 请求及恢复流程读取。

### 6.2 注释、失效帧与终止

空闲保活：

```text
: keep-alive

```

业务流没有 `kind: heartbeat`、业务快照或业务 status 帧。除了 refresh，真实存在两种**额外 JSON 错误信封**，它们不属于 `eventRefreshSchema`，也没有 `event:`、`id` 或新的 retry 字段：

```text
data: {"error":{"code":"UNAUTHENTICATED","message":"会话已失效，请重新登录","requestId":"22222222-2222-4222-8222-222222222222"}}

```

```text
data: {"error":{"code":"EVENT_STREAM_UNAVAILABLE","message":"实时连接暂不可用，请重新读取服务器状态","requestId":"22222222-2222-4222-8222-222222222222"}}

```

- 每轮先检查原会话未撤销、未过期、用户 ACTIVE、角色与建流时一致。失效时尽力发 `UNAUTHENTICATED`，随后结束流并释放名额。客户端立即 close／abort、结束登录态，不能让原生 EventSource 自动重连同一失效会话。
- 数据库、版本读取、Worker 读取或其他流内异常时，尽力发 `EVENT_STREAM_UNAVAILABLE` 后关闭。该错误**不是 HTTP 503**：响应头可能早已是 200。客户端将实时状态标失败，对必要资源做 HTTP 重读，按退避恢复；若 HTTP 重读也失败，不继续标健康。
- 写错误帧本身也可能失败，服务端会终止；客户端必须能处理“没有末帧的 EOF／网络错误”。服务端日志里的 `SSE_STREAM_FAILED` 是观测代码，不是另一个承诺会发给客户端的业务帧。
- 连接处于 OPEN、只收到保活，均不能证明业务数据读取成功或 Worker RUNNING；`/healthz`、相应 HTTP 查询和 Worker 状态才提供各自证据。

## 7. 行情流：报价与状态两类载荷

### 7.1 查询、授权与首帧

规范示例（账户 UUID 为虚构，不含 token）：

```text
GET /api/v1/market/quote-stream?accountId=11111111-1111-4111-8111-111111111111&symbol=AAPL
```

使用 `quoteStreamQuerySchema`：`accountId` 必须 UUID；`symbol` 是去首尾空格、转大写、1–128 字符且不含控制字符的证券代码。URL 中按值编码，不以逗号／重复键传多个证券。每个连接只订阅这一个账户与证券；改变选择时关闭旧连接再建新连接。

建流前先确认会话身份、角色及账户：交易员只能读自己账户，管理员可跨账户只读；账户须 ACTIVE 且同时有读取凭据。该读取不要求账户开启交易，也不把行情可读当成可下单。管理员建行情流记录读取审计。

- 这一步失败按普通 HTTP JSON 返回，例如 401 `UNAUTHENTICATED`、404 `ACCOUNT_FORBIDDEN`、409 `ACCOUNT_UNAVAILABLE`、422 `VALIDATION_ERROR`、429 限流／超额或 500 其他异常；**不会先建立 SSE 再补这些 HTTP 状态**。
- 账户检查通过后，首个正常状态为 `connecting`。后端随后异步创建官方客户端并验证证券规则，再启动 REST 初始快照与官方报价 WebSocket。建流 200／`connecting` 都不证明官方已经有价。
- 若官方初始化／规则读取失败，流内给 `unavailable` 和安全 code，之后约按 5 秒检查节奏再尝试；此时不会返回本地合成行情。
- 首个 data 不保证一定是 connecting：慢客户端队列会合并同类状态，只保留最新状态及最新报价；快速失败／快速更新可能让客户端直接看到后继状态。不要依赖所有中间状态必达，也不要要求先收到 quote 才接受 status。

### 7.2 quote 载荷与精度／时间

脱敏 REST 报价帧：

```text
data: {"kind":"quote","accountId":"11111111-1111-4111-8111-111111111111","symbol":"AAPL","value":{"quote":{"symbol":"AAPL","bid":"199.9900000001","ask":"200.0000000001","bidSize":null,"askSize":"20","timestamp":"2026-11-09T00:00:00.000Z","source":"BINANCE_STOCKS","timestampSource":"LOCAL_RECEIPT","tradingStatus":"UNKNOWN"},"receivedAt":1794182400000,"eventTimestamp":null,"sourceTimestamp":null,"transport":"REST"}}
retry: 3000

```

相同公开结构的 WebSocket 报价帧：

```text
data: {"kind":"quote","accountId":"11111111-1111-4111-8111-111111111111","symbol":"AAPL","value":{"quote":{"symbol":"AAPL","bid":"199.99","ask":"200.01","bidSize":"10","askSize":"20","timestamp":"2026-11-09T00:00:00.250Z","source":"BINANCE_STOCKS","timestampSource":"LOCAL_RECEIPT","tradingStatus":"UNKNOWN"},"receivedAt":1794182400250,"eventTimestamp":1794182400200,"sourceTimestamp":1794182400190,"transport":"WEBSOCKET"}}
retry: 3000

```

字段语义及可空性：

|字段|消费者必须保留的含义|
|---|---|
|顶层 `accountId`、`symbol`|当前订阅范围；quote 内 symbol 也必须相同。对已切换的订阅丢弃迟到数据|
|`value.quote.bid`、`ask`|正十进制**字符串**；最多 20 位整数、18 位小数，且 bid 不大于 ask。原样保留，不用二进制浮点截断报价|
|`bidSize`、`askSize`|必有字段但可以是 `null`，表示未提供可信数量，不等于 0；非空为非负十进制字符串。公开 schema 允许最多 10 位小数，当前官方 WS 适配只接受安全整数数量再转字符串|
|`quote.source`|固定 `BINANCE_STOCKS`，不是前端自己请求官方接口的许可|
|`quote.timestamp`、`timestampSource`|ISO 时间，固定 `LOCAL_RECEIPT`：**后端本地收到行情的时间**，不是交易所盘口生成时间，也不是客户端到达时间|
|`receivedAt`|上述本地接收时间的 epoch 毫秒整数，必须等于 `Date.parse(quote.timestamp)`|
|`eventTimestamp`|官方 WS `E` 事件时间的 epoch 毫秒；REST 必为 null，WS 必为非 null|
|`sourceTimestamp`|官方 WS `T` 的 epoch 毫秒；官方未提供则 null；REST 必为 null。不能用本地时间补齐|
|`transport`|`REST` 或 `WEBSOCKET`；REST 只是官方快照，不是伪装的推送|
|`tradingStatus`|公开值 `TRADING`／`HALTED`／`UNKNOWN`。当前 REST 与 WS 适配均输出 UNKNOWN，因为没有已核实的停牌状态；客户端不能仅因有 bid/ask 就改为 TRADING|

行情是展示证据，不是可直接提交的限价 DTO。需要从报价填限价时使用公开 `quoteLimitPrice` 及用户选择的方向／舍入策略；禁止直接把完整报价字符串截成两位后假称原价。成交、订单数量和账本金额也不应被报价展示格式重写。

### 7.3 status 的完整值域与转换含义

状态帧包含 `kind: 'status'`、`accountId`、`symbol`、`status`；`code` 和 `retryable` 在公开 schema 中可选。当前中转器总会给 retryable，正常状态通常省略 code。**状态帧没有时间戳、报价 value、requestId 或状态说明 message**；不要从不存在的字段读取健康时间。

```text
data: {"kind":"status","accountId":"11111111-1111-4111-8111-111111111111","symbol":"AAPL","status":"connecting","retryable":true}
retry: 3000

```

|status|精确含义与消费策略|
|---|---|
|`connecting`|开始官方初始化／连接准备；尚无报价证据，显示连接中而非实时正常|
|`waiting`|官方 WebSocket 已建立但未收到有效首个推送，且尚无可用 REST 快照；等待报价，不补零|
|`live`|已收到并接受有效 WS 报价；必须结合最近 quote 的 transport／时间，不能只凭旧 live 永久视为新鲜|
|`snapshot`|已发布 REST 快照，或 WS 初次连接成功时只有既有 REST 快照；明确“快照”而非实时推送|
|`reconnecting`|官方 WebSocket 失败，后台退避重连；可能仍有 REST 快照可读，但不把旧 WS 价继续标实时|
|`unavailable`|初始化／规则读取、快照读取或访问条件失败；查看 code 和 retryable。即使保留上一报价，也必须标陈旧／不可用|

状态按 `(status, code, retryable)` 去重；相同状态不会每次报价都重发。因此客户端应以 quote 更新价格到达时间，不能等待新的 live 状态才更新新鲜度；缺 status 更新也不是心跳丢失。两个异步上游可以产生交错状态，不要求固定的线性序列。

后端在规则核实后立即尝试 REST 快照和 WS；没有 WS，或最近有效 WS 报价已至少约 5 秒未到时，会继续尝试 REST 快照。WS 失败退避为约 1、2、4、8、16、30 秒，上限 30 秒；这是**后端到官方的重连**，不是客户端必须同时重建 SSE 的信号。官方 WS 建连有约 10 秒超时。REST 失败也会状态告知，不会用本地撮合／其他证券价格替代。

后端会过滤错误证券、重复 WS 报价、官方事件时间／来源时间倒退的帧，以及晚于新 WS 结果才返回的旧 REST 读取；同一订阅只保留最近报价。但 SSE 不提供所有 tick：慢客户端队列按 kind 合并，最多最新 quote 与最新 status 两项。不能用报价流重建成交记录、统计完整逐笔序列或推断缺帧期间没有变化。

### 7.4 retryable、专有 code 与建流后终止

可恢复的状态示例：

```text
data: {"kind":"status","accountId":"11111111-1111-4111-8111-111111111111","symbol":"AAPL","status":"reconnecting","code":"QUOTE_STREAM_DISCONNECTED","retryable":true}
retry: 3000

```

终止状态示例：

```text
data: {"kind":"status","accountId":"11111111-1111-4111-8111-111111111111","symbol":"AAPL","status":"unavailable","code":"ACCOUNT_CHANGED","retryable":false}
retry: 3000

```

`retryable` 是**载荷的应用语义**，`retry: 3000` 是 SSE 的传输提示，两者不冲突。终止状态也会带 SSE retry；收到 `retryable: false` 时客户端必须主动 close／abort，禁止让原生 EventSource 根据 retry 自动重连。

|代码／条件|发生位置与意义|处理|
|---|---|---|
|`UNAUTHENTICATED`|建流前可为 HTTP 401；建流后访问巡检失败则为 unavailable、retryable false|停止当前流与会话，重新登录后再选账户建流|
|`ACCOUNT_FORBIDDEN`|建流前 HTTP 404，或建流后账户不存在／不再有权限的终止状态|停止订阅，刷新账户列表与权限，不枚举其他账户|
|`ACCOUNT_UNAVAILABLE`|建流前 HTTP 409，或建流后账户停用／凭据缺失的终止状态|停止订阅，先解决账户状态|
|`ACCOUNT_CHANGED`|当前账户的 owner、加密 API Key 或 Secret 相对建流时改变；终止状态|丢弃旧订阅范围，重新读取账户／身份；确认新条件后才可发起新订阅|
|`QUOTE_ACCESS_UNAVAILABLE`|巡检遇到非 BusinessError（例如读取异常），不能证明仍有权；终止状态|停止订阅，先用 HTTP 恢复访问条件，再决定是否新建；不是自动忽略的瞬时健康状态|
|`SYMBOL_NOT_SUPPORTED`|SSE 已建立后的官方规则核对确认没有该证券；终止状态，且不会继续读其报价|回到官方目录选择有效证券；不靠重试创建本地支持|
|`QUOTE_STREAM_DISCONNECTED`、`QUOTE_STREAM_CONNECT_TIMEOUT`、`QUOTE_STREAM_ABORTED`|官方报价流断开／建连超时／取消等安全 code，通常是 reconnecting、retryable true|SSE 仍可保持，由后端处理上游重连；显示退化状态|
|`QUOTE_UNAVAILABLE`、`EXCHANGE_EVIDENCE_INVALID`、`EXCHANGE_*` 及其他读取错误 code|初始化、官方报价或 WS 失败；通常 unavailable／reconnecting、retryable true|按安全 code 显示无价、权限、限流或证据失败；不宣称当前价格可用|

约每 1500 ms 巡检一次会话、用户角色、账户及凭据；慢客户端写入不会阻止巡检。失效后只尽力发送终止 status，不再发送积压价格，关闭上游并释放名额；终止发送有约 1 秒的强制结束保护，单次写／保活还有约 3 秒慢写保护。终止帧**可能因断线根本到不了客户端**。

行情流内不使用业务流的 `{error: ...}` 终止信封，也不保证发送额外的“流故障”JSON。流处理异常、写超时、客户端取消或服务停止可以直接结束／中断 body；初始 HTTP 200 不会因此改写成 4xx／5xx。需要区别：

- **建流前失败**：解析 HTTP JSON，按认证／权限／校验／配额处理；没有合法 quote/status。
- **建流后 status 失败**：HTTP 仍是 200；按 code、retryable 更新状态。retryable true 表示中转器允许继续恢复，并非保证下一次成功，也不要求客户端立即重开。
- **建流后无终止帧断开**：标断开／陈旧，必要时确认 `/auth/me` 与账户条件后有界重连；不要把旧价当最新，勿靠 EOF 推断账户已禁用或订单已失败。

客户端将传输态、报价态和业务可执行性分开：EventSource OPEN／注释保活只说明 SSE 传输，`live`／`snapshot` 说明最近行情来源，交易是否允许仍要看服务端当前规则与预检。没有有效新报价、HTTP 读取失败或 status unavailable 时，都不能以“连接尚未关闭”为健康替代。

## 8. 安全 HTTP 层与流消费者的交付要点

独立实现不绑定任何框架，但至少应满足：

1. 配置 API 外部基址／代理映射；内部路径从公开契约使用；登录、meta、health 和预检例外不混淆。
2. 统一 credentials、JSON 编码、当前会话 CSRF、输入校验、HTTP／JSON／传输错误分类；不记录任何密码、Cookie、CSRF、官方凭据或签名。
3. 响应读取不丢 `operation`、`error.requestId`、可选标记与阻塞回执；HTTP 状态、取消请求和网络异常不作为交易终态。
4. 一路业务失效提示加按需行情订阅；默认 message 解析；额外错误信封、全部报价状态、nullable 时间／数量、retryable false 都有处理分支。
5. 重连后重读基准，报价重连等待新 quote；没有 Last-Event-ID 补播、命名 heartbeat 或全 tick 保证；主动关闭与非主动断开区别处理。
6. 认证／账户／证券代次隔离，旧流与旧 HTTP 业务结果不得写回新用户或新订阅；旧代 401 仍需按第 3.3 节复核当前身份，代次隔离不保证 Cookie 不变。读失败和仅建流不冒充业务健康。

这些是实现要求，不表示本文编写时已启动服务或对新消费者执行验收。可执行的隔离验收安排由[启动与验收](bootstrap-and-acceptance.md)给出。

## 9. 审计来源

类型与校验的唯一入口仍是文首两个公开文件。下列实现文件用于追溯本文规则，不是隐藏的消费者前置阅读：

- [HTTP 挂载、中间件顺序、CORS、体积、健康检查与错误映射](../../backend/src/server/app.ts)。
- [Cookie、请求 ID、认证、Origin／CSRF、限流与角色门禁](../../backend/src/server/context.ts)。
- [登录、me、登出与密码更改](../../backend/src/server/auth.ts)，[安全令牌派生与脱敏](../../backend/src/security/index.ts)。
- [来源与 Cookie 配置约束](../../backend/src/validation/config.ts)、[服务监听与最外层故障兜底](../../backend/src/server/index.ts)。
- [高风险回执的 HTTP 包装与前置拒绝](../../backend/src/server/operations.ts)、[原操作执行与不确定性](../../backend/src/services/operations.ts)。
- [业务 SSE](../../backend/src/server/events.ts)、[Worker 与公开环境读取](../../backend/src/server/queries.ts)。
- [行情 SSE](../../backend/src/server/quote-stream.ts)、[行情中转状态／重试／访问巡检](../../backend/src/services/market-quote-relay.ts)、[官方报价时间与帧标准化](../../backend/src/api/stocks-quote-stream.ts)、[官方 REST 报价](../../backend/src/api/binance-stocks.ts)。
- [官方错误的应用安全映射](../../backend/src/api/sdk-errors.ts)；更多逐码背景见[Stocks 错误处理说明](../reference/stocks-error-handling.md)，客户端不据此重新实现后端拒单裁决。
