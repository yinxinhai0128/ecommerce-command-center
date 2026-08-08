import type { AnalysisFallbackReason } from '../../src/domain/types';
import { modelAnalysisSchema, type ModelAnalysis, type RequestAnalysisContext } from './schema';

export type FetchImplementation = (url: string, init?: RequestInit) => Promise<Response>;

type DeepSeekOptions = {
  fetchImpl: FetchImplementation;
  apiKey: string;
  model?: string;
  context: RequestAnalysisContext;
};

export type DeepSeekOutcome =
  | { analysis: ModelAnalysis }
  | { fallbackReason: Exclude<AnalysisFallbackReason, 'not_configured'> };

const modelSchemaDescription = JSON.stringify({
  summary: 'string',
  signals: [{ title: 'string', evidence: 'string' }],
  causes: [{ title: 'string', evidence: 'string' }],
  risks: [{ title: 'string', evidence: 'string' }],
  actions: [{ title: 'string', rationale: 'string' }],
  followUps: ['string'],
});

export async function requestDeepSeekAnalysis(options: DeepSeekOptions): Promise<DeepSeekOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const model = options.model || 'deepseek-v4-flash';
  const messages = [
    { role: 'system', content: `只返回 JSON 对象，必须遵循此 JSON schema：${modelSchemaDescription}` },
    { role: 'user', content: `根据以下经营上下文生成 JSON 分析，JSON schema 为：${modelSchemaDescription}。上下文：${JSON.stringify(options.context)}` },
  ];

  try {
    const response = await options.fetchImpl('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: 'json_object' },
        max_tokens: 1800,
        thinking: { type: 'disabled' },
      }),
    });

    if (!response.ok) return { fallbackReason: 'upstream_error' };

    const content = (await response.json())?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') return { fallbackReason: 'invalid_response' };

    const parsed = (() => {
      try { return JSON.parse(content); } catch { return undefined; }
    })();
    const result = modelAnalysisSchema.safeParse(parsed);
    return result.success ? { analysis: result.data } : { fallbackReason: 'invalid_response' };
  } catch {
    return { fallbackReason: controller.signal.aborted ? 'timeout' : 'network_error' };
  } finally {
    clearTimeout(timeout);
  }
}
