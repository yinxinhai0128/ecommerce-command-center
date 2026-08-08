import { afterEach, expect, test, vi } from 'vitest';
import type { AnalysisContext, AnalysisResult } from '../domain/types';
import { requestAnalysis } from './analysisClient';

const context: AnalysisContext = {
  range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-08T00:00:00.000Z' },
  comparisonLabel: '较昨日同期',
  kpis: {
    gmv: { value: 120000, comparisonValue: 100000, changeRate: 0.2 },
    netSales: { value: 110000, comparisonValue: 90000, changeRate: 0.22 },
    orderCount: { value: 2400, comparisonValue: 2000, changeRate: 0.2 },
    conversionRate: { value: 0.04, comparisonValue: 0.035, changeRate: 0.14 },
    averageOrderValue: { value: 50, comparisonValue: 50, changeRate: 0 },
    grossMarginRate: { value: 0.3, comparisonValue: 0.28, changeRate: 0.07 },
    refundRate: { value: 0.08, comparisonValue: 0.03, changeRate: 1.67 },
    targetAchievementRate: { value: 0.9, comparisonValue: 1, changeRate: -0.1 },
  },
  topContributors: { channels: [], products: [], regions: [] },
  alerts: [],
  forecast7d: [{ date: '2026-08-09', gmv: 18000 }],
  targetProbability: 0.65,
};

const result: AnalysisResult = {
  summary: 'GMV增长，但退款率需要关注。',
  signals: [{ label: 'GMV', value: 120000, direction: 'up' }],
  causes: [{ label: '天猫', contribution: 20000, evidence: '天猫贡献增长。' }],
  risks: [{ severity: 'warning', title: '退款率风险', evidence: '退款率升至8%。' }],
  actions: [{ priority: 'high', title: '核查退款', rationale: '退款率高于对比期。' }],
  followUps: ['哪个商品退款最多？'],
  source: 'local',
  generatedAt: '2026-08-09T00:00:00.000Z',
  fallbackReason: 'not_configured',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

test('向固定分析端点发送最小上下文、裁剪后的问题和取消信号', async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(result), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const controller = new AbortController();

  await expect(requestAnalysis(context, '  今天怎么做？  ', controller.signal)).resolves.toEqual(result);
  expect(fetchMock).toHaveBeenCalledWith('/api/analysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...context, question: '今天怎么做？' }),
    signal: controller.signal,
  });
  expect(JSON.stringify(fetchMock.mock.calls[0])).not.toMatch(/key|model/i);
});

test('空白问题不会进入请求体', async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(result), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);

  await requestAnalysis(context, '   ');

  const requestInit = fetchMock.mock.calls[0]?.[1];
  expect(requestInit).toBeDefined();
  expect(JSON.parse(requestInit!.body as string)).toEqual(context);
});

test.each([
  ['非2xx响应', vi.fn(async () => new Response('{}', { status: 503 })), '分析服务暂时不可用，请稍后重试'],
  ['网络异常', vi.fn(async () => { throw new TypeError('offline'); }), '网络连接失败，请检查网络后重试'],
  ['无效顶层结果', vi.fn(async () => new Response(JSON.stringify({ summary: 42 }), { status: 200 })), '分析结果无效，请重试'],
])('%s会抛出用户可处理的错误', async (_caseName, fetchMock, message) => {
  vi.stubGlobal('fetch', fetchMock);

  await expect(requestAnalysis(context)).rejects.toThrow(message);
});

test.each([
  ['信号包含非有限数值', { ...result, signals: [{ label: 'GMV', value: 'NaN', direction: 'up' }] }],
  ['信号包含非法方向', { ...result, signals: [{ label: 'GMV', value: 1, direction: 'sideways' }] }],
  ['归因包含非法贡献值', { ...result, causes: [{ label: '天猫', contribution: '很多', evidence: '渠道增长。' }] }],
  ['风险包含非法级别', { ...result, risks: [{ severity: 'low', title: '风险', evidence: '证据。' }] }],
  ['行动包含非法优先级', { ...result, actions: [{ priority: 'urgent', title: '行动', rationale: '原因。' }] }],
  ['后续问题没有问号', { ...result, followUps: ['查看商品退款'] }],
  ['生成时间不是ISO时间', { ...result, generatedAt: '明天上午' }],
])('拒绝%s的嵌套无效分析结果', async (_caseName, invalidResult) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(invalidResult), { status: 200 })));

  await expect(requestAnalysis(context)).rejects.toThrow('分析结果无效，请重试');
});
