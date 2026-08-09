import type { PilotAnalysisContext, PilotAnalysisUnit, PilotSnapshot } from './contracts';

const MAX_CONTRIBUTORS_PER_DIMENSION = 12;
const MAX_LABEL_LENGTH = 200;

const metricDefinitions: Array<{
  key: keyof PilotSnapshot['kpis'];
  label: string;
  unit: PilotAnalysisUnit;
}> = [
  { key: 'itemGmv', label: '成交额', unit: 'currency' },
  { key: 'validOrderCount', label: '有效订单数', unit: 'count' },
  { key: 'averageOrderValue', label: '平均订单金额', unit: 'currency' },
  { key: 'cancellationRate', label: '取消率', unit: 'ratio' },
  { key: 'onTimeDeliveryRate', label: '准时送达率', unit: 'ratio' },
  { key: 'averageDeliveryDays', label: '平均配送天数', unit: 'days' },
  { key: 'averageReviewScore', label: '平均评分', unit: 'score' },
];

const cleanLabel = (value: string) => value.trim().slice(0, MAX_LABEL_LENGTH);

function rankContributors(
  items: Array<{ label: string; itemGmv: number }>,
  dimension: PilotAnalysisContext['contributors'][number]['dimension'],
) {
  return items
    .map((item) => ({ ...item, label: cleanLabel(item.label) }))
    .sort((left, right) => right.itemGmv - left.itemGmv || left.label.localeCompare(right.label))
    .slice(0, MAX_CONTRIBUTORS_PER_DIMENSION)
    .map((item, index) => ({ id: `${dimension}:${index + 1}`, dimension, ...item }));
}

export function buildPilotAnalysisContext(snapshot: PilotSnapshot, question?: string): PilotAnalysisContext {
  const facts = metricDefinitions.flatMap(({ key, label, unit }) => {
    const kpi = snapshot.kpis[key];
    return [
      { id: `${key}.value`, label, value: kpi.value, unit },
      { id: `${key}.comparisonValue`, label: `${label}（对比期）`, value: kpi.comparisonValue, unit },
    ];
  });
  const trendChanges = metricDefinitions.map(({ key, label }) => ({
    id: `${key}.changeRate`,
    label: `${label}变化率`,
    value: snapshot.kpis[key].changeRate,
    unit: 'ratio' as const,
  }));
  const contributors = [
    ...rankContributors(snapshot.categoryRanking.map(({ category: label, itemGmv }) => ({ label, itemGmv })), 'category'),
    ...rankContributors(snapshot.sellerRanking.map(({ sellerId: label, itemGmv }) => ({ label, itemGmv })), 'seller'),
    ...rankContributors(snapshot.customerStateRanking.map(({ customerState: label, itemGmv }) => ({ label, itemGmv })), 'customerState'),
  ].sort((left, right) => right.itemGmv - left.itemGmv
    || left.dimension.localeCompare(right.dimension)
    || left.label.localeCompare(right.label));

  return {
    ...(question ? { question: question.trim().slice(0, 500) } : {}),
    sourceLocalNow: snapshot.sourceLocalNow,
    filters: snapshot.filters,
    comparisonLabel: snapshot.comparisonLabel,
    facts,
    trendChanges,
    contributors,
  };
}

export function trustedNumberAllowList(context: PilotAnalysisContext) {
  return [
    ...context.facts.map(({ value, unit }) => ({ value, unit })),
    ...context.trendChanges.map(({ value, unit }) => ({ value, unit })),
    ...context.contributors.map(({ itemGmv }) => ({ value: itemGmv, unit: 'currency' as const })),
  ];
}
