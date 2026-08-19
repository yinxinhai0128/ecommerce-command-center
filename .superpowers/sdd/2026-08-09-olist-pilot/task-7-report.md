# Task 7 验收报告

## 浏览器验收

- 浏览器环境：`Browser plugin not available`；按允许的回退路径使用仓库已有 `@playwright/test` 与 Chromium。
- 隔离启动：Playwright 前端为 `127.0.0.1:5174`，后端为 `127.0.0.1:8788`；Vite proxy 同步使用 `PORT=8788`。每次测试结束后已确认两个端口均未监听。
- 视口：自动 E2E 使用 Desktop Chrome；手动验收覆盖 `1440x900`（实时回放、智能分析）与 `390x844`（实时回放）。移动视口没有水平溢出。
- 页面身份与非空：标题为“电商经营驾驶舱”，切换后显示“真实匿名历史数据回放”、Olist 试点内容与可信快照，不是空白页面。
- 覆盖层：未见 Vite、React 或其他框架错误覆盖层。
- 控制台：手动验收收集的 `error` 与 `warning` 均为空。
- 交互证据：每个试点流程先点击“重置回放”并等待已暂停和初始源数据本地时间，再验证开始后虚拟时间推进、暂停后源数据本地时间和当前 GMV 快照稳定；另验证“为什么取消率较高？”与“配送是否存在问题？”得到不同且匹配的可信摘要。
- 截图证据（工作区临时文件，未提交）：
  - `C:\Users\LENOVO\Documents\Codex\2026-08-08\new-chat\work\olist-pilot-realtime-1440x900.png`
  - `C:\Users\LENOVO\Documents\Codex\2026-08-08\new-chat\work\olist-pilot-analysis-1440x900.png`
  - `C:\Users\LENOVO\Documents\Codex\2026-08-08\new-chat\work\olist-pilot-realtime-390x844.png`

## 数据导入与核对

`pnpm data:olist:download` 仅尝试 Olist 官方 Kaggle URL，5.5 秒内因 TLS `ECONNRESET` 失败；未使用镜像或第三方数据。手工回退要求是登录 https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce，下载官方归档，并把七个所需 CSV 解压到 `var/olist/source` 后执行导入。

使用仓库提交的最小 CSV 夹具连续两次运行 `pnpm data:olist:import` 与 `pnpm data:olist:verify`：两次均为 `valid: true`、重复主键 `0`、孤儿引用 `0`，所有表的导入行数等于源行数，商品 GMV 均为 `363.75`。

## 契约修复与测试过程

真实夹具导入原先将 manifest 的 `range` 写为本地时间戳，和客户端既有的严格 `YYYY-MM-DD` status 合同不一致，导致已导入数据在试点 UI 被拒绝。先新增真实夹具导入后的 `/api/pilot/status` RED 测试，再将 importer manifest range 统一为日期部分；未放宽客户端校验。对应 importer、route、client 和 Provider focused 测试已转绿。

首版 E2E 的暂停断言会继承持久化 replay state，且用初始“已暂停”文本误判异步状态已完成。测试现显式重置回放，并等待控制按钮完成“开始→暂停”和“暂停→开始”的实际切换。真实 API 与浏览器诊断均证明 replay controller 在 pause 后的下一次 status 和 3.5 秒后的 status 保持相同。

固定绝对日期筛选下，虚拟时间推进不会必然改变 GMV；验收因此验证可信 `sourceLocalNow` 推进，以及暂停后时间和当前快照 GMV 稳定，不伪造 GMV 波动。

## 最终质量门

- `pnpm test`：通过。
- `pnpm exec tsc --noEmit`：通过。
- `pnpm build`：通过；仅有既存构建器的 500 kB bundle-size 建议。
- `pnpm e2e`：通过，3 个非截图用例全部通过。
- `git diff --check`：通过。
- 卫生检查：`var`、`.env`、`.env.local` 未被追踪；未发现密钥值。仅 `.env.example`、README 与计划文件中的空变量名/检查命令匹配。

## Fix Round 1

- Playwright 的两个 web server 改为跨平台的 `node` 与 `pnpm` 命令；端口、专属 `OLIST_DATA_DIR` 和空的 `DEEPSEEK_API_KEY` 通过 `webServer.env` 注入，不再使用 Windows `cmd /c`。
- 试点 E2E 每次仅清理并导入 `test-results/olist-e2e-data`，服务端启动时由 `OLIST_DATA_DIR` 选择该目录。不会读取、重置或写入 `var/olist`。本轮运行前后对现有 `var/olist` 的文件哈希一致，E2E 仍断言新夹具的初始可信时间为 `2017-01-31 00:00:00`。
- `pnpm e2e`（3 个用例）和 `pnpm screenshots`（1 个用例）均通过，且每次均确认 5174、8788 已释放。截图命令生成的已有截图基线未提交。
- 对下载器新增 `ECONNRESET` RED/GREEN：网络异常、401 与 403 都会返回同一官方 Kaggle URL，以及“解压七个 CSV 到 `var/olist/source` 后执行导入”的手工路径。文档明确记录本次实际 TLS `ECONNRESET`。
- 问答 E2E 额外验证可信快照的源数据本地时间，且取消率与配送问题的摘要不相同；README 明确“全模拟”只适用于模拟演示模式。

## Fix Round 1 最终复验

- `pnpm exec vitest run tests/pilot/source.test.ts --no-file-parallelism --maxWorkers=1 --reporter=dot`：11/11 通过。单进程仅用于避免本机并行 Vitest 启动挂起；此前 RED 已精确复现为 `socket reset` 未含手动指引，GREEN 后网络异常会提供官方 URL 与本地导入路径。
- `pnpm exec tsc --noEmit`、`pnpm build`、`git diff --check`：通过；构建仅保留既有的 500 kB bundle-size 建议。
- `pnpm e2e`：3/3 通过（41.9 秒）；`pnpm screenshots`：1/1 通过（19.0 秒）。两次结束后 `5174`、`8788` 均无监听端口。截图命令产生的基线文件仅为测试副产物，已还原，未提交。
- 隔离审计：E2E 后专属 manifest 的范围为 `2017-01-01` 至 `2017-08-01`；`var/olist/manifest.json` 的 SHA-256 仍为 `8F6ADB18F33041CD50473B716FD851BA4E8CA37B455441F7ADBDC829DBD2BBA5`，`var/olist/olist.sqlite` 仍为 `F26E73955C32636704DFAC972533318DF13DF684B2CF9CA778B849FF695D056E`，与 E2E 前记录一致。
