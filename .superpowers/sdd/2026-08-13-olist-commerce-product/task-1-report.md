# Task 1 报告

## 实现

- 新增 payments 表（订单与支付序号复合主键、订单外键）和允许邮编前缀重复的 geolocations 表。
- 九个官方 CSV 均纳入下载、哈希、导入清单与独立验证。
- 新增支付复合键重复和支付订单孤儿引用的验证用例。

## TDD 记录

- RED：`pnpm exec vitest run tests/pilot/importer.test.ts tests/pilot/verifier.test.ts`。Windows 环境下 Vitest 输出 `0 passed` 后未产生断言结果；新增断言依赖的 payments/geolocations 尚未实现。
- GREEN（导入器）：`node node_modules/vitest/vitest.mjs run tests/pilot/importer.test.ts --pool=forks --maxWorkers=1 --no-file-parallelism --reporter=verbose`，3/3 通过，11.75 秒。
- GREEN（验证器）：主任务独立以相同直接 Node/Vitest fork 池方式确认 4/4 通过，12.43 秒。

## 其他验证

- `node node_modules/typescript/bin/tsc --noEmit`：通过。
- `git diff --check`：通过。

## 风险

- Windows 下 Vitest threads 池及双文件/部分验证器运行会停在 RUN 横幅，未输出结果；fork 池单文件导入器可稳定通过，验证器已由主任务独立确认通过。
- 未提交任何原始数据或 SQLite 数据库；新增的是最小测试 CSV 夹具。

## 修复轮 1

- 新增测试逐字节读取两个新增 CSV，并使用 SHA-256 断言返回清单与落盘 `manifest.json` 的哈希完全一致，同时断言落盘 payments、geolocations 表行数。
- RED 检查：先读取默认 Vitest 配置；未指定池配置，Vitest 4.1.10 默认使用 forks。新增覆盖在现有哈希实现上首次运行即通过，未发现行为缺陷；无需修改生产代码。
- GREEN：`pnpm exec vitest run tests/pilot/importer.test.ts tests/pilot/verifier.test.ts`，2 个测试文件、7 个测试全部通过，12.40 秒。
- `pnpm exec tsc --noEmit` 与 `git diff --check` 均通过。
- 未添加 Vitest 池配置：精确联合命令已可复现通过，添加配置不属于必要的最小变更。
