import { fireEvent, render, screen, within } from '@testing-library/react';
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

test('经营概览呈现五阶段转化漏斗和真实渠道贡献', () => {
  render(<RealtimeDashboard snapshot={{
    ...snapshot,
    funnel: [
      { stage: 'visitors', value: 101 },
      { stage: 'productViewers', value: 82 },
      { stage: 'addToCartUsers', value: 53 },
      { stage: 'checkoutUsers', value: 31 },
      { stage: 'paidBuyers', value: 19 },
    ],
    channelRanking: [
      { platform: '天猫', gmv: 8000 },
      { platform: '京东', gmv: 2000 },
    ],
  }} alerts={alerts} isRunning />);

  const overview = within(screen.getByRole('region', { name: '转化漏斗与渠道贡献' }));
  const funnel = within(overview.getByRole('region', { name: '转化漏斗' }));
  for (const [label, value] of [['访客', '101'], ['商品浏览', '82'], ['加购', '53'], ['结算', '31'], ['支付', '19']]) {
    const item = within(funnel.getByText(label).closest('li')!);
    expect(item.getByText(label)).toBeInTheDocument();
    expect(item.getByText(value)).toBeInTheDocument();
  }
  const channels = within(overview.getByRole('region', { name: '渠道贡献' }));
  expect(channels.getByText('天猫')).toBeInTheDocument();
  expect(channels.getByText('¥8,000')).toBeInTheDocument();
  expect(channels.getByText('京东')).toBeInTheDocument();
  expect(channels.getByText('¥2,000')).toBeInTheDocument();
  expect(channels.getByRole('meter', { name: '天猫渠道贡献' })).toHaveAttribute('aria-valuenow', '8000');
  expect(channels.getByRole('meter', { name: '天猫渠道贡献' })).toHaveAttribute('aria-valuemax', '10000');
});

test('仅漏斗为空时只在漏斗显示空态且渠道保留真实值', () => {
  render(<RealtimeDashboard snapshot={{
    ...snapshot,
    channelRanking: [{ platform: '天猫', gmv: 8000 }],
  }} alerts={alerts} isRunning />);

  const funnel = within(screen.getByRole('region', { name: '转化漏斗' }));
  const channels = within(screen.getByRole('region', { name: '渠道贡献' }));
  expect(funnel.getByText('当前筛选条件下暂无数据')).toBeInTheDocument();
  expect(channels.queryByText('当前筛选条件下暂无数据')).not.toBeInTheDocument();
  expect(channels.getByText('天猫')).toBeInTheDocument();
  expect(channels.getByText('¥8,000')).toBeInTheDocument();
});

test('仅渠道为空时只在渠道显示空态且漏斗保留真实值', () => {
  render(<RealtimeDashboard snapshot={{
    ...snapshot,
    funnel: [{ stage: 'visitors', value: 101 }],
  }} alerts={alerts} isRunning />);

  const funnel = within(screen.getByRole('region', { name: '转化漏斗' }));
  const channels = within(screen.getByRole('region', { name: '渠道贡献' }));
  expect(channels.getByText('当前筛选条件下暂无数据')).toBeInTheDocument();
  expect(funnel.queryByText('当前筛选条件下暂无数据')).not.toBeInTheDocument();
  const visitors = within(funnel.getByText('访客').closest('li')!);
  expect(visitors.getByText('101')).toBeInTheDocument();
});

test('分钟经营脉冲只在有经营预警时为最后一个趋势点标记异常', () => {
  render(<RealtimeDashboard snapshot={snapshot} alerts={alerts} isRunning />);

  expect(screen.getByRole('img', { name: '分钟经营脉冲图表' })).toBeInTheDocument();
  const option = chartOptions[0] as { series: Array<{ name: string; type: string; data?: unknown; lineStyle?: { type?: string } }> };
  expect(option.series).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'GMV', type: 'bar' }),
    expect.objectContaining({ name: '订单', type: 'line' }),
    expect.objectContaining({ name: '目标', type: 'line', lineStyle: expect.objectContaining({ type: 'dashed' }) }),
    expect.objectContaining({ name: '异常', type: 'scatter' }),
  ]));
  expect(option.series.find((series) => series.name === '异常')?.data).toEqual([[snapshot.salesTrend.length - 1, snapshot.salesTrend[snapshot.salesTrend.length - 1]?.gmv]]);
});

