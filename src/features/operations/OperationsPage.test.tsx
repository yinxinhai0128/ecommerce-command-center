import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import type { PilotSnapshot } from '../../pilot/types';
import { OperationsPage } from './OperationsPage';

const kpi = { value: 100, comparisonValue: 90, changeRate: 0.1 };
const snapshot: PilotSnapshot = {
  filters: { start: '2018-01-01', end: '2018-01-31' }, sourceLocalNow: '2018-01-31 00:00:00', comparisonLabel: '上期',
  kpis: { itemGmv: kpi, validOrderCount: kpi, averageOrderValue: kpi, cancellationRate: kpi, onTimeDeliveryRate: kpi, averageDeliveryDays: kpi, averageReviewScore: kpi },
  dailyTrend: [], fulfillmentFunnel: [], categoryRanking: [], sellerRanking: [], customerStateRanking: [], recentOrders: [], capabilities: [],
  commerce: { paymentAmount: kpi, uniqueBuyerCount: kpi, repeatBuyerCount: kpi },
  payments: { byType: [{ paymentType: 'credit_card', paymentAmount: 80 }], installments: [{ installments: 1, paymentAmount: 80 }] },
  fulfillment: { statusDistribution: [{ status: 'delivered', value: 10 }], averageApprovalDays: 1, averageCarrierDays: 2, averageDeliveryDays: 4, lateDeliveryRate: 0.1, averageLateDays: 2 },
  experience: { scoreDistribution: [{ score: 5, value: 8 }], lowScoreRate: 0.1, averageReplyDays: 1 },
  contributions: { categories: [{ category: 'bed_bath_table', label: '家居', itemGmv: 80, itemCount: 2 }], sellers: [{ sellerId: 'seller-1', itemGmv: 80, validOrderCount: 2 }], customerStates: [{ customerState: 'SP', itemGmv: 80, validOrderCount: 2 }] },
};

test('经营数据页仅渲染快照已有的支付、客户、履约、体验和贡献模块', () => {
  render(<OperationsPage snapshot={snapshot} />);

  ['支付方式', '客户结构', '履约状态', '服务体验', '贡献排行'].forEach((name) => expect(screen.getByRole('heading', { name })).toBeInTheDocument());
  ['库存', '毛利', '广告', '流量', '退款', '目标', '预测'].forEach((name) => expect(screen.queryByText(name, { exact: false })).not.toBeInTheDocument());
});

test('支付发生时间不可判定时不展示未来支付构成', () => {
  render(<OperationsPage snapshot={{
    ...snapshot,
    capabilities: [{ key: 'paymentTiming', status: 'unavailable', reason: '支付明细缺少可用于回放的发生时间。' }],
  }} />);

  expect(screen.getByText('支付明细缺少可用于回放的发生时间。')).toBeInTheDocument();
  expect(screen.queryByText('credit_card：¥80.00')).not.toBeInTheDocument();
});
