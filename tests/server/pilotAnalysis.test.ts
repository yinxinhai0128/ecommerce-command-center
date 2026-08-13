import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createApp } from '../../server/index';
import { buildPilotAnalysisContext, trustedEvidenceAllowList } from '../../server/pilot/analysisContext';
import { pilotModelAnalysisSchema } from '../../server/pilot/analysisSchema';
import { hasOnlyTrustedNumbers, requestPilotDeepSeekAnalysis } from '../../server/pilot/deepseekAnalysis';
import { createPilotSchema, openPilotDatabase } from '../../server/pilot/database';
import { analyzeLocally } from '../../server/pilot/localAnalysis';
import { resolveOlistPaths } from '../../server/pilot/paths';
import type { PilotSnapshot } from '../../server/pilot/contracts';

const directories: string[] = [];
const applications: Array<ReturnType<typeof createApp>> = [];

const filters = { start: '2018-01-01', end: '2018-01-31' };

const snapshot: PilotSnapshot = {
  filters,
  sourceLocalNow: '2018-01-31 00:00:00',
  comparisonLabel: '2017-12-01 to 2017-12-31',
  kpis: {
    itemGmv: { value: 490, comparisonValue: 400, changeRate: 0.225 },
    validOrderCount: { value: 10, comparisonValue: 8, changeRate: 0.25 },
    averageOrderValue: { value: 49, comparisonValue: 50, changeRate: -0.02 },
    cancellationRate: { value: 0.1, comparisonValue: 0.05, changeRate: 1 },
    onTimeDeliveryRate: { value: 0.8, comparisonValue: 0.9, changeRate: -0.1111 },
    averageDeliveryDays: { value: 4.5, comparisonValue: 4, changeRate: 0.125 },
    averageReviewScore: { value: 3.8, comparisonValue: 4.1, changeRate: -0.0732 },
  },
  dailyTrend: [],
  fulfillmentFunnel: [
    { stage: 'purchased', value: 12 },
    { stage: 'approved', value: 11 },
    { stage: 'carrier', value: 10 },
    { stage: 'delivered', value: 9 },
  ],
  categoryRanking: [{ category: 'books', itemGmv: 300 }],
  sellerRanking: [{ sellerId: 'seller-1', itemGmv: 250 }],
  customerStateRanking: [{ customerState: 'SP', itemGmv: 350 }],
  recentOrders: [],
  capabilities: [],
  commerce: {
    paymentAmount: { value: 575, comparisonValue: 500, changeRate: 0.15 },
    uniqueBuyerCount: { value: 8, comparisonValue: 7, changeRate: 0.1429 },
    repeatBuyerCount: { value: 2, comparisonValue: 1, changeRate: 1 },
  },
  payments: {
    byType: [{ paymentType: 'credit_card', paymentAmount: 420 }, { paymentType: 'boleto', paymentAmount: 155 }],
    installments: [{ installments: 1, paymentAmount: 155 }, { installments: 3, paymentAmount: 420 }],
  },
  fulfillment: {
    statusDistribution: [{ status: 'delivered', value: 8 }, { status: 'carrier', value: 2 }],
    averageApprovalDays: 0.5, averageCarrierDays: 1,
    averageDeliveryDays: 4.5, lateDeliveryRate: 0.25, averageLateDays: 2,
  },
  experience: {
    scoreDistribution: [{ score: 1, value: 2 }, { score: 5, value: 8 }],
    lowScoreRate: 0.2,
    averageReplyDays: 1.5,
  },
  contributions: {
    categories: [{ category: 'books', label: 'Books', itemGmv: 300, itemCount: 6 }],
    sellers: [{ sellerId: 'seller-1', itemGmv: 250, validOrderCount: 5 }],
    customerStates: [{ customerState: 'SP', itemGmv: 350, validOrderCount: 7 }],
  },
};

