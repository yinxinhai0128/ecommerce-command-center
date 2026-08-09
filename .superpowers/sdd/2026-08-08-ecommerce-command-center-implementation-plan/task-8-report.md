# Task 8 浏览器验证与交付报告

## 浏览器路径与范围

- Browser plugin 状态：`Browser plugin not available`。本会话没有 Browser plugin 或 browser skill，故按前端调试技能使用仓库已有的 `@playwright/test`。
- Windows/PowerShell 环境未使用 Playwright 的 `.sh` 包装器；使用 `node node_modules/@playwright/test/cli.js test`。
- 初次运行缺少 Chromium 可执行文件，已通过 `pnpm exec playwright install chromium` 安装浏览器运行时，没有新增 npm 依赖。
- 验证流程：`/ -> 实时监控关键指标与暂停/恢复 -> 切换智能分析 -> 无Key本地分析完成 -> 点击预置问题 -> 对话记录与行动建议保持可见`。

## RED / GREEN 记录

1. 初始 `pnpm e2e` 没有 Playwright 配置，错误地把 Vitest 单测作为 E2E 收集；新增 `playwright.config.ts` 和 `e2e/dashboard.spec.ts` 后，测试被正确发现。
2. 配置规范 base URL 为 `127.0.0.1:5173`，Vite 初始只监听 IPv6 localhost，导致 webServer 不能复用服务。RED 由端口/日志确认；GREEN 是 `vite.config.ts` 显式监听 IPv4，受控启动后 5173 与 8787 都可用。
3. 新 E2E 先 RED 于缺少 Chromium，安装运行时后 GREEN：2/2 通过。
4. 截图发现凌晨数据都堆在最后一个五分钟桶。新增生成器测试先 RED（最小分钟为 270），再让凌晨订单从 00:00 分布到当前分钟；GREEN 通过。
5. 无预警时本地分析的变化归因为空。新增本地 provider 测试先 RED（`causes=[]`），再使用商品、渠道、地区的真实首项生成最多三条归因；GREEN 通过。
6. 1280px 预测金额重叠。新增 ForecastPanel 测试先 RED，再将五位数金额改为紧凑人民币格式；GREEN 通过。
7. 实时订单状态显示英文领域值。新增组件测试先 RED，再只在展示层映射为待支付、已支付、已完成、已取消；GREEN 通过。
8. 无经营预警时，主图把每个超过目标的点画成红色异常。新增图表测试先 RED（无预警仍有散点、预警时有多个散点），再由 `alerts.length > 0` 绑定异常 series，且只标记最后一个趋势点；GREEN 通过。
9. 新增 `e2e/dashboard.spec.ts` 后，Vitest 默认会加载它；`pnpm test` RED 于 Playwright `test()` 导入错误。将 Vitest include 收窄至 `src/` 与 `tests/` 单测目录后 GREEN。

## 浏览器检查

- 视口：1920×1080、1440×900、1280×800。
- 每个视口均断言 `document.documentElement.scrollWidth <= window.innerWidth`；均通过。
- E2E 在三个视口执行页面标题、`经营驾驶舱`、GMV、暂停/恢复、标签切换、本地分析来源、预置问题与对话日志、行动建议、筛选后的“数据已变化，重新分析”以及不自动再次请求。
- E2E 收集浏览器 console error/warn；没有相关浏览器消息。终端的 `NO_COLOR` 提示是 Node 子进程环境警告，不是页面 console 消息。

## 截图

| 文件 | 像素 | 字节 |
| --- | --- | ---: |
| `screenshots/realtime-1920x1080.png` | 1920×1080 | 87,915 |
| `screenshots/analysis-1920x1080.png` | 1920×1080 | 76,086 |
| `screenshots/realtime-1440x900.png` | 1440×900 | 80,519 |
| `screenshots/analysis-1440x900.png` | 1440×900 | 72,405 |
| `screenshots/realtime-1280x800.png` | 1280×800 | 79,832 |
| `screenshots/analysis-1280x800.png` | 1280×800 | 69,847 |

逐张复核确认：顶部导航、KPI 顺序、3-6-3 主布局、漏斗/渠道、主图、订单/预警与底部三拆解均完整；智能分析保持四个主区及问答区；浅色背景、语义色、字号层级与容器边界一致；没有横向滚动、裁切、重叠、默认控件字体或意外换行。最后一轮主图不再出现无预警的红色异常点，1280px 预测金额不重叠。

## Fidelity ledger

| 参考结构证据 | 当前实现证据 | 处理 |
| --- | --- | --- |
| 顶部导航与高密度经营信息 | 顶部标题、双一级模块、全局筛选和实时状态 | 保留结构 |
| KPI 横向带状布局 | 六项 KPI 固定在首个经营区域 | 保留结构 |
| 左/中/右经营轨道 | 漏斗与渠道 / 分钟主图 / 实时订单和预警为 3-6-3 | 保留结构 |
| 底部多维拆解 | 商品、地区、库存三面板 | 保留结构 |
| 分析页结论、归因与行动 | 四个分析区加右侧问答与历史 | 保留结构，并补全无预警归因 |
| 参考视频的深色视觉 | 当前为用户已选择的浅色主题 | 有意偏离，未改结构 |

