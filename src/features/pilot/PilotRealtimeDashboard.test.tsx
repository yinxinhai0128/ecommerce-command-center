import { render, screen, within } from '@testing-library/react';
import type { PilotSnapshot } from '../../pilot/types';
import { PilotRealtimeDashboard } from './PilotRealtimeDashboard';

const filters = { start: '2018-01-01', end: '2018-01-31' };
const snapshot: PilotSnapshot = {
  filters, sourceLocalNow: '2018-01-31 09:30:00', comparisonLabel: '较上期',
  kpis: Object.fromEntries(['itemGmv', 'validOrderCount', 'averageOrderValue', 'cancellationRate', 'onTimeDeliveryRate', 'averageDeliveryDays', 'averageReviewScore'].map((key) => [key, { value: 490, comparisonValue: 400, changeRate: 0.225 }])) as PilotSnapshot['kpis'],
  dailyTrend: [], fulfillmentFunnel: [], categoryRanking: [], sellerRanking: [{ sellerId: 'seller-1', itemGmv: 490 }], customerStateRanking: [], recentOrders: [], capabilities: [],
  commerce: { paymentAmount: { value: 0, comparisonValue: 0, changeRate: 0 }, uniqueBuyerCount: { value: 0, comparisonValue: 0, changeRate: 0 }, repeatBuyerCount: { value: 0, comparisonValue: 0, changeRate: 0 } },
  payments: { byType: [], installments: [] },
  fulfillment: { statusDistribution: [], averageApprovalDays: 0, averageCarrierDays: 0, averageDeliveryDays: 0, lateDeliveryRate: 0, averageLateDays: 0 },
  experience: { scoreDistribution: [], lowScoreRate: 0, averageReplyDays: 0 },
  contributions: { categories: [], sellers: [], customerStates: [] },
};

test('只展示七个受 Olist 支持的 KPI，并标注数据更新时间', () => {
  render(<PilotRealtimeDashboard snapshot={snapshot} onClearFilters={() => undefined} />);

  expect(screen.getAllByTestId('pilot-kpi')).toHaveLength(7);
  expect(screen.getByText('商品成交额')).toBeInTheDocument();
  expect(screen.getByText('准时送达率')).toBeInTheDocument();
  expect(screen.getByText('数据更新时间 2018-01-31 09:30:00')).toBeInTheDocument();
  expect(screen.queryByText('库存风险')).not.toBeInTheDocument();
});

test('一个排行为空时不隐藏其他排行', () => {
  render(<PilotRealtimeDashboard snapshot={snapshot} onClearFilters={() => undefined} />);

  expect(within(screen.getByRole('region', { name: '类目排行' })).getByText('暂无类目数据')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: '卖家排行' })).getByText('seller-1')).toBeInTheDocument();
});

test('不展示数据源明确不支持的毛利能力占位', () => {
  render(<PilotRealtimeDashboard snapshot={{
    ...snapshot,
    capabilities: [{ key: 'grossMarginRate', status: 'unavailable', reason: 'Olist 原始数据不包含成本或毛利事实。' }],
  }} onClearFilters={() => undefined} />);

  expect(screen.getAllByTestId('pilot-kpi')).toHaveLength(7);
  expect(screen.queryByText('grossMarginRate')).not.toBeInTheDocument();
  expect(screen.queryByText('Olist 原始数据不包含成本或毛利事实。')).not.toBeInTheDocument();
  expect(screen.queryByText(/毛利/)).not.toBeInTheDocument();
});
