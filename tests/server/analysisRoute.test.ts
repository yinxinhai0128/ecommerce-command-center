import request from 'supertest';
import express from 'express';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createApp } from '../../server/index';
import { requestDeepSeekAnalysis } from '../../server/analysis/deepseekProvider';
import type { RequestAnalysisContext } from '../../server/analysis/schema';

const validContext = {
  range: { start: '2026-08-01T00:00:00.000Z', end: '2026-08-07T23:59:59.999Z' },
  comparisonLabel: '较上周',
  kpis: {
    gmv: { value: 120000, comparisonValue: 100000, changeRate: 0.2 },
    netSales: { value: 110000, comparisonValue: 92000, changeRate: 0.1957 },
    orderCount: { value: 2400, comparisonValue: 2000, changeRate: 0.2 },
    conversionRate: { value: 0.04, comparisonValue: 0.035, changeRate: 0.1429 },
    averageOrderValue: { value: 50, comparisonValue: 50, changeRate: 0 },
    grossMarginRate: { value: 0.3, comparisonValue: 0.28, changeRate: 0.0714 },
    refundRate: { value: 0.08, comparisonValue: 0.03, changeRate: 1.6667 },
    targetAchievementRate: { value: 0.9, comparisonValue: 1, changeRate: -0.1 },
  },
  topContributors: {
    channels: [{ label: '天猫', value: 72000 }],
    products: [{ label: '经典外套', value: 45000 }],
    regions: [{ label: '华东', value: 60000 }],
  },
  alerts: [{
    severity: 'warning',
    metric: 'refundRate',
    title: '退款率偏高',
    evidence: '退款率为 8%',
    impactAmount: 9600,
    suggestion: '复盘尺码问题',
  }],
  forecast7d: [{ date: '2026-08-08', gmv: 18000 }],
  targetProbability: 0.65,
  question: '请给出下一步建议',
};

const modelResult = {
  summary: '退款率偏高，需要优先排查。',
  signals: [{ title: '退款率', evidence: '退款率为 8%' }],
  causes: [{ title: '尺码问题', evidence: '退款预警建议复盘尺码问题' }],
  risks: [{ title: '目标风险', evidence: '达标概率为 65%' }],
  actions: [{ title: '复盘尺码', rationale: '退款率 8% 高于对比期 3%' }],
  followUps: ['跟踪退款率'],
};

function createResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createFetchWithContent(content: string) {
  return vi.fn(async (_url: string, _init?: RequestInit) => createResponse({ choices: [{ message: { content } }] }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('POST /api/analysis', () => {
  test('导入服务模块不会自动监听端口', async () => {
    const listen = vi.spyOn(express.application, 'listen');

    // Vite query forces a fresh module evaluation for the import-side-effect check.
    // @ts-expect-error Vite query modules are resolved at runtime.
    await import('../../server/index?without-listening');

    expect(listen).not.toHaveBeenCalled();
  });

  test('未配置密钥时以基于上下文的本地分析响应', async () => {
    const fetchImpl = vi.fn();
    const app = createApp({ fetchImpl, env: {}, now: () => new Date('2026-08-09T00:00:00.000Z') });

    const response = await request(app).post('/api/analysis').send(validContext);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      source: 'local',
      fallbackReason: 'not_configured',
      generatedAt: '2026-08-09T00:00:00.000Z',
    });
    expect(response.body.summary).toContain('退款率');
    expect(response.body.signals).toContainEqual({ title: '退款率', evidence: '退款率为 8%' });
    expect(response.body.actions).toContainEqual({
      title: '复盘退款原因',
      rationale: '退款率为 8%，预警提示：退款率为 8%。',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('DeepSeek 返回合规 JSON 时使用服务端结果且密钥不泄露', async () => {
    const apiKey = 'test-key-must-not-leak';
    const fetchImpl = createFetchWithContent(JSON.stringify(modelResult));
    const app = createApp({ fetchImpl, env: { DEEPSEEK_API_KEY: apiKey }, now: () => new Date('2026-08-09T00:00:00.000Z') });

    const response = await request(app).post('/api/analysis').send(validContext);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ...modelResult, source: 'deepseek', generatedAt: '2026-08-09T00:00:00.000Z' });
    expect(response.body.fallbackReason).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain(apiKey);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: `Bearer ${apiKey}` }),
      }),
    );
    const requestBody = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(requestBody).toMatchObject({
      model: 'deepseek-v4-flash',
      response_format: { type: 'json_object' },
      max_tokens: 1800,
      thinking: { type: 'disabled' },
    });
    expect(requestBody.messages[0].content).toMatch(/json|schema/i);
    expect(requestBody.messages[1].content).toMatch(/json|schema/i);
  });

  test.each([
    ['上游非成功状态', () => vi.fn(async () => createResponse({ error: 'bad gateway' }, 502)), 'upstream_error'],
    ['网络异常', () => vi.fn(async () => { throw new Error('offline'); }), 'network_error'],
    ['空模型内容', () => createFetchWithContent(''), 'invalid_response'],
    ['非法模型 JSON', () => createFetchWithContent('{not json'), 'invalid_response'],
    ['缺少模型字段', () => createFetchWithContent(JSON.stringify({ summary: '不完整' })), 'invalid_response'],
    ['超出允许范围的模型数值', () => createFetchWithContent(JSON.stringify({ ...modelResult, actions: [], signals: [] })), 'invalid_response'],
  ])('在%s时使用本地降级结果', async (_name, createFetch, fallbackReason) => {
    const app = createApp({ fetchImpl: createFetch(), env: { DEEPSEEK_API_KEY: 'server-only-key' } });

    const response = await request(app).post('/api/analysis').send(validContext);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ source: 'local', fallbackReason });
    expect(response.body.actions.length).toBeGreaterThan(0);
  });

  test('12 秒后中止未完成的上游请求', async () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    let abortedAt: number | undefined;
    let fetchStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { fetchStarted = resolve; });
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      fetchStarted?.();
      init?.signal?.addEventListener('abort', () => {
        abortedAt = Date.now();
        reject(new DOMException('aborted', 'AbortError'));
      });
    }));
    const resultPromise = requestDeepSeekAnalysis({
      fetchImpl,
      apiKey: 'server-only-key',
      context: validContext as RequestAnalysisContext,
    });

    await started;
    await vi.advanceTimersByTimeAsync(11_999);
    expect(abortedAt).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    const result = await resultPromise;

    expect(abortedAt).toBe(startedAt + 12_000);
    expect(result).toEqual({ fallbackReason: 'timeout' });
  });

  test.each([
    ['空问题', { ...validContext, question: '   ' }],
    ['过长问题', { ...validContext, question: 'a'.repeat(501) }],
    ['超过 64KB 的请求', { ...validContext, question: 'a'.repeat(65 * 1024) }],
    ['无效日期', { ...validContext, range: { ...validContext.range, start: 'not-a-date' } }],
    ['无限 KPI 数值', { ...validContext, kpis: { ...validContext.kpis, gmv: { ...validContext.kpis.gmv, value: 'Infinity' } } }],
  ])('拒绝%s且不调用上游', async (_name, body) => {
    const fetchImpl = vi.fn();
    const app = createApp({ fetchImpl, env: { DEEPSEEK_API_KEY: 'server-only-key' } });

    const response = await request(app).post('/api/analysis').send(body);

    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
