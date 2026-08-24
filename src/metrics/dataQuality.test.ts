import { describe, expect, it } from 'vitest';
import type { CommerceDataset } from '../domain/types';
import { generateDataset } from '../data/generateDataset';
import { runDataQualityChecks } from './dataQuality';

function baseDataset(): CommerceDataset {
  return generateDataset(42, new Date('2026-08-24T10:00:00+08:00'));
}

describe('runDataQualityChecks', () => {
  it('模拟数据集应通过全部检查', () => {
    const report = runDataQualityChecks(baseDataset());
    expect(report.passed).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('订单主键重复 → error', () => {
    const ds = baseDataset();
    ds.orders.push({ ...ds.orders[0] });
    const report = runDataQualityChecks(ds);
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.check === 'pk.orders')).toBe(true);
  });

  it('订单商品引用不存在的订单 → error', () => {
    const ds = baseDataset();
    ds.orderItems.push({ ...ds.orderItems[0], orderId: 'ghost-order' });
    const report = runDataQualityChecks(ds);
    expect(report.issues.some((i) => i.check === 'fk.orderItems.orderId')).toBe(true);
  });

  it('负数退款金额 → error', () => {
    const ds = baseDataset();
    ds.refunds.push({ ...ds.refunds[0], id: 'refund-x', amount: -1 });
    const report = runDataQualityChecks(ds);
    expect(report.issues.some((i) => i.check === 'amounts.refunds')).toBe(true);
  });

  it('支付时间早于创建时间 → warning（不影响 passed）', () => {
    const ds = baseDataset();
    ds.orders[0] = { ...ds.orders[0], paidAt: new Date(ds.orders[0].createdAt.getTime() - 1000) };
    if (ds.orders[0].status === 'created') ds.orders[0].status = 'paid';
    const report = runDataQualityChecks(ds);
    expect(report.issues.some((i) => i.check === 'time.orders')).toBe(true);
    expect(report.issues.every((i) => i.severity !== 'error')).toBe(true);
    expect(report.passed).toBe(true);
  });
});
