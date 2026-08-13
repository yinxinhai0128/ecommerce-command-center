import type { AnalysisFallbackReason } from '../../src/domain/types';
import type { FetchImplementation } from '../analysis/deepseekProvider';
import { trustedEvidenceAllowList } from './analysisContext';
import { pilotAnalysisResultSchema, pilotModelAnalysisSchema, type PilotModelAnalysis } from './analysisSchema';
import type { PilotAnalysisContext, PilotAnalysisResult } from './contracts';

type DeepSeekOptions = {
  fetchImpl: FetchImplementation;
  apiKey: string;
  model?: string;
  context: PilotAnalysisContext;
  now: () => Date;
};

export type PilotDeepSeekOutcome =
  | { analysis: PilotAnalysisResult }
  | { fallbackReason: Exclude<AnalysisFallbackReason, 'not_configured'> };

const modelSchemaDescription = JSON.stringify({
  summary: 'string',
  signals: [{ factId: 'trusted fact id', label: 'trusted fact label', unit: 'trusted fact unit', value: 'trusted finite number', direction: 'up | down | flat' }],
  causes: [{ factId: 'trusted fact id', label: 'trusted fact label', unit: 'trusted fact unit', contribution: 'trusted finite number', evidence: 'string' }],
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

function matchesEvidence(value: number, evidence: { value: number }) {
  return Number.isFinite(value) && Object.is(value, evidence.value);
}

export function hasOnlyTrustedNumbers(analysis: Pick<PilotAnalysisResult, 'signals' | 'causes'>, context: PilotAnalysisContext) {
  const allowList = trustedEvidenceAllowList(context);
  return analysis.signals.every(({ factId, label, unit, value }) => {
    const evidence = allowList.signals.filter((allowed) => allowed.id === factId && allowed.label === label && allowed.unit === unit);
    return evidence.length === 1 && matchesEvidence(value, evidence[0]);
  }) && analysis.causes.every(({ factId, label, unit, contribution }) => {
    const evidence = allowList.causes.filter((allowed) => allowed.id === factId && allowed.label === label && allowed.unit === unit);
    return evidence.length === 1 && matchesEvidence(contribution, evidence[0]);
  });
}

const prohibitedClaims = /毛利|成本|退款|退货|广告|投放|流量|目标|预测|预计|预估|\b(?:margin|cost|refund|advertis(?:e|ing|ement)?|traffic|target|forecast)\b/i;
const numericClaim = /[-+]?\d+(?:\.\d+)?%?/g;

function textFields(analysis: PilotModelAnalysis) {
  return [
    analysis.summary,
    ...analysis.causes.map(({ evidence }) => evidence),
    ...analysis.risks.flatMap(({ title, evidence }) => [title, evidence]),
    ...analysis.actions.flatMap(({ title, rationale, ownerRole, expectedImpact, validationMetric }) => [title, rationale, ownerRole, expectedImpact, validationMetric]),
    ...analysis.followUps,
  ];
}

function hasOnlyTrustedTextClaims(analysis: PilotModelAnalysis, context: PilotAnalysisContext) {
  const allowed = [...context.facts, ...context.trendChanges, ...trustedEvidenceAllowList(context).causes];
  const allowedNumbers = allowed.flatMap(({ value, label }) => [
    value,
    ...(label.match(numericClaim) ?? []).map((token) => Number(token.replace('%', ''))),
  ]);
  return textFields(analysis).every((value) => !prohibitedClaims.test(value)
    && (value.match(numericClaim) ?? []).every((token) => {
      const numeric = Number(token.replace('%', ''));
      const normalized = token.endsWith('%') ? numeric / 100 : numeric;
      return allowedNumbers.some((allowed) => Object.is(normalized, allowed) || Object.is(numeric, allowed));
    }));
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
      const modelResult = pilotModelAnalysisSchema.safeParse(parsed);
      if (!modelResult.success || !hasOnlyTrustedNumbers(modelResult.data, options.context) || !hasOnlyTrustedTextClaims(modelResult.data, options.context)) {
        return { fallbackReason: 'invalid_response' };
      }
      const result = pilotAnalysisResultSchema.safeParse({
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
