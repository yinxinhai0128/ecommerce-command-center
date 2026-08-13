import type { AnalysisFallbackReason, AnalysisResult } from '../../src/domain/types';
import { analysisResultSchema, modelAnalysisSchema } from '../analysis/schema';
import type { FetchImplementation } from '../analysis/deepseekProvider';
import { trustedEvidenceAllowList } from './analysisContext';
import type { PilotAnalysisContext, PilotAnalysisUnit } from './contracts';

type DeepSeekOptions = {
  fetchImpl: FetchImplementation;
  apiKey: string;
  model?: string;
  context: PilotAnalysisContext;
  now: () => Date;
};

export type PilotDeepSeekOutcome =
  | { analysis: AnalysisResult }
  | { fallbackReason: Exclude<AnalysisFallbackReason, 'not_configured'> };

const modelSchemaDescription = JSON.stringify({
  summary: 'string',
  signals: [{ label: 'string', value: 'trusted finite number', direction: 'up | down | flat' }],
  causes: [{ label: 'string', contribution: 'trusted finite number', evidence: 'string' }],
  risks: [{ severity: 'critical | warning', title: 'string', evidence: 'string' }],
  actions: [{
    priority: 'high | medium | low',
    title: 'string',
    rationale: 'string',
    ownerRole: 'string',
    expectedImpact: 'string',
    validationMetric: 'string',
  }],
  followUps: ['以问号结尾的可点击问题'],
});

function tolerance(unit: PilotAnalysisUnit) {
  if (unit === 'currency') return 0.01;
  if (unit === 'ratio') return 0.0001;
  return 0;
}

function matchesEvidence(value: number, evidence: { value: number; unit: PilotAnalysisUnit }) {
  return Number.isFinite(value) && Math.abs(value - evidence.value) <= tolerance(evidence.unit);
}

export function hasOnlyTrustedNumbers(analysis: Pick<AnalysisResult, 'signals' | 'causes'>, context: PilotAnalysisContext) {
  const allowList = trustedEvidenceAllowList(context);
  return analysis.signals.every(({ label, value }) => {
    const evidence = allowList.signals.filter((allowed) => allowed.label === label);
    return evidence.length === 1 && matchesEvidence(value, evidence[0]);
  }) && analysis.causes.every(({ label, contribution }) => {
    const evidence = allowList.causes.filter((allowed) => allowed.label === label);
    return evidence.length === 1 && matchesEvidence(contribution, evidence[0]);
  });
}

export async function requestPilotDeepSeekAnalysis(options: DeepSeekOptions): Promise<PilotDeepSeekOutcome> {
  const controller = new AbortController();
  let resolveDeadline: (outcome: PilotDeepSeekOutcome) => void = () => undefined;
  const deadline = new Promise<PilotDeepSeekOutcome>((resolve) => { resolveDeadline = resolve; });
  const timeout = setTimeout(() => {
    controller.abort();
    resolveDeadline({ fallbackReason: 'timeout' });
  }, 12_000);
  const model = options.model || 'deepseek-v4-flash';
  const allowList = trustedEvidenceAllowList(options.context);
  const messages = [
    {
      role: 'system',
      content: `只返回 JSON 对象，必须遵循此 JSON schema：${modelSchemaDescription}。每个数值必须精确绑定到一个事实的 id、label、unit 和 value；signals.label 只能使用事实 label，且 value 必须复制同一事实；causes.label 只能使用贡献事实 label，且 contribution 必须复制同一事实。signals 可用事实（不得计算新指标）：${JSON.stringify(allowList.signals)}。causes 可用贡献事实：${JSON.stringify(allowList.causes)}。`,
    },
    {
      role: 'user',
      content: `根据以下服务端可信经营上下文生成 JSON 分析。JSON schema：${modelSchemaDescription}。上下文：${JSON.stringify(options.context)}`,
    },
  ];

  const request = async (): Promise<PilotDeepSeekOutcome> => {
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

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return { fallbackReason: 'invalid_response' };
      }
      const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim() === '') return { fallbackReason: 'invalid_response' };

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        return { fallbackReason: 'invalid_response' };
      }
      const modelResult = modelAnalysisSchema.safeParse(parsed);
      if (!modelResult.success || !hasOnlyTrustedNumbers(modelResult.data, options.context)) {
        return { fallbackReason: 'invalid_response' };
      }
      const result = analysisResultSchema.safeParse({
        ...modelResult.data,
        source: 'deepseek',
        generatedAt: options.now().toISOString(),
      });
      return result.success ? { analysis: result.data } : { fallbackReason: 'invalid_response' };
    } catch {
      return { fallbackReason: controller.signal.aborted ? 'timeout' : 'network_error' };
    }
  };

  try {
    return await Promise.race([request(), deadline]);
  } finally {
    clearTimeout(timeout);
  }
}
