import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createApp } from '../../server/index';
import { buildPilotAnalysisContext } from '../../server/pilot/analysisContext';
import { hasOnlyTrustedNumbers } from '../../server/pilot/deepseekAnalysis';
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
};

afterEach(async () => {
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
  database.prepare("INSERT INTO sellers VALUES ('seller-1', '01000', 'Sao Paulo', 'SP')").run();
  database.prepare("INSERT INTO products VALUES ('product-1', 'books', NULL, NULL, NULL, NULL, NULL, NULL, NULL)").run();
  database.prepare("INSERT INTO orders VALUES ('order-1', 'customer-1', 'delivered', '2018-01-01 00:00:00', '2018-01-01 01:00:00', '2018-01-01 02:00:00', '2018-01-02 00:00:00', '2018-01-03 00:00:00')").run();
  database.prepare("INSERT INTO order_items VALUES ('order-1', 1, 'product-1', 'seller-1', '2018-01-01 02:00:00', 490, 0)").run();
  database.close();
  await writeFile(paths.manifestPath, JSON.stringify({
    ready: true,
    importedAt: '2026-08-09T00:00:00.000Z',
    importerVersion: 1,
    source: { dataset: 'olistbr/brazilian-ecommerce', url: 'https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce', license: 'CC BY-NC-SA 4.0' },
    files: {},
    tables: {},
    range: { start: '2018-01-01 00:00:00', end: '2018-01-31 23:59:59' },
  }));
  return dataDir;
}

function modelResult(signalValue: number) {
  return {
    summary: '基于可信证据的分析。',
    signals: [{ label: '成交额', value: signalValue, direction: 'up' }],
    causes: [{ label: '图书', contribution: 490, evidence: '图书贡献来自可信快照。' }],
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
    ['performance', '成交额和订单表现如何？', '成交额'],
    ['reviews', '用户评价是否变差？', '平均评分'],
    ['contributors', '哪些品类和卖家贡献最大？', '主要贡献'],
    ['general', '请做一份整体诊断', '经营概览'],
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
  });

  test('贡献者在各维度截断后按成交额全局稳定排序', () => {
    const context = buildPilotAnalysisContext(snapshot);

    expect(context.contributors.map(({ dimension, label, itemGmv }) => ({ dimension, label, itemGmv }))).toEqual([
      { dimension: 'customerState', label: 'SP', itemGmv: 350 },
      { dimension: 'category', label: 'books', itemGmv: 300 },
      { dimension: 'seller', label: 'seller-1', itemGmv: 250 },
    ]);
  });

  test('数值白名单只接受货币 0.01 与比例 0.0001 范围内的舍入差', () => {
    const context = buildPilotAnalysisContext(snapshot);
    const analysis = (signal: number, contribution: number) => ({
      signals: [{ label: '取消率', value: signal, direction: 'up' as const }],
      causes: [{ label: '成交额', contribution, evidence: '可信证据' }],
    });

    expect(hasOnlyTrustedNumbers(analysis(0.10009, 490.009), context)).toBe(true);
    expect(hasOnlyTrustedNumbers(analysis(0.10011, 490.011), context)).toBe(false);
  });

  test('DeepSeek 使用白名单数值时返回服务端分析', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
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
});
