import type { AnalysisContext, DashboardAlert, DashboardFilters, DashboardSnapshot } from '../domain/types';

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
      ...(filters.storeId ? { storeId: filters.storeId } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    },
    comparisonLabel: snapshot.comparisonLabel,
    kpis: snapshot.kpis,
    topContributors: {
      channels: snapshot.channelRanking.slice(0, 4).map(({ platform, gmv }) => ({ label: platform, value: gmv })),
      products: snapshot.productRanking.slice(0, 5).map(({ name, gmv }) => ({ label: name, value: gmv })),
      regions: snapshot.regionRanking.slice(0, 4).map(({ region, gmv }) => ({ label: region, value: gmv })),
    },
    alerts: alerts.slice(0, 10).map(({ severity, metric, title, evidence, impactAmount, suggestion }) => ({
      severity,
      metric,
      title,
      evidence,
      impactAmount,
      suggestion,
    })),
    forecast7d: snapshot.forecast7d.slice(0, 7),
    targetProbability: snapshot.targetProbability,
  };
}