test('没有经营预警时分钟经营脉冲不标记异常点', () => {
  render(<RealtimeDashboard snapshot={snapshot} alerts={[]} isRunning />);

  const option = chartOptions[0] as { series: Array<{ name: string; data?: unknown }> };
  expect(option.series.find((series) => series.name === '异常')?.data).toEqual([]);
});

test('最近订单最多八条并呈现输入中的订单字段', () => {
  const recentOrders: DashboardSnapshot['recentOrders'] = [
    { id: 'order-7', platform: '抖音电商', amount: 107, status: 'fulfilled', at: new Date('2026-08-08T12:02:00+08:00') },
    { id: 'paid-next', platform: '京东', amount: 102, status: 'paid', at: new Date('2026-08-08T12:07:00+08:00') },
    { id: 'overflow-order', platform: '天猫', amount: 109, status: 'created', at: new Date('2026-08-08T12:00:00+08:00') },
    { id: 'cancelled-next', platform: '自营小程序', amount: 104, status: 'cancelled', at: new Date('2026-08-08T12:05:00+08:00') },
    { id: 'created-latest', platform: '天猫', amount: 101, status: 'created', at: new Date('2026-08-08T12:08:00+08:00') },
    { id: 'order-6', platform: '京东', amount: 106, status: 'paid', at: new Date('2026-08-08T12:03:00+08:00') },
    { id: 'fulfilled-next', platform: '抖音电商', amount: 103, status: 'fulfilled', at: new Date('2026-08-08T12:06:00+08:00') },
    { id: 'order-8', platform: '自营小程序', amount: 108, status: 'cancelled', at: new Date('2026-08-08T12:01:00+08:00') },
    { id: 'order-5', platform: '天猫', amount: 105, status: 'created', at: new Date('2026-08-08T12:04:00+08:00') },
  ];
  const expectedVisibleOrders = [
    { id: 'created-latest', platform: '天猫', amount: 101, status: 'created', at: '2026-08-08T04:08:00.000Z' },
    { id: 'paid-next', platform: '京东', amount: 102, status: 'paid', at: '2026-08-08T04:07:00.000Z' },
    { id: 'fulfilled-next', platform: '抖音电商', amount: 103, status: 'fulfilled', at: '2026-08-08T04:06:00.000Z' },
    { id: 'cancelled-next', platform: '自营小程序', amount: 104, status: 'cancelled', at: '2026-08-08T04:05:00.000Z' },
    { id: 'order-5', platform: '天猫', amount: 105, status: 'created', at: '2026-08-08T04:04:00.000Z' },
    { id: 'order-6', platform: '京东', amount: 106, status: 'paid', at: '2026-08-08T04:03:00.000Z' },
    { id: 'order-7', platform: '抖音电商', amount: 107, status: 'fulfilled', at: '2026-08-08T04:02:00.000Z' },
    { id: 'order-8', platform: '自营小程序', amount: 108, status: 'cancelled', at: '2026-08-08T04:01:00.000Z' },
  ] as const;
  render(<RealtimeDashboard snapshot={{ ...snapshot, recentOrders }} alerts={alerts} isRunning />);

  expect(screen.getByText('实时订单')).toBeInTheDocument();
  const rows = Array.from(document.querySelectorAll('.order-feed-item'));
  expect(rows).toHaveLength(8);
  expect(rows.map((item) => item.firstElementChild?.textContent)).toEqual(expectedVisibleOrders.map((order) => order.id));
  expect(rows.map((item) => item.querySelector('time')?.getAttribute('dateTime'))).toEqual(expectedVisibleOrders.map((order) => order.at));
  for (const order of expectedVisibleOrders) {
    const row = screen.getByText(order.id).closest('li')!;
    expect(row).toHaveTextContent(order.platform);
    expect(row).toHaveTextContent(`¥${order.amount.toFixed(2)}`);
    expect(row.children[3]).toHaveTextContent({ created: '待支付', paid: '已支付', fulfilled: '已完成', cancelled: '已取消' }[order.status]);
    expect(row.querySelector('time')).toHaveAttribute('dateTime', order.at);
  }
  expect(screen.queryByText('overflow-order')).not.toBeInTheDocument();
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

  expect(within(document.querySelector('.breakdown-panels') as HTMLElement).getAllByText('当前筛选条件下暂无数据')).toHaveLength(3);
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
