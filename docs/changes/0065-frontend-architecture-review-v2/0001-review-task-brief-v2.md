# 任务：量化交易平台前端架构第二轮复核与技术方案修订

- 状态：已执行（第二轮审查任务书原文归档，定稿后不重写）。
- 类型：审查任务书／执行要求。
- 来源：用户 2026-11-10 下达的第二轮任务附件原文；仅补元数据块与标题层级，未改写要求。
- 作用：确定 Astryx 为唯一主 UI，要求复核第一轮 P0/P1/P2、验证 P1-001 SSE 与存在性问题、修订技术栈并输出 v2 报告。结论见[第二版审查报告](0002-frontend-architecture-feasibility-review-v2.md)。

## 一、任务背景

上一轮已经完成《前端技术架构与后端实现兼容性审查报告》，文件：

`frontend-architecture-feasibility-review.md`

报告基于后端 3.0.0 实际源码，完成了：

- 后端模块架构审查。
- 52 个 HTTP 接口审查。
- 两条 SSE 通道分析。
- 订单、任务、操作回执三套状态分析。
- API 契约完整性审查。
- 会话、CSRF 和权限审查。
- 金融数值与时间精度分析。
- Astryx、MUI 等 UI 方案比较。
- 25 项技术选型分析。
- P0 / P1 / P2 问题清单。
- 前后端联调前置条件。

上一轮结论为：

**整体有条件可行，但不能按原提案原样冻结。**

现在需要进行第二轮复核，目标不是重复第一轮的全部工作，而是：

1. 修正上一轮报告中存在疑问的技术结论。
2. 进一步验证关键 P0 / P1 问题。
3. 对前端技术选型做最终决策。
4. 保留已经确定的 Astryx 设计系统方案。
5. 完善前端实现架构及后端配合事项。
6. 输出一份修订后的完整报告。

本次仍然是只读审查和文档修订，不进入后端代码修改或前端工程开发。

## 二、重要技术决策：Astryx 继续作为唯一主 UI 设计系统

这是本次复核已经确定的项目决策，不需要重新讨论是否采用 MUI。

上一轮报告将 MUI 作为生产主 UI 默认方案，但这个结论受到历史技术方案和既有组件库选型背景的影响，不应直接作为本项目最终技术决策。

现在明确：

**项目继续采用 Astryx 作为唯一主 UI 设计系统。**

相关技术选型：

| 技术 | 最终方向 |
|---|---|
| React | React 19 |
| TypeScript | TypeScript |
| Build | Vite |
| UI Design System | Astryx |
| CSS | Tailwind CSS v4 |
| Design Tokens | Astryx CSS Variables |
| Icons | @tabler/icons-react |
| Router | TanStack Router |
| Server State | TanStack Query |
| Form | React Hook Form |
| Validation | Zod |
| Table | TanStack Table |
| Realtime | Native EventSource |
| HTTP | Native Fetch |
| Financial Decimal | decimal.js |
| Date Formatting | Intl API |
| Timezone | IANA Time Zone + 精确时间适配 |

以下技术决策保持不变，除非源码或实际技术验证证明存在不可接受的问题：

- 不引入 MUI。
- 不引入 Chakra UI。
- 不引入 Ant Design。
- 不引入 Emotion。
- 不直接使用 StyleX 作为业务样式方案。
- 不引入 K 线图相关库。
- 不引入 WebSocket 替代现有 SSE。
- 不引入 TanStack Form 替代 RHF。

### 2.1 对 Astryx 的重新审查要求

保留 Astryx 不代表忽略它的 Beta 风险。

请基于第一轮已经查阅的 Astryx 0.7.11 发布版本及其官方文档，进一步给出实际可执行的使用方案。

重点分析：

1. Astryx 是否能够承担全部基础 UI 组件。
2. 哪些组件可以直接使用。
3. 哪些组件需要二次封装。
4. 哪些组件不适合直接用于金融交易输入。
5. 如何接入 React Hook Form。
6. 如何接入 Tabler Icons。
7. 如何使用 Astryx CSS Variables。
8. Tailwind CSS v4 如何与 Astryx 正确集成。
9. CSS Cascade Layers 的正确顺序。
10. 如何处理深色主题。
11. 如何锁定 Astryx Core、Theme 和 CLI 版本。
12. 如何降低 Beta 版本升级风险。
13. 是否需要 swizzle，以及如何控制源码分叉成本。

