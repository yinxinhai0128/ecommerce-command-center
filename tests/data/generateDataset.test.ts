import { generateDataset } from '../../src/data/generateDataset';

test('相同种子与时间生成完全一致且覆盖四个平台', () => {
  const now = new Date('2026-08-08T10:00:00+08:00');
  const a = generateDataset(20260808, now);
  const b = generateDataset(20260808, now);

  expect(a).toEqual(b);
  expect(new Set(a.orders.map((order) => order.platform))).toEqual(
    new Set(['天猫', '京东', '抖音电商', '自营小程序']),
  );
  expect(a.orders.length).toBeGreaterThan(5000);
});

test('生成的数据保持订单金额、引用和库存一致性', () => {
  const dataset = generateDataset(20260808, new Date('2026-08-08T10:00:00+08:00'));
  const orderIds = new Set(dataset.orders.map((order) => order.id));
  const productIds = new Set(dataset.products.map((product) => product.id));
  const ordersById = new Map(dataset.orders.map((order) => [order.id, order]));
  const itemsByOrder = new Map(dataset.orders.map((order) => [order.id, [] as typeof dataset.orderItems]));

  for (const item of dataset.orderItems) {
    itemsByOrder.get(item.orderId)?.push(item);
  }

  for (const order of dataset.orders) {
    const items = itemsByOrder.get(order.id) ?? [];
    const itemAmount = items.reduce((total, item) => total + item.quantity * item.unitPrice, 0);

    expect(itemAmount + order.shippingFee - order.discountAmount).toBeGreaterThanOrEqual(0);
    expect(items.every((item) => item.unitCost < item.unitPrice)).toBe(true);
    expect(items.every((item) => productIds.has(item.productId))).toBe(true);
  }

  expect(dataset.refunds.every((refund) => {
    const order = ordersById.get(refund.orderId);
    return orderIds.has(refund.orderId) && (order?.status === 'paid' || order?.status === 'fulfilled');
  })).toBe(true);
  expect(dataset.products.every((product) => product.stock >= 0)).toBe(true);
});
