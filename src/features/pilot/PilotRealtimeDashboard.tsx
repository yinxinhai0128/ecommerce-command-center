import type { JSX } from 'react';
import type { PilotSnapshot } from '../../pilot/types';
import { MetricValue } from '../../ui/MetricValue';
import { Panel } from '../../ui/Panel';
import { PilotSalesChart } from './PilotSalesChart';

type PilotRealtimeDashboardProps = { snapshot: PilotSnapshot; onClearFilters: () => void };
type KpiKey = keyof PilotSnapshot['kpis'];
const kpis: Array<{ key: KpiKey; label: string; format: (value: number) => string; inverse?: boolean }> = [
  { key: 'itemGmv', label: '商品成交额', format: (value) => `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  { key: 'validOrderCount', label: '有效订单数', format: (value) => value.toLocaleString('zh-CN') },
  { key: 'averageOrderValue', label: '平均客单价', format: (value) => `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  { key: 'cancellationRate', label: '取消率', format: percent, inverse: true },
  { key: 'onTimeDeliveryRate', label: '准时送达率', format: percent },
  { key: 'averageDeliveryDays', label: '平均送达天数', format: (value) => `${value.toFixed(1)} 天`, inverse: true },
  { key: 'averageReviewScore', label: '平均评分', format: (value) => value.toFixed(2) },
];
const stageLabel = { purchased: '已下单', approved: '已批准', carrier: '已交承运', delivered: '已送达' } as const;
function percent(value: number): string { return `${(value * 100).toFixed(1)}%`; }
function changeText(changeRate: number, inverse = false): string {
  if (!changeRate) return '较上期持平';
  const positive = inverse ? changeRate < 0 : changeRate > 0;
  return `较上期 ${positive ? '↑' : '↓'} ${percent(Math.abs(changeRate))}`;
}
function Ranking({ title, rows, emptyText, onClearFilters }: { title: string; rows: Array<{ label: string; value: number }>; emptyText: string; onClearFilters: () => void }): JSX.Element {
  const maximum = Math.max(1, ...rows.map((row) => row.value));
  return <Panel title={title}>{rows.length === 0 ? <div className="pilot-empty"><p className="panel-empty">{emptyText}</p><button type="button" onClick={onClearFilters}>清除筛选</button></div> : <ul className="breakdown-list">{rows.slice(0, 5).map((row) => <li key={row.label}><span>{row.label}</span><i><b style={{ width: `${row.value / maximum * 100}%` }} /></i><strong>¥{row.value.toLocaleString('zh-CN')}</strong></li>)}</ul>}</Panel>;
}

export function PilotRealtimeDashboard({ snapshot, onClearFilters }: PilotRealtimeDashboardProps): JSX.Element {
  return (
    <div className="pilot-realtime-dashboard">
      <section className="pilot-kpi-strip" aria-label="Olist 核心经营指标">
        {kpis.map(({ key, label, format, inverse }) => <article key={key} data-testid="pilot-kpi" className="kpi-item"><span>{label}</span><MetricValue value={format(snapshot.kpis[key].value)} change={changeText(snapshot.kpis[key].changeRate, inverse)} /></article>)}
      </section>
      <p className="pilot-cutoff">源数据本地时间 {snapshot.sourceLocalNow}</p>
      <Panel title="每日成交趋势"><PilotSalesChart trend={snapshot.dailyTrend} /></Panel>
      <Panel title="履约漏斗">{snapshot.fulfillmentFunnel.length === 0 ? <p className="panel-empty">当前筛选条件下暂无履约数据</p> : <ol className="funnel-list pilot-funnel">{snapshot.fulfillmentFunnel.map((item) => <li key={item.stage}><span>{stageLabel[item.stage]}</span><strong>{item.value.toLocaleString('zh-CN')}</strong></li>)}</ol>}</Panel>
      <div className="pilot-rankings">
        <Ranking title="类目排行" rows={snapshot.categoryRanking.map((row) => ({ label: row.category, value: row.itemGmv }))} emptyText="暂无类目数据" onClearFilters={onClearFilters} />
        <Ranking title="卖家排行" rows={snapshot.sellerRanking.map((row) => ({ label: row.sellerId, value: row.itemGmv }))} emptyText="暂无卖家数据" onClearFilters={onClearFilters} />
        <Ranking title="客户州排行" rows={snapshot.customerStateRanking.map((row) => ({ label: row.customerState, value: row.itemGmv }))} emptyText="暂无客户州数据" onClearFilters={onClearFilters} />
      </div>
      <Panel title="最近订单">{snapshot.recentOrders.length === 0 ? <p className="panel-empty">当前筛选条件下暂无订单数据</p> : <ul className="pilot-order-list">{snapshot.recentOrders.slice(0, 8).map((order) => <li key={order.orderId}><span>{order.orderId}</span><time dateTime={order.purchasedAt.replace(' ', 'T')}>{order.purchasedAt}</time><strong>¥{order.itemGmv.toLocaleString('zh-CN')}</strong><span>{order.status} · {order.itemCount} 件 · {order.customerState}</span></li>)}</ul>}</Panel>
      <Panel title="数据能力边界"><ul className="pilot-capabilities">{snapshot.capabilities.map((capability) => <li key={capability.key}><strong>{capability.key}</strong><span>{capability.status === 'available' ? '可用' : capability.reason ?? '当前数据源不支持'}</span></li>)}</ul></Panel>
    </div>
  );
}