特别注意：

上一轮已经发现 Astryx NumberInput 可能对输入进行边界钳制，DateTimeInput 不具备 UTC 微秒无损往返能力。

这两个问题不能因为保留 Astryx 而忽略。

请提出实际的组件使用策略：

- 价格、股数、本金：优先使用字符串输入，不允许自动钳制或静默舍入。
- 任务间隔等普通数字：根据后端 Schema 和业务需求选择合适的数字输入组件。
- 计划时间：保留原始 UTC 字符串，采用独立的精确时间适配。
- 表单：通过 RHF Controller 适配 Astryx 受控组件。
- 图标：通过 Astryx Icon Registry 接入 Tabler Icons。
- 表格：Astryx 负责视觉组件，TanStack Table 负责数据逻辑。

如果某个 Astryx 组件不适合当前业务，应该使用自定义业务组件，而不是为了统一而强行使用。

**本次不再将 MUI 作为替代方案进行比较，也不引入 MUI 相关依赖。**

## 三、第二轮重点复核任务

请完整阅读上一轮报告，并结合当前后端真实源码进行定向复核。

不得只修改报告中的文字而不重新检查代码依据。

### 任务 1：复核 P1-001 操作指纹归一化问题

这是上一轮报告中需要重点复核的疑点。

上一轮报告认为：

同一 UUID、同一账户和相同 JSON，第一次请求可能因 CSRF 问题以原始 JSON 保存操作指纹，第二次请求经过 Zod trim 后使用解析后的 JSON 计算指纹，最终造成冲突。

但上一轮报告第七章同时说明：

- CSRF Middleware 在业务路由执行前处理。
- CSRF 不通过时应该直接拒绝请求。

因此必须确认第一次请求是否真的有机会进入操作回执创建和指纹计算逻辑。

请沿真实执行路径逐层检查：

1. Hono Middleware 注册顺序。
2. CSRF 校验发生位置。
3. Origin 校验发生位置。
4. `operation()` 的调用位置。
5. 请求 Body 的读取位置。
6. Zod Parse 的执行位置。
7. 原始 JSON 与解析后对象分别在哪些位置使用。
8. `requestHash` 的具体计算函数。
9. 操作回执创建的实际事务位置。
10. 同一个原操作 UUID 在不同错误路径下的行为。

请重点检查：

- `backend/src/server/app.ts`
- `backend/src/server/context.ts`
- `backend/src/server/operations.ts`
- `backend/src/services/operations.ts`
- `backend/src/server/admin.ts`
- `backend/src/validation/contracts.ts`

必须明确回答：

**第一次 CSRF 失败的请求，是否可能创建 operation receipt 或保存原始请求指纹？**

如果不可能，上一轮提出的具体复现场景就不能成立。

但如果存在其他合法执行路径能够导致原始参数和解析后参数使用不同指纹，则需要给出实际证据。

请分别区分：

- 已确认缺陷。
- 技术推断。
- 无法复现的假设。

如果问题不成立，直接撤销 P1-001，不要为了维持上一轮报告而保留它。

如果问题成立，给出最小修复方案及真实执行路径。

不要自动生成新 UUID 规避指纹冲突。

### 任务 2：复核 P0-001 SSE 慢写撤权问题

上一轮报告发现：

业务 SSE 的会话检查与 `writeSSE` 处于同一循环，但没有行情 SSE 中独立的授权检查和写入超时机制。

这可能导致慢消费者阻塞授权撤销后的连接终止。

但上一轮并未进行真实网络复现。

请检查：

- `backend/src/server/events.ts`
- `backend/src/server/quote-stream.ts`
- Hono `streamSSE` 的实际实现。
- 当前部署和代理相关配置。
- 现有 SSE 测试。

需要明确：

1. 业务 SSE 是否存在无界写入等待。
2. 慢消费者能否阻塞下一次会话检查。
3. 用户会话撤销后，是否仍可能继续发送后续敏感事件。
4. 连接关闭是否有最终兜底机制。
5. 是否存在代理缓冲导致的额外风险。
6. 行情 SSE 的独立授权 guard 是否可以安全复用到业务 SSE。
7. 是否需要设置写入超时。
8. 如何避免关闭连接时产生未处理异常或资源泄漏。

请区分：

