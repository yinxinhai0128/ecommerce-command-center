# Task 5 报告

## 修复轮 1–3

- 深层日期时间契约、ready 重初始化、分析取消代次。
- 刷新和回放代次分离；变更进行中跳过刷新，完成后只刷新一次。
- 回放启动立即解除已失效刷新 loading；回放失败立即显示错误并保持 idle。

## 验证

- `pnpm exec vitest run src/api/pilotClient.test.ts tests/app/pilotDashboardFlow.test.tsx`：18 通过。
- `pnpm exec tsc --noEmit`：通过。

## 修复轮 4/5

- 新增旧 refresh 竞态测试：同时保留忽略取消的旧 status、snapshot 与失败响应，确认 replay 成功及 post-refresh 完成后，所有晚到结果均不能覆盖最新 status/snapshot/error。
- 新增完整 ready 生命周期测试：`ready=true` 建立快照，刷新失败保留旧快照并显示错误，`ready=false` 清空 snapshot/options/filters/error，再以新的 range/sourceLocalNow 重建 30 天筛选和快照。
- 新增连续 replay mutation 竞态测试：pause/start 均延迟且忽略取消，start 先完成、pause 后完成时，只保留 start 状态并只执行一次 start 后刷新。
- Provider 的现有 generation/controller guard 已满足三项契约，本轮没有生产代码改动。

## 修复轮 4/5 RED/GREEN 证据

- A RED：临时移除 refresh 当前性 guard 后，晚到旧 `ready=false` status 覆盖最新 ready 状态，测试按预期失败；恢复后通过。
- B RED：临时移除 `ready=false` 清理分支后，旧 snapshot 仍为 `490` 而非 `null`，测试按预期失败；恢复后通过。
- C RED：临时移除 replay mutation 当前性 guard 后，晚到 pause 触发额外刷新，status/snapshot 请求由预期 `2/2` 变为 `3/3`，测试按预期失败；恢复后通过。
- 三条测试使用显式 deferred Promise 与 `act` 微任务推进；未使用 `findBy` 等待 fake timer，未发生死锁。
- 恢复 Provider 后 `pnpm exec vitest run tests/app/pilotDashboardFlow.test.tsx`：11 通过。
- `pnpm exec vitest run src/api/pilotClient.test.ts tests/app/pilotDashboardFlow.test.tsx`：21 通过。
- `pnpm exec tsc --noEmit`：通过。
