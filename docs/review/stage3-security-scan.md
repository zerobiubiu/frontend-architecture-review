# 第三阶段公开快照：敏感信息检查记录

- 范围：本分支候选发布文件，不含.git对象/旧公开历史、node_modules、构建/coverage/测试运行目录、真实.env、浏览器trace或原项目日志。
- 方法：父执行者对原候选文本逐文件内存扫描；两项独立只读复核分别检查frontend来源/消费链、文档/后端类型/九张归档PNG。需要判断的原字面量仅在内存处理，不回传值，不用原真实环境作比对。
- 结论：没有尚未解决的发布敏感候选。十二处前端候选确认为合成测试数据；两类四处历史文档形态候选先暂停、再经用户明确确认为虚假占位并授权原样公开。没有把实际秘密通过“测试目录”名义豁免。

## 1. 全内容而非文件名检查

初始302个候选文件：293份文本全部实际读取、9张图像另逐张查看；没有读取失败。后续新写的说明/验证/清单将再扫描后提交，不能用初始数量代替最终Git树计数。

扫描类别包括：私钥标记；GitHub/AWS/模型供应商/Slack token；含用户信息的URL（PostgreSQL/MySQL/Redis等）；ENCRYPTION_KEY/API_SECRET/数据库密码赋值；apiKey/apiSecret/encryptionKey/accessToken/refreshToken/csrfToken/sessionToken/password/authorization/cookie字面量。高熵、字段名、SHA与UUID还需上下文判断，不以熵或字段名直接认定真实秘密。

frontend为完整232文件、1,368,124字节、32,678文本行，实际读取失败0；根15/src163/tests53/public1。全部五个主题生成物和全部测试/原生协议桩均纳入，没有为减少命中删除重要测试。

## 2. 前端候选的明确合成来源

12个credential-literal位置：

| 路径/行 | 语义排除证据 |
|---|---|
| tests/e2e/stage2.spec.ts:523 | 负例伪广播标记，断言必须等真正/me响应，不采信广播身份/令牌 |
| tests/integration/auth-ui.test.tsx:434,505,730,768 | 中文测试语义输入，注入vi.fn/受控Promise，检验凭据空白、失败清理和会话竞态 |
| tests/integration/rpc-auth.test.ts:52,57 | 字典占位输入及期望正文，MSW合成AUTH_DATA |
| tests/integration/session-rpc.test.ts:94,110 | 同类占位与MSW会话分流，不是运行Cookie |
| tests/unit/rpc-contract.typecheck.ts:8,61 | 静态正负类型用例，不在运行时执行故意非法调用 |
| tests/unit/session-manager.test.ts:16 | 明确占位、空白保留输入，AuthApi由vi.fn返回合成会话 |

三处长交易ID（MSW positions-trades:86、protocol readonly:362、e2e readonly:53）为40字符语义前缀加21位超JS安全整数后缀：fixture与页面断言相等，协议桩第二条后缀加一，是精度/分页边界，不是捕获的真实成交或凭据。未输出原文。

统一身份/账户表为规则化合成UUID；CSRF测试值由重复字符构造；protocol Cookie和CSRF在运行测试时随机生成、只存在进程内，公开控制DTO不返回它们。生产代码没有导入MSW身份表。apiKeyLast4与hasCredentials为合成展示字段，不是完整密钥。

## 3. 历史文档：暂停及用户确认

自动扫描命中：

- 0064-frontend-architecture-review/0003-feasibility-review-report.md 第1024行数据库地址、第1025行ENCRYPTION_KEY形态。
- 0065-frontend-architecture-review-v2/0002-frontend-architecture-feasibility-review-v2.md 第909/910行相同片段。

当时仅凭回环目标/合成测试文字不能确认具体值来源，执行者已按任务**暂停公开发布并报告**，没有先提交或推送，也没有将匹配值复制到诊断报告。

用户随后明确回复：

> 可以公布，这些信息都是假的占位信息，公开也无妨

因此按用户当前事实和公开授权将两类四处归为已知虚假占位示例，保留历史原文；这不是默认忽略命中、不是代理验证过真实密码/主密钥，也没有连接数据库/解密来测试。原文没有为当前应用创建任何环境配置。

## 4. 后端白名单和图像

后端仅10文件：package.json、.gitignore、scripts两文件、contracts两文件、api-contracts四文件；已逐份内容检查，不混入src、DB/迁移、Worker/SDK实现、真实.env或运行日志。声明中的password/csrfToken等字段是公开schema/类型，不是值。AppType只以provenance中的两行原文说明，不伪造可运行app或client.js。

文档/后端/图像复核70文件（61文本+9PNG）。其中59文本全文复核、两份形态候选仅审阅遮罩上下文且保留当时阻断；父扫描仍覆盖61份实际全文。用户确认后解除这四处，范围内没有其它未解决候选。审阅覆盖与工程验证职责分开，不把静态阅读写成测试通过。

9张归档PNG均逐张可见像素检查，明确Mock/本地无交易协议桩；示例身份、结构化UUID和业务标识来自测试夹具，没有Cookie/密码/主密钥界面。未做专门PNG附加块/隐写分析，不冒称已作；没有此类异常发现。没有复制浏览器trace或运行截图目录。

## 5. 证据边界

内容检查不能数学保证不存在隐藏秘密；它是在用户明确范围内的实际扫描与来源复核。新生成README、验证记录和manifest也应纳入提交前最终检查。报告不列匹配值或可逆编码；源码/文档原字节摘要记录在根manifest，便于固定Commit复核。

允许公开占位示例不等于允许真实资金测试。本快照无真实账号、数据库或SDK运行能力；真实后端未完成登录/业务联调，R2-02～04等旧边界继续保留。
