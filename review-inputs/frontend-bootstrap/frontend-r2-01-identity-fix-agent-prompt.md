# 任务：关闭 R2-01 原请求身份约束缺口，并完成定向复验

## 1. 目标与范围

当前第一阶段前端底座的第二轮独立核验结论为“不通过”，唯一阻塞项是：

**R2-01 · P1：原意图终态判断允许省略可信原请求身份。**

本次授权你实际修复该问题及其调用方、测试和必要的当前开发说明，并完成定向复验。不是第三轮全面技术选型，不是第二阶段开发，不重新初始化工程。

必须保留：Astryx + Tailwind CSS v4、独立 `frontend/`、Bun 包管理、现有传输与回执分层设计。`backend/` 只读，零修改。

Hono RPC 已确定放到第二阶段。本次不引入 `hono/client`，不创建或改造 api-contracts 包，不重复设计 DTO，也不以当前尚未使用 RPC 判定缺陷。

## 2. 输入与版本基线

完整阅读实际仓库中的以下资料；路径不同先定位，不创建替代文档：

- `docs/changes/0068-frontend-bootstrap-independent-review-round2.md`
- `docs/changes/0067-frontend-bootstrap-review-fixes.md`
- `review-inputs/frontend-bootstrap/frontend-independent-review-e91981da.md`
- 根目录及 `frontend/` 下适用的 AGENTS.md 和其他工程约束。

0068 报告的核验基线为：

- 分支：`astryx-dev`
- HEAD：`0427627f3637b4363a51b5c1a79de65791237783`

执行前记录当前分支、HEAD、工作区和暂存区状态。当前 HEAD 如已变化，阅读相关差异并保护既有修改，不为匹配上述 SHA 执行切换、回退、reset、clean、stash 或 rebase。公开旧快照 `e91981da2f113bb9873559e6819530dbd2cacbe2` 也不是本地切换目标。

本轮只对当前真实代码做修复；不能仅根据报告描述重写整套 API 层。

## 3. 必须重新确认的反例

报告给出的反例是：

```text
原请求身份：original-id / TASK_CONTROL / TASK / task-1
响应回执：other-id / TASK_CONTROL / TASK / task-1 / SUCCEEDED

classifyWriteOutcome(outcome, 完整原请求身份)
→ intent=unknown, reason=receipt-mismatch

classifyWriteOutcome(outcome)
classifyWriteOutcome(outcome, {})
→ intent=applied
```

根因不只是 expected 参数整体可选，还包括身份字段全部可选、缺字段跳过比较，以及部分测试/夹具示范了不传身份或身份不匹配仍采用终态。

重点阅读：

- `frontend/src/services/api/errors.ts`
- `frontend/src/services/api/types.ts`
- `frontend/src/services/api/response.ts`
- `frontend/src/services/api/request.ts`
- `frontend/src/services/api/client.ts`
- `frontend/tests/unit/api-errors.test.ts`
- `frontend/tests/integration/api-client.test.ts`
- `frontend/tests/msw/fixtures.ts`
- `frontend/tests/msw/handlers.ts`
- 对上述函数与类型的全部现有引用。

如当前代码已修复，按同样关闭条件验证，不为制造变更重复修改。

## 4. 修复必须满足的不变量

### 4.1 静态类型必须强制身份

凡能将原意图判定为 `applied` 或 `not-applied` 的公共接口，必须要求完整、可信的原请求身份。

至少包含：

- 原操作 ID；
- 原操作 kind；
- 该 kind 所要求的目标类型和目标 ID。

字段要求以实际后端公开契约和当前实现为准。不要把所有字段都改成 optional，不要使用 `Partial<...>` 作为终态判定入口。

若某种操作确实没有目标 ID，须依据真实契约用显式分支表达“该操作没有目标”，不能通过省略字段实现通配匹配；不得虚构无目标操作类型来绕过校验。

