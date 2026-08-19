import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import type { DashboardSnapshot } from '../../domain/types';
import { OverviewPage } from './OverviewPage';

const snapshot = {
  comparisonLabel: '较上期',
  kpis: {
    gmv: { value: 12345, comparisonValue: 11000, changeRate: 0.12 },
    netSales: { value: 11000, comparisonValue: 10000, changeRate: 0.1 },
    orderCount: { value: 128, comparisonValue: 120, changeRate: 0.07 },
    conversionRate: { value: 0.03, comparisonValue: 0.02, changeRate: 0.5 },
    averageOrderValue: { value: 86, comparisonValue: 83, changeRate: 0.04 },
    grossMarginRate: { value: 0.4, comparisonValue: 0.38, changeRate: 0.05 },
    refundRate: { value: 0.01, comparisonValue: 0.02, changeRate: -0.5 },
    targetAchievementRate: { value: 0.8, comparisonValue: 0.75, changeRate: 0.07 },
  },
  salesTrend: [], recentOrders: [], funnel: [], channelRanking: [], productRanking: [], regionRanking: [], inventoryRisks: [], forecast7d: [], targetProbability: 0,
} as DashboardSnapshot;

test('概览只显示已验证的经营与健康事实', () => {
  render(<OverviewPage snapshot={snapshot} />);

  expect(screen.getByRole('heading', { name: '经营概览' })).toBeInTheDocument();
  expect(screen.getByText('成交额')).toBeInTheDocument();
  expect(screen.getByText('订单数')).toBeInTheDocument();
  expect(screen.queryByText('广告投入')).not.toBeInTheDocument();
  expect(screen.queryByText('库存周转')).not.toBeInTheDocument();
});
