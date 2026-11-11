# 第三阶段 3-A：本地契约生成迁移与独立验收

- 状态：已执行；本记录在业务 Feature 开发前定稿，后续变化另记
- 执行日期：2026-11-11
- 范围：仅契约生成、依赖路径及必要工具配置/文档，不含业务页面或后端业务修改
- 基线：`astryx-dev`；开工 HEAD `0427627f3637b4363a51b5c1a79de65791237783`
- 后续授权：用户“记得及时提交项目修改到Git”覆盖原任务书末尾的禁止提交；只做本地提交，不推送
- 已保存前置基线：`86174ee3624a0f9e93a761540fe7a10275ea1d2d`（已验收 R2-01 与第二阶段工作区）

## 1. 独立结论

**3-A 通过，可以进入 3-B。** 原根 `api-contracts/` 已移除；本地包由后端自动生成到被忽略的 `backend/api-contracts/`。三个目录入口、删除后重建、只读检查、陈旧产物/消费副本拒绝、普通权限安装、frozen 安装、真实业务 API 类型推导、231 项定向回归及生产构建均有实际证据。

另在仓库外、没有 node_modules、没有后端运行源码和旧根契约包的干净目录执行从零生成、安装、消费检查、类型检查与生产构建，全部退出 0。这证明迁移不依赖原仓库绝对位置或已有安装目录。

**此结论仅限 3-A。** 3-B～3-D 业务实现尚未在本记录中验收，不以本记录宣称全部第三阶段完成。没有真实后端联调、数据库、Worker、官方 SDK 或真实账户验证。

## 2. 原体系与保留内容

原 `backend/scripts/contract-entry.ts` 使用 `hc<AppType>()` 做声明推导，已有 `export-contracts.ts` 把声明写入 `backend/contracts/client.d.ts`，把公开校验规则写入 `backend/contracts/validation.ts`。旧导出器即使 `--check` 也会使用并清理 `.contract-build/`，它不是新的生成目录只读检查。

本次把**原同步器文件移动**到 `backend/scripts/contracts-sync.ts`，沿用其公开导入白名单、源快照复制和字节内容比较逻辑，再生成最小包描述及类型入口，没有另建 RPC/DTO/声明编译体系。

| 内容 | 处理 |
|---|---|
| `backend/src/server/app.ts` 的 AppType | 不变 |
| `backend/scripts/contract-entry.ts` | 不变且仍被 Git 跟踪 |
| `backend/scripts/export-contracts.ts` | 不变；仍是公开源契约导出器 |
| `backend/contracts/client.d.ts` / `validation.ts` | 不变且仍被 Git 跟踪 |
| 原 `api-contracts/scripts/sync.ts` | 移到后端并适配为唯一打包器 |
| 原根 `api-contracts/` | 整体移除；旧内容已保存在基线提交 |
| `backend/api-contracts/` | 完全生成，不作为独立项目维护，不提交 Git |

生成目录只有四个文件：`package.json`、`index.d.ts`、`client.d.ts`、`validation.ts`。包名仍为 `@project/api-contracts`，private；版本派生自后端版本，不另维护独立版本。根入口只导出 ApiClient 类型，validation 子路径仍可运行。Hono 保持 **4.13.13**，Zod peer 取后端既有版本。

ApiClient 仍是已经展开的客户端，不是 AppType。前端唯一 hc 创建、原生 Response 传输、回执与 Session Manager 均未因目录迁移改写。

## 3. 命令职责与目录独立性

| 命令 | 实际职责 |
|---|---|
| backend `contracts:export` | 既有 AppType/公开 Schema 导出；本阶段未执行 |
| backend `contracts:source:check` | 原导出器 `--check` 的明确新名称；保留源实现一致性门禁，会使用临时声明目录 |
| backend `contracts:prepare` | 只包装已有公开源；校验导入/版本，重建被忽略的四文件目录 |
| backend `contracts:check` | 只读校验四文件完整性、描述/导出、版本、源内容及过期产物；失败非零 |
| frontend `contracts:check` | 实际执行 `bun ../backend/scripts/contracts-sync.ts --check --consumer`，另校验 file: 目标、Hono 和实际安装副本 |

脚本通过 `import.meta.url` 定位 backend 根，不使用 process.cwd() 作为项目定位依据；只导入 Node 内置 fs/url。不会运行后端入口、Worker、数据库、SDK 或官方网络客户端。

| 实际 cwd | 实际命令 | 退出码/目标 |
|---|---|---|
| 仓库根 | `bun run --cwd backend contracts:prepare` | 0，统一 `backend/api-contracts/` |
| backend | `bun run contracts:prepare`、`bun run contracts:check` | 均 0，同一目录 |
| frontend | `bun run --cwd ../backend contracts:prepare` | 0，同一目录 |

全量 backend `check` 保留原有源检查并在新生成检查前显式 prepare。本轮**没有运行它**，因为包含数据库回归；不以脚本存在冒充执行通过。

## 4. Git 与工具边界

新增 `backend/.gitignore` 的 `/api-contracts/`，实际输出：

```text
backend/.gitignore:5:/api-contracts/ backend/api-contracts/package.json
```

`git status --short -- backend/api-contracts` 无输出。`git ls-files` 仍包含 canonical 两文件与 contract-entry。

后端实际改动仅：

- `backend/scripts/contracts-sync.ts`
- `backend/package.json` 的契约命令和完整检查编排
- `backend/.gitignore`
- `backend/biome.json` 排除新生成目录，防止格式化破坏原样快照

