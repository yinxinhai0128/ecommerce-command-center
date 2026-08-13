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

const prohibitedClaims = /毛利|成本|退款|退货|广告|投放|流量|目标|预测|预计|预估|\b(?:gross\s*margin|margin|profit|costs?|refunds?|advertis(?:e|ed|ing|ement|ements)?|traffic|targets?|goals?|forecast(?:s|ed|ing)?|predictions?|predict(?:s|ed|ing|ive)?)\b/;
const numericClaim = /[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?/g;
const englishDisplayNames: Record<string, string[]> = {
  '成交额': ['gmv', 'gross merchandise value'],
  '有效订单数': ['valid order count'],
  '平均订单金额': ['average order value'],
  '取消率': ['cancellation rate'],
  '准时送达率': ['on-time delivery rate', 'on time delivery rate'],
  '平均配送天数': ['average delivery days'],
  '平均评分': ['average review score', 'average rating'],
  '支付金额': ['payment amount'],
  '独立买家数': ['unique buyer count'],
  '复购买家数': ['repeat buyer count'],
};

function normalizeText(value: string) {
  return value.normalize('NFKC').replace(/\p{Cf}/gu, '').toLowerCase();
}

function claimSegments(value: string) {
  return normalizeText(value).split(/[。！？!?；;，,\r\n]+|\.(?!\d)/u).filter(Boolean);
}

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
  return textFields(analysis).every((value) => {
    const normalizedText = normalizeText(value);
    if (prohibitedClaims.test(normalizedText)) return false;
    return claimSegments(normalizedText).every((segment) => {
      const evidenceLabels = allowed.map((evidence) => ({
        evidence,
        labels: [evidence.label, ...(englishDisplayNames[evidence.label] ?? [])].map(normalizeText).filter((label) => segment.includes(label)),
      }));
      return [...segment.matchAll(numericClaim)].every((match) => {
        const token = match[0];
        const tokenStart = match.index;
        const tokenEnd = tokenStart + token.length;
        const isControlledLabelNumber = evidenceLabels.some(({ labels }) => labels.some((label) => {
          let labelStart = segment.indexOf(label);
          while (labelStart >= 0) {
            if (tokenStart >= labelStart && tokenEnd <= labelStart + label.length) return true;
            labelStart = segment.indexOf(label, labelStart + 1);
          }
          return false;
        }));
        if (isControlledLabelNumber) return true;

        const isPercent = token.endsWith('%');
        const numeric = Number(token.replace(/,/g, '').replace('%', ''));
        return evidenceLabels.some(({ evidence, labels }) => {
          const matchesValue = isPercent
            ? evidence.unit === 'ratio' && Object.is(numeric / 100, evidence.value)
            : Object.is(numeric, evidence.value);
          return matchesValue && labels.length > 0;
        });
      });
    });
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
