import type { PilotAnalysisContext, PilotAnalysisUnit, PilotSnapshot } from './contracts';

const MAX_CONTRIBUTORS_PER_DIMENSION = 12;
const MAX_LABEL_LENGTH = 200;
const dimensionLabels = { category: '品类', seller: '卖家', customerState: '地区' } as const;

const metricDefinitions: Array<{ key: keyof PilotSnapshot['kpis']; label: string; unit: PilotAnalysisUnit }> = [
  { key: 'itemGmv', label: '成交额', unit: 'currency' },
  { key: 'validOrderCount', label: '有效订单数', unit: 'count' },
  { key: 'averageOrderValue', label: '平均订单金额', unit: 'currency' },
  { key: 'cancellationRate', label: '取消率', unit: 'ratio' },
  { key: 'onTimeDeliveryRate', label: '准时送达率', unit: 'ratio' },
  { key: 'averageDeliveryDays', label: '平均配送天数', unit: 'days' },
  { key: 'averageReviewScore', label: '平均评分', unit: 'score' },
];

const commerceDefinitions: Array<{ key: keyof PilotSnapshot['commerce']; label: string; unit: PilotAnalysisUnit }> = [
  { key: 'paymentAmount', label: '支付金额', unit: 'currency' },
  { key: 'uniqueBuyerCount', label: '独立买家数', unit: 'count' },
  { key: 'repeatBuyerCount', label: '复购买家数', unit: 'count' },
];

const cleanLabel = (value: string) => value.trim().slice(0, MAX_LABEL_LENGTH);

function rankContributors(items: Array<{ label: string; itemGmv: number }>, dimension: PilotAnalysisContext['contributors'][number]['dimension']) {
  const occurrences = new Map<string, number>();
  return items.map((item) => ({ ...item, label: cleanLabel(item.label) }))
    .sort((left, right) => right.itemGmv - left.itemGmv || left.label.localeCompare(right.label))
    .slice(0, MAX_CONTRIBUTORS_PER_DIMENSION)
    .map((item, index) => {
      const publicLabel = `${dimensionLabels[dimension]}：${item.label}`;
      const occurrence = (occurrences.get(publicLabel) ?? 0) + 1;
      occurrences.set(publicLabel, occurrence);
      return { id: `${dimension}:${index + 1}`, dimension, ...item, label: occurrence === 1 ? publicLabel : `${publicLabel}（${occurrence}）` };
    });
}

function kpiFacts<T extends Record<string, PilotSnapshot['kpis'][keyof PilotSnapshot['kpis']]>>(
  group: string, definitions: Array<{ key: keyof T; label: string; unit: PilotAnalysisUnit }>, values: T,
) {
  return definitions.flatMap(({ key, label, unit }) => {
    const value = values[key];
    return [
      { id: `${group}${String(key)}.value`, label, value: value.value, unit },
      { id: `${group}${String(key)}.comparisonValue`, label: `${label}（对比期）`, value: value.comparisonValue, unit },
    ];
  });
}

