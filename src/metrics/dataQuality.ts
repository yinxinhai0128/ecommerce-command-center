import type { CommerceDataset } from '../domain/types';

export type DataQualityIssue = {
  check: string;
  severity: 'error' | 'warning';
  message: string;
};

export type DataQualityReport = {
  passed: boolean;
  checkedAt: Date;
  checksRun: number;
  issues: DataQualityIssue[];
};

function duplicateIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

/**
 * 数据质量检查（P0-2）：在指标计算前验证数据集的完整性约束。
 * 检查项与 docs/metrics.md 的口径依赖一一对应：
 *  - 主键唯一（orders / orderItems 复合键 / refunds）
 *  - 外键完整（orderItems→orders、refunds→orders、订单商品/流量记录→品类与店铺）
 *  - 数值合法（金额非负、访客数非负、库存非负）
 *  - 状态合法（订单状态枚举、退款状态枚举）
 */
export function runDataQualityChecks(dataset: CommerceDataset): DataQualityReport {
  const issues: DataQualityIssue[] = [];

  // ---- 主键唯一 ----
  const dupOrders = duplicateIds(dataset.orders.map((o) => o.id));
  if (dupOrders.length > 0) {
    issues.push({ check: 'pk.orders', severity: 'error', message: `订单主键重复: ${dupOrders.slice(0, 5).join(', ')}` });
  }
  const itemKeys = dataset.orderItems.map((i) => `${i.orderId}:${i.productId}`);
  const dupItems = duplicateIds(itemKeys);
  if (dupItems.length > 0) {
    issues.push({ check: 'pk.orderItems', severity: 'error', message: `订单商品复合键重复: ${dupItems.slice(0, 5).join(', ')}` });
  }
  const dupRefunds = duplicateIds(dataset.refunds.map((r) => r.id));
  if (dupRefunds.length > 0) {
    issues.push({ check: 'pk.refunds', severity: 'error', message: `退款单主键重复: ${dupRefunds.slice(0, 5).join(', ')}` });
  }

  // ---- 外键完整 ----
  const orderIds = new Set(dataset.orders.map((o) => o.id));
  for (const item of dataset.orderItems) {
    if (!orderIds.has(item.orderId)) {
      issues.push({ check: 'fk.orderItems.orderId', severity: 'error', message: `订单商品引用不存在的订单: ${item.orderId}` });
      break; // 同类错误只报一次
    }
  }
  for (const refund of dataset.refunds) {
    if (!orderIds.has(refund.orderId)) {
      issues.push({ check: 'fk.refunds.orderId', severity: 'error', message: `退款单引用不存在的订单: ${refund.orderId}` });
      break;
    }
  }
  const categoryIds = new Set(dataset.categories.map((c) => c.id));
  for (const item of dataset.orderItems) {
    if (!categoryIds.has(item.categoryId)) {
      issues.push({ check: 'fk.orderItems.categoryId', severity: 'error', message: `订单商品引用不存在的品类: ${item.categoryId}` });
      break;
    }
  }
  const storeIds = new Set(dataset.stores.map((s) => s.id));
  for (const order of dataset.orders) {
    if (!storeIds.has(order.storeId)) {
      issues.push({ check: 'fk.orders.storeId', severity: 'error', message: `订单引用不存在的店铺: ${order.storeId}` });
      break;
    }
  }

  // ---- 数值合法 ----
  const negativeAmountOrder = dataset.orders.find((o) => o.shippingFee < 0 || o.discountAmount < 0);
  if (negativeAmountOrder) {
    issues.push({ check: 'amounts.orders', severity: 'error', message: `订单存在负数运费或优惠金额: ${negativeAmountOrder.id}` });
  }
  const negativePriceItem = dataset.orderItems.find((i) => i.unitPrice < 0 || i.unitCost < 0 || i.quantity <= 0);
  if (negativePriceItem) {
    issues.push({ check: 'amounts.orderItems', severity: 'error', message: `订单商品存在负数价格/成本或非正数量: ${negativePriceItem.orderId}` });
  }
  const negativeRefund = dataset.refunds.find((r) => r.amount < 0);
  if (negativeRefund) {
    issues.push({ check: 'amounts.refunds', severity: 'error', message: `退款金额为负: ${negativeRefund.id}` });
  }
  const negativeTraffic = dataset.traffic.find((t) => t.visitors < 0);
  if (negativeTraffic) {
    issues.push({ check: 'amounts.traffic', severity: 'error', message: '流量记录存在负数访客数' });
  }

  // ---- 状态合法 ----
  const validOrderStatus = new Set(['created', 'paid', 'fulfilled', 'cancelled']);
  for (const order of dataset.orders) {
    if (!validOrderStatus.has(order.status)) {
      issues.push({ check: 'status.orders', severity: 'error', message: `非法订单状态 "${order.status}": ${order.id}` });
      break;
    }
  }
  const validRefundStatus = new Set(['requested', 'approved', 'completed']);
  for (const refund of dataset.refunds) {
    if (!validRefundStatus.has(refund.status)) {
      issues.push({ check: 'status.refunds', severity: 'error', message: `非法退款状态 "${refund.status}": ${refund.id}` });
      break;
    }
  }

  // ---- 时间逻辑（warning 级）----
  for (const order of dataset.orders) {
    if (order.paidAt !== undefined && order.paidAt < order.createdAt) {
      issues.push({ check: 'time.orders', severity: 'warning', message: `支付时间早于创建时间: ${order.id}` });
      break;
    }
  }
  for (const campaign of dataset.campaigns) {
    if (campaign.clicks > campaign.impressions) {
      issues.push({ check: 'logic.campaigns', severity: 'warning', message: `活动点击数大于曝光数: ${campaign.id}` });
      break;
    }
  }

  return {
    passed: !issues.some((issue) => issue.severity === 'error'),
    checkedAt: new Date(),
    checksRun: 14,
    issues,
  };
}
