# Frontend Architecture Review Snapshot

Frontend architecture review snapshot for a React trading platform.

本仓库是一个量化交易平台前端工程的**只读审查快照**，用于外部 AI/工程师做源码级技术审查。快照取自开发仓库 `astryx-dev` 分支（前端底座提交 `26af928`、`f82fed1`），只包含前端工程与审查资料，不包含后端源码、原仓库 Git 历史或任何正式环境配置。

当前阶段仅完成 **Frontend Bootstrap**：工程底座、设计系统、基础组件、API 协议骨架与测试体系；**不包含真实交易业务，也未连接真实后端**。

## 技术栈

| 领域 | 选择 |
|---|---|
| UI | React 19.3、TypeScript 5.9 |
| 构建 | Vite 8（纯静态 SPA，无 SSR） |
| 运行时/包管理 | Bun 1.4.3（`bun.lock`） |
| 设计系统 | Astryx 0.7.11（core / theme-neutral / cli，唯一主 UI） |
| 样式 | Tailwind CSS v4 + Astryx CSS 变量（固定 Cascade Layers） |
| 图标 | Tabler Icons → Astryx 语义图标注册表 |
| 路由 | TanStack Router 1.x（代码路由） |
| 服务端状态 | TanStack Query 5.x |
| 表格逻辑 | TanStack Table 9.x（服务端分页） |
| 表单/校验 | React Hook Form 7 + Zod 4 |
| 测试 | Vitest 5、React Testing Library、MSW 3、Playwright 1.65 |
| 静态检查 | Biome 2.6 + `tsc -b --noEmit` |

## 项目结构

```text
.
├── frontend/                    # 完整前端工程（可独立安装/测试/构建）
│   ├── src/
│   │   ├── app/                 # Provider 与代码路由
│   │   ├── routes/              # 首页 + Engineering Playground
│   │   ├── components/          # DecimalTextInput / UtcDateTimeField / DataTableShell
│   │   ├── lib/                 # 十进制、UTC/DST、Intl 展示
│   │   ├── services/            # Fetch API Client 与 SSE 帧解析
│   │   ├── theme/               # Astryx 主题源、Tabler 图标、生成产物
│   │   └── styles/              # Cascade Layers 与全局样式入口
│   ├── tests/                   # unit / integration / e2e / msw
│   └── public/
└── docs/
    ├── frontend-review-guide.md # 审查说明（架构、依赖、测试、已知问题、审查建议）
    ├── frontend-package-manifest.txt # 打包清单（由审查 ZIP 生成；路径 frontend/... 与本仓库一致）
    └── 0066-frontend-bootstrap.md    # 前端底座变更记录（已脱敏本地绝对路径）
```

说明：

- `docs/frontend-package-manifest.txt` 是原始审查包的清单，两个审查文件在原包中位于根目录，本仓库中位于 `docs/`；清单里的 `frontend/...` 路径与本仓库一致。
- 本仓库不包含 `backend/`、`node_modules/`、构建产物、覆盖率报告、Playwright 报告或 `.env` 实际配置。

## 安装与运行

```bash
cd frontend
bun install --frozen-lockfile
bun run dev
```

开发服务器默认 `http://localhost:5173`，开发环境可访问 `/dev/playground`（生产构建不注册该路由）。本工程不需要后端运行即可开发与测试。

## 测试

```bash
cd frontend
bun run typecheck
bun run lint
bun run test:run
bun run build
bunx playwright test   # 使用本机 Chrome（channel: chrome）
```

审查时的实际结果见 `docs/frontend-review-guide.md` 第 6 节；这些数字来自快照生成时的真实执行，不随本仓库后续状态自动更新。

## 当前实现范围

已完成：

- 独立 Bun + Vite 8 + React 19 + TypeScript 工程，可独立安装、开发、测试与构建。
- Astryx 0.7.11 集成：预编译主题、Tabler 语义图标、Light/Dark/System、固定 CSS 层。
- Tailwind CSS v4 与 Astryx Token 桥接，Engineering Playground 逐项可操作验证。
- 三个基础组件：`DecimalTextInput`（字符串精度）、`UtcDateTimeField`（六位小数秒 + DST 消歧）、`DataTableShell`（服务端分页单一拥有者）。
- Fetch API Client 语义骨架（operation 保留、写请求不重试、未知结果分类）与业务 SSE 帧解析。
- Vitest/RTL/MSW 单元与集成测试、Playwright 浏览器 E2E。

尚未完成：

- 真实登录、会话、CSRF 流程与 Session Epoch 模块。
- Business SSE Manager（连接、退避、失效映射）。
- Operation Recovery（原操作本地持久化与恢复入口）。
- 账户、证券、订单、任务、持仓、账本、管理等业务 Feature。
- 真实后端联调、真实资金与真实交易。

## 审查目的

请重点检查：

- 工程架构与目录职责是否合理，是否存在过度设计或缺失边界。
- 技术栈集成（Bun/Vite/Astryx/Tailwind/TanStack/RHF/Zod）是否正确。
- Astryx 与 Tailwind 的样式层共存是否稳健。
- 基础组件设计，尤其金融数值精度、UTC 六位小数与 DST 处理。
- API Client 对非 2xx、operation 与未知结果的语义。
- 测试覆盖是否足够，测试基础设施是否可靠。
- 性能、依赖与长期维护风险。

详细问题清单见 [docs/frontend-review-guide.md](docs/frontend-review-guide.md) 第 8 节。

## 许可证

本仓库未添加开源许可证；仅用于技术审查，默认保留所有权利。如需复用请先联系仓库所有者。