优先最小修改现有接口。例如：保持现有分类函数但要求完整身份；或者在确有消费者需要时，分离 HTTP attempt 分类与原意图判定。二选一即可，不额外建立多套互相重复的分类框架。

### 4.2 运行时必须 fail closed

TypeScript 约束不能替代运行时检查。即使 JavaScript 调用、测试反射调用、外部 unknown 值或不安全断言绕过静态类型：

- 未提供身份；
- 传入 null、空对象或错误类型；
- 只提供部分必需字段；
- 缺少该 kind 所必需的目标；
- ID/kind/target 不匹配；
- 回执缺少必须用于关联的字段；

均不得产生 `applied` 或 `not-applied`，应保留 `intent: unknown`，并给出可诊断的原因。

缺失身份与身份不匹配可以分别表达，但不要求为了字符串命名修改大量无关代码。

### 4.3 身份来自请求，不来自响应

expected 身份必须来自发送前已经确定的原意图/请求上下文，不能从收到的 operation 中反向构造，再拿它和自身比较。

本阶段尚无完整原意图持久化和恢复模块，因此只要求：

- 公共接口强制该调用契约；
- 现有消费者按可信请求身份调用；
- 测试分别构造请求身份与响应，显式验证错配；
- 写清未来接入约束。

不要为关闭 R2-01 新建完整恢复 UI、Session Manager、登录、交易或持久化系统。

### 4.4 保留已修复语义

本次不能退回旧行为：

- attempt 与 intent 继续独立；
- 无回执的 4xx、operationAccepted:false 不能证明原意图未执行；
- absent / valid / invalid 三态继续区分；
- 有效回执可以在畸形信封中保留，但采用终态仍必须绑定原请求；
- 非 2xx 不丢弃回执；
- 超时、发送后的取消与无法确认的结果保持 unknown；
- 不自动换 key，不自动重试写操作；
- SUCCEEDED 只代表该 kind 的回执结论，不等于订单成交、任务完成或同步成功。

不得通过“所有情况都返回 unknown”关闭问题。完整、可信且匹配的 SUCCEEDED/REJECTED 回执仍应按既定语义得到对应终态。

## 5. 修复测试与 Mock

先补能够在当前漏洞实现上失败的行为测试，再修复，重跑同一用例。不要仅用函数签名改变导致的编译报错充当行为修复证据。

至少覆盖：

| 场景 | 必须结果 |
|---|---|
| 省略 expected | 类型检查不允许；运行时绕过后仍 unknown |
| expected = {} / null / 错误类型 | 运行时 unknown |
| 仅 id、仅 id+kind、缺必需 target | 不允许确认终态 |
| 错 id / kind / targetType / targetId | unknown |
| 回执缺必需关联字段 | unknown |
| 完整身份 + 匹配 SUCCEEDED | 可判 applied，但不声称目标业务成功 |
| 完整身份 + 匹配 REJECTED | 可判 not-applied |
| 完整身份 + PROCESSING/UNKNOWN/CONFLICT | unknown |
| 非 2xx + 完整匹配 SUCCEEDED | 保留回执并正确分类 |
| 畸形 error + 可解析回执 + 缺身份/错身份 | 不丢回执，但不得采用终态 |
| 第一次发送未知，后续无回执 401/409/429 | 不将原意图升级为未执行 |
| 已证明本地未发送 | 只表达本次 not-sent；不反推同一原 ID 的历史结论 |

SUCCEEDED 与 REJECTED 两类终态都必须覆盖省略、部分和错配身份的负例。

类型测试使用当前工具链可执行的方式证明非法调用不能编译，例如专门的编译检查夹具或项目已有类型测试方式。仅在测试边界故意绕过类型以检验运行时防御，生产代码不得使用 any 或双重断言来规避要求。

修正报告指出的 Mock 错误：

