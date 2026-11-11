# 任务：量化交易平台第三阶段——只读业务页面建设与 API 契约生成体系迁移

## 一、任务目标

在已经完成第一、第二阶段的前端工程基础上，正式开始第三阶段开发。

本阶段包含两个部分：

**前置任务 A：迁移 api-contracts 契约生成体系**

将原来位于仓库根目录的独立 `api-contracts/` 调整为后端项目内部的本地生成目录：

`backend/api-contracts/`

该目录由后端脚本自动生成，不纳入 Git，不作为独立项目维护。

前端直接通过本地文件依赖引用：

`file:../backend/api-contracts`

**主要任务 B：建设只读业务页面**

使用现有 Hono RPC、TanStack Query、Session Manager、权限体系、Business SSE 和 Astryx AppShell，完成交易平台第一批真实业务查询页面。

本阶段不实现订单提交、撤单、批量任务控制等业务写操作。

最终目标：

1. 完成契约生成体系迁移。
2. 确保前后端可以在仓库迁移后重新生成契约。
3. 建立完整的只读业务 Feature 架构。
4. 实现账户、证券、行情、订单、任务、持仓、账本、核对和管理等查询页面。
5. 正确接入 Business SSE 和 TanStack Query。
6. 完成数据真实性、权限、分页、筛选和异常状态展示。
7. 建立对应测试和浏览器验收。

---

# 二、执行前检查与必须阅读的资料

## 2.1 Git 检查

开始前执行：

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git diff --stat
git diff --cached --stat
```

当前预期分支：

`astryx-dev`

必须记录：

- 当前 HEAD。
- 工作区状态。
- 暂存区状态。
- 第一、第二阶段已有变更。
- 当前 `api-contracts/` 的实际位置。
- backend 和 frontend 的现有目录结构。

注意：第二阶段报告明确说明，第二阶段工作区没有提交或推送，不能把第二阶段开始前的 HEAD 冒充为包含第二阶段全部实现的提交。

不得通过 reset、clean、checkout、stash、rebase 或强制切换分支处理工作区。

保护所有已有修改。

## 2.2 必须阅读的报告

完整阅读：

1. `docs/changes/0066-frontend-bootstrap.md`
2. `docs/changes/0067-frontend-bootstrap-review-fixes.md`
3. `docs/changes/0068-frontend-bootstrap-independent-review-round2.md`
4. `docs/changes/0069-frontend-r2-01-identity-fix/0002-fix-and-targeted-verification.md`
5. 第二阶段实施与验证报告：`0002-implementation-and-verification.md`
6. 第一、第二阶段对应的任务书。
7. `frontend/README.md`
8. `frontend/DEVELOPMENT.md`
9. `backend/README.md` 及后端开发规范。
10. 根目录、backend、frontend 中的 `AGENTS.md`、`CLAUDE.md`。

报告中的实际实现优先于早期架构提案。

不得重新讨论已经确定的主技术栈。

## 2.3 需要阅读的实际代码

第二阶段已经实现的关键模块：

```text
frontend/src/
├── app/
│   ├── providers/
│   ├── router/
│   └── session/
│
├── features/
│   └── auth/
│
├── services/
│   ├── api/
│   └── realtime/
│
├── components/
│   ├── shared/
│   └── ui/
│
├── theme/
└── lib/
```

实际路径以当前工程为准。

后端需要重点阅读：

```text
backend/
├── scripts/
│   └── contract-entry.ts
├── contracts/
│   ├── client.d.ts
│   └── validation.ts
└── src/
    ├── server/
    ├── services/
    ├── domain/
    ├── database/
    └── validation/
