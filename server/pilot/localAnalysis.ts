import type { AnalysisFallbackReason, FollowUpQuestion } from '../../src/domain/types';
import type { PilotAnalysisContext, PilotAnalysisResult } from './contracts';

type QuestionKind = 'payment' | 'repeatBuyers' | 'lateDelivery' | 'lowReviews' | 'performance' | 'cancellation' | 'delivery' | 'reviews' | 'contributors' | 'general';

const asQuestion = (value: string) => value as FollowUpQuestion;
const direction = (value: number): 'up' | 'down' | 'flat' => value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
const paymentTypeAliases: Record<string, string[]> = {
  credit_card: ['信用卡', 'credit card', 'credit_card'],
  boleto: ['票据', 'boleto'],
  voucher: ['代金券', 'voucher'],
  debit_card: ['借记卡', 'debit card', 'debit_card'],
};

function classifyQuestion(question: string): QuestionKind {
  const normalized = question.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  if (/支付|付款|分期|payment/.test(normalized) || Object.values(paymentTypeAliases).flat().some((alias) => normalized.includes(alias.replace(/\s+/g, '')))) return 'payment';
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
type TrustedFact = PilotAnalysisContext['facts'][number];
type Contributor = PilotAnalysisContext['contributors'][number];
function change(context: PilotAnalysisContext, id: string) { return context.trendChanges.find((item) => item.id === id)?.value ?? 0; }
function signal(item: TrustedFact, itemDirection: 'up' | 'down' | 'flat'): PilotAnalysisResult['signals'][number] {
  return { factId: item.id, label: item.label, unit: item.unit, value: item.value, direction: itemDirection };
}
function contributorSignal(item: Contributor): PilotAnalysisResult['signals'][number] {
  return { factId: item.id, label: item.label, unit: 'currency', value: item.itemGmv, direction: 'flat' };
}
function action(title: string, rationale: string, validationMetric: string): PilotAnalysisResult['actions'][number] {
  return { priority: 'medium', title, rationale, ownerRole: '经营分析负责人', expectedImpact: '用可信快照持续验证经营变化', validationMetric };
}
function response(result: Pick<PilotAnalysisResult, 'summary' | 'signals' | 'causes' | 'risks' | 'actions' | 'followUps'>, fallbackReason: AnalysisFallbackReason, now: () => Date): PilotAnalysisResult {
  return { ...result, source: 'local', generatedAt: now().toISOString(), fallbackReason };
}

function unavailableResponse(summary: string, fallbackReason: AnalysisFallbackReason, now: () => Date): PilotAnalysisResult {
  return response({ summary, signals: [], causes: [], risks: [], actions: [], followUps: [asQuestion('还要查看成交、履约或评价情况吗？')] }, fallbackReason, now);
}

function includesToken(question: string, token: string) {
  const normalized = question.normalize('NFKC').toLowerCase();
  const wanted = token.normalize('NFKC').toLowerCase();
  const index = normalized.indexOf(wanted);
  if (index < 0) return false;
  const word = /[a-z0-9_]/i;
  return !word.test(normalized[index - 1] ?? '') && !word.test(normalized[index + wanted.length] ?? '');
}

function paymentFact(context: PilotAnalysisContext, question: string) {
  const paymentTypes = context.facts.filter(({ id }) => id.startsWith('payments.byType.'));
  const matchedPaymentType = Object.entries(paymentTypeAliases)
    .find(([, aliases]) => aliases.some((alias) => includesToken(question, alias)))?.[0];
  const matchedType = matchedPaymentType
    ? paymentTypes.find(({ id }) => id === `payments.byType.${matchedPaymentType}.paymentAmount`)
    : undefined;
  if (matchedType) return matchedType;
  const installments = /(?:^|\D)(\d+)\s*期(?:\D|$)/u.exec(question.normalize('NFKC'))?.[1];
  const matchedInstallment = installments
    ? context.facts.find(({ id }) => id === `payments.installments.${installments}.paymentAmount`)
    : undefined;
  return matchedInstallment ?? [...paymentTypes].sort((left, right) => right.value - left.value)[0] ?? fact(context, 'commerce.paymentAmount.value');
}

export function analyzeLocally(context: PilotAnalysisContext, question: string, fallbackReason: AnalysisFallbackReason, now: () => Date = () => new Date()): PilotAnalysisResult {
  const kind = classifyQuestion(question);
  const itemGmv = fact(context, 'itemGmv.value');
  const orders = fact(context, 'validOrderCount.value');
  const cancellation = context.facts.find(({ id }) => id === 'cancellationRate.value');
  const delivery = context.facts.find(({ id }) => id === 'onTimeDeliveryRate.value');
  const deliveryDays = context.facts.find(({ id }) => id === 'averageDeliveryDays.value');
  const review = fact(context, 'averageReviewScore.value');
  const requestedDimensions = contributorDimensions(question);
  const contributors = requestedDimensions.length === 0 ? context.contributors : context.contributors.filter(({ dimension }) => requestedDimensions.includes(dimension));
  const topContributor = contributors[0] ?? context.contributors[0];

  if (kind === 'payment') {
    if (!context.facts.some(({ id }) => id.startsWith('payments.') || id === 'commerce.paymentAmount.value')) {
      return unavailableResponse('当前快照的支付发生时间不可判定，暂不展示支付金额或支付构成。', fallbackReason, now);
    }
    const payment = paymentFact(context, question);
    return response({ summary: `当前${payment.label}为 ${payment.value}。`, signals: [signal(payment, 'flat')], causes: [], risks: [], actions: [action('核对支付结构', '按支付方式观察当前快照金额。', payment.label)], followUps: [asQuestion('还要查看不同分期的支付金额吗？')] }, fallbackReason, now);
  }
  if (kind === 'repeatBuyers') {
    const repeat = fact(context, 'commerce.repeatBuyerCount.value');
    return response({ summary: `当前复购买家数为 ${repeat.value}。`, signals: [signal(repeat, direction(change(context, 'commerce.repeatBuyerCount.changeRate')))], causes: [], risks: [], actions: [action('跟踪复购买家', '持续观察复购买家数。', repeat.label)], followUps: [asQuestion('独立买家数是多少？')] }, fallbackReason, now);
  }
  if (kind === 'lateDelivery') {
    if (!delivery || !deliveryDays) return unavailableResponse('当前快照没有已送达订单，配送时效不可判定。', fallbackReason, now);
    const late = fact(context, 'fulfillment.lateDeliveryRate');
    return response({ summary: `当前延迟送达率为 ${late.value}。`, signals: [signal(late, 'flat')], causes: [], risks: late.value > 0 ? [{ severity: 'warning', title: '存在延迟送达', evidence: '延迟送达率来自当前可信快照。' }] : [], actions: [action('跟踪延迟送达', '持续观察延迟送达率。', late.label)], followUps: [asQuestion('平均延迟天数是多少？')] }, fallbackReason, now);
  }
  if (kind === 'lowReviews') {
    const low = fact(context, 'experience.lowScoreRate');
    return response({ summary: `当前低评分率为 ${low.value}。`, signals: [signal(low, 'flat')], causes: [], risks: low.value > 0 ? [{ severity: 'warning', title: '存在低评分订单', evidence: '低评分率来自当前可信快照。' }] : [], actions: [action('跟踪低评分', '持续观察低评分率。', low.label)], followUps: [asQuestion('平均回复天数是多少？')] }, fallbackReason, now);
  }
  if (kind === 'cancellation') {
    if (!cancellation) return unavailableResponse('当前快照的取消状态发生时间不可判定，暂不展示取消率。', fallbackReason, now);
    return response({ summary: `当前取消率为 ${cancellation.value}，对比期为 ${fact(context, 'cancellationRate.comparisonValue').value}。`, signals: [signal(cancellation, direction(change(context, 'cancellationRate.changeRate')))], causes: [], risks: [], actions: [action('复盘取消订单', '按快照跟踪取消率。', cancellation.label)], followUps: [asQuestion('哪些卖家贡献最大？')] }, fallbackReason, now);
  }
  if (kind === 'delivery') {
    if (!delivery || !deliveryDays) return unavailableResponse('当前快照没有已送达订单，配送时效不可判定。', fallbackReason, now);
    return response({ summary: `当前准时送达率为 ${delivery.value}，平均配送天数为 ${deliveryDays.value}。`, signals: [signal(delivery, direction(change(context, 'onTimeDeliveryRate.changeRate'))), signal(deliveryDays, direction(change(context, 'averageDeliveryDays.changeRate')))], causes: [], risks: [], actions: [action('检查配送链路', '持续观察配送事实。', delivery.label)], followUps: [asQuestion('哪些地区的配送时效需要改善？')] }, fallbackReason, now);
  }
  if (kind === 'reviews') return response({ summary: `当前平均评分为 ${review.value}，对比期为 ${fact(context, 'averageReviewScore.comparisonValue').value}。`, signals: [signal(review, direction(change(context, 'averageReviewScore.changeRate')))], causes: [], risks: [], actions: [action('跟踪评分', '持续观察平均评分。', review.label)], followUps: [asQuestion('评分变化是否与配送时效有关？')] }, fallbackReason, now);
  if (kind === 'contributors') return response({ summary: topContributor ? `当前快照的贡献排行是${contributors.slice(0, 12).map(({ label, itemGmv }) => `${label}，成交额为 ${itemGmv}`).join('；')}。` : '当前快照没有可用的贡献者排行。', signals: contributors.length > 0 ? contributors.slice(0, 12).map(contributorSignal) : [signal(itemGmv, direction(change(context, 'itemGmv.changeRate')))], causes: [], risks: [], actions: [action('跟踪贡献排行', '观察当前快照中的头部贡献者。', topContributor?.label ?? itemGmv.label)], followUps: [asQuestion('头部贡献是否集中在少数卖家？')] }, fallbackReason, now);
  if (kind === 'performance') return response({ summary: `当前成交额为 ${itemGmv.value}，有效订单数为 ${orders.value}。`, signals: [signal(itemGmv, direction(change(context, 'itemGmv.changeRate'))), signal(orders, direction(change(context, 'validOrderCount.changeRate')))], causes: [], risks: [], actions: [action('跟踪成交表现', '结合订单量观察成交变化。', itemGmv.label)], followUps: [asQuestion('还要查看哪些贡献者的当前成交额？')] }, fallbackReason, now);
  const overviewSignals = [
    signal(itemGmv, direction(change(context, 'itemGmv.changeRate'))),
    ...(cancellation ? [signal(cancellation, direction(change(context, 'cancellationRate.changeRate')))] : []),
    ...(delivery ? [signal(delivery, direction(change(context, 'onTimeDeliveryRate.changeRate')))] : []),
    signal(review, direction(change(context, 'averageReviewScore.changeRate'))),
  ];
  const overview = [
    `成交额 ${itemGmv.value}`,
    ...(cancellation ? [`取消率 ${cancellation.value}`] : []),
    ...(delivery ? [`准时送达率 ${delivery.value}`] : []),
    `平均评分 ${review.value}`,
  ];
  return response({ summary: `经营概览：${overview.join('，')}。`, signals: overviewSignals, causes: [], risks: [], actions: [action('持续经营诊断', '按当前可用经营事实跟进。', itemGmv.label)], followUps: [asQuestion('你想继续查看成交、取消、配送还是评价？')] }, fallbackReason, now);
}
