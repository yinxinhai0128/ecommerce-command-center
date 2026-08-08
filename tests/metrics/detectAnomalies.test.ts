import { detectAnomalies } from '../../src/metrics/detectAnomalies';
import type { DashboardSnapshot } from '../../src/domain/types';

function snapshot(overrides: Partial<DashboardSnapshot['kpis']> = {}, inventoryRisks: DashboardSnapshot['inventoryRisks'] = []): DashboardSnapshot {
  const kpi = (value: number, comparisonValue = value, changeRate = 0) => ({ value, comparisonValue, changeRate });
  return {
    comparisonLabel: '较昨日同期',
    kpis: {
      gmv: kpi(1000), netSales: kpi(900), orderCount: kpi(10), conversionRate: kpi(0.1),
      averageOrderValue: kpi(100), grossMarginRate: kpi(0.4), refundRate: kpi(0.05), targetAchievementRate: kpi(0.8),
      ...overrides,
    },
    salesTrend: [{ at: new Date('2026-08-08T12:00:00+08:00'), gmv: 1000 }],
    funnel: [], channelRanking: [], productRanking: [], regionRanking: [], inventoryRisks, forecast7d: [], targetProbability: 0,
  };
}

test('退款率较昨日增长达到 30% 且绝对值超过 8% 时生成严重告警', () => {
  const alerts = detectAnomalies(snapshot({ refundRate: { value: 0.09, comparisonValue: 0.06, changeRate: 0.3 } }));

  expect(alerts).toContainEqual(expect.objectContaining({ severity: 'critical', metric: 'refundRate' }));
});

test('支付转化率下降 15%、目标落后时间进度 10 点和可售天数低于 3 天时生成预警', () => {
  const alerts = detectAnomalies(snapshot({
    conversionRate: { value: 0.085, comparisonValue: 0.1, changeRate: -0.15 },
    targetAchievementRate: { value: 0.39, comparisonValue: 0.5, changeRate: -0.22 },
  }, [{ productId: 'product-1', name: '商品一', stock: 2, dailySales: 1, daysAvailable: 2 }]));

  expect(alerts).toEqual(expect.arrayContaining([
    expect.objectContaining({ severity: 'warning', metric: 'conversionRate' }),
    expect.objectContaining({ severity: 'warning', metric: 'targetAchievementRate' }),
    expect.objectContaining({ severity: 'warning', metric: 'inventoryDays' }),
  ]));
  expect(alerts.every((alert) => (
    typeof alert.id === 'string'
    && typeof alert.title === 'string'
    && typeof alert.evidence === 'string'
    && typeof alert.impactAmount === 'number'
    && typeof alert.suggestion === 'string'
    && alert.createdAt instanceof Date
  ))).toBe(true);
});

test('未越过阈值时不生成告警', () => {
  expect(detectAnomalies(snapshot({
    refundRate: { value: 0.08, comparisonValue: 0.06, changeRate: 0.3 },
    conversionRate: { value: 0.086, comparisonValue: 0.1, changeRate: -0.14 },
    targetAchievementRate: { value: 0.41, comparisonValue: 0.5, changeRate: -0.2 },
  }))).toEqual([]);
});

test('目标达成进度恰好落后时间进度 10 个百分点时生成预警', () => {
  const alerts = detectAnomalies(snapshot({
    targetAchievementRate: { value: 0.4, comparisonValue: 0.5, changeRate: -0.2 },
  }));

  expect(alerts).toContainEqual(expect.objectContaining({ severity: 'warning', metric: 'targetAchievementRate' }));
});