```

不能只根据文档中的接口名称创建页面。

必须检查真实 API 路由、请求参数、响应结构、Schema、权限及业务状态。

---

# 三、前置任务 A：迁移 api-contracts 生成体系

这是本阶段第一项任务，必须先完成并验收，然后才开始业务 Feature 开发。

## 3.1 当前实现情况

第二阶段已经存在：

- `backend/src/server/app.ts` 导出的 `AppType`。
- `backend/scripts/contract-entry.ts`，使用 `hc<AppType>()` 生成展开后的客户端声明。
- `backend/contracts/client.d.ts`。
- `backend/contracts/validation.ts`。
- 根目录 `api-contracts/`。
- `api-contracts/scripts/sync.ts`。
- 前端 `contracts:sync`、`contracts:check` 机制。

第二阶段报告记录：

- 后端公开产物与本地副本已经进行 SHA-256 比对。
- 前端实际通过 Hono RPC 调用认证 API。
- 使用 `ApiClient`，不是错误地将 `ApiClient` 当作 `AppType`。
- `client.d.ts` 和 `validation.ts` 已实际参与前端类型与校验。
- Hono 版本为 4.13.13。

本次不是重新设计 RPC，也不是重新实现生成器。

**目标是迁移现有体系，保留现有行为。**

## 3.2 目标目录结构

调整为：

```text
project/
├── backend/
│   ├── scripts/
│   │   ├── contract-entry.ts
│   │   └── contracts-sync.ts
│   │
│   ├── contracts/
│   │   ├── client.d.ts
│   │   └── validation.ts
│   │
│   ├── api-contracts/          # 自动生成，不提交 Git
│   │   ├── package.json
│   │   ├── index.d.ts
│   │   ├── client.d.ts
│   │   └── validation.ts
│   │
│   └── package.json
│
└── frontend/
    ├── package.json
    ├── bun.lock
    └── ...
```

实际生成目录可以根据当前现有包结构微调，但必须满足：

- 位于 `backend/` 内。
- 不提交 Git。
- 可以从零重新生成。
- 不需要人工复制文件。
- 不依赖仓库根目录的独立 `api-contracts/`。
- 不影响后端运行和构建。

## 3.3 迁移现有脚本

优先复用：

`api-contracts/scripts/sync.ts`

将现有同步逻辑迁移到后端：

`backend/scripts/contracts-sync.ts`

不要直接重写一套生成体系。

先检查：

1. `contract-entry.ts` 的真实输出位置。
2. 是否会修改 `backend/contracts/`。
3. 是否会产生额外构建文件。
4. 是否依赖当前 Shell 工作目录。
5. 是否需要运行后端入口。
6. 是否会启动 Worker、数据库或其他服务。

本地契约包生成不应启动后端 HTTP 服务、Worker、数据库或官方 SDK。

如果现有 `contract-entry.ts` 的输出路径不适合直接执行，允许进行最小的脚本适配，但必须保留原有公开契约语义。

不得因为迁移生成目录而改变后端业务路由或 API 行为。

## 3.4 后端统一命令

在 `backend/package.json` 增加统一命令。

建议：

```json
{
  "scripts": {
    "contracts:prepare": "bun scripts/contracts-sync.ts",
    "contracts:check": "bun scripts/contracts-sync.ts --check"
  }
}
```

实际命令名称可以沿用已有命名规范，但必须提供：

### contracts:prepare

负责：

1. 定位 backend 项目根目录。
2. 检查源契约产物。
3. 创建 `backend/api-contracts/`。
4. 生成 package.json。
5. 复制客户端声明。
6. 复制公开校验规则。
7. 创建必要的类型入口。
8. 验证 Hono 版本与后端一致。
9. 检查生成文件完整性。

### contracts:check

只检查，不修改任何文件。

检查：

- 生成文件是否存在。
- 文件是否完整。
- 与 `backend/contracts/` 是否一致。
- package.json 是否正确。
- Hono 版本是否匹配。
- 导出路径是否正确。
- 是否存在过期产物。

检查失败必须返回非零退出码。

## 3.5 路径独立性

生成脚本必须使用脚本自身的绝对位置定位 backend 根目录。

禁止依赖：

```ts
process.cwd()
```

作为唯一项目根目录判断依据。

必须验证：

从仓库根目录执行：

```bash
bun run --cwd backend contracts:prepare
```

从 backend 目录执行：

```bash
cd backend
bun run contracts:prepare
```

从 frontend 目录触发后端命令：

```bash
cd frontend
bun run --cwd ../backend contracts:prepare
```

三个入口必须指向同一个生成目录。

如果使用 Bun 的文件链接行为存在平台限制，应明确记录，不得伪造成功。

## 3.6 Git 忽略规则

在 `backend/.gitignore` 中忽略：

```gitignore
/api-contracts/
```

要求：

- `backend/contracts/` 保留在 Git。
- `backend/scripts/` 保留在 Git。
- 后端生成脚本保留在 Git。
- 只有 `backend/api-contracts/` 生成产物不提交。

检查：

```bash
git check-ignore -v backend/api-contracts/package.json
git status --short -- backend/api-contracts
```

不能因为忽略目录而误删或忽略真正的契约源文件。

## 3.7 前端依赖迁移

修改：

`frontend/package.json`

原依赖：

```json
{
  "dependencies": {
    "@project/api-contracts": "file:../api-contracts"
  }
}
```

修改为：

```json
{
  "dependencies": {
    "@project/api-contracts": "file:../backend/api-contracts",
    "hono": "4.13.13"
  }
}
```

版本以当前第二阶段实际锁定版本为准。

前端仍然使用：

```ts
import type { ApiClient } from '@project/api-contracts';
```

不修改现有 RPC 客户端创建和统一传输结构，除非本地包解析确实要求最小调整。

## 3.8 迁移验收

必须执行完整的从零生成验证：

1. 备份或记录现有生成产物。
2. 删除旧根目录 `api-contracts/` 的生成副本。
3. 确认 `backend/api-contracts/` 不存在。
4. 执行 `backend` 的 contracts:prepare。
5. 确认目录自动创建。
6. 执行 contracts:check。
7. 安装前端本地依赖。
8. 执行前端类型检查。
9. 执行前端 RPC 类型负例。
10. 验证真实业务 API 类型推导没有退化。

禁止删除：

- `backend/contracts/client.d.ts`。
- `backend/contracts/validation.ts`。
- `backend/scripts/contract-entry.ts`。
- 已提交的契约源文件。

特别验证：

**当 `backend/api-contracts/` 被删除后，执行后端生成命令，必须能够从现有受版本控制的契约源重新创建完整目录。**

## 3.9 迁移完成后的工作流

正式文档统一为：

首次克隆仓库：

```bash
cd backend
bun install
bun run contracts:prepare

