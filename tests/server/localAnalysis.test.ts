import { expect, test } from 'vitest';
import { createLocalAnalysis } from '../../server/analysis/localProvider';
import type { RequestAnalysisContext } from '../../server/analysis/schema';

const context = {
  range: { start: '2026-08-08T00:00:00.000Z', end: '2026-08-08T04:30:00.000Z' },
  comparisonLabel: '较昨日同期',
  kpis: {
    gmv: { value: 34_000, comparisonValue: 30_000, changeRate: 0.13 },
    netSales: { value: 32_000, comparisonValue: 28_000, changeRate: 0.14 },
    orderCount: { value: 60, comparisonValue: 55, changeRate: 0.09 },
    conversionRate: { value: 0.01, comparisonValue: 0.01, changeRate: 0 },
    averageOrderValue: { value: 567, comparisonValue: 545, changeRate: 0.04 },
    grossMarginRate: { value: 0.39, comparisonValue: 0.38, changeRate: 0.01 },
    refundRate: { value: 0, comparisonValue: 0, changeRate: 0 },
    targetAchievementRate: { value: 0.9, comparisonValue: 0.8, changeRate: 0.13 },
  },
  topContributors: {
    products: [{ label: '商品A', value: 12_000 }],
    channels: [{ label: '平台A', value: 10_000 }],
    regions: [{ label: '区域A', value: 8_000 }],
  },
  alerts: [],
  forecast7d: [],
  targetProbability: 0.9,
} as RequestAnalysisContext;

test('无告警的本地分析以真实首要贡献项生成变化归因', () => {
  const result = createLocalAnalysis(context, 'not_configured', () => new Date('2026-08-08T04:30:00.000Z'));

  expect(result.causes).toEqual([
    expect.objectContaining({ label: '商品A', contribution: 12_000 }),
    expect.objectContaining({ label: '平台A', contribution: 10_000 }),
    expect.objectContaining({ label: '区域A', contribution: 8_000 }),
  ]);
  expect(result.causes.every((cause) => cause.evidence.length > 0)).toBe(true);
});
