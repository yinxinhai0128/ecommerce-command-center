import type { AnalysisFallbackReason, AnalysisResult, FollowUpQuestion } from '../../src/domain/types';
import type { RequestAnalysisContext } from './schema';

const percentage = (value: number) => String(Math.round(value * 1_000) / 10);
const limit = <T>(items: T[]) => items.slice(0, 12);
const truncate = (value: string) => value.trim().slice(0, 1_000);
const question = (value: string): FollowUpQuestion => `${truncate(value).slice(0, 999).replace(/[？?]+$/, '')}？` as FollowUpQuestion;
const direction = (value: number): 'up' | 'down' | 'flat' => value > 0 ? 'up' : value < 0 ? 'down' : 'flat';

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
  const alertSignals = limit(context.alerts).map((alert) => {
    if (alert.metric === 'inventoryDays') {
      return { label: metricTitle(alert.metric), value: alert.impactAmount, direction: 'flat' as const };
    }
    const kpi = context.kpis[alert.metric];
    return { label: metricTitle(alert.metric), value: kpi.value, direction: direction(kpi.changeRate) };
  });
  const contributor = context.topContributors.products[0] ?? context.topContributors.channels[0] ?? context.topContributors.regions[0];
  const signals = limit([
    ...alertSignals,
    ...(contributor ? [{ label: '主要贡献', value: contributor.value, direction: 'flat' as const }] : []),
  ]);

  if (signals.length === 0) {
    signals.push({ label: 'GMV', value: context.kpis.gmv.value, direction: direction(context.kpis.gmv.changeRate) });
  }

  const causes = limit(context.alerts).map(({ title, impactAmount, evidence }) => ({ label: truncate(title), contribution: impactAmount, evidence: truncate(evidence) }));
  if (causes.length === 0) {
    const contributors = [
      context.topContributors.products[0],
      context.topContributors.channels[0],
      context.topContributors.regions[0],
    ].filter((item): item is { label: string; value: number } => item !== undefined);
    causes.push(...contributors.map((item) => ({
      label: truncate(item.label),
      contribution: item.value,
      evidence: truncate(`${item.label} 当前贡献 ${item.value}`),
    })));
  }
  const risks = limit(context.alerts).map(({ severity, title, evidence }) => ({ severity, title: truncate(title), evidence: truncate(evidence) }));
  if (context.alerts.length === 0 && context.targetProbability < 0.8) {
    risks.push({ severity: 'warning', title: '目标达成风险', evidence: `目标达成概率为 ${percentage(context.targetProbability)}%` });
  }
  if (context.alerts.length === 0 && context.kpis.refundRate.value >= 0.05) {
    risks.push({ severity: 'warning', title: '退款风险', evidence: refundEvidence });
  }

  const refundAlert = context.alerts.find((alert) => alert.metric === 'refundRate');
  const actions = refundAlert
    ? [{
      priority: 'high' as const,
      title: '复盘退款原因',
      rationale: truncate(`${refundEvidence}，预警提示：${refundAlert.evidence}。`),
      ownerRole: '商品运营负责人',
      expectedImpact: '降低退款损失并改善净销售额',
      validationMetric: '未来 7 天退款率及退款金额',
    }]
    : context.targetProbability < 0.8
      ? [{
        priority: 'high' as const,
        title: '提升目标达成',
        rationale: truncate(`目标达成概率为 ${percentage(context.targetProbability)}%，需跟进未来 7 天预测。`),
        ownerRole: '经营负责人',
        expectedImpact: '提升目标达成概率',
        validationMetric: '未来 7 天目标达成概率与 GMV',
      }]
      : [{
        priority: 'medium' as const,
        title: '跟进主要贡献项',
        rationale: truncate(contributor ? `${contributor.label}当前贡献 ${contributor.value}，应持续跟踪。` : `GMV为 ${context.kpis.gmv.value}，应持续跟踪。`),
        ownerRole: '经营分析负责人',
        expectedImpact: '保持主要增长来源稳定贡献',
        validationMetric: '未来 7 天主要贡献项与 GMV',
      }];

  return {
    summary: truncate(context.alerts.length > 0
      ? `发现 ${context.alerts.length} 项经营预警，${context.alerts[0].title}需优先处理。`
      : `当前 GMV为 ${context.kpis.gmv.value}，目标达成概率为 ${percentage(context.targetProbability)}%。`),
    signals,
    causes,
    risks,
    actions,
    followUps: context.alerts.length > 0 ? limit(context.alerts).map((alert) => question(`如何执行${alert.suggestion}`)) : [question('如何跟进未来 7 天 GMV 预测')],
    source: 'local',
    generatedAt: now().toISOString(),
    fallbackReason,
  };
}