export function buildPilotAnalysisContext(snapshot: PilotSnapshot, question?: string): PilotAnalysisContext {
  const paymentAvailable = !snapshot.capabilities.some(({ key, status }) => key === 'paymentTiming' && status === 'unavailable');
  const availableCommerceDefinitions = paymentAvailable ? commerceDefinitions : commerceDefinitions.filter(({ key }) => key !== 'paymentAmount');
  const facts = [
    ...kpiFacts('', metricDefinitions, snapshot.kpis),
    ...kpiFacts('commerce.', availableCommerceDefinitions, snapshot.commerce),
    ...(paymentAvailable ? snapshot.payments.byType.map(({ paymentType, paymentAmount }) => ({ id: `payments.byType.${paymentType}.paymentAmount`, label: `支付方式：${cleanLabel(paymentType)} 支付金额`, value: paymentAmount, unit: 'currency' as const })) : []),
    ...(paymentAvailable ? snapshot.payments.installments.map(({ installments, paymentAmount }) => ({ id: `payments.installments.${installments}.paymentAmount`, label: `分期：${installments}期 支付金额`, value: paymentAmount, unit: 'currency' as const })) : []),
    ...snapshot.fulfillment.statusDistribution.map(({ status, value }) => ({ id: `fulfillment.status.${status}.count`, label: `履约状态：${cleanLabel(status)} 订单数`, value, unit: 'count' as const })),
    { id: 'fulfillment.averageApprovalDays', label: '平均审批天数', value: snapshot.fulfillment.averageApprovalDays, unit: 'days' as const },
    { id: 'fulfillment.averageCarrierDays', label: '平均交运天数', value: snapshot.fulfillment.averageCarrierDays, unit: 'days' as const },
    { id: 'fulfillment.averageDeliveryDays', label: '履约平均配送天数', value: snapshot.fulfillment.averageDeliveryDays, unit: 'days' as const },
    { id: 'fulfillment.lateDeliveryRate', label: '延迟送达率', value: snapshot.fulfillment.lateDeliveryRate, unit: 'ratio' as const },
    { id: 'fulfillment.averageLateDays', label: '平均延迟天数', value: snapshot.fulfillment.averageLateDays, unit: 'days' as const },
    ...snapshot.experience.scoreDistribution.map(({ score, value }) => ({ id: `experience.score.${score}.count`, label: `评分：${score}分 订单数`, value, unit: 'count' as const })),
    { id: 'experience.lowScoreRate', label: '低评分率', value: snapshot.experience.lowScoreRate, unit: 'ratio' as const },
    { id: 'experience.averageReplyDays', label: '平均回复天数', value: snapshot.experience.averageReplyDays, unit: 'days' as const },
    ...snapshot.contributions.categories.flatMap(({ category, label, itemGmv, itemCount }) => [
      { id: `contributions.category.${category}.itemGmv`, label: `品类：${cleanLabel(label)} 成交额`, value: itemGmv, unit: 'currency' as const },
      { id: `contributions.category.${category}.itemCount`, label: `品类：${cleanLabel(label)} 商品数`, value: itemCount, unit: 'count' as const },
    ]),
    ...snapshot.contributions.sellers.flatMap(({ sellerId, itemGmv, validOrderCount }) => [
      { id: `contributions.seller.${sellerId}.itemGmv`, label: `卖家：${cleanLabel(sellerId)} 成交额`, value: itemGmv, unit: 'currency' as const },
      { id: `contributions.seller.${sellerId}.validOrderCount`, label: `卖家：${cleanLabel(sellerId)} 有效订单数`, value: validOrderCount, unit: 'count' as const },
    ]),
    ...snapshot.contributions.customerStates.flatMap(({ customerState, itemGmv, validOrderCount }) => [
      { id: `contributions.customerState.${customerState}.itemGmv`, label: `地区：${cleanLabel(customerState)} 成交额`, value: itemGmv, unit: 'currency' as const },
      { id: `contributions.customerState.${customerState}.validOrderCount`, label: `地区：${cleanLabel(customerState)} 有效订单数`, value: validOrderCount, unit: 'count' as const },
    ]),
  ];
  const trendChanges = [
    ...metricDefinitions.map(({ key, label }) => ({ id: `${key}.changeRate`, label: `${label}变化率`, value: snapshot.kpis[key].changeRate, unit: 'ratio' as const })),
    ...availableCommerceDefinitions.map(({ key, label }) => ({ id: `commerce.${key}.changeRate`, label: `${label}变化率`, value: snapshot.commerce[key].changeRate, unit: 'ratio' as const })),
  ];
  const contributors = [
    ...rankContributors(snapshot.categoryRanking.map(({ category: label, itemGmv }) => ({ label, itemGmv })), 'category'),
    ...rankContributors(snapshot.sellerRanking.map(({ sellerId: label, itemGmv }) => ({ label, itemGmv })), 'seller'),
    ...rankContributors(snapshot.customerStateRanking.map(({ customerState: label, itemGmv }) => ({ label, itemGmv })), 'customerState'),
  ].sort((left, right) => right.itemGmv - left.itemGmv || left.dimension.localeCompare(right.dimension) || left.label.localeCompare(right.label));

  return { ...(question ? { question: question.trim().slice(0, 500) } : {}), sourceLocalNow: snapshot.sourceLocalNow, filters: snapshot.filters, comparisonLabel: snapshot.comparisonLabel, facts, trendChanges, contributors };
}

export function trustedEvidenceAllowList(context: PilotAnalysisContext) {
  const contributors = context.contributors.map(({ id, label, itemGmv }) => ({ id, label, value: itemGmv, unit: 'currency' as const }));
  return {
    signals: [...context.facts, ...context.trendChanges, ...contributors],
    causes: contributors,
  };
}
