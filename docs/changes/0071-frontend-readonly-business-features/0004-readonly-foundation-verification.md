# 第三阶段 3-B：只读 Feature 公共边界

- 状态：已执行，公共基础设施验证记录；不代表业务页面全部完成
- 前置：3-A 已本地提交 `c725768555421133573cd8e6d4b563bc1764c585`
- 接口事实：[0003](0003-readonly-api-facts.md)

## 方案

不另建客户端、身份Store、QueryClient或业务SSE管理器。只在既有收敛器及表格上增加真实只读消费者需要的能力，并提供薄React绑定/展示组件。

- `sessionQueryKey` 复用于已确认和未确认元数据；未确认user为null且不能授权读取，不伪造用户DTO。
- 既有QueryConvergence保留默认显式注销语义，新增有限次级资源依赖及缓存生命周期登记。页面离开后只让缓存stale、不主动读；缓存GC/移除或会话结束清理，重访不积累重复登记。原在途版本/尾随策略保留。
- `useResourceQuery` 绑定唯一Session/QueryClient、查询取消signal、精确key/账户/角色，使用Layout登记以覆盖初始在途通知；无跨账户placeholder。
- 401/403/404隐藏旧数据并停止自动收敛；普通网络/5xx保留最后成功数据和时间。显式单次核对可恢复访问，不将一次403当成整个新会话失效。
- `useReadSearch` 令URL拥有已应用筛选/分页；草稿由表单单独持有，应用账户/筛选或改页长时回第一页，后退恢复URL。无真实排序参数，不编造排序。
- `parseReadOutcome` 先使用既有requireData，再校验实际消费字段；错误只报告有限字段路径，不带完整raw输入。金额复用十进制文本判断，不规范化/计算；历史时间仅要求非空原文，由展示层说明转换能力。
- DataTableShell新增显式无分页union，不出现假页码/总数；原有服务端分页调用保持。平表头、列显示、横向滚动保留，不引入虚拟滚动。
- ReadPage/QuerySurface/FilterBar在现有AppShell内部使用。disabled范围不显示缓存；stale/读取中/断线/错误与空列表区分，原生UTC成功缓存时间明确是客户端缓存元数据。
- DecimalValue不经Number；格式化保留完整小数/尾零，不支持时退回原文。UtcValue用既有Intl UTC辅助，九位历史raw原样显示并注明未转换；不修改旧时间/Decimal模块。

## 实施文件

`app/business-sync/query-convergence.ts`、新增`use-resource-query.ts`；`lib/read-only/{response,schemas,search}.ts`；`components/read-only/{page,query-surface,filters,values,object-details}.tsx`；既有`components/ui/data-table-shell.tsx`及对应五个新增/扩展行为测试模块。

## 实际验证

| 命令/场景 | 实际结果 |
|---|---|
| 新收敛行为在旧实现上执行 | 3项明确失败：null用户、聚合次级依赖、卸载缓存失效 |
| typecheck | 退出0 |
| lint | 退出0，105文件 |
| 收敛、业务SSE、值展示、只读UI、资源Query、URL搜索六文件 | **71项通过**，退出0 |
| 生产build | 退出0；主JS1203.96kB/gzip372.48kB；500kB警告保留 |
| Chromium既有DataTableShell分页/排序/列显示回归 | **1 passed**，未重试，独占5273协议环境 |

行为覆盖：未确认不读；账户切换取消旧请求且迟到成功不污染；访问拒绝隐藏/停止自动读/显式复核恢复；有限依赖合并；非活动缓存stale及GC解除；金额非零伪造防护、历史raw、错误保留缓存；草稿不被refetch抹掉、URL账户/页长重置和后退、非法URL恢复。

没有测试复制字面布局/源码，移除了冗余的键数组快照和tabindex实现断言。真实表格键盘/移动数据可访问性将在实际业务页面E2E中继续验证；公共新组件未凭jsdom宣称所有真实页面已验收。

## 限制与接续

没有真实后端联调；业务Feature和行情订阅尚须按真实契约逐个接入。R2-02/03/04及历史编辑透传仍保留，组件只提供不损原文的只读fallback。LSP当前不可用，导出变更先尝试references得到No language server found，再用限定源码引用核对；未安装语言服务器或额外诊断依赖。
