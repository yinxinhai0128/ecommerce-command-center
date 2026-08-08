import type { JSX } from 'react';
import type { DashboardSnapshot } from '../../domain/types';

type Row = { name: string; value: number; suffix?: string };

function BreakdownPanel({ title, rows }: { title: string; rows: Row[] }): JSX.Element {
  const maximum = Math.max(...rows.map((row) => row.value), 1);
  return <section className="panel breakdown-panel"><h2>{title}</h2>{rows.length === 0 ? <p className="panel-empty">当前筛选条件下暂无数据</p> : <ul>{rows.slice(0, 5).map((row) => <li key={row.name}><span>{row.name}</span><i><b style={{ width: `${row.value / maximum * 100}%` }} /></i><strong>{row.suffix ?? `¥${row.value.toLocaleString('zh-CN')}`}</strong></li>)}</ul>}</section>;
}

export function BreakdownPanels({ snapshot }: { snapshot: DashboardSnapshot }): JSX.Element {
  return <div className="breakdown-panels">
    <BreakdownPanel title="商品排行" rows={snapshot.productRanking.map((item) => ({ name: item.name, value: item.gmv }))} />
    <BreakdownPanel title="地区贡献" rows={snapshot.regionRanking.map((item) => ({ name: item.region, value: item.gmv }))} />
    <BreakdownPanel title="库存风险" rows={snapshot.inventoryRisks.map((item) => ({ name: item.name, value: item.daysAvailable, suffix: `${item.daysAvailable.toFixed(1)} 天` }))} />
  </div>;
}
