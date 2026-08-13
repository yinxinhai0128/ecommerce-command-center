# Task 3 报告

## 范围

- 从语义 `PilotSnapshot` 的支付、买家、履约、体验和贡献段构建可追溯分析事实。
- 本地分析按支付、复购、延迟送达、低评分和贡献问题选择对应快照事实。
- DeepSeek 只可复用允许事实中同一标签、单位和数值；错误标签/单位或快照外数值会降级到本地分析。
- 客户端对新增快照段执行严格运行时 schema 校验。

## 中断接管与 RED

- 接管时工作区已有未提交的 Task 3 半成品；没有可用的原代理 RED 终端记录。
- 首次按任务简报运行 `pnpm exec vitest run tests/server/pilotRoute.test.ts tests/server/pilotAnalysis.test.ts` 在约 24 秒后以退出码 0 结束，但 Windows/Vitest 未输出断言统计，因此不作为 GREEN 证据。
- 为补足客户端运行时 schema 的深度拒绝覆盖，先新增五种嵌套无效快照断言（子键缺失、嵌套类型错误、严格对象额外字段），随后直接单进程 Vitest 验证为 GREEN。它们在已继承的 strict schema 上首次通过，未发现需要新增生产修复的缺陷。

## GREEN 验证

- `node node_modules/vitest/vitest.mjs run src/api/pilotClient.test.ts --environment=node --pool=forks --maxWorkers=1 --no-file-parallelism --reporter=verbose`：1 文件、16/16 通过，5.37 秒。
- `node node_modules/vitest/vitest.mjs run tests/server/pilotAnalysis.test.ts --environment=node --pool=forks --maxWorkers=1 --no-file-parallelism --reporter=verbose`：1 文件、37/37 通过，14.25 秒。
- `node node_modules/vitest/vitest.mjs run tests/server/pilotRoute.test.ts --environment=node --pool=forks --maxWorkers=1 --no-file-parallelism --reporter=verbose`：1 文件、13/13 通过，11.47 秒。
- `node node_modules/vitest/vitest.mjs run src/features/pilot/PilotAnalysisDashboard.test.tsx --pool=forks --maxWorkers=1 --no-file-parallelism --reporter=verbose`：1 文件、1/1 通过，16.83 秒。
- `node node_modules/vitest/vitest.mjs run src/features/pilot/PilotRealtimeDashboard.test.tsx --pool=forks --maxWorkers=1 --no-file-parallelism --reporter=verbose`：1 文件、3/3 通过，17.11 秒。
- `pnpm exec tsc --noEmit`：退出码 0，7.1 秒。
- `git diff --check`：退出码 0。

## 风险

- Windows 上一次同时运行两个服务端 Vitest 文件出现 `Worker exited unexpectedly`，尽管其中已执行的 15 项通过；因此以同一 fork 单 worker 参数逐文件复跑，三个定向测试集合均干净退出。未修改全局 Vitest 配置，因为这不属于 Task 3 的最小变更。
- 未改动旧 `/api/analysis` 路由、数据库或生产 UI；客户端与 UI 夹具仅补齐 `PilotSnapshot` 必填段。

## 审查修复：可信 Olist 分析

### RED 证据

- 第一轮：`node node_modules/vitest/vitest.mjs run tests/server/pilotAnalysis.test.ts --environment=node --pool=forks --maxWorkers=1 --no-file-parallelism --reporter=verbose`，退出码 1，41/47 通过、6 项失败。失败精确覆盖 boleto/3期仍错误选择首个支付方式、贡献/general/performance signal 缺少 `factId`/`unit` 且 label 不在上下文，以及合法的新四元绑定被旧共享 strict schema 拒绝。
- 第二轮精确值 RED：同一文件用 `-t "signal 必须|cause 必须"`，退出码 1，2/2 失败；证明原容差会错误接受 ratio `0.10009` 代替 `0.1`、currency `300.009` 代替 `300`。
- 文本投毒用例最初因旧共享 schema 先拒绝新增绑定字段而“错误原因通过”；建立 pilot 专用 schema 后，合法绑定模型响应恢复为 `deepseek`，summary、risk、action 三个投毒用例继续降级，才构成真实文本校验证据。

### 实现与兼容性

- 新增 pilot 专用 strict 模型/结果 schema，要求每条 signal/cause 都携带 `factId`、`label`、`unit` 和精确数值；不修改旧 `server/analysis/schema.ts` 或 `/api/analysis`。
- 四元绑定必须命中 allow-list 的同一条事实，数值用精确相等校验，不再接受近似值。
- 扫描 summary、cause evidence、risk title/evidence、action 全部文本字段和 follow-up。毛利、成本、退款、广告、流量、目标、预测等中英文禁词直接拒绝；其余文本数字必须精确匹配上下文事实/变化率/贡献值，或事实 label 中的受控字面数字。百分号只允许匹配相同数字或对应 ratio。
- 本地 payment 先按大小写不敏感、词界受控的 `paymentType` 匹配，再按“数字+期”匹配分期，最后才选支付金额最高项。
- 本地所有 signal/cause 都生成上下文可核对的四元绑定；贡献排行作为事实 signal 展示，不再伪装成原因，general 不再使用“经营概览”等非事实 label。
- 客户端 pilot 专用类型与 strict response schema 同步新增绑定字段；旧共享 `AnalysisResult` 保持不变。

### 手算绑定证据

- `boleto支付情况如何？` → `payments.byType.boleto.paymentAmount` / `支付方式：boleto 支付金额` / `currency` / `155`，不会误选金额更高的 credit_card `420`。
- `3期分期支付情况如何？` → `payments.installments.3.paymentAmount` / `分期：3期 支付金额` / `currency` / `420`。
- 合法成交额模型 signal → `itemGmv.value` / `成交额` / `currency` / `490`；改为 `validOrderCount.value`、`count` 或 `490.009` 均拒绝。
- 品类贡献模型 cause → `category:1` / `品类：books` / `currency` / `300`；`300.009` 拒绝。

### GREEN 证据

- pilot 核心组合：60/60 通过（`pilotAnalysis` 47 项 + `pilotRoute` 13 项）。
- pilot 客户端：16/16 通过。
- 旧 `/api/analysis` 与旧本地分析兼容回归：23/23 通过。
- `pnpm exec tsc --noEmit`：退出码 0。
- `git diff --check`：退出码 0（仅 Windows CRLF 提示）。

### 剩余风险

- 文本事实校验采用保守 allow-list：无法绑定的数字或禁词即降级，可能拒绝模型生成的无害编号/日期；这是可信优先的有意取舍。
- 支付方式匹配依赖快照中的原始 `paymentType` token；未知中文别名不会猜测，而会按最高支付金额事实降级选择。
