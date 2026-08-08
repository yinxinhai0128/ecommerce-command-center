import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import type { DashboardAlert, DashboardSnapshot } from '../../domain/types';
import { App } from '../../App';
import { RealtimeDashboard } from './RealtimeDashboard';

let chartOptions: ComponentProps<typeof import('echarts-for-react').default>['option'][] = [];

vi.mock('echarts-for-react', () => ({
  default: ({ option, ...props }: { option: Record<string, unknown>; 'aria-label'?: string }) => {
    chartOptions.push(option);
    return <div role="img" aria-label={props['aria-label']} />;
  },
}));

const snapshot: DashboardSnapshot = {
  comparisonLabel: '较昨日同期',
  kpis: {
    gmv: { value: 125600, comparisonValue: 112000, changeRate: 0.1214 },
    netSales: { value: 118000, comparisonValue: 110000, changeRate: 0.0727 },
    orderCount: { value: 836, comparisonValue: 760, changeRate: 0.1 },
    conversionRate: { value: 0.034, comparisonValue: 0.03, changeRate: 0.1333 },
    averageOrderValue: { value: 150.24, comparisonValue: 147.37, changeRate: 0.0195 },
    grossMarginRate: { value: 0.42, comparisonValue: 0.4, changeRate: 0.05 },
    refundRate: { value: 0.021, comparisonValue: 0.024, changeRate: -0.125 },
    targetAchievementRate: { value: 0.86, comparisonValue: 0.8, changeRate: 0.075 },
  },
  salesTrend: [
    { at: new Date('2026-08-08T12:00:00+08:00'), gmv: 3200, orderCount: 22, target: 3000 },
    { at: new Date('2026-08-08T12:05:00+08:00'), gmv: 4100, orderCount: 31, target: 3000 },
  ],
  recentOrders: Array.from({ length: 9 }, (_, index) => ({
    id: `order-${index + 1}`,
    platform: index % 2 === 0 ? '天猫' : '京东',
    amount: 100 + index,
    status: index % 2 === 0 ? 'paid' as const : 'created' as const,
    at: new Date(`2026-08-08T12:${String(9 - index).padStart(2, '0')}:00+08:00`),
  })),
  funnel: [],
  channelRanking: [],
  productRanking: [{ productId: 'sku-1', name: '云感外套', gmv: 8200 }],
  regionRanking: [{ region: '华东', gmv: 12800 }],
  inventoryRisks: [{ productId: 'sku-2', name: '轻量跑鞋', stock: 4, dailySales: 3, daysAvailable: 1.33 }],
  forecast7d: [],
  targetProbability: 0,
};

const alerts: DashboardAlert[] = [{
  id: 'refund-alert',
  severity: 'warning',
  metric: 'refundRate',
  title: '退款率高于阈值',
  evidence: '近一小时退款申请增加',
  impactAmount: 3200,
  suggestion: '核对尺码与物流异常订单',
  createdAt: new Date('2026-08-08T12:10:00+08:00'),
}];

beforeEach(() => {
  chartOptions = [];
});

test('展示六项经营KPI且退款率下降使用向好语义色', () => {
  render(<RealtimeDashboard snapshot={snapshot} alerts={alerts} isRunning />);

  for (const label of ['GMV', '支付订单', '支付转化率', '客单价', '毛利率', '退款率']) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
  expect(screen.getByText('GMV').closest('[data-tone]')).toHaveAttribute('data-tone', 'positive');
  expect(screen.getByText('退款率').closest('[data-tone]')).toHaveAttribute('data-tone', 'positive');
  expect(screen.getAllByText(/较昨日同期/)).toHaveLength(6);
});

test('分钟经营脉冲输出GMV、订单、目标和异常四条可访问系列', () => {
  render(<RealtimeDashboard snapshot={snapshot} alerts={alerts} isRunning />);

  expect(screen.getByRole('img', { name: '分钟经营脉冲图表' })).toBeInTheDocument();
  const option = chartOptions[0] as { series: Array<{ name: string; type: string; lineStyle?: { type?: string } }> };
  expect(option.series).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'GMV', type: 'bar' }),
    expect.objectContaining({ name: '订单', type: 'line' }),
    expect.objectContaining({ name: '目标', type: 'line', lineStyle: expect.objectContaining({ type: 'dashed' }) }),
    expect.objectContaining({ name: '异常', type: 'scatter' }),
  ]));
});

test('最近订单最多八条并呈现输入中的订单字段', () => {
  render(<RealtimeDashboard snapshot={snapshot} alerts={alerts} isRunning />);

  expect(screen.getByText('实时订单')).toBeInTheDocument();
  expect(screen.getByText('order-1')).toBeInTheDocument();
  expect(screen.getByText('order-1').parentElement).toHaveTextContent('天猫');
  expect(screen.getByText('¥100.00')).toBeInTheDocument();
  expect(screen.queryByText('order-9')).not.toBeInTheDocument();
});

test('点击告警在同一面板展开影响、证据和建议', () => {
  render(<RealtimeDashboard snapshot={snapshot} alerts={alerts} isRunning />);

  expect(screen.getByText('经营预警')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /退款率高于阈值/ }));

  expect(screen.getByText('影响金额')).toBeInTheDocument();
  expect(screen.getByText('¥3,200.00')).toBeInTheDocument();
  expect(screen.getByText('近一小时退款申请增加')).toBeInTheDocument();
  expect(screen.getByText('核对尺码与物流异常订单')).toBeInTheDocument();
});

test('拆解区为空时给出真实空态', () => {
  render(<RealtimeDashboard snapshot={{ ...snapshot, productRanking: [], regionRanking: [], inventoryRisks: [] }} alerts={[]} isRunning={false} />);

  expect(screen.getAllByText('当前筛选条件下暂无数据')).toHaveLength(3);
  expect(screen.getByText('暂无经营预警')).toBeInTheDocument();
});

test('应用在实时标签装配仪表盘，切换分析标签时隐藏实时面板', () => {
  render(<App />);

  const realtimePanel = document.getElementById('dashboard-panel-realtime')!;
  expect(realtimePanel).toHaveTextContent('实时订单');
  fireEvent.click(document.getElementById('dashboard-tab-analysis')!);

  expect(realtimePanel).toHaveAttribute('hidden');
  expect(document.getElementById('dashboard-panel-analysis')).not.toHaveAttribute('hidden');
});
