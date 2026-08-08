import type { JSX } from 'react';
import type { DashboardSnapshot, Kpi } from '../../domain/types';

type KpiDefinition = {
  key: keyof DashboardSnapshot['kpis'];
  label: string;
  format: (value: number) => string;
  inverse?: boolean;
};

const definitions: KpiDefinition[] = [
  { key: 'gmv', label: 'GMV', format: currency },
  { key: 'orderCount', label: '支付订单', format: (value) => value.toLocaleString('zh-CN') },
  { key: 'conversionRate', label: '支付转化率', format: percent },
  { key: 'averageOrderValue', label: '客单价', format: currency },
  { key: 'grossMarginRate', label: '毛利率', format: percent },
  { key: 'refundRate', label: '退款率', format: percent, inverse: true },
];

function currency(value: number): string {
  return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function tone(kpi: Kpi, inverse = false): 'positive' | 'negative' | 'neutral' {
  if (kpi.changeRate === 0) return 'neutral';
  return (kpi.changeRate > 0) !== inverse ? 'positive' : 'negative';
}

export function KpiStrip({ snapshot }: { snapshot: DashboardSnapshot }): JSX.Element {
  return (
    <section className="kpi-strip" aria-label="核心经营指标">
      {definitions.map((definition) => {
        const kpi = snapshot.kpis[definition.key];
        const semanticTone = tone(kpi, definition.inverse);
        return (
          <article key={definition.key} className="kpi-item" data-tone={semanticTone}>
            <span>{definition.label}</span>
            <strong>{definition.format(kpi.value)}</strong>
            <small>{snapshot.comparisonLabel} {kpi.changeRate === 0 ? '持平' : `${kpi.changeRate > 0 ? '↑' : '↓'} ${percent(Math.abs(kpi.changeRate))}`}</small>
          </article>
        );
      })}
    </section>
  );
}
