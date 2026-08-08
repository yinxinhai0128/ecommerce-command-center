import type { AnalysisFallbackReason, AnalysisResult } from '../../src/domain/types';
import type { RequestAnalysisContext } from './schema';

const percentage = (value: number) => String(Math.round(value * 1_000) / 10);

const metricTitle = (metric: RequestAnalysisContext['alerts'][number]['metric']) => ({
  refundRate: '退款率',
  conversionRate: '转化率',
  targetAchievementRate: '目标达成率',
  inventoryDays: '库存天数',
}[metric]);

export function createLocalAnalysis(
  context: RequestAnalysisContext,
  fallbackReason: AnalysisFallbackReason,
  now: () => Date,
): AnalysisResult {
  const refundEvidence = `退款率为 ${percentage(context.kpis.refundRate.value)}%`;
  const alertSignals = context.alerts.map(({ metric, evidence }) => ({ title: metricTitle(metric), evidence }));
  const contributor = context.topContributors.products[0] ?? context.topContributors.channels[0] ?? context.topContributors.regions[0];
  const signals = [
    ...alertSignals,
    ...(contributor ? [{ title: '主要贡献', evidence: `${contributor.label}贡献 ${contributor.value}` }] : []),
  ];

  if (signals.length === 0) {
    signals.push({ title: 'GMV', evidence: `GMV为 ${context.kpis.gmv.value}` });
  }

  const causes = context.alerts.map(({ title, evidence }) => ({ title, evidence }));
  const risks = context.alerts.map(({ title, evidence }) => ({ title, evidence }));
  if (context.alerts.length === 0 && context.targetProbability < 0.8) {
    risks.push({ title: '目标达成风险', evidence: `目标达成概率为 ${percentage(context.targetProbability)}%` });
  }
  if (context.alerts.length === 0 && context.kpis.refundRate.value >= 0.05) {
    risks.push({ title: '退款风险', evidence: refundEvidence });
  }

  const refundAlert = context.alerts.find((alert) => alert.metric === 'refundRate');
  const actions = refundAlert
    ? [{ title: '复盘退款原因', rationale: `${refundEvidence}，预警提示：${refundAlert.evidence}。` }]
    : context.targetProbability < 0.8
      ? [{ title: '提升目标达成', rationale: `目标达成概率为 ${percentage(context.targetProbability)}%，需跟进未来 7 天预测。` }]
      : [{ title: '跟进主要贡献项', rationale: contributor ? `${contributor.label}当前贡献 ${contributor.value}，应持续跟踪。` : `GMV为 ${context.kpis.gmv.value}，应持续跟踪。` }];

  return {
    summary: context.alerts.length > 0
      ? `发现 ${context.alerts.length} 项经营预警，${context.alerts[0].title}需优先处理。`
      : `当前 GMV为 ${context.kpis.gmv.value}，目标达成概率为 ${percentage(context.targetProbability)}%。`,
    signals,
    causes,
    risks,
    actions,
    followUps: context.alerts.length > 0 ? context.alerts.map((alert) => `跟进：${alert.suggestion}`) : ['跟进未来 7 天 GMV 预测'],
    source: 'local',
    generatedAt: now().toISOString(),
    fallbackReason,
  };
}
