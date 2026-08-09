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

test('每个自然日覆盖全部 24 个平台与类目流量原子', () => {
  const dataset = generateDataset(20260808, new Date('2026-08-08T10:00:00+08:00'));
  const trafficByDate = new Map<string, typeof dataset.traffic>();
  for (const record of dataset.traffic) {
    const date = record.at.toLocaleDateString('en-CA');
    trafficByDate.set(date, [...(trafficByDate.get(date) ?? []), record]);
  }

  expect(trafficByDate.size).toBe(90);
  for (const records of trafficByDate.values()) {
    expect(records).toHaveLength(24);
    expect(new Set(records.map((record) => `${record.platform}/${record.categoryId}`)).size).toBe(24);
    expect(records.every((record) => (
      record.visitors >= record.productViewers
      && record.productViewers >= record.addToCartUsers
      && record.addToCartUsers >= record.checkoutUsers
      && record.checkoutUsers >= record.paidBuyers
    ))).toBe(true);
  }
});

test('凌晨生成的今日订单覆盖已发生的多个分钟且不晚于当前时间', () => {
  const now = new Date('2026-08-08T04:30:00+08:00');
  const todayOrders = generateDataset(20260808, now).orders.filter((order) => order.createdAt.toDateString() === now.toDateString());
  const minutes = todayOrders.map((order) => order.createdAt.getHours() * 60 + order.createdAt.getMinutes());

  expect(Math.min(...minutes)).toBeLessThan(60);
  expect(Math.max(...minutes)).toBeGreaterThanOrEqual(240);
  expect(Math.max(...minutes)).toBeLessThanOrEqual(270);
  expect(new Set(minutes).size).toBeGreaterThan(1);
});

test('订单创建时间连续覆盖 now 当日及此前 89 个自然日', () => {
  const now = new Date('2026-08-08T10:00:00+08:00');
  const dataset = generateDataset(20260808, now);
  const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const orderDates = new Set(dataset.orders.map((order) => dateKey(order.createdAt)));
  const firstDate = new Date(2026, 4, 11);
  const sortedOrderDates = [...orderDates].sort();

  expect(orderDates.size).toBe(90);
  expect(sortedOrderDates[0]).toBe('2026-05-11');
  expect(sortedOrderDates[sortedOrderDates.length - 1]).toBe('2026-08-08');
  for (let day = 0; day < 90; day += 1) {
    expect(orderDates.has(dateKey(new Date(firstDate.getTime() + day * 24 * 60 * 60 * 1000)))).toBe(true);
  }
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
  const targetDates = [...new Set(dataset.targets.map((target) => target.date))];
  for (const date of targetDates) {
    const targets = dataset.targets.filter((target) => target.date === date);
    const total = targets.find((target) => !target.platform && !target.storeId && !target.categoryId);
    const atomic = targets.filter((target) => target.platform && target.storeId && target.categoryId);

    expect(total).toBeDefined();
    expect(atomic).toHaveLength(24);
    expect(new Set(atomic.map((target) => `${target.platform}/${target.storeId}/${target.categoryId}`)).size).toBe(24);
    expect(atomic.reduce((sum, target) => sum + target.gmv, 0)).toBe(total?.gmv);
  }
  expect(dataset.targets.filter((target) => !target.platform && !target.storeId && !target.categoryId && target.date > '2026-08-08')).toHaveLength(7);

  const factDates = [
    ...dataset.orders.flatMap((order) => order.paidAt ? [order.createdAt, order.paidAt] : [order.createdAt]),
    ...dataset.traffic.map((record) => record.at),
    ...dataset.refunds.map((refund) => refund.createdAt),
  ];
  expect(factDates.every((date) => date >= new Date('2026-05-10T10:00:00+08:00') && date <= now)).toBe(true);
});
