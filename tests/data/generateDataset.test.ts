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
  const now = new Date('2026-08-08T10:00:00+08:00');
  const dataset = generateDataset(20260808, now);
  const orderIds = new Set(dataset.orders.map((order) => order.id));
  const productIds = new Set(dataset.products.map((product) => product.id));
  const customerIds = new Set(dataset.customers.map((customer) => customer.id));
  const storeIds = new Set(dataset.stores.map((store) => store.id));
  const categoryIds = new Set(dataset.categories.map((category) => category.id));
  const campaignIds = new Set(dataset.campaigns.map((campaign) => campaign.id));
  const ordersById = new Map(dataset.orders.map((order) => [order.id, order]));
  const itemsByOrder = new Map(dataset.orders.map((order) => [order.id, [] as typeof dataset.orderItems]));
  const productsById = new Map(dataset.products.map((product) => [product.id, product]));
  const campaignsById = new Map(dataset.campaigns.map((campaign) => [campaign.id, campaign]));

  for (const item of dataset.orderItems) {
    itemsByOrder.get(item.orderId)?.push(item);
  }

  for (const order of dataset.orders) {
    const items = itemsByOrder.get(order.id) ?? [];
    const itemAmount = items.reduce((total, item) => total + item.quantity * item.unitPrice, 0);

    expect(itemAmount + order.shippingFee - order.discountAmount).toBeGreaterThanOrEqual(0);
    expect(customerIds.has(order.customerId)).toBe(true);
    expect(storeIds.has(order.storeId)).toBe(true);
    expect(items.every((item) => item.unitCost < item.unitPrice)).toBe(true);
    expect(items.every((item) => productIds.has(item.productId))).toBe(true);
    expect(items.every((item) => categoryIds.has(item.categoryId) && productsById.get(item.productId)?.categoryId === item.categoryId)).toBe(true);
    if (order.campaignId) {
      const campaign = campaignsById.get(order.campaignId);
      expect(campaignIds.has(order.campaignId)).toBe(true);
      expect(campaign?.platform).toBe(order.platform);
      expect(campaign?.storeId).toBe(order.storeId);
    }
  }

  expect(dataset.refunds.every((refund) => {
    const order = ordersById.get(refund.orderId);
    const items = itemsByOrder.get(refund.orderId) ?? [];
    const paidAmount = items.reduce((total, item) => total + item.quantity * item.unitPrice, 0) + (order?.shippingFee ?? 0) - (order?.discountAmount ?? 0);
    return orderIds.has(refund.orderId)
      && (order?.status === 'paid' || order?.status === 'fulfilled')
      && refund.amount <= paidAmount;
  })).toBe(true);
  expect(dataset.products.every((product) => product.stock >= 0)).toBe(true);
  expect(dataset.orders.some((order) => order.campaignId)).toBe(true);
  expect(dataset.targets.every((target) => (
    (!target.platform || ['天猫', '京东', '抖音电商', '自营小程序'].includes(target.platform))
    && (!target.storeId || storeIds.has(target.storeId))
    && (!target.categoryId || categoryIds.has(target.categoryId))
  ))).toBe(true);
  expect(dataset.targets.some((target) => target.platform && target.storeId && target.categoryId)).toBe(true);
  expect(dataset.targets.filter((target) => !target.platform && !target.storeId && !target.categoryId && target.date > '2026-08-08')).toHaveLength(7);

  const factDates = [
    ...dataset.orders.flatMap((order) => order.paidAt ? [order.createdAt, order.paidAt] : [order.createdAt]),
    ...dataset.traffic.map((record) => record.at),
    ...dataset.refunds.map((refund) => refund.createdAt),
  ];
  expect(factDates.every((date) => date >= new Date('2026-05-10T10:00:00+08:00') && date <= now)).toBe(true);
});
