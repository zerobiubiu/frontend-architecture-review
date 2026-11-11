# 第三阶段公开审查资料索引

本目录是独立快照的阅读索引，不是完整原项目文档中心；没有复制全部后端历史或私有运行材料。

## 当前事实

1. [0071 第三阶段完整实施与验收](changes/0071-frontend-readonly-business-features.md)：模块/API覆盖、金融时间来源、权限、SSE与实际原轮证据。
2. [0071 阶段归档](changes/0071-frontend-readonly-business-features/README.md)：任务原文、迁移、接口事实、公共只读、拒绝锁定和NodeNext接续记录，文件名保持实际工作区命名。
3. [认证只读诊断](changes/0071-frontend-auth-local-runtime-diagnosis.md)：实际Vite404、后端匿名401、精确CORS和未应用配置方案；不提供真实会话数据。
4. [后端契约来源摘录](review/backend-contract-provenance.md)：AppType逐字两行证据、声明依赖闭包与可运行命令限制。
5. 本次独立快照的实际命令／安全检查记录：review/stage3-snapshot-verification.md。原报告中的测试数字不是本轮发布验证。

## 前置验收与历史

- [0069 第一阶段最终准入](changes/0069-frontend-r2-01-identity-fix/0002-fix-and-targeted-verification.md)；[归档](changes/0069-frontend-r2-01-identity-fix/README.md)。
- [0070 第二阶段实施](changes/0070-frontend-stage2-app-shell-rpc-session/0002-implementation-and-verification.md)；[归档](changes/0070-frontend-stage2-app-shell-rpc-session/README.md)。
- [0068 原第二轮独立审查](changes/0068-frontend-bootstrap-independent-review-round2.md)、[0067 修复](changes/0067-frontend-bootstrap-review-fixes.md)、[0066 底座](changes/0066-frontend-bootstrap.md)。
- [0064 架构归档](changes/0064-frontend-architecture-review/README.md)、[0065 第二版复核](changes/0065-frontend-architecture-review-v2/README.md)。

0070旧根api-contracts README链接和原轮未提交／环境限制保留历史事实，不伪造兼容文件。运行日志与原始证据ZIP未公开；关键报告和明确Mock截图已经保留。图像来自归档目录，不从浏览器运行目录重新采集可能含凭据的trace。

## 公开后端消费契约

- [接入索引](integration/README.md)
- [模型与动作](integration/backend-model-and-actions.md)
- [接口目录](integration/api-catalog.md)
- [查询和响应语义](integration/query-and-response-contracts.md)
- [HTTP、Cookie、CSRF与SSE](integration/http-and-events.md)
- [写入与原意图恢复边界](integration/write-and-recovery.md)
- [接入与验收](integration/bootstrap-and-acceptance.md)

其余随附integration资料为背景说明；以实际公开声明、运行时schema及当前报告为准。当前快照没有生产部署或完整后端执行能力，审查不需要也不允许以真实买卖、撤单、任务控制或账户同步来验证。