- ACCOUNT_SYNC 的目标不能继续沿用 ORDER/order-1；
- 请求原 ID 与回执 ID 不一致时不能期待 applied；
- 正向夹具从明确的请求上下文生成一致身份；负向夹具有意改一个字段；
- 测试中的调用者不得通过读取响应反向构造 expected。

无需为 Mock 重写全部后端协议，也不要更改后端真实行为。

## 6. P2 与接入约束：登记，不扩张本次任务

本轮不要求为关闭 P1 一并重做以下模块：

- R2-02：Decimal 超协议接受域、中间运算精度和规范化闭包；
- R2-03：fold 已选择后仍显示不可提交提示；
- R2-04：纽约极端年份/秒级历史偏移/转换越界；
- 真实任务编辑器对既有超六位有效小数时间的未修改透传；
- Bundle、字体、多浏览器、生产 sourcemap。

这些事项在新报告中保留编号、风险、受影响范围和接入前条件。不得写成已修复，也不得因为本轮未修改它们而反复扩大 R2-01 的验收范围。

当前开发说明里与本次分类 API 相关的旧字符串三态描述，应同步更新；既有编号审查/修复记录是历史证据，不改写。

## 7. 执行边界

允许修改：

- `frontend/` 中 R2-01 相关实现、现有调用方、测试和夹具；
- 必要的当前开发说明；
- 按仓库编号规则新增修复与定向复验报告，必要时更新文档索引。

禁止：

- 修改或启动 backend、API、Worker、数据库；
- 真实账户连接、真实交易或撤单；
- 新业务页面、完整会话/恢复/SSE 系统；
- 提前引入 Hono RPC；
- 新增或升级生产依赖；修改锁文件掩盖问题；
- 手工改主题生成物、关闭已有检查或跳过失败用例；
- 自动提交、推送、更新公开审查仓库或变更分支。

使用已安装依赖。如缺依赖或浏览器，明确报告限制，不安装替代版本冒充当前锁定环境。所有临时服务和探针限定本地，结束后清理自己创建的资源。

## 8. 验证与交付

执行实际存在的脚本，不虚构结果：

```text
cd frontend
bun run typecheck
bun run lint
bun run test:run
bun run theme:check
bun run build
bunx --no-install playwright test
```

另外单独记录 R2-01 定向 API/类型用例结果。覆盖率不是本次关闭条件；若执行，只报告真实数字和阈值设置，不用用例总数代替关闭证据。

建议修复完成后安排独立只读复验视角：只核对缺失/部分/错配身份、匹配正例、无回执拒绝的历史未知保护与相关回归。无需再次完整审查 UI 选型和全部 P2。

最终报告至少包含：

1. 修复基线：分支、HEAD、工作区/暂存区状态；未提交代码附完整变更清单，必要时记录 diff 或文件哈希。
2. 根因与最终接口契约：哪些字段必填；无目标分支的真实依据；运行时如何拒绝缺失/错配身份。
3. 逐项验收矩阵：省略、空、部分、错配、完整匹配；分别给出 SUCCEEDED/REJECTED 结果和测试名称。
4. 修复前行为失败证据、修复后同一测试通过证据、类型检查负例。
5. 夹具一致性及全部现有调用方检查结果。
6. 验证命令、退出码、通过/失败/跳过/未执行，明确 Mock 与浏览器证据边界。
7. backend 零改动、依赖与锁文件未变、没有新 Feature 的工作区证据。
8. P2 和接入约束列表，不删除或伪关闭。
9. 准入结论：R2-01 已关闭/未关闭；是否存在新阻塞；第一阶段是否可验收，第二阶段是否可准入。

新报告按现有规则选用未占用编号，不覆盖 0066、0067、0068。

**完成标准：可信原请求身份成为终态判断的不可省略条件；绕过静态类型也不能缺身份确认终态；正确匹配的终态仍正常处理；全部相关回归通过。达到后停止，不自动进入第二阶段。**
