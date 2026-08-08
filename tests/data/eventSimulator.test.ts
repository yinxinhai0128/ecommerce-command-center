import { applyEvent, createNextEvent } from '../../src/data/eventSimulator';
import { calculateSnapshot } from '../../src/metrics/calculateMetrics';
import type { CommerceDataset, DashboardFilters } from '../../src/domain/types';

const now = new Date('2026-08-08T12:00:00+08:00');
const filters: DashboardFilters = {
  start: new Date('2026-08-08T00:00:00+08:00'),
  end: now,
};

const dataset: CommerceDataset = {
  orders: [{
    id: 'order-1', customerId: 'customer-1', platform: '天猫', storeId: 'store-1',
    createdAt: new Date('2026-08-08T11:00:00+08:00'), status: 'created', shippingFee: 0, discountAmount: 0,
  }],
  orderItems: [{ orderId: 'order-1', productId: 'product-1', categoryId: 'category-1', quantity: 1, unitPrice: 100, unitCost: 50 }],
  traffic: [],
  refunds: [],
  products: [{ id: 'product-1', name: '商品一', categoryId: 'category-1', stock: 10 }],
  targets: [{ date: '2026-08-08', gmv: 1000 }],
  customers: [{ id: 'customer-1', name: '顾客一' }],
  stores: [{ id: 'store-1', name: '天猫店', region: '华东' }],
  categories: [{ id: 'category-1', name: '数码' }],
  campaigns: [],
};

test('种子 42 的事件增加订单或退款总数，并改变快照', () => {
  const event = createNextEvent(dataset, 42, now);
  const next = applyEvent(dataset, event);

  expect(next.orders.length + next.refunds.length).toBeGreaterThan(dataset.orders.length + dataset.refunds.length);
  expect(calculateSnapshot(next, filters, now)).not.toEqual(calculateSnapshot(dataset, filters, now));
});

test('事件具有确定性、唯一 ID，且应用后保持领域约束', () => {
  const event = createNextEvent(dataset, 43, now);
  const next = applyEvent(dataset, event);
  const again = applyEvent(dataset, createNextEvent(dataset, 43, now));
  const ordersById = new Map(next.orders.map((order) => [order.id, order]));
  const itemsByOrder = new Map(next.orders.map((order) => [order.id, [] as typeof next.orderItems]));

  for (const item of next.orderItems) itemsByOrder.get(item.orderId)?.push(item);

  expect(event).toEqual(createNextEvent(dataset, 43, now));
  expect(next).toEqual(again);
  expect(new Set(next.orders.map((order) => order.id)).size).toBe(next.orders.length);
  expect(new Set(next.refunds.map((refund) => refund.id)).size).toBe(next.refunds.length);
  expect(next.products.every((product) => product.stock >= 0)).toBe(true);
  expect(next.refunds.every((refund) => {
    const order = ordersById.get(refund.orderId);
    const paidAmount = (itemsByOrder.get(refund.orderId) ?? []).reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
      + (order?.shippingFee ?? 0) - (order?.discountAmount ?? 0);
    return (order?.status === 'paid' || order?.status === 'fulfilled') && refund.amount <= paidAmount;
  })).toBe(true);
});
