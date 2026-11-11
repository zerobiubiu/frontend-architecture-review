# 第三阶段前端源码公开审查快照

这是量化交易平台第三阶段的**独立源码审查快照**，不是正式部署仓库，不包含可运行的完整后端，不连接真实资金账户。请从 [0071 实施与验收报告](docs/changes/0071-frontend-readonly-business-features.md)及 [审查资料索引](docs/REVIEW-INDEX.md)开始。

- 来源项目代码：astryx-dev / `47ec2d98e95cbac10c74991a4eaf9b4061d0379b`。
- 公开历史基线：本仓库 main 的 `e91981da2f113bb9873559e6819530dbd2cacbe2`；第三阶段使用独立 stage3-source-review 分支，不覆盖 main 或旧提交。
- 这是完整 frontend（源代码、公开资源、配置、锁文件、单元/集成/E2E、MSW、本地协议桩、主题源与生成物），不是只打包 docs 的资料包。
- 未完成真实隔离后端登录／Cookie／业务联调；没有下单、撤单、任务控制、账户限制、用户或风控写入口，也没有完整 Operation Recovery。
- 本轮另外做了公开健康与匿名认证 GET 的只读诊断，不代表已验证真实用户登录。见 [本地认证诊断](docs/changes/0071-frontend-auth-local-runtime-diagnosis.md)。

## 技术栈与边界

| 领域 | 来源清单/锁定栈 |
|---|---|
| 前端 | React 19.3.1、TypeScript 5.9.3、Vite 8.3.7，纯静态 SPA |
| UI | Astryx 0.7.11（core/theme-neutral/cli 一致）、Tailwind v4.3.5、Tabler Icons |
| 路由/状态 | TanStack Router 1.170.46、Query 5.107.1、Table 9.3.1；唯一 Session Manager/QueryClient |
| 契约 | Hono 精确 4.13.13；本地 @project/api-contracts；Zod 4.6.7 |
| 表单/金融 | RHF 7.91.0、decimal.js 10.6.0；金融字符串与独立 Decimal Context |
| 验证 | Vitest 5.1、RTL、MSW 3.0.4、Playwright 1.65、Biome 2.6.6 |
| Bun | 清单约定 bun@1.4.3、engines>=1.4.0；发布验证宿主为 Bun 1.4.4，无依赖升级 |

