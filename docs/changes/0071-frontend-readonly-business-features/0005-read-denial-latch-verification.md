# 0005 只读权限拒绝跨重试与重挂载的锁定修复

- 状态：已执行。
- 范围：第三阶段公共只读 Query 授权门禁，不是整阶段最终验收。
- 前置：[0004 公共只读基础设施](0004-readonly-foundation-verification.md)。
- 基线：`cc2fe89de53c19d9c9ed23a1c9d622522c2a4079`；本记录不回写 0004 原轮结果。

## 背景

两项独立只读源码核验均指出：原门禁仅根据 TanStack Query 当前 `error` 判断 401/403/404。成功读取后遭到拒绝，再显式核对遇到 5xx 或网络失败，新的错误会替换访问拒绝，而旧 `data` 仍在缓存。由此既可能恢复自动读取，也可能使此前被拒绝的记录重新进入普通陈旧数据展示路径。

本轮新增行为测试在旧实现上失败：显式核对后实际调用 4 次，而预期只允许累计 3 次，已观察到未重新授权就恢复读取。问题不是简单的错误文案。

## 方案与实施

- `frontend/src/app/business-sync/use-resource-query.ts`：访问拒绝使用绑定精确 Query 实例的弱引用锁定记录；普通失败、重新挂载、窗口或 SSE 刷新均不能解除。只有该条目一次成功的 API 读取及运行时解析完成后才解除。
- 被拒绝的消费者持续得到无数据的授权错误结果；不把保留在 TanStack 缓存中的旧值交回页面。错误结果的状态标志保持一致，不增加第二套 QueryClient 或传输。
- 显式重新核对仍使用现有 `refetch`；期间可登记在途通知，失败后停止自动收敛，成功后恢复原有有界收敛。
- 拒绝记录不持久化、不保存响应原文；缓存对象回收后由 WeakMap 自动释放。它是前端消费者隔离，不替代后端授权。
- `frontend/tests/integration/resource-query.test.tsx`：新增成功→403→显式网络失败→资源刷新→卸载/重挂载→显式成功→恢复资源刷新的行为回归。

## 执行验证记录

执行环境：Windows x64，Bun 1.4.4；仅前端测试与 Mock，无后端、数据库、Worker、SDK 或真实账户。

| 命令 | 退出码与实际结果 |
|---|---|
| `bun run test:run tests/integration/resource-query.test.tsx -t 拒绝后核对`（修复前） | 1；新增用例失败，实际读取 4 次而非 3 次 |
| `bun run test:run tests/integration/resource-query.test.tsx tests/integration/market-readonly.test.tsx tests/integration/administration-readonly.test.tsx tests/unit/query-convergence.test.ts`（修复后） | 0；4 文件、57 项通过，包含新拒绝锁定用例与既有成功恢复路径 |
| `bunx --no-install tsc -p tsconfig.test.json --noEmit` | 0；源码及单元/集成测试类型检查通过 |

验证结论：上述定向消费者路径已修复；未把网络失败误认作重新授权，显式成功后仍可恢复正常读取，未用永久禁读规避问题。

## 后续验证与限制

完整回归及真实 Chromium 协议桩验收归入本阶段最终总报告，不挪用本记录当作其通过证据。真实后端未联调。后端业务代码、第一阶段写入安全分类、R2-02～R2-04 及历史时间编辑透传均未在本修复中更改，也不宣称关闭。
