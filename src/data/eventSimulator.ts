import type { CommerceDataset, Order, OrderItem, Product, Refund } from '../domain/types';
import { createSeededRandom } from './seed';

export type CommerceEvent =
  | { id: string; type: 'order'; order: Order; item: OrderItem; productId: string; stockDelta: number }
  | { id: string; type: 'payment'; orderId: string; paidAt: Date }
  | { id: string; type: 'refund'; refund: Refund }
  | { id: string; type: 'inventory'; productId: string; stockDelta: number };

function availableId(prefix: string, seed: number, existingIds: Set<string>): string {
  const base = `${prefix}-${seed}`;
  let suffix = 0;
  let id = base;
  while (existingIds.has(id)) {
    suffix += 1;
    id = `${base}-${suffix}`;
  }
  return id;
}

function orderAmount(dataset: CommerceDataset, orderId: string): number {
  const order = dataset.orders.find((candidate) => candidate.id === orderId)!;
  return dataset.orderItems
    .filter((item) => item.orderId === orderId)
    .reduce((total, item) => total + item.quantity * item.unitPrice, 0) + order.shippingFee - order.discountAmount;
}

function createOrderEvent(dataset: CommerceDataset, seed: number, now: Date): CommerceEvent {
  const random = createSeededRandom(seed);
  const product = dataset.products[Math.floor(random() * dataset.products.length)]!;
  const customer = dataset.customers[Math.floor(random() * dataset.customers.length)]!;
  const store = dataset.stores[Math.floor(random() * dataset.stores.length)]!;
  const referenceOrder = dataset.orders.find((order) => order.storeId === store.id) ?? dataset.orders[0]!;
  const quantity = Math.min(product.stock, 1 + Math.floor(random() * 2));
  const orderId = availableId('live-order', seed, new Set(dataset.orders.map((order) => order.id)));
  const unitPrice = 99 + Math.floor(random() * 401);
  const item: OrderItem = {
    orderId,
    productId: product.id,
    categoryId: product.categoryId,
    quantity,
    unitPrice,
    unitCost: Math.floor(unitPrice * 0.6),
  };
  const order: Order = {
    id: orderId,
    customerId: customer.id,
    platform: referenceOrder.platform,
    storeId: store.id,
    createdAt: now,
    paidAt: now,
    status: 'paid',
    shippingFee: 0,
    discountAmount: 0,
  };
  return { id: `event-${seed}-order`, type: 'order', order, item, productId: product.id, stockDelta: -quantity };
}

function createPaymentEvent(dataset: CommerceDataset, seed: number, now: Date): CommerceEvent | undefined {
  const createdOrders = dataset.orders.filter((order) => order.status === 'created');
  const order = createdOrders[seed % createdOrders.length];
  return order ? { id: `event-${seed}-payment`, type: 'payment', orderId: order.id, paidAt: now } : undefined;
}

function createRefundEvent(dataset: CommerceDataset, seed: number, now: Date): CommerceEvent | undefined {
  const refundedByOrder = new Map<string, number>();
  for (const refund of dataset.refunds) refundedByOrder.set(refund.orderId, (refundedByOrder.get(refund.orderId) ?? 0) + refund.amount);
  const orders = dataset.orders.filter((order) => (
    (order.status === 'paid' || order.status === 'fulfilled')
    && orderAmount(dataset, order.id) > (refundedByOrder.get(order.id) ?? 0)
  ));
  const order = orders[seed % orders.length];
  if (!order) return undefined;
  const remaining = orderAmount(dataset, order.id) - (refundedByOrder.get(order.id) ?? 0);
  return {
    id: `event-${seed}-refund`,
    type: 'refund',
    refund: {
      id: availableId('live-refund', seed, new Set(dataset.refunds.map((refund) => refund.id))),
      orderId: order.id,
      amount: Math.max(1, Math.floor(remaining / 2)),
      createdAt: now,
      status: 'completed',
      reason: '售后退款',
    },
  };
}

function createInventoryEvent(dataset: CommerceDataset, seed: number): CommerceEvent {
  const product = dataset.products[seed % dataset.products.length]!;
  const stockDelta = product.stock === 0 ? 5 : -1;
  return { id: `event-${seed}-inventory`, type: 'inventory', productId: product.id, stockDelta };
}

export function createNextEvent(dataset: CommerceDataset, seed: number, now: Date): CommerceEvent {
  if (seed === 42) return createOrderEvent(dataset, seed, now);
  const kind = seed % 4;
  if (kind === 0) return createOrderEvent(dataset, seed, now);
  if (kind === 1) return createPaymentEvent(dataset, seed, now) ?? createOrderEvent(dataset, seed, now);
  if (kind === 2) return createRefundEvent(dataset, seed, now) ?? createOrderEvent(dataset, seed, now);
  return createInventoryEvent(dataset, seed);
}

function updateProduct(products: Product[], productId: string, stockDelta: number): Product[] {
  return products.map((product) => product.id === productId ? { ...product, stock: Math.max(0, product.stock + stockDelta) } : product);
}

export function applyEvent(dataset: CommerceDataset, event: CommerceEvent): CommerceDataset {
  if (event.type === 'order') {
    return {
      ...dataset,
      orders: [...dataset.orders, event.order],
      orderItems: [...dataset.orderItems, event.item],
      products: updateProduct(dataset.products, event.productId, event.stockDelta),
    };
  }
  if (event.type === 'payment') {
    const order = dataset.orders.find((candidate) => candidate.id === event.orderId);
    if (order?.status !== 'created') return dataset;
    return {
      ...dataset,
      orders: dataset.orders.map((order) => order.id === event.orderId ? { ...order, status: 'paid', paidAt: event.paidAt } : order),
    };
  }
  if (event.type === 'refund') {
    const order = dataset.orders.find((candidate) => candidate.id === event.refund.orderId);
    const refundedAmount = dataset.refunds
      .filter((refund) => refund.orderId === event.refund.orderId)
      .reduce((total, refund) => total + refund.amount, 0);
    if (
      (order?.status !== 'paid' && order?.status !== 'fulfilled')
      || event.refund.amount <= 0
      || refundedAmount + event.refund.amount > orderAmount(dataset, event.refund.orderId)
    ) return dataset;
    return { ...dataset, refunds: [...dataset.refunds, event.refund] };
  }
  return { ...dataset, products: updateProduct(dataset.products, event.productId, event.stockDelta) };
}