- 连接撤销延迟。
- 已经写入缓冲区但尚未到达浏览器的数据。
- 撤销后新产生并继续发送的数据。

这三者不是同一问题。

如果无法进行真实网络复现，必须明确说明测试限制，并提出隔离环境下的复现方案。

最终判断：

- 是否属于真实安全风险。
- 是否属于资源管理问题。
- 是否属于性能问题。
- 应当保持 P0、调整为 P1，还是撤销。

不能只因为两个 SSE 文件实现不同，就认定其中一个存在安全漏洞。

### 任务 3：复核 P0-006 对象存在性差异

上一轮报告发现：

对象不存在和对象存在但无权访问时，部分 API 返回不同的错误 code/message。

需要进一步分析：

1. 哪些接口存在这种差异。
2. 哪些接口只存在消息差异。
3. 哪些接口存在错误码差异。
4. 是否会向未授权用户暴露其他用户的资源存在性。
5. UUID 是否存在实际可枚举条件。
6. 是否有速率限制或其他保护措施。
7. 当前系统的威胁模型是否要求统一响应。
8. 是否影响原操作恢复和内部审计。

必须区分：

- 资源存在性信号。
- 资源内容泄露。
- 资源可枚举性。
- 真实越权访问。

不能把这些问题混为一谈。

请重新判断 P0-006 的优先级。

如果属于纵深防御加固，建议调整为 P1。

如果存在明确可利用的越权信息泄露路径，提供证据并保留 P0。

任何统一对外错误的修改都必须保留内部授权判断和审计能力。

### 任务 4：重新审查 P0/P1/P2 全部问题

不要只处理上面三个问题。

请重新检查上一轮报告中的全部问题：

- P0-001 至 P0-008。
- P1-001 至 P1-006。
- P2-001 至 P2-005。

每个问题都需要给出：

| 字段 | 内容 |
|---|---|
| 原问题编号 | 上一轮编号 |
| 原结论 | 上一轮判断 |
| 本轮复核结果 | 确认 / 部分确认 / 撤销 / 调整 |
| 源码依据 | 当前真实路径及行号 |
| 实际影响 | 对前端和后端的影响 |
| 最终优先级 | P0 / P1 / P2 / 无需处理 |
| 建议 | 最小解决方案 |
| 责任方 | 前端 / 后端 / 双方 |

不能简单继承上一轮优先级。

必须根据真实影响重新判断。

特别注意：

P0 应当只保留会阻碍交易正确性、存在明确安全风险或使关键业务无法可靠实现的问题。

普通组件适配、文档完善和开发便利性不能列为 P0。

## 四、前端技术栈最终复核

在保留 Astryx 的前提下，重新输出最终技术栈。

重点复核以下内容：

### 4.1 UI 和样式

- React 19。
- Astryx。
- Tailwind CSS v4。
- Astryx CSS Variables。
- Tabler Icons。

明确每项职责和依赖关系。

不要重复引入第二套 UI 组件库。

不要把 Astryx 内部使用 StyleX 理解为业务项目必须直接使用 StyleX。

### 4.2 TanStack 生态

继续评估：

- TanStack Router。
- TanStack Query。
- TanStack Table。
- TanStack Virtual（按需）。

需要特别注意：

1. Router Loader 与 Query 是否重复缓存。
2. Query 与 SSE 的数据同步如何实现。
3. Query 取消请求与 sessionEpoch 如何配合。
4. 如何处理旧 GET 覆盖新状态。
5. 是否需要 Vanilla Store。
6. 是否需要 Zustand。
7. 表格是否存在不必要的第二套排序和分页状态。

不因为使用 TanStack Router，就默认所有 TanStack 产品都必须采用。

### 4.3 表单

保留：

- React Hook Form。
- Zod。
- @hookform/resolvers。

请验证 Astryx 组件与 RHF 的实际适配方式。

重点是：

- 受控组件。
- 字符串输入。
- 动态字段。
- 条件字段。
- 完整 PATCH。
- disabled 字段。
- null、undefined 和空字符串。
- Zod 4 的 input/output 类型。

### 4.4 API 和实时数据

保留：

- Native Fetch。
- Backend Contracts。
- Native EventSource。
- TanStack Query。

重点：

- 不强制引入 Hono RPC。
- 不引入 WebSocket。
- 不将 SSE 作为可靠事件日志。
- 不把 HTTP 超时视为业务失败。
- 不自动重试写操作。
- 不合并订单、任务和操作回执三套状态。

