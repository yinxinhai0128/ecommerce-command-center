# 最终审查修复：历史状态回放

## 问题

Olist 订单只提供最终 `order_status`，但取消、不可用等终态没有发生时间戳。此前仓储层在任意历史回放时刻直接展示这些终态，并据此计算取消率，造成未来事实泄漏。

## TDD 证据

- 新增手算夹具：一个最终取消的订单分别在下单、批准、交承运三个已知时间阶段回放。
- RED：首次定向运行退出码 1；下单阶段期望 `purchased`，实际得到未来终态 `canceled`。
- GREEN：完整 `tests/pilot/repository.test.ts` 20/20 通过。

## 语义取舍

- 回放状态只使用有时间戳且不晚于回放时刻的事实：`purchased`、`approved`、`carrier`、`delivered`。
- 最终为 canceled、unavailable、processing、shipped 等订单不会被隐藏；订单下单事实和已知阶段仍保留。
- 因数据集没有可证明的取消发生时间，历史回放不展示取消终态，取消率不使用最终状态倒灌，值为 0。
- 仅原始最终状态为 delivered 且送达时间已发生的订单进入履约时长，原有边界保持不变。

## 验证

- `node node_modules/vitest/vitest.mjs run tests/pilot/repository.test.ts --environment=node --pool=forks --maxWorkers=1 --no-file-parallelism --reporter=verbose`：20/20 通过。
- `node node_modules/typescript/bin/tsc --noEmit`：退出码 0。
- `git diff --check`：退出码 0，仅 Windows 行尾提示。

## 补充边界修复：异常终态记录

### 根因

`known_status` 曾只依据 `delivered_at <= replayNow` 判定已送达。若一条最终为
`canceled` 或 `unavailable` 的异常记录仍携带历史送达时间，它会被错误纳入 GMV、有效订单、
趋势、贡献、送达漏斗和配送指标；这也与配送耗时对原始 `order_status = 'delivered'` 的限制不一致。

### TDD 证据

- 新增两个手算订单：最终状态分别为 `canceled`、`unavailable`，均包含下单、审批、承运和送达时间。
- RED：修复前定向运行 `tests/pilot/repository.test.ts`，新增用例失败，GMV 实得 `100`、期望 `0`。
- GREEN：仅将 `known_status` 的送达分支收紧为 `order_status = 'delivered' AND delivered_at <= replayNow`。
  异常终态记录仍按已知时间显示为 `carrier`，但不会被视为完成交易；取消率保持 `0`，不从没有发生时点的最终状态倒灌事实。

### 验证

- `node node_modules/vitest/vitest.mjs run tests/pilot/repository.test.ts --pool=vmForks --maxWorkers=1 --no-file-parallelism --reporter=verbose`：21/21 通过。
- `node node_modules/typescript/bin/tsc --noEmit`：退出码 0。
- `git diff --check`：退出码 0（仅 Windows 行尾提示）。
