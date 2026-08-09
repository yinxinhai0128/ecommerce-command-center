import type { AnalysisContext, DashboardAlert, DashboardFilters, DashboardSnapshot } from '../domain/types';

const MAX_CONTEXT_TEXT_LENGTH = 80;

function truncateContextText(value: string): string {
  return value.slice(0, MAX_CONTEXT_TEXT_LENGTH);
}

export function buildAnalysisContext(
  snapshot: DashboardSnapshot,
  alerts: DashboardAlert[],
  filters: DashboardFilters,
): AnalysisContext {
  return {
    range: {
      start: filters.start.toISOString(),
      end: filters.end.toISOString(),
      ...(filters.platform ? { platform: filters.platform } : {}),
      ...(filters.storeId ? { storeId: truncateContextText(filters.storeId) } : {}),
      ...(filters.categoryId ? { categoryId: truncateContextText(filters.categoryId) } : {}),
    },
    comparisonLabel: truncateContextText(snapshot.comparisonLabel),
    kpis: snapshot.kpis,
    topContributors: {
      channels: snapshot.channelRanking.slice(0, 4).map(({ channel, attributedRevenue, spend }) => ({ label: channel, attributedRevenue, spend })),
      products: snapshot.productRanking.slice(0, 5).map(({ name, gmv }) => ({ label: truncateContextText(name), value: gmv })),
      regions: snapshot.regionRanking.slice(0, 4).map(({ region, gmv }) => ({ label: truncateContextText(region), value: gmv })),
    },
    alerts: alerts.slice(0, 10).map(({ severity, metric, title, evidence, impactAmount, suggestion }) => ({
      severity,
      metric,
      title: truncateContextText(title),
      evidence: truncateContextText(evidence),
      impactAmount,
      suggestion: truncateContextText(suggestion),
    })),
    forecast7d: snapshot.forecast7d.slice(0, 7).map(({ date, gmv }) => ({ date: truncateContextText(date), gmv })),
    targetProbability: snapshot.targetProbability,
  };
}
