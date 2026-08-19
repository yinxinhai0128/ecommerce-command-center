# Olist 真实数据试点

## 内部产品边界

本说明仅供仓库维护和验收。产品界面不展示数据来源、许可、试点、演示或模拟数据文案。

数据来自 Olist 官方 Kaggle 页面发布的 *Brazilian E-Commerce Public Dataset by Olist*，适用 CC BY-NC-SA 4.0；使用衍生内容时保留 Olist 归属，并遵守非商业与相同方式共享要求。界面外壳采用 CoreUI，归属见 `THIRD_PARTY_NOTICES.md`。本项目不复制第三方应用的产品文案或界面，仅复用经验证的订单级聚合思路。

导入需要以下 9 张源表：`olist_orders_dataset.csv`、`olist_order_items_dataset.csv`、`olist_order_payments_dataset.csv`、`olist_order_reviews_dataset.csv`、`olist_products_dataset.csv`、`olist_customers_dataset.csv`、`olist_sellers_dataset.csv`、`olist_geolocation_dataset.csv`、`product_category_name_translation.csv`。

本试点把 Olist 发布的匿名历史订单用于本地回放和经营分析。它不是企业店铺、ERP、CRM、广告平台或支付系统的连接器，也不应被视为生产监控系统。

## 安装、下载、导入与启动

需要 Node.js 24+ 与 pnpm。

```powershell
pnpm install
pnpm data:olist:download
pnpm data:olist:import
pnpm data:olist:verify
pnpm dev
```

所有本地文件位于 `var/olist`，并被 Git 忽略：下载的归档为 `var/olist/source.zip`，解压 CSV 为 `var/olist/source`，导入后的 SQLite 与清单也在该目录。运行 `pnpm data:olist:import` 后再运行同一命令是幂等的；`pnpm data:olist:verify` 会检查源行数与导入行数、重复主键、孤儿引用和商品 GMV。

下载只访问 [Olist 官方 Kaggle 数据集](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce)。若命令因 Kaggle 401 或 403 失败，请登录该官方页面并手动下载归档；不要使用镜像。将其中以下七个 CSV 解压到 `var/olist/source`，然后从上面的 `pnpm data:olist:import` 继续：

- `olist_orders_dataset.csv`
- `olist_order_items_dataset.csv`
- `olist_order_reviews_dataset.csv`
- `olist_products_dataset.csv`
- `olist_customers_dataset.csv`
- `olist_sellers_dataset.csv`
- `product_category_name_translation.csv`

本次验收实际尝试官方下载时，Kaggle TLS 连接返回 `ECONNRESET`。遇到该网络错误时同样应登录上述官方页面手动下载，不能替换为第三方来源。

## 许可证、归属与使用边界

数据来源：Olist，**Brazilian E-Commerce Public Dataset by Olist**，通过 [Olist 官方 Kaggle 页面](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce) 提供，许可证为 **CC BY-NC-SA 4.0**。使用、展示或分享由此数据衍生的内容时必须保留 Olist 署名，并遵守非商业与相同方式共享要求；不要将原始数据重新分发或用于商业用途。

试点只读取本机的 Olist 历史 CSV 与 SQLite，不上传真实企业数据。它没有身份认证、权限隔离、审计、服务等级、实时同步或企业数据治理能力，因此不是企业生产连接。

## 回放与时间

切换到“真实数据试点”后，页面明确标识“真实匿名历史数据回放”。“开始回放”每 3 秒将服务端虚拟时钟推进 6 个源数据本地小时；“暂停回放”停止推进；“重置回放”回到初始时点。状态由服务端 SQLite 持久化，刷新页面不会重置它。

Olist 时间字段不带时区偏移。页面与 API 一律将其显示为“源数据本地时间”，不把它换算为北京时间，也不推断巴西时区。

日期筛选是固定的绝对日期窗口；回放推进只会纳入该窗口中、且不晚于虚拟时钟的真实记录。因此，虚拟时间推进时 GMV 不一定变化；暂停验收要求的是虚拟时间与当前快照都保持稳定，而不是伪造 GMV 波动。

## 支持与不支持的指标

试点支持：商品 GMV、有效订单数、平均客单价、取消率、准时送达率、平均送达天数、平均评分，以及每日成交趋势、履约漏斗、类目/卖家/客户州排行和最近订单。

Olist 原始事实不支持以下能力，页面不会把它们填为零或伪造成真实：库存、成本与毛利、访问/流量与转化、广告花费与 ROI、退款金额、目标达成和销售预测。

## 可选 DeepSeek 分析

可在本地 `.env` 中配置 `DEEPSEEK_API_KEY`（可选 `DEEPSEEK_MODEL`）；密钥只由 Express 服务端读取。未配置密钥、模型超时或结果不可信时，试点会基于同一可信快照使用本地规则分析，因此回放与问答仍可验证。不要提交 `.env`、本地数据或密钥。

## 验证与回归

```powershell
pnpm test
pnpm exec tsc --noEmit
pnpm build
pnpm e2e
```

端到端试点测试使用仓库提交的最小 CSV 夹具，不复制 Olist 原始记录；每个流程开始时都会重置持久化回放状态，随后验证虚拟时间推进、暂停稳定，以及取消率与配送问题的不同可信问答证据。
