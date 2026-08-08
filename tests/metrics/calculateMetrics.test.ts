import { calculateSnapshot } from '../../src/metrics/calculateMetrics';
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
  expect(snapshot.channelRanking[0]).toEqual({ platform: '京东', gmv: 200 });
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
