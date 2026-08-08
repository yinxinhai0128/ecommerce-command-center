import { applyEvent, createNextEvent, type CommerceEvent } from '../../src/data/eventSimulator';
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

test('订单和库存事件应用后更新对应 ID 与库存', () => {
  const orderEvent: CommerceEvent = {
    id: 'event-order-2',
    type: 'order',
    order: {
      ...dataset.orders[0],
      id: 'order-2',
      status: 'paid',
      paidAt: now,
    },
    item: { ...dataset.orderItems[0], orderId: 'order-2', quantity: 2 },
    productId: 'product-1',
    stockDelta: -2,
  };
  const inventoryEvent: CommerceEvent = { id: 'event-inventory-1', type: 'inventory', productId: 'product-1', stockDelta: 5 };

  const afterOrder = applyEvent(dataset, orderEvent);
  const afterInventory = applyEvent(afterOrder, inventoryEvent);

  expect(afterOrder.orders[afterOrder.orders.length - 1]?.id).toBe('order-2');
  expect(afterOrder.orderItems[afterOrder.orderItems.length - 1]?.orderId).toBe('order-2');
  expect(afterOrder.products[0].stock).toBe(8);
  expect(afterInventory.products[0].stock).toBe(13);
});

test('支付事件仅将 created 订单变为 paid，其他状态不改变数据集', () => {
  const payment: CommerceEvent = { id: 'event-payment-1', type: 'payment', orderId: 'order-1', paidAt: now };
  const paid = applyEvent(dataset, payment);
  const fulfilledDataset: CommerceDataset = {
    ...dataset,
    orders: [{ ...dataset.orders[0], status: 'fulfilled', paidAt: now }],
  };

  expect(paid.orders[0]).toMatchObject({ id: 'order-1', status: 'paid', paidAt: now });
  expect(applyEvent(fulfilledDataset, payment)).toBe(fulfilledDataset);
});

test('退款事件仅接受已支付订单，且累计退款不能超过实付金额', () => {
  const paidDataset: CommerceDataset = {
    ...dataset,
    orders: [{ ...dataset.orders[0], status: 'paid', paidAt: now }],
    refunds: [{ id: 'refund-existing', orderId: 'order-1', amount: 20, createdAt: now, status: 'requested', reason: '首次申请' }],
  };
  const validRefund: CommerceEvent = {
    id: 'event-refund-1', type: 'refund',
    refund: { id: 'refund-valid', orderId: 'order-1', amount: 30, createdAt: now, status: 'approved', reason: '补偿' },
  };
  const excessiveRefund: CommerceEvent = {
    id: 'event-refund-2', type: 'refund',
    refund: { id: 'refund-excessive', orderId: 'order-1', amount: 81, createdAt: now, status: 'completed', reason: '超额' },
  };
  const zeroRefund: CommerceEvent = {
    id: 'event-refund-3', type: 'refund',
    refund: { id: 'refund-zero', orderId: 'order-1', amount: 0, createdAt: now, status: 'requested', reason: '零金额' },
  };
  const negativeRefund: CommerceEvent = {
    id: 'event-refund-4', type: 'refund',
    refund: { id: 'refund-negative', orderId: 'order-1', amount: -1, createdAt: now, status: 'requested', reason: '负金额' },
  };
  const createdDataset: CommerceDataset = { ...paidDataset, orders: [{ ...dataset.orders[0], status: 'created' }] };
  const fulfilledDataset: CommerceDataset = { ...paidDataset, orders: [{ ...dataset.orders[0], status: 'fulfilled', paidAt: now }], refunds: [] };

  const next = applyEvent(paidDataset, validRefund);
  const fulfilledNext = applyEvent(fulfilledDataset, validRefund);

  expect(next.refunds.map((refund) => refund.id)).toEqual(['refund-existing', 'refund-valid']);
  expect(next.refunds.reduce((total, refund) => total + refund.amount, 0)).toBe(50);
  expect(next.refunds[1]).toMatchObject({ id: 'refund-valid', orderId: 'order-1', amount: 30, status: 'approved' });
  expect(fulfilledNext.refunds).toEqual([expect.objectContaining({ id: 'refund-valid', orderId: 'order-1', amount: 30, status: 'approved' })]);
  expect(applyEvent(paidDataset, excessiveRefund)).toBe(paidDataset);
  expect(applyEvent(paidDataset, zeroRefund)).toBe(paidDataset);
  expect(applyEvent(paidDataset, negativeRefund)).toBe(paidDataset);
  expect(applyEvent(createdDataset, validRefund)).toBe(createdDataset);
});
