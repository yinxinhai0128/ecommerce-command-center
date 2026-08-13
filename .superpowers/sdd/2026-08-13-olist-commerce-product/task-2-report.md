# Task 2 报告：Olist 语义指标契约

## RED

- 新增了订单级手算夹具：重复 `customer_unique_id`、一个双商品双支付订单、信用卡和代金券支付、已送达/取消/延迟订单，以及 1 至 5 分评价。
- 执行 `pnpm exec vitest run tests/pilot/repository.test.ts server/pilot/metricDefinitions.test.ts`：新增三项断言按预期失败，原因是 `snapshot.commerce` 尚未暴露；既有 13 项通过。
- 首次 GREEN 实现后，SQLite 报 `Unknown named parameter 'replayNow'`。原因是同一参数对象传给未引用该占位符的 SQL；已把占位符固定在共享 CTE 中，避免该绑定错误。
- 指标定义测试首次未被收集：`pnpm exec vitest run --config vite.config.ts server/pilot/metricDefinitions.test.ts` 报 `No test files found`，因为 `vite.config.ts` 的 `test.include` 不包含 `server/**`。经授权，仅将该目录加入匹配范围。

## GREEN 与验证

- `pnpm exec vitest run tests/pilot/repository.test.ts server/pilot/metricDefinitions.test.ts`：2 个文件、17 项测试全部通过。
- `pnpm exec tsc --noEmit`：通过。
- `git diff --check`：通过。

## 手算示例

- 未筛选时，五个所选订单支付额为 `300 + 130 + 70 + 12 + 60 = 572`，与已送达商品 GMV 不同；按支付方式为信用卡 `370`、代金券 `202`。
- 对双商品订单仅筛选图书时，图书价为 `100 / (100 + 200)`，因此该订单支付额 `300` 分摊为 `100`；与另一笔图书订单 `130` 合计为 `230`。
- 截至 `2018-01-04 23:59:59`，后续评价和后续送达不进入体验/履约指标；回放内同一唯一买家仅有两笔已购买订单时，复购买家数为 `1`。

## 实现与风险

- 商品、全订单商品、订单支付均先按订单聚合，再连接到筛选订单，避免 `order_items × payments` 乘法。
- 新分组和原有排名、趋势、漏斗均共用同一受日期、类目、卖家、客户州和回放上限约束的订单集。
- 新分组在服务端 `PilotSnapshot` 里暂为可选：当前后续 API/分析测试夹具仍只构造旧快照，而本任务文件范围不含那些夹具。仓储实际始终返回全部新分组；后续 API 契约任务应将其收紧为必填。
- `vite.config.ts` 是为使简报指定的 `server/pilot/metricDefinitions.test.ts` 实际被 Vitest 收集而获得的最小授权改动。

## 修复轮 1：回放安全与必填契约

### RED

- `does not expose a future delivery as completed before its delivery fact` 在 `2018-01-04 23:59:59` 回放时实际得到 `[{ status: 'delivered', value: 1 }]`，而手算期望为 `carrier`；证明仓储直接读取了未来的最终状态。
- `uses distinct reviewed orders as the low-score-rate denominator` 实际得到 `0.5`，而同一订单的 1 分和 5 分评价应使低分率为 `1`；证明原 SQL 用了评价行数而非不同订单数。
- 主任务复验旧仓储测试还发现两项与新语义冲突：1 月 4 日回放错误期待未来送达的 GMV 为 `490`，以及 1 月 1 日回放错误期待 1 月 2 日送达已进入漏斗。

### GREEN

- 订单集新增 `known_status`：仅在 `delivered_at <= replayNow` 时为 `delivered`；否则按已知 `carrier_at`、`approved_at`、购买事实映射。兼容 KPI、历史对比、趋势、漏斗、状态分布、贡献和近期订单均使用此状态。
- `lowScoreRate` 改为 `COUNT(DISTINCT CASE WHEN review_score IN (1, 2) THEN reviews.order_id END) / COUNT(DISTINCT reviews.order_id)`。
- 新分组已从 `PilotSnapshot` 可选改为必填。TypeScript 首次仅报 `tests/server/pilotAnalysis.test.ts(20,7)` 缺失五个分组；经授权为该 Task 3 测试夹具补充零/空安全值，未改任何 Task 3 生产代码。
- 验证结果：仓储 18/18、指标定义 1/1、`pilotAnalysis` 26/26 通过；`tsc --noEmit` 与 `git diff --check` 通过。

## 修复轮 2：履约时长只统计已送达订单

### RED

- 新增一个带有审批、交运时间但最终状态为 `canceled` 的订单。回放后状态分布实际将其错误显示为 `carrier`，而断言要求仍为 `canceled`；该断言以 1 项失败、18 项跳过实际观察。

### GREEN

- `known_status` 仅对原始 `delivered` 订单按回放时间映射 `purchased/approved/carrier/delivered`；取消、不可用等非送达终态保持原始状态。
- 平均审批与平均交运时长均要求原始状态为 `delivered`、`delivered_at <= replayNow`，并要求各自阶段时间非空且不晚于回放。
- 验证：新增回归 1/1、完整仓储 19/19、指标定义 1/1、`pilotAnalysis` 26/26 通过；`tsc --noEmit` 和 `git diff --check` 通过。
