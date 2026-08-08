import type {
  CommerceDataset,
  DashboardFilters,
  DashboardSnapshot,
  Kpi,
  Order,
  OrderItem,
  Platform,
  TrafficRecord,
} from '../domain/types';

const dayMs = 24 * 60 * 60 * 1000;
type MetricValues = Record<keyof DashboardSnapshot['kpis'], number>;

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isInRange(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}

function matchesOrderFilters(order: Order, items: OrderItem[], filters: DashboardFilters): boolean {
  return (!filters.platform || order.platform === filters.platform)
    && (!filters.storeId || order.storeId === filters.storeId)
    && (!filters.categoryId || items.some((item) => item.categoryId === filters.categoryId));
}

function matchesTrafficFilters(record: TrafficRecord, filters: DashboardFilters): boolean {
  return (!filters.platform || record.platform === filters.platform)
    && (!filters.storeId || record.storeId === filters.storeId)
    && (!filters.categoryId || record.categoryId === filters.categoryId);
}

function itemAmount(items: OrderItem[]): number {
  return items.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
}

function orderGmv(order: Order, items: OrderItem[]): number {
  return itemAmount(items) + order.shippingFee - order.discountAmount;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function calculateMetricValues(dataset: CommerceDataset, filters: DashboardFilters): MetricValues {
  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of dataset.orderItems) {
    const items = itemsByOrder.get(item.orderId) ?? [];
    items.push(item);
    itemsByOrder.set(item.orderId, items);
  }
  const ordersById = new Map(dataset.orders.map((order) => [order.id, order]));
  const paidOrders = dataset.orders.filter((order) => (
    (order.status === 'paid' || order.status === 'fulfilled')
    && order.paidAt !== undefined
    && isInRange(order.paidAt, filters.start, filters.end)
    && matchesOrderFilters(order, itemsByOrder.get(order.id) ?? [], filters)
  ));
  const gmv = paidOrders.reduce((total, order) => total + orderGmv(order, itemsByOrder.get(order.id) ?? []), 0);
  const refundAmount = dataset.refunds
    .filter((refund) => {
      const order = ordersById.get(refund.orderId);
      return (refund.status === 'approved' || refund.status === 'completed')
        && isInRange(refund.createdAt, filters.start, filters.end)
        && order !== undefined
        && matchesOrderFilters(order, itemsByOrder.get(order.id) ?? [], filters);
    })
    .reduce((total, refund) => total + refund.amount, 0);
  const netSales = gmv - refundAmount;
  const cost = paidOrders.reduce((total, order) => (
    total + (itemsByOrder.get(order.id) ?? []).reduce((itemTotal, item) => itemTotal + item.quantity * item.unitCost, 0)
  ), 0);
  const traffic = dataset.traffic.filter((record) => isInRange(record.at, filters.start, filters.end) && matchesTrafficFilters(record, filters));
  const visitors = traffic.reduce((total, record) => total + record.visitors, 0);
  const paidBuyers = traffic.reduce((total, record) => total + record.paidBuyers, 0);
  const target = dataset.targets
    .filter((entry) => entry.date >= dateKey(filters.start) && entry.date <= dateKey(filters.end))
    .reduce((total, entry) => total + entry.gmv, 0);

  return {
    gmv,
    netSales,
    orderCount: paidOrders.length,
    conversionRate: visitors === 0 ? 0 : paidBuyers / visitors,
    averageOrderValue: paidOrders.length === 0 ? 0 : gmv / paidOrders.length,
    grossMarginRate: netSales === 0 ? 0 : (netSales - cost) / netSales,
    refundRate: gmv === 0 ? 0 : refundAmount / gmv,
    targetAchievementRate: target === 0 ? 0 : gmv / target,
  };
}

function comparisonFilters(filters: DashboardFilters): { filters: DashboardFilters; label: string } {
  const days = Math.ceil((startOfDay(filters.end).getTime() - startOfDay(filters.start).getTime()) / dayMs) + 1;
  const shiftDays = days <= 1 ? 1 : days <= 7 ? 7 : 30;
  const label = days <= 1 ? '较昨日同期' : days <= 7 ? '较前7天' : '较前30天';

  return {
    label,
    filters: {
      ...filters,
      start: new Date(filters.start.getTime() - shiftDays * dayMs),
      end: new Date(filters.end.getTime() - shiftDays * dayMs),
    },
  };
}

function createKpi(value: number, comparisonValue: number): Kpi {
  return {
    value,
    comparisonValue,
    changeRate: comparisonValue === 0 ? 0 : (value - comparisonValue) / comparisonValue,
  };
}

