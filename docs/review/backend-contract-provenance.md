# 后端公开契约来源与快照能力边界

本快照来源于本地完整项目第三阶段提交 `47ec2d98e95cbac10c74991a4eaf9b4061d0379b`。该哈希是来源项目版本，不是此公开仓库的发布 Commit；公开快照 Commit 以本分支实际提交为准。

## AppType 原始摘录

原文件 `backend/src/server/app.ts` 第 168–169 行逐字摘录：

```ts
export const app = createApp();
export type AppType = typeof app;
```

`createApp` 在原文件第 28–37 行以 `new Hono<ApiEnv>()` 开始返回链式路由构造；第 106–112 行挂载 auth/accounts/admin/events/market/operations/business 路由。这里仅说明类型来源，不复制后端 handler、配置、数据库、Worker 或 SDK 实现，也不伪造残缺的 app.ts 来满足导入。

快照中的真实 `backend/scripts/contract-entry.ts` 以 `hc<AppType>('https://contract.invalid')` 供原项目 TypeScript 声明编译。该地址是无效占位 origin，未调用请求方法。AppType 是完整原 Hono 构造结果的类型，不是生成后的 ApiClient。

## 已提供的实际闭包

- 原始规范产物：`backend/contracts/client.d.ts`、`validation.ts`，按字节保留。
- 同步包装实现：`backend/scripts/contracts-sync.ts`，仅导入 node:fs/promises 与 node:url；从自身位置定位项目，读取清单及公开快照，不启动后端。
- 四文件生成副本：`backend/api-contracts/`，在此审查分支明确收录供直接阅读；原项目仍忽略该目录，忽略规则没有修改。
- 类型入口 `index.d.ts` 只 re-export ApiClient，`./client.js` 解析到同名声明；不是运行时客户端工厂，不需要编造 client.js。
- 展开声明仅引用 Hono 公共 client/http-status/types 与本地 ./validation。
- validation 内部闭合 Role、Symbol、Quote、FundingSnapshot、WalletAssetBalance，唯一外部运行依赖是 Zod，不需服务端私有类型。
- 前端唯一工厂仍是 `frontend/src/services/api/rpc.ts`。自定义 Fetch 返回原生 Response，共用一次传输与一次正文消费；不使用 hc<ApiClient>()，不导入 backend/src。

## 能执行与不能执行的命令

```bash
bun run --cwd backend contracts:prepare
bun run --cwd backend contracts:check
bun install --cwd frontend --frozen-lockfile
bun run --cwd frontend contracts:check
```

以上 prepare 从已有规范产物重建四文件本地包，check 只检查生成结果，前端检查还核对实际安装副本与 Hono/file: 目标；不需要也不应安装 backend 运行依赖。

本最小快照**不能从完整 AppType 实现重新导出规范声明**：未提供完整服务器类型图、原导出器及 TS7 后端工具链。因此 backend 清单中的 contracts:export、contracts:source:check、dev/start/api/worker/setup/db:*、backend 全量检查不能当作本快照可运行命令。清单与 contract-entry 是忠实审查材料，不是完整后端交付。

验证前端时只安装 frontend 锁定依赖。不得为“证明可运行”启动 Worker、数据库、官方 SDK、账户同步或任何资金操作。
