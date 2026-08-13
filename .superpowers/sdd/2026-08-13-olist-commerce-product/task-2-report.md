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
