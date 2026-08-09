import type { AnalysisFallbackReason, AnalysisResult, FollowUpQuestion } from '../../src/domain/types';
import type { PilotAnalysisContext } from './contracts';

type QuestionKind = 'performance' | 'cancellation' | 'delivery' | 'reviews' | 'contributors' | 'general';

const asQuestion = (value: string) => value as FollowUpQuestion;
const direction = (value: number): 'up' | 'down' | 'flat' => value > 0 ? 'up' : value < 0 ? 'down' : 'flat';

function classifyQuestion(question: string): QuestionKind {
  const normalized = question.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  if (/取消|撤销|cancel/.test(normalized)) return 'cancellation';
  if (/配送|送达|物流|时效|履约|delivery|shipping/.test(normalized)) return 'delivery';
  if (/评价|评分|口碑|差评|review|rating/.test(normalized)) return 'reviews';
  if (/贡献|品类|类目|类别|卖家|州|地区|区域|category|seller|contributor/.test(normalized)) return 'contributors';
  if (/成交|销售|订单|gmv|业绩|表现|performance/.test(normalized)) return 'performance';
  return 'general';
}

function contributorDimension(question: string): PilotAnalysisContext['contributors'][number]['dimension'] | undefined {
  const normalized = question.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  if (/卖家|seller/.test(normalized)) return 'seller';
  if (/品类|类目|类别|category/.test(normalized)) return 'category';
  if (/地区|州|区域|state|region/.test(normalized)) return 'customerState';
  return undefined;
}

function fact(context: PilotAnalysisContext, id: string) {
  const value = context.facts.find((item) => item.id === id);
  if (!value) throw new Error(`Missing trusted fact: ${id}`);
  return value;
}

function change(context: PilotAnalysisContext, id: string) {
  return context.trendChanges.find((item) => item.id === id)?.value ?? 0;
}

function action(title: string, rationale: string, validationMetric: string): AnalysisResult['actions'][number] {
  return {
    priority: 'medium',
    title,
    rationale,
    ownerRole: '经营分析负责人',
    expectedImpact: '用可信快照持续验证经营变化',
    validationMetric,
  };
}

