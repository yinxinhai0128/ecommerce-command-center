import { calculateSnapshot } from '../../src/metrics/calculateMetrics';
import { generateDataset } from '../../src/data/generateDataset';
import type { CommerceDataset, DashboardFilters } from '../../src/domain/types';

const now = new Date('2026-08-08T23:59:59+08:00');

const dataset: CommerceDataset = {
  orders: [
    {
      id: 'order-1',
      customerId: 'customer-1',
      platform: '天猫',
      storeId: 'store-1',
      createdAt: new Date('2026-08-08T11:55:00+08:00'),
      paidAt: new Date('2026-08-08T12:00:00+08:00'),
      status: 'paid',
      shippingFee: 0,
      discountAmount: 0,
    },
    {
      id: 'order-2',
      customerId: 'customer-2',
      platform: '京东',
      storeId: 'store-2',
      createdAt: new Date('2026-08-08T12:05:00+08:00'),
      paidAt: new Date('2026-08-08T12:10:00+08:00'),
      status: 'fulfilled',
      shippingFee: 0,
      discountAmount: 0,
    },
  ],
  orderItems: [
    { orderId: 'order-1', productId: 'product-1', categoryId: 'category-1', quantity: 1, unitPrice: 100, unitCost: 40 },
    { orderId: 'order-2', productId: 'product-2', categoryId: 'category-2', quantity: 1, unitPrice: 200, unitCost: 80 },
  ],
  traffic: [{
    at: new Date('2026-08-08T12:00:00+08:00'),
    platform: '天猫',
    storeId: 'store-1',
    categoryId: 'category-1',
    visitors: 100,
    productViewers: 70,
    addToCartUsers: 40,
    checkoutUsers: 30,
    paidBuyers: 10,
  }],
  refunds: [
    { id: 'refund-1', orderId: 'order-2', amount: 30, createdAt: new Date('2026-08-08T13:00:00+08:00'), status: 'completed', reason: '不想要了' },
    { id: 'refund-2', orderId: 'order-1', amount: 100, createdAt: new Date('2026-08-08T13:00:00+08:00'), status: 'requested', reason: '处理中' },
    { id: 'refund-3', orderId: 'order-1', amount: 100, createdAt: new Date('2026-08-07T13:00:00+08:00'), status: 'approved', reason: '窗口外' },
  ],
  products: [
    { id: 'product-1', name: '商品一', categoryId: 'category-1', stock: 0 },
    { id: 'product-2', name: '商品二', categoryId: 'category-2', stock: 10 },
  ],
  targets: [{ date: '2026-08-08', gmv: 400 }],
  customers: [{ id: 'customer-1', name: '顾客一' }, { id: 'customer-2', name: '顾客二' }],
  stores: [{ id: 'store-1', name: '天猫店', region: '华东' }, { id: 'store-2', name: '京东店', region: '华南' }],
  categories: [{ id: 'category-1', name: '数码' }, { id: 'category-2', name: '家居' }],
  campaigns: [],
};

const filters: DashboardFilters = {
  start: new Date('2026-08-08T00:00:00+08:00'),
  end: now,
};

test('按指定口径汇总两笔已支付订单', () => {
  const snapshot = calculateSnapshot(dataset, filters, now);

  expect(snapshot.kpis.gmv.value).toBe(300);
  expect(snapshot.kpis.netSales.value).toBe(270);
  expect(snapshot.kpis.orderCount.value).toBe(2);
  expect(snapshot.kpis.conversionRate.value).toBe(0.02);
  expect(snapshot.kpis.averageOrderValue.value).toBe(150);
  expect(snapshot.kpis.grossMarginRate.value).toBeCloseTo(150 / 270);
  expect(snapshot.kpis.refundRate.value).toBeCloseTo(30 / 300);
  expect(snapshot.kpis.targetAchievementRate.value).toBe(0.75);
  expect(snapshot.kpis.gmv.comparisonValue).toBe(0);
  expect(snapshot.kpis.gmv.changeRate).toBe(0);
  expect(snapshot.comparisonLabel).toBe('较昨日同期');
  expect(snapshot.salesTrend.reduce((total, point) => total + point.gmv, 0)).toBe(300);
  expect(snapshot.funnel).toEqual([
    { stage: 'visitors', value: 100 },
    { stage: 'productViewers', value: 70 },
    { stage: 'addToCartUsers', value: 40 },
    { stage: 'checkoutUsers', value: 30 },
    { stage: 'paidBuyers', value: 10 },
  ]);
  expect(snapshot.channelRanking).toEqual([]);
  expect(snapshot.productRanking[0]).toEqual({ productId: 'product-2', name: '商品二', gmv: 200 });
  expect(snapshot.regionRanking[0]).toEqual({ region: '华南', gmv: 200 });
  expect(snapshot.inventoryRisks[0].productId).toBe('product-1');
  expect(snapshot.forecast7d).toHaveLength(7);
  expect(snapshot.targetProbability).toBeGreaterThanOrEqual(0);
  expect(snapshot.targetProbability).toBeLessThanOrEqual(1);
});

