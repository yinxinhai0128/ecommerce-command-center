import { calculateSnapshot } from '../../src/metrics/calculateMetrics';
import type { CommerceDataset, DashboardFilters } from '../../src/domain/types';

const filters: DashboardFilters = {
  start: new Date('2026-08-08T12:00:00+08:00'),
  end: new Date('2026-08-08T12:10:00+08:00'),
};

const dataset: CommerceDataset = {
  orders: [
    { id: 'paid-order', customerId: 'customer-1', platform: '天猫', storeId: 'store-1', createdAt: new Date('2026-08-08T12:01:00+08:00'), paidAt: new Date('2026-08-08T12:00:00+08:00'), status: 'paid', shippingFee: 10, discountAmount: 5 },
    { id: 'cancelled-order', customerId: 'customer-2', platform: '京东', storeId: 'store-1', createdAt: new Date('2026-08-08T12:09:00+08:00'), status: 'cancelled', shippingFee: 0, discountAmount: 0 },
  ],
  orderItems: [
    { orderId: 'paid-order', productId: 'product-1', categoryId: 'category-1', quantity: 1, unitPrice: 100, unitCost: 30 },
    { orderId: 'cancelled-order', productId: 'product-1', categoryId: 'category-1', quantity: 2, unitPrice: 50, unitCost: 30 },
  ],
  traffic: [],
  refunds: [],
  products: [{ id: 'product-1', name: '商品一', categoryId: 'category-1', stock: 10 }],
  targets: [{ date: '2026-08-08', gmv: 300 }],
  customers: [{ id: 'customer-1', name: '顾客一' }, { id: 'customer-2', name: '顾客二' }],
  stores: [{ id: 'store-1', name: '旗舰店', region: '华东' }],
  categories: [{ id: 'category-1', name: '服饰' }],
  campaigns: [],
};

test('实时快照将目标均分到实际桶并输出筛选窗内的四状态订单', () => {
  const snapshot = calculateSnapshot(dataset, filters, filters.end);

  expect(snapshot.salesTrend).toEqual([
    expect.objectContaining({ gmv: 105, orderCount: 1, target: 100 }),
    expect.objectContaining({ gmv: 0, orderCount: 0, target: 100 }),
    expect.objectContaining({ gmv: 0, orderCount: 0, target: 100 }),
  ]);
  expect(snapshot.recentOrders).toEqual([
    { id: 'cancelled-order', platform: '京东', amount: 100, status: 'cancelled', at: new Date('2026-08-08T12:09:00+08:00') },
    { id: 'paid-order', platform: '天猫', amount: 105, status: 'paid', at: new Date('2026-08-08T12:01:00+08:00') },
  ]);
});