`backend/src`、migrations、后端锁、canonical 源、contract-entry 无差异。未修改后端 README 或其它后端文件；当前契约操作说明位于前端开发说明、文档中心及运维现状文档。

| 文件 | canonical 与生成副本相同 SHA-256 |
|---|---|
| `client.d.ts` | `8b3aea58843c6e0d86d6cd9137239996b80d1d0d348c8c09df76e758462993d2` |
| `validation.ts` | `1710f710a6051f3660bd72bd5e250f666a3c582eb62de9c4f86afd2b24a4e875` |

0066～0070 历史记录不回写；旧根路径属于它们原轮事实，本轮以新说明接续，不留路径兼容壳。

## 5. file: 安装、陈旧检测和从零证明

前端依赖现为：

```json
{"@project/api-contracts":"file:../backend/api-contracts","hono":"4.13.13"}
```

前端移除旧 `contracts:sync`，不保留旧根脚本别名。锁文件实际比对只有 `@project/api-contracts` 条目改变；其余包无新增、删除或版本解析改变。前端 packageManager 声明未改；恢复任务后的实际环境已是 Bun **1.4.4**，本轮没有执行 Bun 升级。

1. 新目录不存在时 `contracts:check` 实际退出 1（ENOENT），没有创建目录。
2. prepare 自动创建完整四文件；成功 check 前后四文件内容 SHA 与 mtime 完全相同。
3. 仓库外一次性探针将生成的 index 加入陈旧内容；check 退出 1，并且失败检查前后内容与 mtime 仍完全相同。
4. 生成目录被实际删除后，从 tracked canonical 自动重建成功。
5. 原安装 package.json 被 `--consumer` 准确拒绝，不能只凭新 package.json 路径宣布成功。
6. 本机文件安装可能共享 inode。探针改变过的安装 inode 没有因源目录重建自动恢复，消费检查继续准确拒绝陈旧 index。执行显式 `bun install --force --frozen-lockfile` 后恢复，消费检查及类型检查通过；没有手工伪造 node_modules 内容。
7. 本轮普通 `bun install`、普通 `bun install --frozen-lockfile` 都真实成功，没有使用已经取消的提权确认。--force 只用于恢复陈旧/损坏探针副本，不升级已锁依赖。

### 异地干净目录

一次性复制 103 个前端 tracked 源/配置文件，以及后端 package.json、canonical 两文件、同步脚本；**没有复制后端运行源码、.env 或任何 node_modules**。

在新临时根实际执行：

```bash
bun run --cwd backend contracts:prepare
bun install --cwd frontend --frozen-lockfile
bun run --cwd frontend contracts:check
bun run --cwd frontend typecheck
bun run --cwd frontend build
```

全部退出 0，输出安装消费位置确为新临时根内部。Bun 安装 294 packages；Hono、Astryx、React、TypeScript 等均使用既有锁定版本。探针目录已清理。

此验证不是手工复制生成包：临时目录最初没有 backend/api-contracts，由迁移后的脚本从 canonical 重建。

## 6. 类型与认证安全回归

`rpc-contract.typecheck.ts` 在既有认证正负例之外增加真实 orders/accounts 调用，验证金融数量仍为字符串、未知现金仍为 nullable 字符串，错误数字赋值及不存在的 sort 参数编译失败。没有将展开 ApiClient 填入 hc 泛型，也没有在业务调用处新增客户端断言。

| 实际命令/验证 | 结果 |
|---|---|
| `bun install --frozen-lockfile` | 退出 0，既有安装无变更 |
| `bun install --force --frozen-lockfile` | 退出 0，恢复探针消费副本，无升级 |
| frontend `contracts:check` | 退出 0，源/生成/安装三方一致 |
| frontend `typecheck` | 退出 0，含所有 RPC/原身份类型负例 |
| frontend `lint` | 退出 0，92 文件，无自动修复 |
| `test:run`：rpc-auth、session-rpc、api-errors、api-client | 4 文件、**231 项通过**，退出 0 |
| frontend `build` | 退出 0；主 JS 1203.32 kB / gzip 372.33 kB，原 500kB 警告保留 |
| 新位置无依赖目录的完整重建/安装/类型/构建 | 全部退出 0 |

认证适配仍走唯一 Hono/传输判断。完整原身份、receipt absent/valid/invalid、attempt/intent、非 2xx 回执、旧 epoch、body 超时及无写重放均由相关既有回归覆盖。没有为目录迁移修改这些生产实现或测试期望。

## 7. 正式工作流及边界

首次克隆：

```bash
cd backend
bun install
bun run contracts:prepare
cd ../frontend
bun install
bun run contracts:check
bun run typecheck
```

公开源更新后：先在 backend prepare，再在 frontend 安装、检查、类型验证。源契约真正变化时，由另行授权的后端工作先导出 canonical；prepare 不替代这一步。若消费检查发现陈旧副本，显式 frozen --force 刷新后复验，不能忽略检查。

日常 backend `contracts:check` 只读生成目录，不依赖安装前端；frontend 同名命令额外读自己的安装副本。没有发布 npm 包或创建根 Workspace。

未执行：真实后端/数据库/Worker/SDK/账户请求、backend 全量 build/typecheck/check、业务页面 E2E。后端未安装依赖；生成器本身不需要后端依赖，异地证明也不含后端运行源。这些未执行项不写为通过。

**下一步仅为 3-B 和已授权的只读业务建设。** R2-02～R2-04、历史时间透传、真实 Cookie 联调及生产发布前条件继续保留，不由本次迁移关闭。