### 4.5 金融数据和时间

保留：

- decimal.js。
- Intl API。
- IANA Time Zone。
- 必要的 Temporal 适配。

重点：

- 价格、股数、本金使用字符串。
- 不允许 Number 静默损失精度。
- 不允许输入组件自动钳制金融值。
- 保留原始 UTC 时间字符串。
- 最多六位有效小数秒。
- DST 春季不存在时间和秋季重复时间必须有明确处理。
- 展示舍入不得修改提交值。

### 4.6 测试体系

保留：

- Vitest。
- React Testing Library。
- Playwright。
- MSW。
- React Doctor。
- Semgrep（安全检查）。

需要明确每项的职责，不要让多个工具重复承担同一种测试。

特别强调：

MSW 可以模拟协议，但不能替代真实 HTTP、PostgreSQL、Cookie、SSE 和浏览器竞态测试。

## 五、完善前端实现架构

上一轮报告已经提出了新的目录结构。

请以 Astryx 为主 UI 设计系统，重新完善以下结构：

```text
src/
├── app/
│   ├── router/
│   ├── providers/
│   ├── session/
│   └── business-sync/
│
├── routes/
│
├── features/
│   ├── auth/
│   ├── accounts/
│   ├── market/
│   ├── orders/
│   ├── tasks/
│   ├── operations/
│   ├── reconciliations/
│   ├── positions/
│   ├── ledger/
│   └── administration/
│
├── components/
│   ├── ui/
│   ├── shared/
│   └── data-table/
│
├── shared/
│   ├── http/
│   ├── contracts/
│   ├── realtime/
│   ├── decimal/
│   └── time/
│
├── theme/
│   ├── index.ts
│   ├── tokens.ts
│   └── icons.tsx
│
└── styles/
    └── index.css
```

需要说明：

1. 每个 Feature 的职责。
2. 哪些模块拥有自己的 API。
3. 哪些模块拥有 Query Key。
4. 哪些模块拥有表单 Schema。
5. 哪些状态由 Query 管理。
6. 哪些状态由局部 React State 管理。
7. 哪些状态需要独立外部 Store。
8. SSE Manager 的生命周期。
9. Operation Recovery 的生命周期。
10. Session Epoch 的职责。

不要为了目录完整而建立大量空目录或重复的服务层。

## 六、重新确定 Astryx 业务组件实施方案

请根据后端真实业务能力，整理需要开发的业务组件。

至少考虑：

### 应用框架

- AppShell。
- SideNavigation。
- TopNavigation。
- AccountSelector。
- NotificationCenter。
- UserMenu。

### 账户与资产

- AccountSummary。
- AccountStatus。
- FundingBalance。
- AssetSnapshot。
- PositionTable。
- HoldingsEvidence。

### 交易执行

- OrderEntry。
- OrderPreflightPanel。
- OrderConfirmDialog。
- OrderStatus。
- OrderTable。
- OrderDetail。
- CancelOrderDialog。

### 批量任务

- TaskEditor。
- TaskConfigurationSummary。
- TaskMonitor。
- TaskProgress。
- TaskControlPanel。
- TaskOrderTable。

### 操作恢复

- OperationStatus。
- OperationRecoveryPanel。
- UnknownOrderPanel。
- ReconciliationPanel。
- ReconciliationDifferenceList。

### 账本与管理

- LedgerTable。
- TradeTable。
- AuditTable。
- UserManagementTable。
- AdminAccountTable。
- RiskControlPanel。
- WorkerHealthStatus。

对每个组件说明：

- 是否直接使用 Astryx 基础组件组合。
- 是否需要独立业务逻辑。
- 是否需要独立数据请求。
- 是否需要独立状态映射。
- 是否需要专门测试。

不要把所有组件都做成复杂的通用组件。

## 七、最终需要重新输出的报告

请基于上一轮报告重新生成完整报告：

`frontend-architecture-feasibility-review-v2.md`

不要覆盖上一轮原始报告。

新报告需要保留原报告的 13 章结构，并根据本轮结果修订内容。

至少包括：

