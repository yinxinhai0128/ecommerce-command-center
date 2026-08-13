import type { AnalysisFallbackReason, AnalysisResult, FollowUpQuestion } from '../../src/domain/types';
import type { PilotAnalysisContext } from './contracts';

type QuestionKind = 'payment' | 'repeatBuyers' | 'lateDelivery' | 'lowReviews' | 'performance' | 'cancellation' | 'delivery' | 'reviews' | 'contributors' | 'general';

const asQuestion = (value: string) => value as FollowUpQuestion;
const direction = (value: number): 'up' | 'down' | 'flat' => value > 0 ? 'up' : value < 0 ? 'down' : 'flat';

function classifyQuestion(question: string): QuestionKind {
  const normalized = question.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  if (/支付|付款|信用卡|分期|payment/.test(normalized)) return 'payment';
  if (/复购|重复购买|回购|repeat/.test(normalized)) return 'repeatBuyers';
  if (/延迟|逾期|晚到|late/.test(normalized)) return 'lateDelivery';
  if (/低评分|低分|badreview/.test(normalized)) return 'lowReviews';
  if (/差评/.test(normalized)) return 'reviews';
  if (/取消|撤销|cancel/.test(normalized)) return 'cancellation';
  if (/配送|送达|物流|时效|履约|delivery|shipping/.test(normalized)) return 'delivery';
  if (/评价|评分|口碑|review|rating/.test(normalized)) return 'reviews';
  if (/贡献|品类|类目|类别|卖家|地区|区域|category|seller|contributor/.test(normalized)) return 'contributors';
  if (/成交|销售|订单|gmv|业绩|表现|performance/.test(normalized)) return 'performance';
  return 'general';
}

type ContributorDimension = PilotAnalysisContext['contributors'][number]['dimension'];
function contributorDimensions(question: string): ContributorDimension[] {
  const normalized = question.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  return [
    ...( /品类|类目|类别|category/.test(normalized) ? ['category' as const] : []),
    ...( /卖家|seller/.test(normalized) ? ['seller' as const] : []),
    ...( /地区|区域|state|region/.test(normalized) ? ['customerState' as const] : []),
  ];
}
function fact(context: PilotAnalysisContext, id: string) {
  const value = context.facts.find((item) => item.id === id);
  if (!value) throw new Error(`Missing trusted fact: ${id}`);
  return value;
}
function change(context: PilotAnalysisContext, id: string) { return context.trendChanges.find((item) => item.id === id)?.value ?? 0; }
function action(title: string, rationale: string, validationMetric: string): AnalysisResult['actions'][number] {
  return { priority: 'medium', title, rationale, ownerRole: '经营分析负责人', expectedImpact: '用可信快照持续验证经营变化', validationMetric };
}
function response(result: Pick<AnalysisResult, 'summary' | 'signals' | 'causes' | 'risks' | 'actions' | 'followUps'>, fallbackReason: AnalysisFallbackReason, now: () => Date): AnalysisResult {
  return { ...result, source: 'local', generatedAt: now().toISOString(), fallbackReason };
}