## 质量门与风险

- `pnpm test`：15 个文件、91 个测试通过。
- `pnpm exec tsc --noEmit`：通过。
- `pnpm build`：通过。
- `node node_modules/@playwright/test/cli.js test --reporter=line`：2/2 通过。
- `git diff --check`：通过。
- 敏感扫描：受追踪范围与 `dist/` 未发现疑似 Key；`.env` 不存在且未追踪。模拟数据仅使用通用商品、商店和客户占位名称。
- React 只读性能审查：`echarts-for-react` 使生产首包为约 450 kB gzip，构建已给出 chunk 警告。这是已记录的非阻塞风险；本轮没有为消除警告进行大范围代码分割或重构。
- 交付结束前已停止本任务开发服务，5173 与 8787 均没有监听进程。

## 修复轮 1：环境变量与截图命令边界

1. 临时 `.env` 只写入 `PORT=8790`。旧 `pnpm dev` 的 RED 证据为前端监听 5173、Express 仍监听 8787，8790 未监听。确认后停止全部进程并删除该临时文件。
2. 参数验证表明 `tsx --env-file-if-exists=.env watch server/index.ts` 会把 `watch` 解析为入口文件，不能使用。项目当前 Node 为 v24.15.0，最终改为 `node --env-file-if-exists=.env --import tsx --watch server/index.ts`：临时文件存在时 GREEN 为 5173 + 8790；删除 `.env` 后 GREEN 为 5173 + 8787。README 明确 Node.js 24 或更高版本要求。
3. 拆分 E2E：截图用例标记为 `@screenshots`；`pnpm e2e` 排除该标记，`pnpm screenshots` 仅运行该标记。旧 `pnpm e2e` 的 RED 证据为 6 张 PNG 的 SHA-256 都发生变化；新 `pnpm e2e` 为 1/1 通过且 6 张截图 hash 变化数为 0；`pnpm screenshots` 为 1/1 通过并在 05:01:46–05:01:54 明确重生 6 张交付图。
4. 最后一次逐张视觉复核仍通过：三种桌面尺寸无横滚、裁切或重叠，主图无无预警红色异常点，分析图金额紧凑且可读。

## 修复轮 2：Vite 动态 API 代理端口

1. RED：临时 `.env` 只含 `PORT=8790` 时，启动状态为 Vite 5173、Express 8790、8787 无监听；旧 Vite 代理仍固定指向 8787，核心 E2E 失败于智能分析请求后的结果不可见。纯函数测试首次运行也因 `resolveApiPort` 尚不存在而 7/7 失败。
2. GREEN：Vite 通过 `loadEnv(mode, process.cwd(), '')` 取得环境，但只解构和使用 `PORT`；进程环境优先于文件值。端口解析覆盖未设置、合法值、非数字、零、越界和小数，非法值统一回退 8787。配置没有读取、定义或向客户端注入 `DEEPSEEK_API_KEY`。
3. 集成证据：临时 `PORT=8790` 时仅监听 5173 + 8790，核心 `pnpm e2e` 为 1/1 通过；删除 `.env` 后仅监听 5173 + 8787，核心 E2E 仍为 1/1 通过。两轮执行前后 6 张交付截图的 SHA-256 完全一致，未运行截图刷新用例。
4. 新鲜质量门：聚焦端口测试 7/7、`pnpm test` 16 个文件 / 101 个测试、`pnpm exec tsc --noEmit`、`pnpm build` 均通过；构建仅保留已记录的 ECharts 大 chunk 非阻塞警告。受追踪文件与 `dist/` 的疑似真实 Key 扫描均为 0；`.env` 不存在，5173、8787、8790 均无残留监听。
5. Fidelity ledger：本轮没有改动组件、样式、数据或截图；浅色视觉、顶部导航、KPI、3-6-3 经营轨道、底部拆解和智能分析四区的既有视觉证据不变，仅修正开发环境的 API 路由一致性。

## 修复轮 3：截图流程等待双服务就绪

1. RED：最终刷新截图时，Playwright 只确认 5173 的 Vite 前端可用便开始交互；首个 `/api/analysis` 请求在 Express 尚未监听时返回 502，截图用例失败并显示“分析服务暂时不可用”。失败 trace 明确记录该 POST 为 `502 Bad Gateway`。
2. GREEN：E2E 在进入经营流程前轮询 `/api/readiness-check`，仅当 Express 经 Vite 代理返回预期的 API 404 后继续。该等待由服务状态驱动，没有增加固定超时；截图用例重新运行 1/1 通过。
3. 最终重生 6 张截图并逐张复核：实时页已展示真实“搜索/信息流”渠道归因收入与花费，分析页行动建议已展示原因、负责人、预期影响和验证指标；1920、1440、1280 三种桌面视口均无横滚、裁切或重叠。