test('预测使用四周权重、截断趋势并只以无维度未来目标计算概率', () => {
  const forecastDataset: CommerceDataset = {
    ...dataset,
    orders: [
      { ...dataset.orders[0], id: 'forecast-1', customerId: 'customer-1', paidAt: new Date('2026-08-02T12:00:00+08:00') },
      { ...dataset.orders[0], id: 'forecast-2', customerId: 'customer-2', paidAt: new Date('2026-07-26T12:00:00+08:00') },
      { ...dataset.orders[0], id: 'forecast-3', customerId: 'customer-3', paidAt: new Date('2026-07-19T12:00:00+08:00') },
      { ...dataset.orders[0], id: 'forecast-4', customerId: 'customer-4', paidAt: new Date('2026-07-12T12:00:00+08:00') },
      { ...dataset.orders[0], id: 'forecast-5', customerId: 'customer-5', paidAt: new Date('2026-08-08T12:00:00+08:00') },
    ],
    orderItems: [
      { ...dataset.orderItems[0], orderId: 'forecast-1', unitPrice: 100 },
      { ...dataset.orderItems[0], orderId: 'forecast-2', unitPrice: 200 },
      { ...dataset.orderItems[0], orderId: 'forecast-3', unitPrice: 300 },
      { ...dataset.orderItems[0], orderId: 'forecast-4', unitPrice: 400 },
      { ...dataset.orderItems[0], orderId: 'forecast-5', unitPrice: 500 },
    ],
    refunds: [],
    traffic: [],
    customers: Array.from({ length: 5 }, (_, index) => ({ id: `customer-${index + 1}`, name: `顾客${index + 1}` })),
    targets: [
      { date: '2026-08-09', gmv: 600 },
      { date: '2026-08-09', gmv: 999, platform: '天猫', storeId: 'store-1', categoryId: 'category-1' },
    ],
  };
  const snapshot = calculateSnapshot(forecastDataset, {
    start: new Date('2026-07-01T00:00:00+08:00'),
    end: now,
  }, now);

  expect(snapshot.forecast7d[0]).toEqual({ date: '2026-08-09', gmv: 240 });
  expect(snapshot.targetProbability).toBe(0.8);
});

test('无历史和零目标时预测、比率与概率均为零', () => {
  const emptyDataset: CommerceDataset = {
    ...dataset,
    orders: [],
    orderItems: [],
    traffic: [],
    refunds: [],
    targets: [{ date: '2026-08-09', gmv: 0 }],
  };
  const snapshot = calculateSnapshot(emptyDataset, filters, now);

  expect(snapshot.kpis.conversionRate.value).toBe(0);
  expect(snapshot.kpis.averageOrderValue.value).toBe(0);
  expect(snapshot.kpis.grossMarginRate.value).toBe(0);
  expect(snapshot.kpis.refundRate.value).toBe(0);
  expect(snapshot.kpis.targetAchievementRate.value).toBe(0);
  expect(snapshot.forecast7d.every((point) => point.gmv === 0)).toBe(true);
  expect(snapshot.targetProbability).toBe(0);
});

test('对比窗口有数据时返回手工推导的比较值与变化率', () => {
  const comparisonDataset: CommerceDataset = {
    ...dataset,
    orders: [...dataset.orders, {
      ...dataset.orders[0],
      id: 'order-yesterday',
      customerId: 'customer-1',
      createdAt: new Date('2026-08-07T11:55:00+08:00'),
      paidAt: new Date('2026-08-07T12:00:00+08:00'),
    }],
    orderItems: [...dataset.orderItems, { ...dataset.orderItems[0], orderId: 'order-yesterday' }],
  };
  const snapshot = calculateSnapshot(comparisonDataset, filters, now);

  expect(snapshot.kpis.gmv.comparisonValue).toBe(100);
  expect(snapshot.kpis.gmv.changeRate).toBe(2);
});

test('类目筛选只保留匹配明细的订单与流量', () => {
  const snapshot = calculateSnapshot(dataset, { ...filters, categoryId: 'category-1' }, now);

  expect(snapshot.kpis.gmv.value).toBe(100);
  expect(snapshot.kpis.orderCount.value).toBe(1);
  expect(snapshot.kpis.conversionRate.value).toBe(0.01);
});