1. 总体审查结论。
2. 后端实际架构分析。
3. 前端技术选型审查。
4. API 契约分析。
5. SSE 可行性分析。
6. 业务状态与操作恢复分析。
7. 安全与权限分析。
8. 数据表格和数据处理分析。
9. Astryx 可行性与实施方案。
10. P0/P1/P2 问题及改进清单。
11. 最终技术栈。
12. 前后端联调前置条件。
13. 最终建议与验证证据。

本轮新增要求：

### 1. 明确 Astryx 是最终主 UI 方案

不能再将 MUI 作为默认生产方案。

不能在最终技术栈中加入 MUI、Emotion 或 MUI X。

### 2. 保留 Tailwind CSS v4

除非发现真实兼容性问题，否则继续采用。

如果存在问题，必须给出最小可复现证据和替代方案。

### 3. 复核上一轮所有 P0/P1/P2

保留、调整、撤销都必须给出依据。

### 4. 区分前端责任与后端责任

不要将前端可以处理的问题全部转化为后端改造任务。

也不要将必须由后端解决的交易安全问题交给前端规避。

### 5. 最终技术栈必须明确

输出一张最终技术栈表：

| 分类 | 技术 | 最终决定 | 版本范围 | 采用原因 |
|---|---|---|---|---|

区分：

- 必须引入。
- 按需引入。
- 暂缓引入。
- 不引入。

## 八、源码证据和验证要求

所有本轮修改过的结论都必须重新检查实际源码。

要求：

1. 文件路径必须真实。
2. 行号必须对应当前 HEAD。
3. 函数和类型名称必须真实。
4. 不能引用已经失效的行号。
5. 技术推断必须明确标记。
6. 没有实际复现的风险不能写成已复现缺陷。
7. 第三方能力需要引用对应版本的官方文档或发布包。
8. 不得把原型验证计划写成已经通过。
9. 不得把跳过的测试写成通过。
10. 不得把类型检查通过当作运行时正确性证明。

对无法实际复现的问题，必须说明：

- 当前缺少什么条件。
- 为什么无法验证。
- 建议如何验证。
- 是否阻碍前端开发。

## 九、执行约束

本次任务仅允许：

- 阅读上一轮审查报告。
- 阅读后端项目概览。
- 阅读前端架构提案。
- 检查真实后端源码。
- 搜索和追踪函数调用。
- 检查类型及运行时实现。
- 运行安全的现有测试。
- 查阅 Astryx 官方文档和已发布版本。
- 编写第二轮审查报告。

禁止：

- 修改后端业务代码。
- 修改 API 行为。
- 修改数据库 Schema。
- 创建或执行数据库迁移。
- 修改订单状态机。
- 修改任务执行规则。
- 修改交易 SDK。
- 修改 Worker。
- 修改安全机制。
- 引入生产依赖。
- 创建前端工程。
- 执行真实买入、卖出或撤单。
- 连接真实资金账户。
- 自动实施上一轮发现的修复。

发现需要修改后端的事项，只记录问题、证据、建议和影响范围。

执行前检查 Git 工作区。

不得覆盖、删除或重置已有用户修改。

只允许新增本次指定的报告文件：

`frontend-architecture-feasibility-review-v2.md`

## 十、最终验收标准

本轮报告完成后，必须明确回答：

1. Astryx 是否可以作为当前项目唯一主 UI 设计系统？
2. Tailwind CSS v4 是否可以与 Astryx 稳定共存？
3. 哪些 Astryx 组件可以直接使用，哪些必须封装？
4. RHF + Zod 是否适合实际任务配置表单？
5. TanStack Router、Query、Table 是否仍然是最优组合？
6. Zustand 是否真的需要引入？
7. 两条 SSE 是否足以满足当前业务需求？
8. SSE 与 Query 如何实现最终数据收敛？
9. 未知订单和原操作回执如何跨刷新恢复？
10. 当前 API 契约还缺少哪些必要内容？
11. 迟到 401 是否必须由后端修复？
12. 上一轮 P0/P1/P2 是否存在误判？
13. 哪些问题必须在前端开发前解决？
14. 哪些问题可以在前端开发过程中解决？
15. 最终前端技术栈是否可以冻结？

**本次任务的最终目标：在保留 Astryx + Tailwind CSS v4 的前提下，形成一套经过真实后端源码验证、职责清晰、风险明确、能够直接进入前端工程建设阶段的最终技术架构方案。**

报告交付后等待进一步指示，不自动进入后端修改或前端开发阶段。
