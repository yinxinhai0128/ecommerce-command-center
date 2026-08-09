## Olist 真实数据试点

除原有模拟演示外，应用提供本地、非商业的 Olist 匿名历史数据回放。完整操作、指标口径、限制与验证说明见 [docs/olist-pilot.md](docs/olist-pilot.md)。

```powershell
pnpm install
pnpm data:olist:download
pnpm data:olist:import
pnpm data:olist:verify
pnpm dev
```

数据保存在被 Git 忽略的 `var/olist`。来源为 [Olist Brazilian E-Commerce Public Dataset](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce)，许可证为 CC BY-NC-SA 4.0；仅可按其非商业、署名与相同方式共享条件使用。未配置 `DEEPSEEK_API_KEY` 时，试点分析自动使用本地规则，不会阻止回放。

# 经营驾驶舱

一个用于演示电商经营数据的本地 React 应用。它包含两个一级模块：**实时监控** 与 **智能分析**。模拟演示模式下的数据、商店、商品和客户均为模拟数据，不对应真实商家或客户；Olist 真实匿名历史试点的使用边界见上文链接。

## 运行

```powershell
pnpm install
pnpm dev
```

`pnpm dev` 会同时启动 Vite 前端（`http://127.0.0.1:5173`）和 Express 分析服务（默认 `http://127.0.0.1:8787`）。

常用命令：

```powershell
pnpm test
pnpm build
pnpm e2e
pnpm screenshots
```

需要 Node.js 24 或更高版本；开发服务使用 Node 的 `--env-file-if-exists` 支持读取可选 `.env`。`pnpm e2e` 只运行核心流程，不会改写交付截图；需要明确刷新截图时运行 `pnpm screenshots`。

## 分析服务配置

使用 PowerShell 复制环境变量模板：

```powershell
Copy-Item .env.example .env
```

`.env` 支持以下变量：

```text
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
PORT=8787
```

API Key 只由 Express 服务端读取，浏览器不会接收或保存它。未配置 `DEEPSEEK_API_KEY` 时，智能分析会返回本地模拟分析结果；这使完整界面和问答流程无需 Key 也能运行。

## 经营口径

- 单日范围与昨日同期对比；2–7 日范围与前 7 天对比；更长范围与前 30 天对比。
- GMV 是已支付或已完成订单的商品金额、运费与优惠后的合计；净销售额为 GMV 减已批准或已完成退款。
- 转化率为去重支付买家数除以筛选范围内访客数；退款率为退款金额除以 GMV；目标达成率为 GMV 除以同一范围目标金额。
- 未来 7 天预测使用历史周度基线与近期趋势；实时数据每 3 秒模拟一次订单或退款事件，暂停后停止该模拟更新。

## 架构与数据边界

前端在浏览器中从模拟数据生成筛选后的快照，并把最小的结构化 JSON 上下文提交到 `POST /api/analysis`。上下文只包含日期范围、KPI、贡献项、告警和预测；服务端返回同样为结构化 JSON 的结论、信号、归因、风险、行动建议与追问。服务端优先使用已配置的模型，缺失 Key 或上游异常时使用本地模拟分析。

## 浏览器与截图

已用 Chromium 验证 1920×1080、1440×900、1280×800 三种桌面视口。交付截图在 [`screenshots/`](screenshots/)，每种视口均包含实时监控和智能分析两张图。

建议使用当前版本的 Chrome、Edge 或 Firefox。此演示界面针对桌面经营看板布局验证；窄屏仍会调整栅格，但不是本次交付的主验证范围。