test('平台与类目组合有支付订单时使用同口径流量计算转化率', () => {
  const generatedNow = new Date('2026-08-08T23:59:59+08:00');
  const snapshot = calculateSnapshot(generateDataset(20260808, generatedNow), {
    start: new Date('2026-05-11T00:00:00+08:00'),
    end: generatedNow,
    platform: '天猫',
    categoryId: 'category-2',
  }, generatedNow);

  expect(snapshot.kpis.orderCount.value).toBeGreaterThan(0);
  expect(snapshot.funnel.find(({ stage }) => stage === 'visitors')?.value).toBeGreaterThan(0);
  expect(snapshot.kpis.conversionRate.value).toBeGreaterThan(0);
});

test('渠道排行按活动 campaign.channel 聚合归因收入与花费并响应平台筛选', () => {
  const campaignDataset: CommerceDataset = {
    ...dataset,
    campaigns: [
      { id: 'feed-1', platform: '天猫', storeId: 'store-1', channel: '信息流', startAt: new Date('2026-08-01T00:00:00+08:00'), endAt: new Date('2026-08-31T23:59:59+08:00'), impressions: 100, clicks: 10, spend: 400, attributedRevenue: 1200 },
      { id: 'feed-2', platform: '天猫', storeId: 'store-1', channel: '信息流', startAt: new Date('2026-08-08T00:00:00+08:00'), endAt: new Date('2026-08-08T23:59:59+08:00'), impressions: 100, clicks: 10, spend: 100, attributedRevenue: 300 },
      { id: 'search-jd', platform: '京东', storeId: 'store-2', channel: '搜索', startAt: new Date('2026-08-01T00:00:00+08:00'), endAt: new Date('2026-08-31T23:59:59+08:00'), impressions: 100, clicks: 10, spend: 600, attributedRevenue: 900 },
      { id: 'expired', platform: '天猫', storeId: 'store-1', channel: '搜索', startAt: new Date('2026-07-01T00:00:00+08:00'), endAt: new Date('2026-07-31T23:59:59+08:00'), impressions: 100, clicks: 10, spend: 999, attributedRevenue: 9999 },
    ],
  };

  const allPlatforms = calculateSnapshot(campaignDataset, filters, now);
  const tmall = calculateSnapshot(campaignDataset, { ...filters, platform: '天猫' }, now);
  const category = calculateSnapshot(campaignDataset, { ...filters, categoryId: 'category-1' }, now);

  expect(allPlatforms.channelRanking).toEqual([
    { channel: '信息流', attributedRevenue: 1500, spend: 500 },
    { channel: '搜索', attributedRevenue: 900, spend: 600 },
  ]);
  expect(tmall.channelRanking).toEqual([
    { channel: '信息流', attributedRevenue: 1500, spend: 500 },
  ]);
  expect(category.channelRanking).toEqual([]);
});

test('类目筛选按匹配明细分摊订单级费用、退款和排行', () => {
  const multiCategoryDataset: CommerceDataset = {
    ...dataset,
    orders: [{
      ...dataset.orders[0],
      id: 'multi-category-order',
      shippingFee: 40,
      discountAmount: 20,
      createdAt: new Date('2026-08-08T12:00:00+08:00'),
      paidAt: new Date('2026-08-08T12:00:00+08:00'),
    }],
    orderItems: [
      { orderId: 'multi-category-order', productId: 'product-1', categoryId: 'category-1', quantity: 1, unitPrice: 100, unitCost: 40 },
      { orderId: 'multi-category-order', productId: 'product-2', categoryId: 'category-2', quantity: 1, unitPrice: 300, unitCost: 120 },
    ],
    refunds: [{ id: 'multi-category-refund', orderId: 'multi-category-order', amount: 84, createdAt: new Date('2026-08-08T13:00:00+08:00'), status: 'completed', reason: 'refund' }],
  };

  const snapshot = calculateSnapshot(multiCategoryDataset, { ...filters, categoryId: 'category-1' }, now);

  expect(snapshot.kpis.gmv.value).toBe(105);
  expect(snapshot.kpis.netSales.value).toBe(84);
  expect(snapshot.kpis.orderCount.value).toBe(1);
  expect(snapshot.kpis.grossMarginRate.value).toBeCloseTo(44 / 84);
  expect(snapshot.kpis.refundRate.value).toBeCloseTo(21 / 105);
  expect(snapshot.salesTrend.reduce((total, point) => total + point.gmv, 0)).toBe(105);
  expect(snapshot.channelRanking).toEqual([]);
  expect(snapshot.regionRanking).toEqual([{ region: '华东', gmv: 105 }]);
  expect(snapshot.productRanking).toEqual([{ productId: 'product-1', name: '商品一', gmv: 100 }]);
  expect(snapshot.recentOrders).toEqual([expect.objectContaining({ id: 'multi-category-order', amount: 105 })]);
});

