# 0006 本地契约根类型入口的 NodeNext 接续修复

- 状态：已执行。
- 范围：3-A 契约包装工具及 E2E 共享夹具的 ESM 导入，不改变后端业务运行行为。
- 前置：[0002 契约迁移验收](0002-contract-migration-verification.md)。原记录保持原轮事实，本记录补充第三阶段业务夹具实际参与 NodeNext 编译后发现的问题。

## 背景

业务 E2E 复用已按生成 DTO 校验的夹具后，完整 `tsc -b --noEmit` 暴露了两层问题：夹具相对导入缺少 ESM 扩展名；生成包 `index.d.ts` 使用 `export type { ApiClient } from './client'`，在 NodeNext 下根入口解析失效，导致响应推导落入 `never`。此前只在应用/集成的 Bundler 解析范围内验证，不能据此宣称所有解析范围相同。

## 方案与实施

- `backend/scripts/contracts-sync.ts`：仅将生成根入口改为 `./client.js`，由 TypeScript 解析到同名 `client.d.ts`；不伪造运行时工厂，不修改 `backend/contracts/` 的公开原文或白名单。
- `frontend/tests/msw/readonly/orders-tasks.ts`：相对导入使用 `.js` 规范，Bun/Vite 按既有规则解析源 TS。
- `frontend/tests/msw/auth-fixtures.ts`：认证夹具直接由公开 `ApiClient`/Hono 推导数据类型，不把应用别名及传输类型链引入 Node 测试边界，不手写认证 DTO。
- 没有修改 tsconfig、Hono 版本、公开后端路由或任何后端运行入口。

## 执行验证记录

环境：Windows x64，Bun 1.4.4；没有安装新工具、提权或启动后端。

| 验证 | 实际结果 |
|---|---|
| 修复前完整 `bun run typecheck` | 退出 2；先报 ESM 扩展名/别名问题，修正夹具后仍有 43 项 `never` 相关诊断 |
| 仓库外继承 Node 配置，仅启用 preserveSymlinks | 仍失败；该选项不能解决根入口问题 |
| 仓库外将根类型临时直接解析到已安装 client.d.ts | 编译成功，定位到根入口；临时路径映射仅作探针，未写入项目配置，探针目录已清理 |
| `bun run --cwd backend contracts:prepare` | 退出 0；仅生成本地四文件包，未执行后端运行入口 |
| `bun install --cwd frontend --frozen-lockfile` | 退出 0；1 个本地契约包重新安装，未升级其余依赖 |
| `bun run --cwd frontend contracts:check` | 退出 0；生成包及实际消费副本与公开源一致，Hono 4.13.13 |
| `bun run typecheck && bun run lint && bun run contracts:check && bun run theme:check && bun run build` | 退出 0；无需临时路径覆盖，221 个文件 lint 通过，主题一致，生产构建成功；仍有既存的大 chunk 警告 |

结论：当前前端实际使用的 Bundler 与 NodeNext 项目均通过，既有 RPC 正/负类型断言仍由正式检查编译。源契约原文继续逐字节复制；不把这次入口修复扩大宣称为任意第三方 Node 分发体系的认证。

## 后续建议与已知限制

新克隆仍按后端 prepare → 前端安装 → contracts:check → typecheck 顺序，不手工改生成物或忽略安装副本。完整业务 Chromium 验收另见阶段最终报告；本记录不替代真实后端联调，也不关闭 R2-02～R2-04 或历史时间编辑透传事项。
