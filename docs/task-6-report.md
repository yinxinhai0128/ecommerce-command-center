# Task 6 验收报告

## 变更

- CoreUI 的“经营数据”入口复用既有 `PilotApp`，因此保留回放、筛选、分析、快照与错误状态。
- 新增浏览器验收 `e2e/commerce-product.spec.ts`：提交 fixture 自动导入，API 使用 8788、Vite 使用 5174，每例先重置回放。
- 390px 侧栏压缩且可见，修复水平溢出；保留原生可聚焦导航按钮。
- 内部文档补充数据许可/归属、9 张源表、产品边界、评分卡和风险；产品界面不展示这些声明。

## TDD 与浏览器证据

- RED：`pnpm exec playwright test e2e/commerce-product.spec.ts --reporter=line` 首次在 CoreUI 的经营数据入口找不到 `pilot-source-local-now` 失败，证明该入口未接入回放流程。
- GREEN：桌面用例 `1 passed (17.2s)`；分析用例 `1 passed (14.4s)`；390px 用例在响应式修复后 `1 passed (13.5s)`。
- Browser 插件未在本会话可用，依照前端测试技能使用项目 Playwright 回退；检查了可访问导航、键盘焦点、筛选、开始/暂停/重置、暂停稳定快照、可信快照问答、移动溢出和产品禁用文案。
- 暂停断言在“开始回放”重新可见、允许暂停前在途刷新完成后才采样；因此证明的是稳定暂停态，不宣称取消暂停前的在途响应。

## 质量门

- `pnpm exec tsc --noEmit`：通过。
- `pnpm build`：通过；Vite 报告已有主 chunk 大于 500kB 的性能警告。
- `pnpm test`：本机 worker 环境在 Vitest 启动后被宿主中断，无法取得完整终态；尝试单 worker forks 时，Vitest 4.1.10 不支持 `--minWorkers`，移除该参数的单文件运行仍在启动输出后被宿主中断。未将其报告为通过。
- `pnpm e2e`：按协调要求在首个已通过桌面用例后停止，未取得完整全量终态；不报告通过。
- `pnpm screenshots`：未运行，因协调要求停止全量命令。
- `git diff --check`：通过。
- `git ls-files var .env .env.local`：无输出。
- 密钥扫描只命中空变量模板、README 说明和历史计划中的扫描命令；没有实际 key。

## 评分与风险

总分为 **96/100**；评分证据和非生产风险详见 `docs/commerce-product-scorecard.md`。主要风险为公开匿名历史数据并非生产连接、仅 Chromium 覆盖、可选模型输出需复核，以及上述全量 Vitest/E2E/截图终态未能在本机会话取得。

## 补充验收（恢复与移动端）

- RED：新增恢复验收首次只让状态请求返回 503；由于三秒轮询自动恢复，十秒内未出现可操作错误提示而失败。随后将路由控制为在点击“重试”前持续返回 503，从而隔离并验证用户可访问的恢复动作；后端未被伪造或修改。
- GREEN：`pnpm exec playwright test e2e/commerce-product.spec.ts --grep '状态请求失败后' --reporter=line`：`1 passed (12.4s)`。断言错误提示与“重试”可见，解除路由后点击“重试”，确认成功状态响应、经营数据控制台与回放控制恢复，错误提示清除。
- 390px：`pnpm exec playwright test e2e/commerce-product.spec.ts --grep '390 宽度下可实际' --reporter=line`：`1 passed (12.6s)`。真实进入经营数据，应用 `2017-01-03` 至 `2017-01-31` 合法范围并确认快照请求，启动、暂停、重置回放，且无横向溢出。
- 每例继续通过 `beforeEach` 重置回放；Playwright 配置仍将 API 隔离在 8788、Vite 隔离在 5174。