需要安装 Bun 时请使用[官方安装说明](https://bun.sh/docs/installation)；本快照不提供第三方安装器，不要求安装后端 SDK 或数据库。实际依赖与精确解析以 frontend/package.json、bun.lock 为准。

## 结构

```text
frontend/                  # 完整独立前端
  src/app/                 # Provider、Router、Session Epoch、授权 Query 收敛
  src/features/            # auth + 十二个只读 Feature
  src/services/api/        # 唯一 Hono RPC/原生传输/响应与身份回执边界
  src/services/realtime/   # 业务 SSE、独立行情 SSE、共享有界连接策略
  src/components/         # Astryx 壳、表格、金融/时间字段、只读状态和来源
  tests/                   # 全部单元/集成/类型负例/E2E/MSW/无交易协议桩
backend/                   # 仅契约审查材料，不是完整后端
  package.json
  .gitignore
  scripts/contract-entry.ts
  scripts/contracts-sync.ts
  contracts/              # 原始规范公开声明和校验模块
  api-contracts/          # 本分支明确收录的四文件生成副本
                            # 原项目该目录仍被忽略，没有修改原项目规则
docs/                      # 第一至第三阶段历史及公开接口资料
  review/                  # 契约来源摘录、本次快照实际验证记录
```

原后端 AppType 的两行逐字摘录及其必要类型闭包见 [backend-contract-provenance.md](docs/review/backend-contract-provenance.md)。没有创建假的 backend/src/server/app.ts，也没有把展开后的 ApiClient 作为 AppType 传给 hc。

## 先生成本地契约，再安装前端

从本快照根目录：

```bash
bun run --cwd backend contracts:prepare
bun run --cwd backend contracts:check
bun install --cwd frontend --frozen-lockfile
bun run --cwd frontend contracts:check
```

prepare 只读取随附 backend/package.json 与 contracts 两个公开源，通过脚本自身位置生成 api-contracts 四文件，**不启动 API、Worker、数据库、SDK**。前端 file 依赖指向 file:../backend/api-contracts，消费检查还比对真正安装副本。

这不等于从 AppType 重新推导规范声明。本快照不含完整服务器类型图或原导出工具链，不能运行或声称通过 backend 的 contracts:export、contracts:source:check、dev/start/setup/db:*、后端完整 build/check。不要在 backend 执行 bun install 或 bun dev 来测试本快照。

frontend/README.md、DEVELOPMENT.md 是完整原项目的原文；其中涉及完整后端安装／运行的段落不适用于此最小审查后端，快照运行顺序以本 README 为准。

## 本地运行与 API 地址

```bash
bun run --cwd frontend dev
```

普通 dev 没有自动 Mock 回退，也没有 Vite API proxy。默认 /api/v1 会发向当前前端 origin；仅启动 Vite不提供真实认证，因此可能显示“暂时无法确认会话”，不能据此放宽认证 schema 或伪造登录。

若另有单独授权的隔离 API，才在自己的 frontend/.env.local 设置公开 API 地址并核对精确 CORS：

```env
VITE_API_BASE_URL=http://localhost:3020/api/v1
```

上例应配合同主机写法的 http://localhost:5173 前端，API必须真实可达且允许该精确 Origin。也可全部使用127.0.0.1，但必须先让前端真的监听并能以该地址访问。不要混用 localhost 与127后仅因CORS正常就忽略 SameSite；不要关闭安全策略、使用通配凭据CORS或把Cookie改为localStorage token。

没有提供真实 .env、用户密码、Cookie、CSRF／Session Token、API Key/Secret、数据库连接串、主密钥或私钥。测试中的明确 Mock 凭据／token 常量是合成测试数据，不是可用账户。

## 验证

在 frontend/ 执行：

```bash
bun install --frozen-lockfile
bun run contracts:check
bun run typecheck
bun run lint
bun run test:run
bun run test:coverage
bun run theme:check
bun run build
PLAYWRIGHT_PORT=5273 bunx --no-install playwright test --retries=0
```

PowerShell 可先 `$env:PLAYWRIGHT_PORT='5273'` 再运行最后一条。Playwright使用已经安装的 Chrome；若没有浏览器，不能把未执行写为通过，也不要自动安装／升级浏览器。

E2E明确使用无交易能力的协议桩：自动独占本机18770、专用Vite5273和生产预览4173；先 build，不默认复用已有服务器，不结束用户5173／后端进程。Cookie/CORS/EventSource是真实浏览器机制，数据仍是明确Mock，不是后端联调。

历史0071中的588／65是原轮证据；**本次发布副本的命令、退出码和结果另记录在 docs/review/stage3-snapshot-verification.md，不挪用历史结果**。类型负例由正式TS项目编译，不在运行时执行非法调用。

## 当前只读能力与安全保留

已实现21个业务路由：工作台；账户列表/详情；证券搜索/目录/已加载规则；报价；订单与任务列表/详情；名义/官方候选持仓；官方成交历史；账本；核对；操作回执与业务事件；管理员概览/用户及详情/账户/审计/系统健康。

- TRADER本人、ADMIN后端授权范围；普通管理读不需要canManageAdmins，但不授予专项管理写或交易能力。
- Query key包含epoch/user/account/resource/有效参数，访问拒绝不因503/重挂载复活旧数据；SSE只做有限通知收敛，不当作可靠事件日志或交易终态。
- 非2xx回执保留、receipt absent/valid/invalid、attempt/intent分离、完整发送前OriginalOperationIdentity匹配、发送后未知语义和敏感写门禁均保留。没有网络恢复重放交易意图。
- 金融值为字符串，未知不补零；Funding/Spot、USD/USDC、本地名义和官方候选分别展示，不计算权威资产或盈亏。
- 历史UTC保留原串和九位小数，展示不回写；R2-02/03/04和历史时间编辑透传继续登记，没有因只读验收被关闭。
- 生成主题与源一起提供；不手改生成CSS、不引入第二套UI。

## 历史文档与公开范围

0066～0070和阶段任务书按原文保留，描述的是各自当时状态，不用旧报告覆盖当前实现。

- 0070索引中的旧根 api-contracts/README.md 已随迁移失效：本快照只解释，不创建兼容README、旧脚本或假运行文件。
- 旧报告中原项目 backend/src、数据库、Worker、SDK、完整后端README、运行日志或未提供材料的链接，不代表这些文件在本快照存在；不得据此自行拼一个后端。
- 已提交的九张归档PNG均明确Mock；不复制 test-results、浏览器trace、运行日志或全部review证据ZIP。
- node_modules、dist、coverage、playwright-report、test-results、.git、缓存、真实环境、凭据均不属于发布树。

本分支完成发布后等待独立源码审查，不自动进入第四阶段、部署或连接真实资金。文件清单与SHA-256见 SNAPSHOT-MANIFEST.json；该清单明确不自存自身哈希，整体摘要由发布结果另行记录。

## 发布前内容检查与用户确认

本轮先对全部候选文本检查，不仅检查文件名；九张归档PNG也逐张审阅。两份额外历史架构报告中的数据库地址及主密钥形态曾导致暂停公开发布。用户随后明确确认“这些信息都是假的占位信息，公开也无妨”，因此保留历史原文并记录授权，不在新记录中列匹配值；不是默认忽略扫描或把真实运行环境公开。

十二处前端凭据字面量与三个长ID均已核对为明确的合成测试输入／伪广播／精度边界，未删除必要测试。其余范围没有未解决的敏感候选，详见[内容安全检查](docs/review/stage3-security-scan.md)与[本轮实际验证](docs/review/stage3-snapshot-verification.md)。本结论不把静态审阅替代真实工程测试，也不构成实盘授权。

原始任务输入部分含CRLF，本快照只为 review-inputs/** 增加 -text 属性以保持其原字节；未改原项目属性或历史正文。旧Markdown的两个空格换行/末尾空行保持原文，不为Git空白提示重新格式化历史；新增代码、配置与本轮元数据另作定向空白检查。
