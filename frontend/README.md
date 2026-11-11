# binance-stocks-frontend

量化交易平台的独立前端工程，已实现认证、会话隔离、应用外壳及第三阶段只读业务页面。与 `backend/` 保持独立应用、独立清单和锁文件；通过后端自动生成且不入库的 `backend/api-contracts/` 消费公开声明，不导入后端运行源码。

- 版本：0.1.0
- 主 UI：Astryx 0.7.11（唯一设计系统）
- 构建：Vite 8 静态 SPA（无 SSR、无 Next.js）
- 状态：**只读业务页面已实现，真实后端未联调；不提供交易或管理写操作。验收证据以 0071 当轮记录为准**

## 快速开始

```bash
# 首次克隆后，从仓库根目录准备本地契约
cd backend
bun install
bun run contracts:prepare
cd ../frontend
bun install --frozen-lockfile
bun run contracts:check      # 同时核对本地、后端公开产物及安装后的消费副本
bun run dev                 # http://localhost:5173
bun run typecheck
bun run lint
bun run test:run
bun run test:coverage
bun run theme:check
bun run build
bunx --no-install playwright test --retries=0 # 本机 Chrome；自动启动无交易能力协议桩
```

开发环境提供 `http://localhost:5173/dev/playground`：用于逐项操作 Astryx 组件、主题、RHF/Zod 表单、金融输入、精确时间与表格；生产构建不注册该路由。

`backend/` 与 `frontend/` 保持兄弟目录；本地依赖为 `file:../backend/api-contracts`。生成目录可删后重建，不是独立维护的项目，不提交 Git。普通开发不会自动使用假登录或假数据；未配置可用认证 API 时显示无法确认会话。浏览器验收只在专用 Vite 子进程中显式设置协议桩地址及 Mock 标识。

E2E 默认独占 `5173`，不复用已有服务器。若该端口已有用户进程，本轮使用 `PLAYWRIGHT_PORT=5273 bunx --no-install playwright test --retries=0`；PowerShell 可先设置 `$env:PLAYWRIGHT_PORT='5273'`。不结束用户进程，也不通过复用错误服务器规避冲突。

## 技术栈

| 领域 | 选择 |
|---|---|
| 运行时/包管理 | Bun 1.4.3 |
| UI | React 19.3 + TypeScript 5.9 + Vite 8 |
| 设计系统 | Astryx 0.7.11（core / theme-neutral / cli，精确同版本） |
| 样式 | Tailwind CSS v4 + Astryx CSS 变量（固定 Cascade Layers） |
| 图标 | Tabler Icons → Astryx 语义图标注册表 |
| 路由 | TanStack Router 1.x（代码路由） |
| 服务端状态 | TanStack Query 5.x |
| API 契约 | Hono 4.13.13 + `@project/api-contracts` 本地声明与公开校验规则 |
| 表格逻辑 | TanStack Table 9.x（服务端分页） |
| 表单 | React Hook Form 7 + Zod 4 |
| 金融数值 | decimal.js 独立 Context + Intl（字符串流转，仍有已登记精度边界） |
| 测试 | Vitest 5 + RTL + MSW 3 + Playwright 1.65 |

## 目录

```text
src/
├── app/
│   ├── providers/        # Theme / i18n / Layer / 唯一 QueryClient
│   ├── router/           # 登录、守卫、工作台、404、错误边界、开发路由
│   ├── session/          # 唯一 Session Manager、epoch、跨标签通知
│   └── business-sync/    # 授权 Query 注册与在途版本收敛
├── features/             # auth 及工作台、账户、证券/报价、订单/任务、持仓/成交、账本/核对、操作、管理只读模块
├── routes/dev/           # 开发演练与权限探针，生产不注册
├── components/
│   ├── ui/               # DecimalTextInput、UtcDateTimeField、DataTableShell
│   ├── shared/           # Astryx AppShell、主题切换、显式协议桩标识
│   └── read-only/        # 筛选、来源/时间/数值、读取状态与已加载详情
├── lib/
│   ├── decimal/          # 十进制字符串解析/比较/求和
│   ├── time/             # UTC 解析、IANA 时区、DST 消歧
│   ├── format/           # Intl 展示（不回写）
│   └── read-only/        # 运行时投影、URL 查询状态与原文 schema
├── services/
│   ├── api/              # 唯一原生传输/响应判断、Hono RPC、回执与写入门禁
│   └── realtime/         # 业务通知与独立报价 SSE；共用有限连接策略，不共用帧解析器
├── theme/                # 主题源 + 生成产物 + 图标 + Token 引用
└── styles/index.css      # Cascade Layers 与全局导入
tests/
├── unit/                 # 纯逻辑
├── integration/          # RTL + MSW 组件/协议
├── e2e/                  # 原生 Chromium Cookie / CORS / SSE / 主题与交互
├── msw/                  # 明确标记的 Mock 处理器与夹具
└── protocol/             # 明确 Mock 的只读 API/Cookie/SSE 验收桩，无数据库、SDK 或交易实现
```

## 工程约束（不可绕过）

1. **金融数值只用字符串**：不转 Number，展示不回填；R2-02 的精度边界仍保留，未授权无限精度计算。
2. **UTC 时间是权威值**：保留原始字符串与后端允许的有效小数秒；DST 重复时间必须显式选择，R2-03/R2-04 及历史时间透传未在本阶段修复。
3. **HTTP 非 2xx 不丢弃 operation**：写请求不自动重试；超时/断网/结构异常按“结果未知”处理。
4. **单一 UI 来源**：不引入第二套组件库；不写 StyleX 业务样式；不修改生成主题文件。
5. **单一分页拥有者**：表格分页状态只来自页面 props，TanStack 不注册分页 feature。
6. **会话未确认先隔离**：不显示敏感旧缓存；退出未知不得静默 `/me` 恢复，旧代响应与消息不得污染当前身份。
7. **不重放写入**：应用层不自动重试，不离线排队续发；RPC 不替代敏感写门禁或完整原请求身份关联。
8. **业务只读**：Feature 只走统一 RPC GET；交易员读本人、管理员可按后端权限读跨账户，专项管理权限不由 ADMIN 自动推断。服务端查询可能更新缓存/审计，不等于数据库零写入。
9. **拒绝不是普通陈旧**：401/403/404 隐藏旧值；显式核对遇网络失败或重挂载仍不得复活，只有授权读取成功才能恢复。

## 文档

- 开发与维护细节：[DEVELOPMENT.md](DEVELOPMENT.md)
- 第三阶段实施与验收：[0071](../docs/changes/0071-frontend-readonly-business-features.md)
- 本地契约生成、检查及迁移验收：[第三阶段 3-A](../docs/changes/0071-frontend-readonly-business-features/0002-contract-migration-verification.md)
- 第二阶段实施与真实验证：[0070](../docs/changes/0070-frontend-stage2-app-shell-rpc-session/README.md)
- 第一阶段准入与已知边界：[0069](../docs/changes/0069-frontend-r2-01-identity-fix/README.md)
- 历史底座与架构：[0066](../docs/changes/0066-frontend-bootstrap.md)、[0065](../docs/changes/0065-frontend-architecture-review-v2/README.md)
