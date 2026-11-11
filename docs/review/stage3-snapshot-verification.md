# 第三阶段公开快照：本轮实际验证

- 状态：验证已执行，非0071原轮结果的转述。
- 代码来源：本地原项目 astryx-dev 提交 `47ec2d98e95cbac10c74991a4eaf9b4061d0379b`；0071报告与该代码版本相符。原项目源码、真实环境和后端业务未修改。
- 公开历史父基线：本仓库 main 的 `e91981da2f113bb9873559e6819530dbd2cacbe2`；使用新的 stage3-source-review 分支，不替换 main。
- 执行环境：Windows x64，Bun 1.4.4，既有本机 Chrome。快照在原仓库外，无原 node_modules、dist、真实.env；仅包含最小后端契约材料，没有后端运行源码或依赖安装。

## 实际命令和退出码

从快照根目录按顺序执行，下列命令全部实际完成且退出0；并非因历史报告写着通过就认为通过。

| 命令 | 退出码 | 结果 |
|---|---|---|
| `bun --version` | 0 | 1.4.4 |
| `bun run --cwd backend contracts:prepare` | 0 | 仅包装规范产物生成四文件本地包；没有运行后端 |
| `bun run --cwd backend contracts:check` | 0 | 生成物与公开规范一致 |
| `bun install --cwd frontend --frozen-lockfile` | 0 | 294包、34.28秒，锁定依赖不升级 |
| `bun run --cwd frontend contracts:check` | 0 | 实际安装副本、Hono4.13.13及file目标一致 |
| `bun run --cwd frontend typecheck` | 0 | app/test/Node项目及身份/RPC类型负例编译通过 |
| `bun run --cwd frontend lint` | 0 | Biome检查221文件，无修复 |
| `bun run --cwd frontend test:run` | 0 | 32文件588项通过，23.38秒 |
| `bun run --cwd frontend test:coverage` | 0 | 同588项通过，21.81秒；S94/B86.90/F92.97/L95.47 |
| `bun run --cwd frontend theme:check` | 0 | Astryx生成主题与源一致 |
| `bun run --cwd frontend build` | 0 | Vite生产构建通过；主JS688.22kB/gzip210.74kB，CSS303.58kB/gzip47.44kB |
| `PLAYWRIGHT_PORT=5273 PLAYWRIGHT_REUSE_SERVER=0 bunx --cwd frontend --no-install playwright test --retries=0` | 0 | 65项全部通过，3.6分钟，1 worker，0重试 |

这次完整流水线耗时326.02秒。没有必要命令失败／跳过／未执行；后端完整重导出／业务运行不属于本快照可执行能力，未冒充通过。

## 证据与限制

- Playwright从本快照源码启动18770无交易协议桩、5273专用Vite和4173生产预览，不复用用户5173或3020服务；测试数据明确Mock。
- 真实Cookie/CORS/EventSource及焦点／主题／窄屏／运行时渲染错误门禁均被实际浏览器执行；不等于真实用户、真实后端或资金联调。
- 没有执行backend dev/API/Worker/DB/SDK；backend只运行纯文件契约包装与检查。
- Chunk>500kB warning保留，无coverage数字阈值，不通过提高阈值或跳过测试消音；部署不应公开source map，本次不部署。
- 编译、依赖、coverage、browser trace／运行目录只存在本地验证工作区，按发布排除规则不入库；九张旧归档PNG保留其原轮Mock来源，不假称此次重拍。
- 0071历史报告及0066～0070没有重写；R2-02/03/04和历史时间编辑透传继续登记。

## 发布内容安全检查

自动读取全部候选文本内容，另有独立前端语义复核与文档／后端／九张图像复核。前端232文件、1,368,124字节、32,678行；读取失败0。十二处测试凭据字面量及三个长ID均具有明确合成/伪广播/精度边界上下文，不删除测试来规避扫描。

两份历史架构报告出现两类四处数据库地址／主密钥形态候选，代理曾按任务停止公开发布并报告。用户随后明确确认：“可以公布，这些信息都是假的占位信息，公开也无妨”。因此保留原文，并在此记录确认，不输出匹配值，不声称曾连接／验证这些示例。其它范围没有剩余不能解释的候选。

真实.env、Cookie/CSRF/Session值、真实API Secret、数据库密码／私钥、真实账户/用户资料和含会话的浏览器trace均未复制。声明中的字段类型、SHA校验和明确Mock常量不等于真实凭据。详细扫描范围及归类见 stage3-security-scan.md；最终文件路径/字节/SHA-256见根SNAPSHOT-MANIFEST.json，其整体摘要另由发布结果记录。

## Git入库字节保留

初次全树空白检查提示原历史Markdown的两个空格换行及末尾空行；没有为此改写旧报告。代码、配置与本轮新元数据采用定向检查。原review-inputs任务书含CRLF，快照属性明确保留其字节，并刷新这四个文件的索引；不修改原项目属性。提交前还须将全部暂存blob与最终SHA-256清单比对，避免只核对工作区而忽略Git换行规范化。