function selectPaidOrders(dataset: CommerceDataset, filters: DashboardFilters): { orders: Order[]; itemsByOrder: Map<string, OrderItem[]> } {
  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of dataset.orderItems) {
    const items = itemsByOrder.get(item.orderId) ?? [];
    items.push(item);
    itemsByOrder.set(item.orderId, items);
  }
  return {
    itemsByOrder,
    orders: dataset.orders.filter((order) => (
      (order.status === 'paid' || order.status === 'fulfilled')
      && order.paidAt !== undefined
      && isInRange(order.paidAt, filters.start, filters.end)
      && matchesOrderFilters(order, itemsByOrder.get(order.id) ?? [], filters)
    )),
  };
}

function buildSalesTrend(dataset: CommerceDataset, filters: DashboardFilters): DashboardSnapshot['salesTrend'] {
  const { orders, itemsByOrder } = selectPaidOrders(dataset, filters);
  const singleDay = dateKey(filters.start) === dateKey(filters.end);
  const intervalMs = singleDay ? 5 * 60 * 1000 : dayMs;
  const firstBucket = singleDay
    ? new Date(filters.start.getFullYear(), filters.start.getMonth(), filters.start.getDate(), filters.start.getHours(), Math.floor(filters.start.getMinutes() / 5) * 5)
    : startOfDay(filters.start);
  const lastBucket = singleDay
    ? new Date(filters.end.getFullYear(), filters.end.getMonth(), filters.end.getDate(), filters.end.getHours(), Math.floor(filters.end.getMinutes() / 5) * 5)
    : startOfDay(filters.end);
  const gmvByBucket = new Map<number, number>();
  for (const order of orders) {
    const paidAt = order.paidAt!;
    const bucket = singleDay
      ? new Date(paidAt.getFullYear(), paidAt.getMonth(), paidAt.getDate(), paidAt.getHours(), Math.floor(paidAt.getMinutes() / 5) * 5).getTime()
      : startOfDay(paidAt).getTime();
    gmvByBucket.set(bucket, (gmvByBucket.get(bucket) ?? 0) + orderGmv(order, itemsByOrder.get(order.id) ?? []));
  }
  const trend: DashboardSnapshot['salesTrend'] = [];
  for (let at = firstBucket.getTime(); at <= lastBucket.getTime(); at += intervalMs) {
    trend.push({ at: new Date(at), gmv: gmvByBucket.get(at) ?? 0 });
  }
  return trend;
}

function calculateForecast(dataset: CommerceDataset, filters: DashboardFilters, now: Date): DashboardSnapshot['forecast7d'] {
  const historicalFilters = { ...filters, start: new Date(0), end: now };
  const dailyGmv = new Map<string, number>();
  const { orders, itemsByOrder } = selectPaidOrders(dataset, historicalFilters);
  for (const order of orders) {
    const key = dateKey(order.paidAt!);
    dailyGmv.set(key, (dailyGmv.get(key) ?? 0) + orderGmv(order, itemsByOrder.get(order.id) ?? []));
  }
  const recentStart = new Date(now.getTime() - 7 * dayMs);
  const previousStart = new Date(now.getTime() - 14 * dayMs);
  const recentGmv = [...dailyGmv.entries()]
    .filter(([key]) => {
      const date = new Date(`${key}T00:00:00`);
      return date >= recentStart && date <= now;
    })
    .reduce((total, [, value]) => total + value, 0);
  const previousGmv = [...dailyGmv.entries()]
    .filter(([key]) => {
      const date = new Date(`${key}T00:00:00`);
      return date >= previousStart && date < recentStart;
    })
    .reduce((total, [, value]) => total + value, 0);
  const trendFactor = previousGmv === 0 ? 1 : clamp(recentGmv / previousGmv, 0.8, 1.2);
  const tomorrow = new Date(startOfDay(now).getTime() + dayMs);
  const weights = [0.4, 0.3, 0.2, 0.1];

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(tomorrow.getTime() + index * dayMs);
    const baseline = weights.reduce((total, weight, week) => {
      const historyDate = new Date(date.getTime() - (week + 1) * 7 * dayMs);
      return total + (dailyGmv.get(dateKey(historyDate)) ?? 0) * weight;
    }, 0);
    return { date: dateKey(date), gmv: Math.round(baseline * trendFactor * 100) / 100 };
  });
}

