import { expect, test } from 'vitest';
import type { DashboardAlert, DashboardFilters, DashboardSnapshot } from '../domain/types';
import { buildAnalysisContext } from './buildAnalysisContext';

const kpis: DashboardSnapshot['kpis'] = {
  gmv: { value: 125600, comparisonValue: 112000, changeRate: 0.1214 },
  netSales: { value: 118000, comparisonValue: 110000, changeRate: 0.0727 },
  orderCount: { value: 836, comparisonValue: 760, changeRate: 0.1 },
  conversionRate: { value: 0.034, comparisonValue: 0.03, changeRate: 0.1333 },
  averageOrderValue: { value: 150.24, comparisonValue: 147.37, changeRate: 0.0195 },
  grossMarginRate: { value: 0.42, comparisonValue: 0.4, changeRate: 0.05 },
  refundRate: { value: 0.021, comparisonValue: 0.024, changeRate: -0.125 },
  targetAchievementRate: { value: 0.86, comparisonValue: 0.8, changeRate: 0.075 },
};

const snapshot: DashboardSnapshot = {
  comparisonLabel: '较昨日同期',
  kpis,
  salesTrend: Array.from({ length: 500 }, (_, index) => ({ at: new Date(2026, 7, 8, 0, index), gmv: index, orderCount: index, target: index })),
  recentOrders: [{ id: 'sensitive-order', platform: '天猫', amount: 99, status: 'paid', at: new Date('2026-08-08T08:00:00+08:00') }],
  funnel: [],
  channelRanking: Array.from({ length: 6 }, (_, index) => ({ platform: (index % 2 ? '京东' : '天猫') as '天猫' | '京东', gmv: 6000 - index * 500 })),
  productRanking: Array.from({ length: 7 }, (_, index) => ({ productId: `sku-${index}`, name: `商品${index}`, gmv: 7000 - index * 500 })),
  regionRanking: Array.from({ length: 6 }, (_, index) => ({ region: `区域${index}`, gmv: 5000 - index * 500 })),
  inventoryRisks: [],
  forecast7d: [
    { date: '2026-08-09', gmv: 18000 },
    { date: '2026-08-10', gmv: 19500 },
  ],
  targetProbability: 0.72,
};

const alerts: DashboardAlert[] = Array.from({ length: 12 }, (_, index) => ({
  id: `alert-${index}`,
  severity: index === 0 ? 'critical' : 'warning',
  metric: 'refundRate',
  title: `退款预警${index}`,
  evidence: `退款影响${index}`,
  impactAmount: 1000 + index,
  suggestion: `处理建议${index}`,
  createdAt: new Date(2026, 7, 8, 8, index),
}));

const filters: DashboardFilters = {
  start: new Date('2026-08-08T00:00:00+08:00'),
  end: new Date('2026-08-08T23:59:59+08:00'),
  platform: '天猫',
  storeId: 'store-1',
  categoryId: 'category-1',
};

test('构建严格最小化的分析上下文并限制贡献者与告警数量', () => {
  const context = buildAnalysisContext(snapshot, alerts, filters);

  expect(context).toEqual({
    range: {
      start: '2026-08-07T16:00:00.000Z',
      end: '2026-08-08T15:59:59.000Z',
      platform: '天猫',
      storeId: 'store-1',
      categoryId: 'category-1',
    },
    comparisonLabel: '较昨日同期',
    kpis,
    topContributors: {
      channels: [
        { label: '天猫', value: 6000 },
        { label: '京东', value: 5500 },
        { label: '天猫', value: 5000 },
        { label: '京东', value: 4500 },
      ],
      products: Array.from({ length: 5 }, (_, index) => ({ label: `商品${index}`, value: 7000 - index * 500 })),
      regions: Array.from({ length: 4 }, (_, index) => ({ label: `区域${index}`, value: 5000 - index * 500 })),
    },
    alerts: alerts.slice(0, 10).map(({ id: _id, createdAt: _createdAt, ...alert }) => alert),
    forecast7d: snapshot.forecast7d,
    targetProbability: 0.72,
  });
});

test('分析上下文绝不包含订单明细或完整销售趋势且小于30KB', () => {
  const serialized = JSON.stringify(buildAnalysisContext(snapshot, alerts, filters));

  expect(serialized.length).toBeLessThan(30000);
  expect(serialized).not.toContain('sensitive-order');
  expect(serialized).not.toContain('recentOrders');
  expect(serialized).not.toContain('salesTrend');
  expect(serialized).not.toContain('createdAt');
  expect(serialized).not.toContain('alert-0');
});

test('超长中文业务文本会被确定性压缩且保留可用分析结构', () => {
  const longText = '超长经营文本'.repeat(5000);
  const oversizedSnapshot: DashboardSnapshot = {
    ...snapshot,
    comparisonLabel: longText,
    productRanking: Array.from({ length: 5 }, (_, index) => ({ productId: `${index}-${longText}`, name: `${index}${longText}`, gmv: 7000 - index })),
    regionRanking: Array.from({ length: 4 }, (_, index) => ({ region: `${index}${longText}`, gmv: 5000 - index })),
  };
  const oversizedAlerts: DashboardAlert[] = alerts.map((alert) => ({
    ...alert,
    title: longText,
    evidence: longText,
    suggestion: longText,
  }));

  const context = buildAnalysisContext(oversizedSnapshot, oversizedAlerts, {
    ...filters,
    storeId: longText,
    categoryId: longText,
  });
  const serialized = JSON.stringify(context);

  expect(serialized.length).toBeLessThan(30000);
  expect(context.kpis.gmv.value).toBe(125600);
  expect(context.topContributors.products).toHaveLength(5);
  expect(context.topContributors.regions).toHaveLength(4);
  expect(context.alerts).toHaveLength(10);
  expect(context.forecast7d).toEqual(snapshot.forecast7d);
  expect(context.topContributors.products.every(({ label }) => label.length > 0)).toBe(true);
  expect(context.alerts.every(({ title, evidence, suggestion }) => title.length > 0 && evidence.length > 0 && suggestion.length > 0)).toBe(true);
});