export function analyzeLocally(
  context: PilotAnalysisContext,
  question: string,
  fallbackReason: AnalysisFallbackReason,
  now: () => Date = () => new Date(),
): AnalysisResult {
  const kind = classifyQuestion(question);
  const itemGmv = fact(context, 'itemGmv.value');
  const orderCount = fact(context, 'validOrderCount.value');
  const cancellationRate = fact(context, 'cancellationRate.value');
  const deliveryRate = fact(context, 'onTimeDeliveryRate.value');
  const deliveryDays = fact(context, 'averageDeliveryDays.value');
  const reviewScore = fact(context, 'averageReviewScore.value');
  const topContributor = context.contributors[0];
  const requestedDimension = contributorDimension(question);
  const relevantContributors = requestedDimension
    ? context.contributors.filter(({ dimension }) => dimension === requestedDimension)
    : context.contributors;
  const relevantTopContributor = relevantContributors[0];

  let result: Pick<AnalysisResult, 'summary' | 'signals' | 'causes' | 'risks' | 'actions' | 'followUps'>;
  switch (kind) {
    case 'cancellation':
      result = {
        summary: `当前取消率为 ${cancellationRate.value}，对比期为 ${fact(context, 'cancellationRate.comparisonValue').value}。`,
        signals: [{ label: '取消率', value: cancellationRate.value, direction: direction(change(context, 'cancellationRate.changeRate')) }],
        causes: [{ label: '取消率变化', contribution: change(context, 'cancellationRate.changeRate'), evidence: `取消率证据来自 ${context.sourceLocalNow} 快照。` }],
        risks: change(context, 'cancellationRate.changeRate') > 0
          ? [{ severity: 'warning', title: '取消率上升', evidence: `取消率较 ${context.comparisonLabel} 上升。` }]
          : [],
        actions: [action('复盘取消订单', '按商品、卖家和地区定位取消率变化。', '下一周期取消率')],
        followUps: [asQuestion('哪些卖家带来的取消率变化最大？')],
      };
      break;
    case 'delivery':
      result = {
        summary: `当前准时送达率为 ${deliveryRate.value}，平均配送天数为 ${deliveryDays.value}。`,
        signals: [
          { label: '准时送达率', value: deliveryRate.value, direction: direction(change(context, 'onTimeDeliveryRate.changeRate')) },
          { label: '平均配送天数', value: deliveryDays.value, direction: direction(change(context, 'averageDeliveryDays.changeRate')) },
        ],
        causes: [],
        risks: change(context, 'onTimeDeliveryRate.changeRate') < 0
          ? [{ severity: 'warning', title: '配送时效下降', evidence: `准时送达率较 ${context.comparisonLabel} 下降。` }]
          : [],
        actions: [action('检查配送链路', '跟进准时送达率与平均配送天数。', '下一周期准时送达率')],
        followUps: [asQuestion('哪些地区的配送时效最需要改善？')],
      };
      break;
    case 'reviews':
      result = {
        summary: `当前平均评分为 ${reviewScore.value}，对比期为 ${fact(context, 'averageReviewScore.comparisonValue').value}。`,
        signals: [{ label: '平均评分', value: reviewScore.value, direction: direction(change(context, 'averageReviewScore.changeRate')) }],
        causes: [],
        risks: change(context, 'averageReviewScore.changeRate') < 0
          ? [{ severity: 'warning', title: '评分下降', evidence: `平均评分较 ${context.comparisonLabel} 下降。` }]
          : [],
        actions: [action('跟进低评分订单', '结合配送与卖家维度复盘评分变化。', '下一周期平均评分')],
        followUps: [asQuestion('评分变化是否与配送时效有关？')],
      };
      break;
    case 'contributors':
      result = {
        summary: relevantTopContributor
          ? `主要贡献来自${relevantTopContributor.label}，成交额为 ${relevantTopContributor.itemGmv}。`
          : '当前快照没有可用的贡献者排行。',
        signals: [{
          label: '主要贡献',
          value: relevantTopContributor?.itemGmv ?? itemGmv.value,
          direction: 'flat',
        }],
        causes: relevantContributors.slice(0, 12).map((contributor) => ({
          label: contributor.label,
          contribution: contributor.itemGmv,
          evidence: `${contributor.dimension} 维度成交额来自可信快照。`,
        })),
        risks: [],
        actions: [action('跟进主要贡献者', '观察头部品类、卖家和地区的成交贡献。', '下一周期主要贡献者成交额')],
        followUps: [asQuestion('头部贡献是否集中在少数卖家？')],
      };
      break;
    case 'performance':
      result = {
        summary: `当前成交额为 ${itemGmv.value}，有效订单数为 ${orderCount.value}。`,
        signals: [
          { label: '成交额', value: itemGmv.value, direction: direction(change(context, 'itemGmv.changeRate')) },
          { label: '有效订单数', value: orderCount.value, direction: direction(change(context, 'validOrderCount.changeRate')) },
        ],
        causes: topContributor ? [{ label: topContributor.label, contribution: topContributor.itemGmv, evidence: '主要贡献来自可信快照排行。' }] : [],
        risks: [],
        actions: [action('跟进成交表现', '结合订单量和主要贡献者检查成交变化。', '下一周期成交额和有效订单数')],
        followUps: [asQuestion('成交额变化主要由哪些贡献者驱动？')],
      };
      break;
    default:
      result = {
        summary: `经营概览：成交额 ${itemGmv.value}，取消率 ${cancellationRate.value}，准时送达率 ${deliveryRate.value}，平均评分 ${reviewScore.value}。`,
        signals: [{ label: '经营概览', value: itemGmv.value, direction: direction(change(context, 'itemGmv.changeRate')) }],
        causes: topContributor ? [{ label: topContributor.label, contribution: topContributor.itemGmv, evidence: '主要贡献来自可信快照排行。' }] : [],
        risks: [],
        actions: [action('持续经营诊断', '按成交、取消、配送和评价维度跟进。', '下一周期核心经营指标')],
        followUps: [asQuestion('你想继续查看成交、取消、配送还是评价？')],
      };
  }

  return {
    ...result,
    source: 'local',
    generatedAt: now().toISOString(),
    fallbackReason,
  };
}
