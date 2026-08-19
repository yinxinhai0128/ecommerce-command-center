import type { JSX } from 'react';
import type { DashboardSnapshot } from '../../domain/types';
import { MetricValue } from '../../ui/MetricValue';
import { Panel } from '../../ui/Panel';

type OverviewPageProps = { snapshot: DashboardSnapshot };

const facts: Array<{ key: 'gmv' | 'netSales' | 'orderCount' | 'averageOrderValue'; label: string; format: (value: number) => string }> = [
  { key: 'gmv', label: '成交额', format: (value) => `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  { key: 'netSales', label: '净销售额', format: (value) => `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  { key: 'orderCount', label: '订单数', format: (value) => value.toLocaleString('zh-CN') },
  { key: 'averageOrderValue', label: '平均客单价', format: (value) => `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
];

function change(rate: number): string {
  return `较上期 ${rate >= 0 ? '↑' : '↓'} ${(Math.abs(rate) * 100).toFixed(1)}%`;
}

export function OverviewPage({ snapshot }: OverviewPageProps): JSX.Element {
  return (
    <section className="overview-page" aria-labelledby="overview-title">
      <h2 id="overview-title">经营概览</h2>
      <div className="overview-facts">
        {facts.map(({ key, label, format }) => <Panel key={key} title={label}><MetricValue value={format(snapshot.kpis[key].value)} change={change(snapshot.kpis[key].changeRate)} /></Panel>)}
      </div>
    </section>
  );
}