test('维度筛选在指标、趋势、比较和预测中只选择完整原子目标', () => {
  const targetDataset: CommerceDataset = {
    ...dataset,
    orders: [
      { ...dataset.orders[0], id: 'target-order', paidAt: new Date('2026-08-08T12:00:00+08:00') },
      { ...dataset.orders[0], id: 'target-order-yesterday', paidAt: new Date('2026-08-07T12:00:00+08:00') },
    ],
    orderItems: [
      { ...dataset.orderItems[0], orderId: 'target-order' },
      { ...dataset.orderItems[0], orderId: 'target-order-yesterday', unitPrice: 50 },
    ],
    refunds: [],
    targets: [
      { date: '2026-08-08', gmv: 400 },
      { date: '2026-08-07', gmv: 200 },
      { date: '2026-08-09', gmv: 400 },
      { date: '2026-08-08', gmv: 100, platform: '天猫', storeId: 'store-1', categoryId: 'category-1' },
      { date: '2026-08-08', gmv: 300, platform: '天猫', storeId: 'store-1', categoryId: 'category-2' },
      { date: '2026-08-07', gmv: 50, platform: '天猫', storeId: 'store-1', categoryId: 'category-1' },
      { date: '2026-08-09', gmv: 100, platform: '天猫', storeId: 'store-1', categoryId: 'category-1' },
      { date: '2026-08-09', gmv: 300, platform: '天猫', storeId: 'store-1', categoryId: 'category-2' },
      { date: '2026-08-08', gmv: 999, platform: '天猫' },
    ],
  };

  const platform = calculateSnapshot(targetDataset, { ...filters, platform: '天猫' }, now);
  const store = calculateSnapshot(targetDataset, { ...filters, storeId: 'store-1' }, now);
  const category = calculateSnapshot(targetDataset, { ...filters, categoryId: 'category-1' }, now);
  const combination = calculateSnapshot(targetDataset, { ...filters, platform: '天猫', storeId: 'store-1', categoryId: 'category-1' }, now);
  const noMatch = calculateSnapshot(targetDataset, { ...filters, categoryId: 'category-missing' }, now);
  const unfiltered = calculateSnapshot(targetDataset, filters, now);

  expect(platform.kpis.targetAchievementRate.value).toBe(0.25);
  expect(store.kpis.targetAchievementRate.value).toBe(0.25);
  expect(category.kpis.targetAchievementRate.value).toBe(1);
  expect(combination.kpis.targetAchievementRate.value).toBe(1);
  expect(combination.kpis.targetAchievementRate.comparisonValue).toBe(1);
  expect(combination.salesTrend.reduce((total, point) => total + point.target, 0)).toBeCloseTo(100);
  expect(combination.targetProbability).toBe(0.6);
  expect(noMatch.kpis.targetAchievementRate.value).toBe(0);
  expect(unfiltered.kpis.targetAchievementRate.value).toBe(0.25);
});

test('库存风险使用筛选后的七日销量且不泄露其它类目', () => {
  const inventoryDataset: CommerceDataset = {
    ...dataset,
    orders: [
      { ...dataset.orders[0], id: 'tmall-category-1', paidAt: new Date('2026-08-07T12:00:00+08:00') },
      { ...dataset.orders[1], id: 'jd-category-2', paidAt: new Date('2026-08-07T12:00:00+08:00') },
    ],
    orderItems: [
      { ...dataset.orderItems[0], orderId: 'tmall-category-1', quantity: 7 },
      { ...dataset.orderItems[1], orderId: 'jd-category-2', quantity: 7 },
    ],
    products: [
      { ...dataset.products[0], stock: 2 },
      { ...dataset.products[1], stock: 2 },
    ],
    refunds: [],
  };

  const category = calculateSnapshot(inventoryDataset, { ...filters, categoryId: 'category-1' }, now);
  const platform = calculateSnapshot(inventoryDataset, { ...filters, platform: '天猫' }, now);

  expect(category.inventoryRisks).toEqual([expect.objectContaining({ productId: 'product-1', stock: 2, dailySales: 1 })]);
  expect(category.inventoryRisks.some((risk) => risk.productId === 'product-2')).toBe(false);
  expect(platform.inventoryRisks).toEqual([expect.objectContaining({ productId: 'product-1', stock: 2, dailySales: 1 })]);
});
