# 0065 前端架构第二轮复核归档（Astryx 最终方案）

- 状态：已执行（第二轮复核完成，结论定稿；未实施任何修复）。
- 类型：审查任务书与第二版审查报告的成组归档。
- 基线：后端 3.0.0；`dev` HEAD `f7c6d7b`；`backend/` 相对第一轮基线 `6fa779e` 零改动。
- 决策：**Astryx 为唯一主 UI 设计系统**，不引入 MUI／Chakra／AntD／Emotion；Tailwind v4 保留。
- 边界：只读审查与文档修订；未创建前端工程、未改后端、未连数据库或真实账户。

## 1. 文档清单与阅读顺序

|顺序|文档|类型|内容|
|---|---|---|---|
|1|[第二轮审查任务书](0001-review-task-brief-v2.md)|审查任务书|Astryx 决策、三项重点复核、全量 P0/P1/P2 重审、技术栈与组件方案要求、证据与约束|
|2|[第二版审查报告](0002-frontend-architecture-feasibility-review-v2.md)|可行性审查（输出）|十三章：结论、架构、选型、契约、SSE、状态恢复、安全、表格精度、Astryx 实施、问题清单、最终栈、门禁、验收|
|参考|[第一轮归档（0064）](../0064-frontend-architecture-review/README.md)|历史审查|原始报告与提案；v2 对其结论做修订，不覆盖原文|

## 2. 关键修订

|第一轮|第二版|依据|
|---|---|---|
|MUI 作为生产主 UI 默认|**撤销**；Astryx 唯一主 UI|项目决策＋Astryx 0.7.11 能力核对|
|P0-001 SSE 慢写为 P0|**P1**|通道仅资源名；撤销延迟与名额占用属资源/授权时效，无数据泄露|
|P0-003 契约缺口为 P0|**拆分**：P0 前端消费规则＋P1 后端类型契约|非 2xx 可带 SUCCEEDED；前端可防御，后端修复不阻塞|
|P0-005 迟到 401 / P0-006 存在性 / P0-007 原 actor 失效|**P1**|会话可用性、纵深防御、运维闭环；无越权或交易错误|
|P1-001 指纹归一化为待验证|**已确认缺陷**（P1）|Hono 错误分派＋记录器后置执行＋原始/解析指纹差异；无库探针验证控制流|
|P1-002 / P1-006 / P2-002 / P2-005|P2／无需|新前端固定 UUID key；Beta 已决策缓解；补播当前不需要|

## 3. 归档映射与校验

|原路径（工作区根目录）|现路径|SHA-256|
|---|---|---|
|`frontend-architecture-feasibility-review-v2.md`|[0002-frontend-architecture-feasibility-review-v2.md](0002-frontend-architecture-feasibility-review-v2.md)|`dad81c00…3f3c60`（移动前后曾一致；入库前仅修正两处相对链接，未改结论）|

报告正文第十三章 13.5 已写明归档路径；除上述两处相对链接外，正文未回改写。任务书按原文归档，仅补元数据块。

## 4. 本轮验证

- `cd backend && bun run typecheck` → `$ tsc --noEmit` 成功。
- 无 DB／无外部账户定向测试：`113 pass, 9 skip, 0 fail`（2264 expect，122 tests / 11 files，183 ms）。
- 控制流探针（内存 Hono）：下游 403 后上游 `await next()` 恢复，`afterNextRan=true`、`status=403`；同一请求体二次解析成功。
- 第三方：Astryx 0.7.11（core/CLI/theme peer 与 Node 要求）、Tailwind 4.3.5、React Doctor 0.9.22（TS<6）、Semgrep 官方安装方式。
- 未执行：`contracts:check`、构建、`test:db`、迁移、API/Worker 启动、真实交易、浏览器原型、代理 SSE。

## 5. 不可变性与后续

- 本组为不可变变更文档：定稿后不重写；后续修复或实施另建编号，并在本 README 登记替代关系。
- 0064 保留为第一轮原貌；两版结论冲突时，以 0065 为准，但不得把 0065 的建议写成已实施。