afterEach(async () => {
  vi.useRealTimers();
  applications.splice(0).forEach((app) => app.dispose());
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

async function readyDataDirectory() {
  const dataDir = await mkdtemp(join(tmpdir(), 'olist-pilot-analysis-'));
  directories.push(dataDir);
  const paths = resolveOlistPaths(dataDir);
  const database = openPilotDatabase(paths.databasePath);
  createPilotSchema(database);
  database.prepare("INSERT INTO customers VALUES ('customer-1', 'unique-1', '01000', 'Sao Paulo', 'SP')").run();
  database.prepare("INSERT INTO customers VALUES ('customer-2', 'unique-1', '01000', 'Sao Paulo', 'SP')").run();
  database.prepare("INSERT INTO customers VALUES ('customer-3', 'unique-3', '01000', 'Sao Paulo', 'SP')").run();
  database.prepare("INSERT INTO sellers VALUES ('seller-1', '01000', 'Sao Paulo', 'SP')").run();
  database.prepare("INSERT INTO products VALUES ('product-1', 'books', NULL, NULL, NULL, NULL, NULL, NULL, NULL)").run();
  database.prepare("INSERT INTO orders VALUES ('order-1', 'customer-1', 'delivered', '2018-01-01 00:00:00', '2018-01-01 01:00:00', '2018-01-01 02:00:00', '2018-01-02 00:00:00', '2018-01-01 12:00:00')").run();
  database.prepare("INSERT INTO orders VALUES ('order-2', 'customer-2', 'delivered', '2018-01-10 00:00:00', '2018-01-10 01:00:00', '2018-01-10 02:00:00', '2018-01-11 00:00:00', '2018-01-12 00:00:00')").run();
  database.prepare("INSERT INTO orders VALUES ('order-3', 'customer-3', 'delivered', '2018-02-01 00:00:00', '2018-02-01 01:00:00', '2018-02-01 02:00:00', '2018-02-02 00:00:00', '2018-02-03 00:00:00')").run();
  database.prepare("INSERT INTO order_items VALUES ('order-1', 1, 'product-1', 'seller-1', '2018-01-01 02:00:00', 490, 0)").run();
  database.prepare("INSERT INTO order_items VALUES ('order-2', 1, 'product-1', 'seller-1', '2018-01-10 02:00:00', 0, 0)").run();
  database.prepare("INSERT INTO order_items VALUES ('order-3', 1, 'product-1', 'seller-1', '2018-02-01 02:00:00', 500, 0)").run();
  database.prepare("INSERT INTO payments VALUES ('order-1', 1, 'credit_card', 3, 420)").run();
  database.prepare("INSERT INTO payments VALUES ('order-2', 1, 'boleto', 1, 155)").run();
  database.prepare("INSERT INTO payments VALUES ('order-3', 1, 'credit_card', 3, 500)").run();
  database.prepare("INSERT INTO reviews VALUES ('review-1', 'order-1', 1, NULL, NULL, '2018-01-03 00:00:00', '2018-01-03 12:00:00')").run();
  database.prepare("INSERT INTO reviews VALUES ('review-2', 'order-2', 5, NULL, NULL, '2018-01-12 00:00:00', '2018-01-12 12:00:00')").run();
  database.close();
  await writeFile(paths.manifestPath, JSON.stringify({
    ready: true,
    importedAt: '2026-08-09T00:00:00.000Z',
    importerVersion: 1,
    source: { dataset: 'olistbr/brazilian-ecommerce', url: 'https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce', license: 'CC BY-NC-SA 4.0' },
    files: {},
    tables: {},
    range: { start: '2018-01-01 00:00:00', end: '2018-02-28 23:59:59' },
  }));
  return dataDir;
}

function modelResult(signalValue: number) {
  return {
    summary: '基于可信证据的分析。',
    signals: [{ factId: 'itemGmv.value', label: '成交额', unit: 'currency', value: signalValue, direction: 'up' }],
    causes: [{ factId: 'category:1', label: '品类：books', unit: 'currency', contribution: 490, evidence: '图书贡献来自可信快照。' }],
    risks: [],
    actions: [{
      priority: 'medium',
      title: '跟进成交额',
      rationale: '成交额需要持续观察。',
      ownerRole: '经营分析负责人',
      expectedImpact: '保持成交表现稳定',
      validationMetric: '下一周期成交额',
    }],
    followUps: ['哪些品类贡献最大？'],
  };
}

describe('Olist pilot trusted analysis', () => {
  test.each([
    ['把其他事实的数值冒充平均评分', '平均评分为 490。'],
    ['用全角数字隐藏陌生数值', '成交额为 １２３４５。'],
    ['用零宽字符拆分禁止指标', '毛\u200b利表现稳定。'],
    ['使用 forecasting 预测声明', 'Sales forecasting remains positive.'],
  ])('DeepSeek %s时使用 invalid_response 本地降级', async (_name, summary) => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ ...modelResult(490), summary }) } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const app = createApp({
      pilot: {
        dataDir: await readyDataDirectory(), fetchImpl, env: { DEEPSEEK_API_KEY: 'server-key' },
        now: () => new Date('2026-08-09T00:00:00.000Z'),
      },
    });
    applications.push(app);

    const response = await request(app).post('/api/pilot/analysis').send({ question: '表现如何？', filters });

    expect(response.body).toMatchObject({ source: 'local', fallbackReason: 'invalid_response' });
  });

  test('DeepSeek 文本中的数值与同一事实 label 和 value 一致时保留服务端分析', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ ...modelResult(490), summary: '成交额为 490。' }) } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const app = createApp({
      pilot: {
        dataDir: await readyDataDirectory(), fetchImpl, env: { DEEPSEEK_API_KEY: 'server-key' },
        now: () => new Date('2026-08-09T00:00:00.000Z'),
      },
    });
    applications.push(app);

    const response = await request(app).post('/api/pilot/analysis').send({ question: '成交额如何？', filters });

    expect(response.body).toMatchObject({ source: 'deepseek', summary: '成交额为 490。' });
  });

  test.each([
    ['summary 中的陌生预测数值', { summary: '预计明日销售 123456789。' }],
    ['risk 中的禁止指标', { risks: [{ severity: 'warning', title: '毛利率风险', evidence: '毛利率为 30%。' }] }],
    ['action 中的陌生目标数值', { actions: [{ ...modelResult(490).actions[0], expectedImpact: '目标提升到 123456789。' }] }],
  ])('DeepSeek %s时使用 invalid_response 本地降级', async (_name, changed) => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ ...modelResult(490), ...changed }) } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const app = createApp({
      pilot: {
        dataDir: await readyDataDirectory(), fetchImpl, env: { DEEPSEEK_API_KEY: 'server-key' },
        now: () => new Date('2026-08-09T00:00:00.000Z'),
      },
    });
    applications.push(app);

    const response = await request(app).post('/api/pilot/analysis').send({ question: '表现如何？', filters });

    expect(response.body).toMatchObject({ source: 'local', fallbackReason: 'invalid_response' });
    expect(JSON.stringify(response.body)).not.toMatch(/123456789|毛利率|30%/);
  });

  test.each([
    ['错误 factId', { factId: 'validOrderCount.value', label: '成交额', unit: 'currency', value: 490, direction: 'up' }],
    ['错误 unit', { factId: 'itemGmv.value', label: '成交额', unit: 'count', value: 490, direction: 'up' }],
  ])('DeepSeek 正确数值搭配%s时使用 invalid_response 本地降级', async (_name, signal) => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ ...modelResult(490), signals: [signal] }) } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const app = createApp({
      pilot: {
        dataDir: await readyDataDirectory(), fetchImpl, env: { DEEPSEEK_API_KEY: 'server-key' },
        now: () => new Date('2026-08-09T00:00:00.000Z'),
      },
    });
    applications.push(app);

    const response = await request(app).post('/api/pilot/analysis').send({ question: '表现如何？', filters });

    expect(response.body).toMatchObject({ source: 'local', fallbackReason: 'invalid_response' });
  });

  test.each([
    ['boleto 支付', 'boleto支付情况如何？', 'payments.byType.boleto.paymentAmount', '支付方式：boleto 支付金额', 155],
    ['3期支付', '3期分期支付情况如何？', 'payments.installments.3.paymentAmount', '分期：3期 支付金额', 420],
  ])('本地支付分析优先选择问题指定的%s事实', (_name, question, factId, label, value) => {
    const result = analyzeLocally(buildPilotAnalysisContext(snapshot), question, 'not_configured');

    expect(result.signals[0]).toMatchObject({ factId, label, unit: 'currency', value });
  });

  test.each([
    ['信用卡', '信用卡支付情况如何', 'payments.byType.credit_card.paymentAmount', '支付方式：credit_card 支付金额', 100],
    ['票据', '票据', 'payments.byType.boleto.paymentAmount', '支付方式：boleto 支付金额', 200],
  ])('本地支付分析只按已知中文别名选择%s事实', (_name, question, factId, label, value) => {
    const paymentSnapshot = {
      ...snapshot,
      payments: {
        ...snapshot.payments,
        byType: [
          { paymentType: 'boleto', paymentAmount: 200 },
          { paymentType: 'credit_card', paymentAmount: 100 },
        ],
      },
    };

    const result = analyzeLocally(buildPilotAnalysisContext(paymentSnapshot), question, 'not_configured');

    expect(result.signals[0]).toMatchObject({ factId, label, unit: 'currency', value });
  });

  test.each([
    ['贡献', '哪些品类和卖家贡献最大？'],
    ['整体', '请做一份整体诊断'],
    ['成交', '成交额和订单表现如何？'],
  ])('本地%s分析的 signals/causes 全部精确绑定 context 且不虚构因果', (_name, question) => {
    const context = buildPilotAnalysisContext(snapshot);
    const result = analyzeLocally(context, question, 'not_configured');
    const allowed = trustedEvidenceAllowList(context);

    for (const signal of result.signals) {
      expect(allowed.signals).toContainEqual(expect.objectContaining({
        id: signal.factId, label: signal.label, unit: signal.unit, value: signal.value,
      }));
    }
    for (const cause of result.causes) {
      expect(allowed.causes).toContainEqual(expect.objectContaining({
        id: cause.factId, label: cause.label, unit: cause.unit, value: cause.contribution,
      }));
    }
    expect(JSON.stringify(result)).not.toMatch(/原因|导致|造成/);
  });
  test('strict 请求边界拒绝浏览器 KPI 注入', async () => {
    const fetchImpl = vi.fn();
    const app = createApp({
      pilot: { dataDir: await readyDataDirectory(), fetchImpl, env: { DEEPSEEK_API_KEY: 'server-key' } },
    });
    applications.push(app);

    const response = await request(app).post('/api/pilot/analysis').send({
      question: '当前成交额表现如何？',
      filters,
      kpis: { itemGmv: { value: 999_999_999 } },
    });

    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('服务端从仓库重建证据并返回可信快照时间', async () => {
    const app = createApp({
      pilot: {
        dataDir: await readyDataDirectory(),
        env: {},
        now: () => new Date('2026-08-09T00:00:00.000Z'),
      },
    });
    applications.push(app);

    const response = await request(app).post('/api/pilot/analysis').send({ question: '当前成交额表现如何？', filters });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      source: 'local',
      fallbackReason: 'not_configured',
      metadata: { sourceLocalNow: '2018-01-31 00:00:00' },
    });
    expect(response.body.signals).toContainEqual(expect.objectContaining({ label: '成交额', value: 490 }));
  });

  test.each([
    ['支付构成', '信用卡支付构成如何？', '支付方式：credit_card 支付金额', 420],
    ['复购买家', '复购买家有多少？', '复购买家数', 1],
    ['延迟配送', '延迟送达情况如何？', '延迟送达率', 0.5],
    ['低评分', '低评分订单多吗？', '低评分率', 0.5],
  ])('分析接口将%s问题绑定到本请求快照事实', async (_name, question, label, value) => {
    const app = createApp({
      pilot: { dataDir: await readyDataDirectory(), env: {}, now: () => new Date('2026-08-09T00:00:00.000Z') },
    });
    applications.push(app);

    const response = await request(app).post('/api/pilot/analysis').send({ question, filters });

    expect(response.status).toBe(200);
    expect(response.body.metadata).toEqual({ sourceLocalNow: '2018-01-31 00:00:00' });
    expect(response.body.signals).toContainEqual(expect.objectContaining({ label, value }));
  });

  test('较早分析响应不会收到之后回放快照的数值', async () => {
    vi.useFakeTimers();
    const app = createApp({
      pilot: { dataDir: await readyDataDirectory(), env: {}, now: () => new Date('2026-08-09T00:00:00.000Z') },
    });
    applications.push(app);
    const replayFilters = { start: '2018-01-01', end: '2018-02-28' };

    const earlier = await request(app).post('/api/pilot/analysis').send({ question: '成交额表现如何？', filters: replayFilters });
    await request(app).post('/api/pilot/replay').send({ action: 'start' });
    await vi.advanceTimersByTimeAsync(36_000);
    const later = await request(app).post('/api/pilot/analysis').send({ question: '成交额表现如何？', filters: replayFilters });

    expect(earlier.body.metadata).toEqual({ sourceLocalNow: '2018-01-31 00:00:00' });
    expect(earlier.body.signals).toContainEqual(expect.objectContaining({ label: '成交额', value: 490 }));
    expect(later.body.metadata).toEqual({ sourceLocalNow: '2018-02-03 00:00:00' });
    expect(later.body.signals).toContainEqual(expect.objectContaining({ label: '成交额', value: 990 }));
  });

  test('本地分析对取消与配送问题返回不同证据和追问', () => {
    const context = buildPilotAnalysisContext(snapshot);

    const cancellation = analyzeLocally(context, '为什么取消率较高？', 'not_configured', () => new Date('2026-08-09T00:00:00.000Z'));
    const delivery = analyzeLocally(context, '配送是否存在问题？', 'not_configured', () => new Date('2026-08-09T00:00:00.000Z'));

    expect(cancellation.summary).toContain('取消率');
    expect(cancellation.signals).toContainEqual(expect.objectContaining({ label: '取消率', value: 0.1 }));
    expect(delivery.summary).toMatch(/准时送达|配送/);
    expect(delivery.signals).toContainEqual(expect.objectContaining({ label: '准时送达率', value: 0.8 }));
    expect(delivery.summary).not.toBe(cancellation.summary);
    expect(delivery.followUps).not.toEqual(cancellation.followUps);
  });

  test.each([
    ['支付构成', '信用卡支付构成如何？', '支付方式：credit_card 支付金额', 420, (value: number) => ({
      ...snapshot,
      payments: { ...snapshot.payments, byType: [{ paymentType: 'credit_card', paymentAmount: value }] },
    })],
    ['复购买家', '复购买家有多少？', '复购买家数', 2, (value: number) => ({
      ...snapshot,
      commerce: { ...snapshot.commerce, repeatBuyerCount: { value, comparisonValue: 1, changeRate: value - 1 } },
    })],
    ['延迟配送', '延迟送达情况如何？', '延迟送达率', 0.25, (value: number) => ({
      ...snapshot,
      fulfillment: { ...snapshot.fulfillment, lateDeliveryRate: value },
    })],
    ['低评分', '低评分订单多吗？', '低评分率', 0.2, (value: number) => ({
      ...snapshot,
      experience: { ...snapshot.experience, lowScoreRate: value },
    })],
  ])('本地分析将%s问题绑定到对应快照事实，并随该事实变化', (_name, question, label, value, changedSnapshot) => {
    const first = analyzeLocally(buildPilotAnalysisContext(snapshot), question, 'not_configured', () => new Date('2026-08-09T00:00:00.000Z'));
    const second = analyzeLocally(buildPilotAnalysisContext(changedSnapshot(value + 1)), question, 'not_configured', () => new Date('2026-08-09T00:00:00.000Z'));

    expect(first.signals).toContainEqual(expect.objectContaining({ label, value }));
    expect(second.signals).toContainEqual(expect.objectContaining({ label, value: value + 1 }));
    expect(second.summary).not.toBe(first.summary);
  });

  test.each([
    ['performance', '成交额和订单表现如何？', '成交额'],
    ['reviews', '用户评价是否变差？', '平均评分'],
    ['reviews synonym', '最近差评是否变多？', '平均评分'],
    ['delivery synonym', '履约环节是否存在问题？', '准时送达率'],
    ['contributors', '哪些品类和卖家贡献最大？', '品类：books'],
    ['general', '请做一份整体诊断', '成交额'],
  ])('本地分析区分 %s 问题', (_kind, question, expectedLabel) => {
    const result = analyzeLocally(buildPilotAnalysisContext(snapshot), question, 'not_configured', () => new Date('2026-08-09T00:00:00.000Z'));

    expect(result.signals[0].label).toBe(expectedLabel);
  });

  test('上下文按稳定顺序截断且 JSON 小于 30KB', () => {
    const rankings = Array.from({ length: 100 }, (_, index) => ({
      category: `${String(index).padStart(3, '0')}-${'类'.repeat(2_000)}`,
      itemGmv: index % 2 === 0 ? 100 : index,
    }));
    const oversized = {
      ...snapshot,
      categoryRanking: rankings,
      sellerRanking: rankings.map(({ category: sellerId, itemGmv }) => ({ sellerId, itemGmv })),
      customerStateRanking: rankings.map(({ category: customerState, itemGmv }) => ({ customerState, itemGmv })),
    };

    const first = buildPilotAnalysisContext(oversized, '哪些品类贡献最大？');
    const second = buildPilotAnalysisContext({ ...oversized, categoryRanking: [...rankings].reverse() }, '哪些品类贡献最大？');

    expect(Buffer.byteLength(JSON.stringify(first), 'utf8')).toBeLessThan(30 * 1024);
    expect(second).toEqual(first);
    expect(first.facts).toHaveLength(41);
    expect(first.trendChanges).toHaveLength(10);
    for (const dimension of ['category', 'seller', 'customerState'] as const) {
      const dimensionContributors = first.contributors.filter((item) => item.dimension === dimension);
      expect(dimensionContributors).toHaveLength(12);
      expect(dimensionContributors[0].itemGmv).toBe(100);
      expect(dimensionContributors[0].label).toMatch(/^(品类|卖家|地区)：000-/);
    }
  });

  test('贡献者在各维度截断后按成交额全局稳定排序', () => {
    const context = buildPilotAnalysisContext(snapshot);

    expect(context.contributors.map(({ dimension, label, itemGmv }) => ({ dimension, label, itemGmv }))).toEqual([
      { dimension: 'customerState', label: '地区：SP', itemGmv: 350 },
      { dimension: 'category', label: '品类：books', itemGmv: 300 },
      { dimension: 'seller', label: '卖家：seller-1', itemGmv: 250 },
    ]);
  });

  test('贡献者公开标签用维度前缀消除跨维度重名', () => {
    const repeated = buildPilotAnalysisContext({
      ...snapshot,
      categoryRanking: [{ category: 'shared', itemGmv: 3 }],
      sellerRanking: [{ sellerId: 'shared', itemGmv: 2 }],
      customerStateRanking: [{ customerState: 'shared', itemGmv: 1 }],
    });

    expect(repeated.contributors.map(({ label }) => label)).toEqual(['品类：shared', '卖家：shared', '地区：shared']);
    expect(new Set(repeated.contributors.map(({ label }) => label)).size).toBe(3);
  });

  test('signal 必须按同一公开证据标签和单位校验数值', () => {
    const countBorrowingCurrency = buildPilotAnalysisContext({
      ...snapshot,
      kpis: { ...snapshot.kpis, averageOrderValue: { ...snapshot.kpis.averageOrderValue, value: 10 } },
    });
    const analysis = (factId: string, label: string, unit: 'currency' | 'count' | 'ratio', value: number) => ({
      signals: [{ factId, label, unit, value, direction: 'up' as const }],
      causes: [],
    });

    expect(hasOnlyTrustedNumbers(analysis('cancellationRate.value', '取消率', 'ratio', 490), buildPilotAnalysisContext(snapshot))).toBe(false);
    expect(hasOnlyTrustedNumbers(analysis('validOrderCount.value', '有效订单数', 'count', 10.009), countBorrowingCurrency)).toBe(false);
    expect(hasOnlyTrustedNumbers(analysis('cancellationRate.value', '取消率', 'ratio', 0.10009), buildPilotAnalysisContext(snapshot))).toBe(false);
    expect(hasOnlyTrustedNumbers(analysis('cancellationRate.value', '取消率', 'ratio', 0.1), buildPilotAnalysisContext(snapshot))).toBe(true);
  });

  test('cause 必须按同一贡献者标签校验贡献金额', () => {
    const context = buildPilotAnalysisContext(snapshot);
    const analysis = (contribution: number) => ({
      signals: [{ factId: 'itemGmv.value', label: '成交额', unit: 'currency' as const, value: 490, direction: 'up' as const }],
      causes: [{ factId: 'category:1', label: '品类：books', unit: 'currency' as const, contribution, evidence: '可信证据' }],
    });

    expect(hasOnlyTrustedNumbers(analysis(0.1), context)).toBe(false);
    expect(hasOnlyTrustedNumbers(analysis(490), context)).toBe(false);
    expect(hasOnlyTrustedNumbers(analysis(300.009), context)).toBe(false);
    expect(hasOnlyTrustedNumbers(analysis(300), context)).toBe(true);
  });

  test('合法零值、负变化率和重复 signal 通过证据绑定', () => {
    const zeroContext = buildPilotAnalysisContext({
      ...snapshot,
      kpis: { ...snapshot.kpis, itemGmv: { value: 0, comparisonValue: 0, changeRate: -0.02 } },
    });

    const model = {
      ...modelResult(0),
      signals: [
        { factId: 'itemGmv.value', label: '成交额', unit: 'currency', value: 0, direction: 'flat' },
        { factId: 'itemGmv.changeRate', label: '成交额变化率', unit: 'ratio', value: -0.02, direction: 'down' },
        { factId: 'itemGmv.value', label: '成交额', unit: 'currency', value: 0, direction: 'flat' },
      ],
      causes: [],
    };
    const parsed = pilotModelAnalysisSchema.safeParse(model);

    expect(parsed.success).toBe(true);
    expect(parsed.success && hasOnlyTrustedNumbers(parsed.data, zeroContext)).toBe(true);
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('analysis schema 拒绝非有限结构数值 %s', (value) => {
    expect(pilotModelAnalysisSchema.safeParse({ ...modelResult(490), signals: [{ factId: 'itemGmv.value', label: '成交额', unit: 'currency', value, direction: 'up' }] }).success).toBe(false);
  });

  test('12 秒硬截止覆盖响应 body 读取阶段', async () => {
    vi.useFakeTimers();
    const context = buildPilotAnalysisContext(snapshot, '表现如何？');
    const resultPromise = requestPilotDeepSeekAnalysis({
      fetchImpl: vi.fn(async () => ({ ok: true, json: () => new Promise<never>(() => undefined) } as unknown as Response)),
      apiKey: 'server-key',
      context,
      now: () => new Date('2026-08-09T00:00:00.000Z'),
    });

    await vi.advanceTimersByTimeAsync(11_999);
    let settled = false;
    void resultPromise.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(resultPromise).resolves.toEqual({ fallbackReason: 'timeout' });
    expect(vi.getTimerCount()).toBe(0);
  });

  test('fetch 忽略 AbortSignal 时仍在 12 秒硬截止返回 timeout', async () => {
    vi.useFakeTimers();
    const resultPromise = requestPilotDeepSeekAnalysis({
      fetchImpl: vi.fn(() => new Promise<Response>(() => undefined)),
      apiKey: 'server-key',
      context: buildPilotAnalysisContext(snapshot, '表现如何？'),
      now: () => new Date('2026-08-09T00:00:00.000Z'),
    });

    await vi.advanceTimersByTimeAsync(12_000);

    await expect(resultPromise).resolves.toEqual({ fallbackReason: 'timeout' });
    expect(vi.getTimerCount()).toBe(0);
  });

  test('贡献者问题只使用问题指定的维度', () => {
    const context = buildPilotAnalysisContext(snapshot);

    const seller = analyzeLocally(context, '哪个卖家贡献最大？', 'not_configured');
    const category = analyzeLocally(context, '哪个品类贡献最大？', 'not_configured');

    expect(seller.summary).toContain('卖家：seller-1');
    expect(seller.summary).not.toContain('地区：SP');
    expect(category.summary).toContain('品类：books');
    expect(category.summary).not.toContain('地区：SP');
  });

  test('品类和卖家问题同时返回两个被点名维度并排除地区', () => {
    const result = analyzeLocally(buildPilotAnalysisContext(snapshot), '哪些品类和卖家贡献最大？', 'not_configured');

    expect(result.summary).toContain('品类：books');
    expect(result.summary).toContain('卖家：seller-1');
    expect(result.summary).not.toContain('地区：SP');
    expect(result.signals.map(({ label }) => label)).toEqual(['品类：books', '卖家：seller-1']);
    expect(result.causes).toEqual([]);
  });

  test('地区贡献问题只返回地区维度', () => {
    const result = analyzeLocally(buildPilotAnalysisContext(snapshot), '哪些地区贡献最大？', 'not_configured');

    expect(result.summary).toContain('地区：SP');
    expect(result.signals.map(({ label }) => label)).toEqual(['地区：SP']);
    expect(result.causes).toEqual([]);
  });

  test('三维贡献问题各取对应 top 并按成交额稳定合并', () => {
    const context = buildPilotAnalysisContext(snapshot);
    const result = analyzeLocally(context, '哪些品类、卖家和地区贡献最大？', 'not_configured');
    const generic = analyzeLocally(context, '哪些贡献者贡献最大？', 'not_configured');

    expect(result.signals.map(({ label, value }) => ({ label, value }))).toEqual([
      { label: '地区：SP', value: 350 },
      { label: '品类：books', value: 300 },
      { label: '卖家：seller-1', value: 250 },
    ]);
    expect(result.causes).toHaveLength(0);
    expect(result.summary).toContain('地区：SP');
    expect(result.summary).toContain('品类：books');
    expect(result.summary).toContain('卖家：seller-1');
    expect(generic.summary).toContain('地区：SP');
  });

  test('DeepSeek 使用白名单数值时返回服务端分析', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(modelResult(490)) } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const app = createApp({
      pilot: {
        dataDir: await readyDataDirectory(),
        fetchImpl,
        env: { DEEPSEEK_API_KEY: 'server-key' },
        now: () => new Date('2026-08-09T00:00:00.000Z'),
      },
    });
    applications.push(app);

    const response = await request(app).post('/api/pilot/analysis').send({ question: '表现如何？', filters });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      source: 'deepseek',
      generatedAt: '2026-08-09T00:00:00.000Z',
      metadata: { sourceLocalNow: '2018-01-31 00:00:00' },
    });
    const requestBody = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(requestBody.messages[0].content).toContain('signals.label 只能使用');
    expect(requestBody.messages[0].content).toContain('"成交额"');
    expect(requestBody.messages[0].content).toContain('causes.label 只能使用');
    expect(requestBody.messages[0].content).toContain('"品类：books"');
  });

  test('DeepSeek 虚构可信快照外数值时使用同一快照降级', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(modelResult(123_456_789)) } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const app = createApp({
      pilot: {
        dataDir: await readyDataDirectory(),
        fetchImpl,
        env: { DEEPSEEK_API_KEY: 'server-key' },
        now: () => new Date('2026-08-09T00:00:00.000Z'),
      },
    });
    applications.push(app);

    const response = await request(app).post('/api/pilot/analysis').send({ question: '表现如何？', filters });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      source: 'local',
      fallbackReason: 'invalid_response',
      metadata: { sourceLocalNow: '2018-01-31 00:00:00' },
    });
    expect(response.body.signals).toContainEqual(expect.objectContaining({ value: 490 }));
    expect(JSON.stringify(response.body)).not.toContain('123456789');
  });

  test.each([
    ['将复购买家数 1 冒充支付金额', { label: '支付金额', value: 1, direction: 'up' }],
    ['使用快照外数值', { label: '支付金额', value: 123_456_789, direction: 'up' }],
  ])('DeepSeek %s时回退到事实绑定的本地分析', async (_name, signal) => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ ...modelResult(490), signals: [signal] }) } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const app = createApp({
      pilot: {
        dataDir: await readyDataDirectory(),
        fetchImpl,
        env: { DEEPSEEK_API_KEY: 'server-key' },
        now: () => new Date('2026-08-09T00:00:00.000Z'),
      },
    });
    applications.push(app);

    const response = await request(app).post('/api/pilot/analysis').send({ question: '信用卡支付构成如何？', filters });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      source: 'local',
      fallbackReason: 'invalid_response',
      metadata: { sourceLocalNow: '2018-01-31 00:00:00' },
    });
    expect(response.body.signals).toContainEqual(expect.objectContaining({ label: '支付方式：credit_card 支付金额', value: 420 }));
  });
});
