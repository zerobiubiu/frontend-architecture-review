# binance-stocks-frontend

量化交易平台的独立前端工程（工程底座阶段）。与 `backend/` 完全解耦：独立 `package.json`、独立 Bun 锁文件，通过 HTTP/SSE 与后端通信，不导入后端源码。

- 版本：0.1.0
- 主 UI：Astryx 0.7.11（唯一设计系统）
- 构建：Vite 8 静态 SPA（无 SSR、无 Next.js）
- 状态：**尚未连接真实后端，不包含任何交易业务页面**

## 快速开始

```bash
bun install
bun run dev                 # http://localhost:5173
bun run typecheck
bun run lint
bun run test:run
bun run build
bunx playwright test        # 使用本机 Chrome
```

开发环境提供 `http://localhost:5173/dev/playground`：用于逐项操作 Astryx 组件、主题、RHF/Zod 表单、金融输入、精确时间与表格；生产构建不注册该路由。

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
| 表格逻辑 | TanStack Table 9.x（服务端分页） |
| 表单 | React Hook Form 7 + Zod 4 |
| 分布式数值 | decimal.js + Intl（金融值始终用字符串） |
| 测试 | Vitest 5 + RTL + MSW 3 + Playwright 1.65 |

## 目录

```text
src/
├── app/
│   ├── providers/        # Theme / i18n / Layer / QueryClient
│   └── router/           # 根路由、404、错误边界、布局
├── routes/               # 页面（含 dev/playground-page）
├── components/
│   ├── ui/               # DecimalTextInput、UtcDateTimeField、DataTableShell
│   └── shared/           # 主题切换等共享组件
├── lib/
│   ├── decimal/          # 十进制字符串解析/比较/求和
│   ├── time/             # UTC 解析、IANA 时区、DST 消歧
│   └── format/           # Intl 展示（不回写）
├── services/
│   ├── api/              # Fetch 信封、operation、错误分类、CSRF/幂等键
│   └── realtime/         # 业务 SSE 帧类型与解析
├── theme/                # 主题源 + 生成产物 + 图标 + Token 引用
└── styles/index.css      # Cascade Layers 与全局导入
tests/
├── unit/                 # 纯逻辑
├── integration/          # RTL + MSW 组件/协议
├── e2e/                  # Playwright
└── msw/                  # Mock 处理器与夹具
```

## 工程约束（不可绕过）

1. **金融数值只用字符串**：不转 Number、不钳制、不舍入；价格/股数/本金必须使用 `DecimalTextInput`。
2. **UTC 时间是权威值**：保留原始字符串与最多六位小数秒；DST 重复时间必须显式选择，不默认取一个。
3. **HTTP 非 2xx 不丢弃 operation**：写请求不自动重试；超时/断网/结构异常按“结果未知”处理。
4. **单一 UI 来源**：不引入第二套组件库；不写 StyleX 业务样式；不修改生成主题文件。
5. **单一分页拥有者**：表格分页状态只来自页面 props，TanStack 不注册分页 feature。

## 文档

- 开发与维护细节：[DEVELOPMENT.md](DEVELOPMENT.md)
- 仓库变更记录：`docs/changes/0066-frontend-bootstrap.md`
- 前端架构依据：`docs/changes/0065-frontend-architecture-review-v2/`