export function analyzeLocally(context: PilotAnalysisContext, question: string, fallbackReason: AnalysisFallbackReason, now: () => Date = () => new Date()): AnalysisResult {
  const kind = classifyQuestion(question);
  const itemGmv = fact(context, 'itemGmv.value');
  const orders = fact(context, 'validOrderCount.value');
  const cancellation = fact(context, 'cancellationRate.value');
  const delivery = fact(context, 'onTimeDeliveryRate.value');
  const deliveryDays = fact(context, 'averageDeliveryDays.value');
  const review = fact(context, 'averageReviewScore.value');
  const requestedDimensions = contributorDimensions(question);
  const contributors = requestedDimensions.length === 0 ? context.contributors : context.contributors.filter(({ dimension }) => requestedDimensions.includes(dimension));
  const topContributor = contributors[0] ?? context.contributors[0];

  if (kind === 'payment') {
    const payment = context.facts.find(({ id }) => id.startsWith('payments.byType.')) ?? fact(context, 'commerce.paymentAmount.value');
    return response({ summary: `当前${payment.label}为 ${payment.value}。`, signals: [{ label: payment.label, value: payment.value, direction: 'flat' }], causes: [], risks: [], actions: [action('核对支付结构', '按支付方式观察当前快照金额。', payment.label)], followUps: [asQuestion('还要查看不同分期的支付金额吗？')] }, fallbackReason, now);
  }
  if (kind === 'repeatBuyers') {
    const repeat = fact(context, 'commerce.repeatBuyerCount.value');
    return response({ summary: `当前复购买家数为 ${repeat.value}。`, signals: [{ label: repeat.label, value: repeat.value, direction: direction(change(context, 'commerce.repeatBuyerCount.changeRate')) }], causes: [], risks: [], actions: [action('跟踪复购买家', '持续观察复购买家数。', repeat.label)], followUps: [asQuestion('独立买家数是多少？')] }, fallbackReason, now);
  }
  if (kind === 'lateDelivery') {
    const late = fact(context, 'fulfillment.lateDeliveryRate');
    return response({ summary: `当前延迟送达率为 ${late.value}。`, signals: [{ label: late.label, value: late.value, direction: 'flat' }], causes: [], risks: late.value > 0 ? [{ severity: 'warning', title: '存在延迟送达', evidence: '延迟送达率来自当前可信快照。' }] : [], actions: [action('跟踪延迟送达', '持续观察延迟送达率。', late.label)], followUps: [asQuestion('平均延迟天数是多少？')] }, fallbackReason, now);
  }
  if (kind === 'lowReviews') {
    const low = fact(context, 'experience.lowScoreRate');
    return response({ summary: `当前低评分率为 ${low.value}。`, signals: [{ label: low.label, value: low.value, direction: 'flat' }], causes: [], risks: low.value > 0 ? [{ severity: 'warning', title: '存在低评分订单', evidence: '低评分率来自当前可信快照。' }] : [], actions: [action('跟踪低评分', '持续观察低评分率。', low.label)], followUps: [asQuestion('平均回复天数是多少？')] }, fallbackReason, now);
  }
  if (kind === 'cancellation') return response({ summary: `当前取消率为 ${cancellation.value}，对比期为 ${fact(context, 'cancellationRate.comparisonValue').value}。`, signals: [{ label: cancellation.label, value: cancellation.value, direction: direction(change(context, 'cancellationRate.changeRate')) }], causes: [], risks: [], actions: [action('复盘取消订单', '按快照跟踪取消率。', cancellation.label)], followUps: [asQuestion('哪些卖家贡献最大？')] }, fallbackReason, now);
  if (kind === 'delivery') return response({ summary: `当前准时送达率为 ${delivery.value}，平均配送天数为 ${deliveryDays.value}。`, signals: [{ label: delivery.label, value: delivery.value, direction: direction(change(context, 'onTimeDeliveryRate.changeRate')) }, { label: deliveryDays.label, value: deliveryDays.value, direction: direction(change(context, 'averageDeliveryDays.changeRate')) }], causes: [], risks: [], actions: [action('检查配送链路', '持续观察配送事实。', delivery.label)], followUps: [asQuestion('哪些地区的配送时效需要改善？')] }, fallbackReason, now);
  if (kind === 'reviews') return response({ summary: `当前平均评分为 ${review.value}，对比期为 ${fact(context, 'averageReviewScore.comparisonValue').value}。`, signals: [{ label: review.label, value: review.value, direction: direction(change(context, 'averageReviewScore.changeRate')) }], causes: [], risks: [], actions: [action('跟踪评分', '持续观察平均评分。', review.label)], followUps: [asQuestion('评分变化是否与配送时效有关？')] }, fallbackReason, now);
  if (kind === 'contributors') return response({ summary: topContributor ? `主要贡献来自${contributors.slice(0, 12).map(({ label, itemGmv }) => `${label}，成交额为 ${itemGmv}`).join('；')}。` : '当前快照没有可用的贡献者排行。', signals: [{ label: '主要贡献', value: topContributor?.itemGmv ?? itemGmv.value, direction: 'flat' }], causes: contributors.slice(0, 12).map(({ label, itemGmv, dimension }) => ({ label, contribution: itemGmv, evidence: `${dimension} 维度成交额来自可信快照。` })), risks: [], actions: [action('跟踪主要贡献者', '观察头部贡献者的成交贡献。', '主要贡献者成交额')], followUps: [asQuestion('头部贡献是否集中在少数卖家？')] }, fallbackReason, now);
  if (kind === 'performance') return response({ summary: `当前成交额为 ${itemGmv.value}，有效订单数为 ${orders.value}。`, signals: [{ label: itemGmv.label, value: itemGmv.value, direction: direction(change(context, 'itemGmv.changeRate')) }, { label: orders.label, value: orders.value, direction: direction(change(context, 'validOrderCount.changeRate')) }], causes: topContributor ? [{ label: topContributor.label, contribution: topContributor.itemGmv, evidence: '主要贡献来自可信快照排行。' }] : [], risks: [], actions: [action('跟踪成交表现', '结合订单量观察成交变化。', itemGmv.label)], followUps: [asQuestion('成交额变化主要由哪些贡献者驱动？')] }, fallbackReason, now);
  return response({ summary: `经营概览：成交额 ${itemGmv.value}，取消率 ${cancellation.value}，准时送达率 ${delivery.value}，平均评分 ${review.value}。`, signals: [{ label: '经营概览', value: itemGmv.value, direction: direction(change(context, 'itemGmv.changeRate')) }], causes: topContributor ? [{ label: topContributor.label, contribution: topContributor.itemGmv, evidence: '主要贡献来自可信快照排行。' }] : [], risks: [], actions: [action('持续经营诊断', '按成交、取消、配送和评价维度跟进。', '核心经营指标')], followUps: [asQuestion('你想继续查看成交、取消、配送还是评价？')] }, fallbackReason, now);
}