export function calculateSnapshot(dataset: CommerceDataset, filters: DashboardFilters, now: Date): DashboardSnapshot {
  const values = calculateMetricValues(dataset, filters);
  const comparison = comparisonFilters(filters);
  const comparisonValues = calculateMetricValues(dataset, comparison.filters);
  const { orders, itemsByOrder } = selectPaidOrders(dataset, filters);
  const traffic = dataset.traffic.filter((record) => isInRange(record.at, filters.start, filters.end) && matchesTrafficFilters(record, filters));
  const totalTraffic = (field: keyof Pick<TrafficRecord, 'visitors' | 'productViewers' | 'addToCartUsers' | 'checkoutUsers' | 'paidBuyers'>): number => (
    traffic.reduce((total, record) => total + record[field], 0)
  );
  const gmvByPlatform = new Map<Platform, number>();
  const gmvByProduct = new Map<string, number>();
  const gmvByRegion = new Map<string, number>();
  const storesById = new Map(dataset.stores.map((store) => [store.id, store]));
  const productsById = new Map(dataset.products.map((product) => [product.id, product]));
  for (const order of orders) {
    const amount = orderGmv(order, itemsByOrder.get(order.id) ?? []);
    gmvByPlatform.set(order.platform, (gmvByPlatform.get(order.platform) ?? 0) + amount);
    const region = storesById.get(order.storeId)?.region ?? '未知';
    gmvByRegion.set(region, (gmvByRegion.get(region) ?? 0) + amount);
    for (const item of itemsByOrder.get(order.id) ?? []) {
      const productAmount = item.quantity * item.unitPrice;
      gmvByProduct.set(item.productId, (gmvByProduct.get(item.productId) ?? 0) + productAmount);
    }
  }
  const inventoryStart = new Date(now.getTime() - 7 * dayMs);
  const soldUnits = new Map<string, number>();
  for (const order of dataset.orders) {
    if ((order.status === 'paid' || order.status === 'fulfilled') && order.paidAt && isInRange(order.paidAt, inventoryStart, now)) {
      for (const item of itemsByOrder.get(order.id) ?? dataset.orderItems.filter((candidate) => candidate.orderId === order.id)) {
        soldUnits.set(item.productId, (soldUnits.get(item.productId) ?? 0) + item.quantity);
      }
    }
  }
  const forecast7d = calculateForecast(dataset, filters, now);
  const futureTarget = dataset.targets
    .filter((target) => forecast7d.some((forecast) => forecast.date === target.date))
    .reduce((total, target) => total + target.gmv, 0);

  return {
    comparisonLabel: comparison.label,
    kpis: {
      gmv: createKpi(values.gmv, comparisonValues.gmv),
      netSales: createKpi(values.netSales, comparisonValues.netSales),
      orderCount: createKpi(values.orderCount, comparisonValues.orderCount),
      conversionRate: createKpi(values.conversionRate, comparisonValues.conversionRate),
      averageOrderValue: createKpi(values.averageOrderValue, comparisonValues.averageOrderValue),
      grossMarginRate: createKpi(values.grossMarginRate, comparisonValues.grossMarginRate),
      refundRate: createKpi(values.refundRate, comparisonValues.refundRate),
      targetAchievementRate: createKpi(values.targetAchievementRate, comparisonValues.targetAchievementRate),
    },
    salesTrend: buildSalesTrend(dataset, filters),
    funnel: [
      { stage: 'visitors', value: totalTraffic('visitors') },
      { stage: 'productViewers', value: totalTraffic('productViewers') },
      { stage: 'addToCartUsers', value: totalTraffic('addToCartUsers') },
      { stage: 'checkoutUsers', value: totalTraffic('checkoutUsers') },
      { stage: 'paidBuyers', value: totalTraffic('paidBuyers') },
    ],
    channelRanking: [...gmvByPlatform.entries()]
      .map(([platform, gmv]) => ({ platform, gmv }))
      .sort((a, b) => b.gmv - a.gmv),
    productRanking: [...gmvByProduct.entries()]
      .map(([productId, gmv]) => ({ productId, name: productsById.get(productId)?.name ?? productId, gmv }))
      .sort((a, b) => b.gmv - a.gmv),
    regionRanking: [...gmvByRegion.entries()]
      .map(([region, gmv]) => ({ region, gmv }))
      .sort((a, b) => b.gmv - a.gmv),
    inventoryRisks: dataset.products
      .map((product) => {
        const dailySales = (soldUnits.get(product.id) ?? 0) / 7;
        return { productId: product.id, name: product.name, stock: product.stock, dailySales, daysAvailable: dailySales === 0 ? Infinity : product.stock / dailySales };
      })
      .filter((risk) => risk.dailySales > 0 && risk.daysAvailable < 3)
      .sort((a, b) => a.daysAvailable - b.daysAvailable),
    forecast7d,
    targetProbability: futureTarget === 0 ? 0 : clamp(forecast7d.reduce((total, forecast) => total + forecast.gmv, 0) / futureTarget, 0, 1),
  };
}
