import { expect, test } from 'vitest';
import { metricDefinitions, supportedContributionDimensions } from './metricDefinitions';

test('declares the repository metric contract and its supported dimensions', () => {
  // Removing a repository-supported metric or allowing an unsupported dimension must fail this contract test.
  expect(metricDefinitions.commerce).toEqual({
    paymentAmount: { label: '支付金额', unit: 'currency' },
    uniqueBuyerCount: { label: '独立买家数', unit: 'count' },
    repeatBuyerCount: { label: '复购买家数', unit: 'count' },
  });
  expect(metricDefinitions.contributions.categories).toEqual({ label: '品类贡献', dimensions: ['category', 'seller', 'customerState'] });
  expect(metricDefinitions.fulfillment.lateDeliveryRate).toEqual({ label: '延迟送达率', unit: 'ratio' });
  expect(metricDefinitions.experience.lowScoreRate).toEqual({ label: '低分评价率', unit: 'ratio' });
  expect(supportedContributionDimensions).toEqual(['category', 'seller', 'customerState']);
});
