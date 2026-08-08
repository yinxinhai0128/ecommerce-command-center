import type { DashboardAlert, DashboardSnapshot } from '../domain/types';

function alertTime(snapshot: DashboardSnapshot): Date {
  return snapshot.salesTrend[snapshot.salesTrend.length - 1]?.at ?? new Date(0);
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function detectAnomalies(snapshot: DashboardSnapshot): DashboardAlert[] {
  const createdAt = alertTime(snapshot);
  const alerts: DashboardAlert[] = [];
  const { kpis } = snapshot;

  if (kpis.refundRate.changeRate >= 0.3 && kpis.refundRate.value > 0.08) {
    alerts.push({
      id: `refundRate-${createdAt.getTime()}`,
      severity: 'critical',
      metric: 'refundRate',
      title: '退款率异常上升',
      evidence: `退款率为 ${percent(kpis.refundRate.value)}，较昨日同期上升 ${percent(kpis.refundRate.changeRate)}。`,
      impactAmount: kpis.gmv.value * (kpis.refundRate.value - kpis.refundRate.comparisonValue),
      suggestion: '核查近期商品质量、物流与售后原因，优先处理高退款商品。',
      createdAt,
    });
  }

  if (kpis.conversionRate.changeRate <= -0.15) {
    alerts.push({
      id: `conversionRate-${createdAt.getTime()}`,
      severity: 'warning',
      metric: 'conversionRate',
      title: '支付转化率下降',
      evidence: `支付转化率为 ${percent(kpis.conversionRate.value)}，较昨日同期下降 ${percent(-kpis.conversionRate.changeRate)}。`,
      impactAmount: kpis.gmv.value * (kpis.conversionRate.comparisonValue - kpis.conversionRate.value),
      suggestion: '检查商品详情页、优惠活动和支付链路的转化表现。',
      createdAt,
    });
  }

  const timeProgress = (createdAt.getHours() * 60 + createdAt.getMinutes()) / (24 * 60);
  if (kpis.targetAchievementRate.value <= timeProgress - 0.1) {
    alerts.push({
      id: `targetAchievementRate-${createdAt.getTime()}`,
      severity: 'warning',
      metric: 'targetAchievementRate',
      title: '目标达成进度落后',
      evidence: `目标达成 ${percent(kpis.targetAchievementRate.value)}，低于 ${percent(timeProgress)} 的时间进度超过 10 个百分点。`,
      impactAmount: kpis.gmv.value * (timeProgress - kpis.targetAchievementRate.value),
      suggestion: '增加高转化渠道投放，并跟进重点商品与活动节奏。',
      createdAt,
    });
  }

  const inventoryRisk = snapshot.inventoryRisks.find((risk) => risk.daysAvailable < 3);
  if (inventoryRisk) {
    alerts.push({
      id: `inventoryDays-${inventoryRisk.productId}-${createdAt.getTime()}`,
      severity: 'warning',
      metric: 'inventoryDays',
      title: '商品库存不足',
      evidence: `${inventoryRisk.name} 预计可售 ${inventoryRisk.daysAvailable.toFixed(1)} 天。`,
      impactAmount: inventoryRisk.dailySales * Math.max(0, 3 - inventoryRisk.daysAvailable),
      suggestion: '尽快安排补货，并评估是否需要降低投放或调整售卖节奏。',
      createdAt,
    });
  }

  return alerts;
}
