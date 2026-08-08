import type { JSX } from 'react';
import ReactECharts from 'echarts-for-react';
import type { DashboardSnapshot } from '../../domain/types';

const colors = { accent: '#4C5E9E', positive: '#287A5B', warning: '#B7791F', danger: '#C2414B', muted: '#667085' };

function timeLabel(at: Date): string {
  return at.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function SalesPulseChart({ salesTrend, hasAnomaly }: { salesTrend: DashboardSnapshot['salesTrend']; hasAnomaly: boolean }): JSX.Element {
  const latestPoint = salesTrend[salesTrend.length - 1];
  const option = {
    color: [colors.accent, colors.positive, colors.warning, colors.danger],
    tooltip: {
      trigger: 'axis',
      formatter: (values: Array<{ seriesName: string; value: number; axisValue: string }>) => `${values[0]?.axisValue ?? ''}<br/>${values.map((value) => `${value.seriesName}：${value.seriesName === 'GMV' || value.seriesName === '目标' ? `¥${value.value.toLocaleString('zh-CN')}` : value.value}`).join('<br/>')}`,
    },
    grid: { top: 32, right: 16, bottom: 24, left: 48, containLabel: true },
    xAxis: { type: 'category', data: salesTrend.map((point) => timeLabel(point.at)), axisLabel: { color: colors.muted } },
    yAxis: [{ type: 'value', axisLabel: { color: colors.muted } }, { type: 'value', axisLabel: { color: colors.muted } }],
    series: [
      { name: 'GMV', type: 'bar', data: salesTrend.map((point) => point.gmv), itemStyle: { color: colors.accent } },
      { name: '订单', type: 'line', yAxisIndex: 1, data: salesTrend.map((point) => point.orderCount), smooth: true, itemStyle: { color: colors.positive } },
      { name: '目标', type: 'line', data: salesTrend.map((point) => point.target), symbol: 'none', lineStyle: { type: 'dashed', color: colors.warning } },
      { name: '异常', type: 'scatter', data: hasAnomaly && latestPoint ? [[salesTrend.length - 1, latestPoint.gmv]] : [], itemStyle: { color: colors.danger } },
    ],
  };

  return <ReactECharts option={option} style={{ height: 260, width: '100%' }} role="img" aria-label="分钟经营脉冲图表" notMerge lazyUpdate />;
}