cd ../frontend
bun install
```

后端契约更新后：

```bash
cd backend
bun run contracts:prepare

cd ../frontend
bun install
bun run contracts:check
bun run typecheck
```

日常检查：

```bash
cd backend
bun run contracts:check
```

如果前端需要独立验证契约一致性，可以提供：

```bash
bun run contracts:check
```

但必须明确其实际调用的后端脚本路径。

注意：

`file:` 依赖可能涉及 Bun 本地链接及锁文件解析行为。必须在当前 Windows + Bun 环境中验证。

不能仅凭 package.json 中路径正确，就认为安装副本一定同步。

不能将生成目录加入 Git，也不能把契约生成物发布到 npm。

## 3.10 本前置任务的验收标准

必须满足：

- 根目录不再存在独立 `api-contracts/`。
- 后端生成目录为 `backend/api-contracts/`。
- 生成目录不被 Git 跟踪。
- 后端生成脚本可以从任意工作目录执行。
- 删除生成目录后可以重新生成。
- 前端 `file:` 依赖指向新目录。
- `bun install --frozen-lockfile` 正常。
- Hono RPC 类型推导正常。
- `contracts:check` 能识别陈旧副本。
- 现有认证 API 调用不回归。
- 后端业务代码和运行行为不变。

完成本前置任务后，在阶段报告中单独记录结果，再进入第三阶段业务开发。

---

# 四、第三阶段业务架构

## 4.1 Feature 目录

在现有工程中建立：

```text
frontend/src/features/
├── auth/
├── dashboard/
├── accounts/
├── securities/
├── market/
├── orders/
├── tasks/
├── positions/
├── trades/
├── ledger/
├── reconciliations/
├── operations/
└── administration/
```

实际 Feature 应根据真实后端 API 决定。

不要求每个目录都必须存在。

每个 Feature 只创建实际需要的模块：

```text
features/accounts/
├── api.ts
├── queries.ts
├── query-keys.ts
├── schemas.ts
├── types.ts
├── components/
└── pages/
```

职责：

- `api.ts`：RPC 调用和响应适配。
- `queries.ts`：TanStack Query Hooks。
- `query-keys.ts`：唯一 Query Key 定义。
- `schemas.ts`：必要的运行时 Schema。
- `types.ts`：领域展示模型，不能重复复制后端 DTO。
- `components/`：模块内部组件。
- `pages/`：页面入口。

不要机械创建全部文件。

## 4.2 API 调用规则

必须使用第二阶段已实现的 Hono RPC 客户端。

禁止：

- 在业务 Feature 中直接调用 fetch。
- 每个模块创建自己的 hc()。
- 绕过统一自定义 Fetch。
- 重新实现 CSRF。
- 重新实现 Session Epoch。
- 重新实现 Operation Receipt。
- 手写第二套 API DTO。

业务模块通过统一 API Adapter 调用 RPC。

如果需要对响应进行展示模型转换，在 Feature 内建立明确的 Mapper。

不要将后端 DTO 直接作为 UI 组件内部状态随意修改。

## 4.3 TanStack Query 规则

每个 Feature 统一管理 Query Key。

例如：

```ts
export const accountKeys = {
  all: ['accounts'] as const,
  lists: () => [...accountKeys.all, 'list'] as const,
  detail: (accountId: string) =>
    [...accountKeys.all, 'detail', accountId] as const,
};
```

实际项目必须包含 Session Epoch、用户和账户作用域，沿用第二阶段的 Query 作用域规则。

必须检查：

- 用户切换。
- 账户切换。
- 权限变化。
- 查询参数变化。
- 页面离开。
- SSE 通知。
- 旧 Query 结果返回。

禁止：

- 同一数据同时维护在 Query 和 Zustand。
- 使用组件 State 保存服务端业务数据。
- 为每个页面创建独立 QueryClient。
- 在组件中直接拼接 Query Key。
- 用 `invalidateQueries` 无差别刷新全部业务数据。

---

# 五、业务模块实施范围

所有模块以真实后端 API 和契约为依据。

不能因为产品规划里有某个页面，就假设后端已经提供对应接口。

如果没有真实 API，明确标记未实现，不得伪造业务数据或接口。

## 5.1 工作台 Dashboard

展示真实可用的基础信息：

- 当前用户。
- 当前角色。
- 可管理账户范围。
- 账户概览。
- 连接状态。
- 业务资源更新时间。
- 当前需要关注的业务状态。

如果后端没有提供聚合 Dashboard API：

使用已有接口组合查询，但必须控制请求数量。

不要为了 Dashboard 自行修改后端增加聚合接口。

不展示虚构的：

- 账户总资产。
- 盈亏。
- 成交统计。
- 未完成订单数量。

没有可靠数据来源时明确显示不可用。

## 5.2 账户管理 Accounts

只读功能：

- 账户列表。
- 账户详情。
- 账户状态。
- 账户连接状态。
- 账户余额和可用资金（如果 API 提供）。
- 最近更新时间。
- 数据来源和可信程度。

明确区分：

- 已确认余额。
- 未知余额。
- 不可用余额。
- 历史快照。
- 尚未同步。

不得把 `null` 显示为零。

不得把连接正常显示为资金充足。

管理员和交易员按照后端实际权限显示不同账户范围。

## 5.3 证券与行情 Securities / Market

只读功能：

- 证券搜索。
- 证券列表。
- 证券详情。
- 交易规则。
- 当前 Bid / Ask。
- 最新报价时间。
- 行情连接状态。

行情 SSE 使用第二阶段已有的基础设施，只有在真实 API 和协议确认后才建立证券订阅。

当前产品不做 K 线图。

不引入 TradingView、ECharts 或其他 K 线图组件。

行情展示必须区分：

- 当前有效报价。
- 过期报价。
- 连接中断。
- 尚无报价。
- 时间未知。

不要把上一次报价伪装成实时价格。

## 5.4 订单管理 Orders

只读功能：

- 订单列表。
- 订单筛选。
- 订单详情。
- 订单状态。
- 订单原始请求信息（按权限）。
- 订单更新时间。
- 订单关联任务。
- 订单关联操作回执（如 API 提供）。

必须区分：

- 订单状态。
- Operation Receipt 状态。
- 成交状态。
- 核对状态。

`FILLED` 不代表费用、资金和库存已经完全闭环。

不得实现：

- 买入。
- 卖出。
- 撤单。
- 修改订单。

不要在订单列表中放置可执行写操作的按钮。

## 5.5 批量任务 Tasks

只读功能：

- 任务列表。
- 任务详情。
- 任务配置展示。
- 执行进度。
- 已生成订单。
- 失败原因。
- 最后更新时间。
- 任务状态。

保留完整时间精度。

不要使用 Date 将原始计划时间重新序列化。

历史时间可能超过六位有效小数，未修改的历史值必须按后端契约保留。

不得实现：

- 创建任务。
- 修改任务。
- 启动。
- 暂停。
- 继续。
- 停止。

这些属于后续写操作阶段。

## 5.6 持仓 Positions

只读功能：

- 当前持仓。
- 数量。
- 可用数量（仅当权威 API 提供）。
- 证券信息。
- 数据来源。
- 最近更新时间。

特别注意：

本地成交重放得出的名义持仓不能显示为官方完整持仓。

不能把没有返回的持仓直接当成零。

不能把冻结数量、可卖数量和总持仓混为一谈。

## 5.7 交易记录 Trades

只读功能：

- 成交列表。
- 成交详情。
- 关联订单。
- 成交数量。
- 成交价格。
- 成交时间。
- 手续费（如果提供）。
- 成交来源。

使用 Decimal 字符串处理金融数据。

不得使用 Number 进行精度敏感计算。

## 5.8 账本 Ledger

只读功能：

- 账本列表。
- 账本详情。
- 金额。
- 币种。
- 交易方向。
- 关联对象。
- 创建时间。

严格区分：

- 实际账本记录。
- 估算值。
- 未计算值。
- 未知值。

不得自行计算并冒充后端权威盈亏。

R2-02 的 Decimal 接受范围、聚合精度和规范化闭包必须在真实金额聚合接入前重新确认。

不能因为 Decimal 使用 50 位上下文就宣称任意金额计算无限精确。

## 5.9 账户核对 Reconciliations

只读功能：

- 核对记录。
- 核对结果。
- 差异列表。
- 核对时间。
- 关联账户。
- 核对完整性。
- 未完成原因。

区分：

- 一致。
- 存在差异。
- 部分核对。
- 不可用。
- 未完成。
- 未知。

`SUCCEEDED` 不能直接显示为账户核对一致。

## 5.10 操作记录 Operations

只读功能：

- 操作记录列表。
- 操作详情。
- 操作类型。
- 操作状态。
- 目标对象。
- 操作时间。
- 操作回执。

严格使用第一阶段已经验收的：

- Receipt absent / valid / invalid。
- OriginalOperationIdentity。
- attempt / intent。
- receiptMatchesRequest。
- classifyWriteOutcome。

没有完整原请求身份的回执不能被解释为原意图终态。

本阶段只展示已有服务端操作记录，不实现：

- 原操作持久化恢复。
- 原操作重新执行。
- 自动对账。
- 自动重试。

完整 Operation Recovery 留到第四阶段。

## 5.11 管理后台 Administration

只读功能，按照第二阶段权限体系实现：

- 用户列表。
- 用户详情。
- 管理账户列表。
- 审计记录。
- 系统状态。
- Worker 状态。
- 风险控制当前配置。

管理员专项权限必须按真实后端字段判断。

普通管理员不能因为拥有 ADMIN 角色就自动获得管理员账户管理权限。

不得实现用户创建、禁用、删除、权限修改或风险参数修改。

---

# 六、统一数据表格规范

使用：

- Astryx Table：视觉。
- TanStack Table：数据逻辑。

继续使用已经完成的 DataTableShell。

统一实现：

- 服务端分页。
- 服务端排序。
- 筛选。
- 列显示。
- 空状态。
- 加载状态。
- 错误状态。
- 陈旧数据状态。
- 刷新时间。

要求：

1. 每张表只能有一个分页状态拥有者。
2. URL Search Params 能表达可分享的筛选和分页状态时优先使用 Router。
3. 服务端不支持的排序或筛选不能假装在服务器执行。
4. 不为所有列表强行统一一种分页协议。
5. 分页能力必须来自对应 API 契约。
6. 当前数据陈旧时，明确显示最后成功更新时间。
7. 账户切换不能展示上一账户的 placeholderData。
8. 表格排序不能对金融字符串使用字典序。

如果某个接口不支持分页，就不要伪造分页参数。

如果数据量不适合前端全量加载，明确报告接口限制，不自行改变后端。

虚拟滚动只有在真实性能测量证明需要时才引入。

---

# 七、Business SSE 与 TanStack Query 实际接入

第二阶段已经完成：

- BusinessSseManager。
- QueryConvergence。
- 资源解析。
- 账户和用户作用域。
- 在途请求尾随补读。
- 有界重连。

第三阶段不允许重新创建第二套 SSE Manager。

## 7.1 接入要求

每个 Feature 注册资源依赖：

- resource。
- Query Key。
- accountId。
- canRead(user)。

只有当前用户有权限读取的资源才参与收敛。

## 7.2 资源映射

根据真实后端 SSE resources 和 API 资源映射：

| SSE 资源 | 可能关联的业务模块 |
|---|---|
| accounts | 账户、Dashboard |
| orders | 订单 |
| tasks | 批量任务 |
| ledger | 账本 |
| events | 操作记录 |
| users | 用户管理 |
| audit | 审计 |
| settings | 系统设置展示 |
| worker | Worker 状态 |

必须根据真实 API 资源依赖核实，不能直接假设一对一。

## 7.3 收敛规则

- 活动 Query：按第二阶段机制执行有限刷新。
- 在途 Query：保留 dirty/version 并尾随补读。
- 非活动 Query：只标记 stale。
- 权限撤销：停止相关资源读取。
- 账户切换：旧账户资源立即失效。
- SSE 断开：页面显示连接状态，不能继续假装实时。
- 重连：按已有预算和恢复机制执行。
- 未知操作：不依赖 SSE 作为最终结论，仍需要 REST 查询。

SSE 是资源变化通知，不是可靠事件日志。

不得因为 SSE 收到 refresh 就直接将订单状态标记为成功。

---

# 八、金融数据与时间展示规范

本阶段开始真实展示金融数据，必须执行以下规范。

## 8.1 数值

- API 原始金融值使用字符串。
- Decimal 统一使用项目独立上下文。
- 展示格式化不得回写原始值。
- 未知值不得转换为零。
- 超出已支持计算范围必须明确拒绝。
- 不允许 `parseFloat`、`Number` 参与精度敏感计算。

R2-02 仍需在实际金额聚合、乘除等操作接入前确定精度和规模边界。

## 8.2 时间

- UTC 原始字符串是权威值。
- 展示时间使用 Intl。
- IANA 时区明确。
- 不使用 Date 无损往返微秒时间。
- DST gap 拒绝。
- DST fold 显示两个候选。
- 历史超六位有效小数时间不得因为只是展示而被改写。

R2-03、R2-04 继续登记。

如果某个业务页面暂时无法正确展示某类时间，明确展示原始 UTC 和不可转换状态，不要生成错误的本地时间。

---

# 九、UI 与交互要求

继续使用：

- React 19。
- Astryx 0.7.11。
- Tailwind CSS v4。
- Astryx CSS Variables。
- Tabler Icons。
- TanStack Router。
- TanStack Query。

不引入其他 UI 组件库。

遵循 Financial Trading Platform Design System：

- 高信息密度。
- 清晰的数据层级。
- 风险状态突出但不滥用颜色。
- 真实更新时间。
- 数据来源透明。
- 空值与未知状态明确。
- 操作和展示分离。
- 表格优先。
- 减少不必要的卡片嵌套。

不要使用普通 SaaS 模板生成所有页面。

所有页面必须使用现有 AppShell。

不要重新设计一套导航或主题。

移动端至少保证：

- 导航正常。
- 主要数据可以访问。
- 表格允许横向滚动。
- Dialog / Drawer 不溢出。
- 关键状态不会被隐藏。

---

# 十、真实数据与 Mock 的边界

这是本阶段非常重要的约束。

当前第二阶段报告明确：真实后端尚未联调。

本阶段优先依据真实后端契约和源码实现查询模块。

允许使用 MSW 进行开发和自动化测试。

但必须明确：

1. Mock 数据必须标记为测试或开发数据。
2. 生产环境不能自动退回 Mock。
3. 不能将 Mock 字段加入正式 DTO。
4. 不能因为页面需要字段就虚构后端 API。
5. 没有后端数据来源的指标必须显示不可用。
6. 没有真实后端环境时，明确记录未联调。
7. 不得启动 Worker、数据库、官方 SDK 或真实资金账户。
8. 如果存在明确授权的隔离测试环境，可以进行只读请求，但必须先核对环境身份和权限。

对于没有真实 API 的业务功能：

- 记录接口缺口。
- 提供页面占位或明确未开放状态。
- 不修改后端业务代码补接口。
- 不编造接口路径和响应字段。

---

# 十一、测试要求

继续使用：

- Vitest。
- React Testing Library。
- MSW。
- Playwright。
- TypeScript 类型检查。
- Biome。

每个 Feature 必须有对应测试。

## 11.1 API 与 Query

验证：

- 请求参数。
- 响应解析。
- 运行时 Schema。
- Query Key。
- 缓存作用域。
- 账户隔离。
- 权限隔离。
- 分页。
- 筛选。
- 排序。
- 错误状态。
- stale 状态。

## 11.2 SSE

验证：

- refresh 后对应资源更新。
- 无关资源不刷新。
- 在途请求尾随补读。
- 账户切换不污染缓存。
- 权限撤销停止读取。
- 断线显示状态。
- 重连后数据收敛。
- SSE 不直接修改业务终态。

## 11.3 页面 E2E

至少覆盖：

- Dashboard。
- 账户列表和详情。
- 证券搜索和报价。
- 订单列表和详情。
- 任务列表和详情。
- 持仓。
- 账本。
- 核对记录。
- 操作记录。
- 管理员只读页面。
- 交易员权限边界。
- 管理员专项权限边界。
- 深色和浅色主题。
- 移动端导航和表格。

所有 E2E 必须使用明确的测试数据。

不能连接真实资金账户。

---

# 十二、阶段实施顺序

本阶段严格按以下顺序推进。

## 阶段 3-A：契约生成体系迁移

完成：

- 移动现有 sync 脚本。
- 后端统一生成命令。
- 后端统一检查命令。
- Git 忽略生成目录。
- 前端 file 依赖迁移。
- 从零生成和安装验证。

完成后输出独立检查结果。

## 阶段 3-B：Feature 基础设施

完成：

- 统一 Query Key 规范。
- Feature API Adapter 规范。
- 运行时 Schema 规范。
- 列表分页与筛选规范。
- 资源到 Query 的登记规范。
- 数据状态展示规范。

不要建立第二套公共基础设施。

## 阶段 3-C：核心只读业务模块

按以下顺序：

1. Dashboard。
2. Accounts。
3. Securities / Market。
4. Orders。
5. Tasks。
6. Positions。
7. Trades。
8. Ledger。
9. Reconciliations。
10. Operations。
11. Administration。

实际开发优先级可依据后端 API 完整程度调整。

但调整必须记录原因。

## 阶段 3-D：统一回归与验收

完成全部已实现模块的：

- 类型检查。
- Lint。
- Vitest。
- MSW。
- Playwright。
- 生产构建。
- 权限回归。
- SSE Query 收敛回归。

---

# 十三、严格禁止事项

本阶段禁止：

- 买入。
- 卖出。
- 撤单。
- 订单修改。
- 批量任务创建。
- 批量任务修改。
- 任务启动。
- 任务暂停。
- 任务继续。
- 任务停止。
- 账户限制修改。
- 用户管理写操作。
- 风险控制写操作。
- 自动操作恢复。
- 自动重新执行未知操作。
- 自动重试交易请求。

本阶段是只读业务页面建设。

不要为了页面完整而提前开发第四阶段的写操作。

不修改后端业务代码、数据库 Schema、交易规则、Worker 或 SDK。

允许的 backend 修改仅限于前置任务 A 所需的契约生成脚本、package.json 脚本和 .gitignore，以及确有必要的生成工具配置。

所有此类修改必须局限于契约生成体系，不改变 API 运行行为。

---

# 十四、文档与交付

新增阶段文档：

`docs/changes/0071-frontend-readonly-business-features.md`

如果 0071 已被占用，使用下一个未占用编号。

不得覆盖 0066～0070 历史记录。

报告必须包括：

## 1. 契约迁移

- 原目录。
- 新目录。
- 迁移文件。
- 生成命令。
- 检查命令。
- Git 忽略结果。
- file 依赖。
- 全新生成验证。
- 锁文件变化。

## 2. 业务模块

逐个列出：

- 实现页面。
- 使用 API。
- RPC 调用入口。
- Query Key。
- 运行时 Schema。
- 权限条件。
- SSE 资源依赖。
- 分页能力。
- 测试。

## 3. 后端接口覆盖情况

输出：

| API | Feature | 使用情况 | 运行时校验 | 测试 |
|---|---|---|---|---|

未使用接口说明原因。

没有实现的业务能力明确列出。

## 4. 金融数据正确性

说明：

- 金额。
- 股数。
- 余额。
- 持仓。
- 盈亏。
- 账本。
- 未知值。
- 历史快照。
- 数据来源。

哪些是真实字段，哪些是不可用或未计算状态。

## 5. 实时数据

说明：

- Business SSE 资源映射。
- Query 收敛。
- 活动与非活动 Query。
- 账户隔离。
- 重连。
- stale 状态。
- 未解决操作的处理边界。

## 6. 测试

列出：

- 类型检查。
- Lint。
- 契约检查。
- Theme Check。
- Vitest。
- Coverage。
- Playwright。
- Build。

明确真实后端联调是否执行。

## 7. 已知问题

保留 R2-02、R2-03、R2-04 和历史时间透传等未关闭事项。

不得因为第三阶段只读页面通过测试就宣称这些问题已修复。

---

# 十五、完成验收标准

本阶段完成后必须满足：

### 契约体系

1. api-contracts 已迁移至 backend/api-contracts。
2. 生成目录不进入 Git。
3. 后端能够从零生成。
4. 前端能够独立引用。
5. 契约检查能够发现不一致。
6. Hono RPC 类型推导正常。
7. 原有统一传输和回执安全语义不退化。

### 业务页面

1. 所有实际实现的页面使用真实后端契约。
2. 没有虚构 API 和 DTO。
3. 没有假装可用的金融数据。
4. 用户和账户缓存隔离。
5. 角色权限正确。
6. Business SSE 与 Query 收敛正常。
7. 列表分页和筛选符合真实 API 能力。
8. 所有业务状态有明确的 Loading、Empty、Error、Stale 表达。
9. 金融数值和时间不丢失精度。
10. 不存在交易写入入口。

### 工程质量

1. 第一、第二阶段测试继续通过。
2. 新增 Feature 测试通过。
3. Chromium E2E 通过。
4. TypeScript、Biome、Build 通过。
5. 后端业务代码无修改。
6. 不存在真实资金操作。
7. 所有遗留事项明确登记。

**完成后停止，不自动进入第四阶段，不提交、不推送 Git，等待独立审查。**
