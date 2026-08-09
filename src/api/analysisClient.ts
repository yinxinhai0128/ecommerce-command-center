import type { AnalysisContext, AnalysisResult } from '../domain/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 1000;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isArrayOf(value: unknown, minimum: number, maximum: number, predicate: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.length >= minimum && value.length <= maximum && value.every(predicate);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = Number(match[7] ?? 0);
  const offsetMinute = Number(match[8] ?? 0);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1
    && month <= 12
    && day >= 1
    && day <= daysInMonth[month - 1]
    && hour <= 23
    && minute <= 59
    && second <= 59
    && offsetHour <= 14
    && offsetMinute <= 59
    && (offsetHour < 14 || offsetMinute === 0)
    && Number.isFinite(Date.parse(value));
}

function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!isRecord(value)) return false;
  const fallbackReasons = ['not_configured', 'upstream_error', 'timeout', 'invalid_response', 'network_error'];
  return isText(value.summary)
    && isArrayOf(value.signals, 1, 12, (signal) => isRecord(signal)
      && isText(signal.label)
      && isFiniteNumber(signal.value)
      && (signal.direction === 'up' || signal.direction === 'down' || signal.direction === 'flat'))
    && isArrayOf(value.causes, 0, 12, (cause) => isRecord(cause)
      && isText(cause.label)
      && isFiniteNumber(cause.contribution)
      && isText(cause.evidence))
    && isArrayOf(value.risks, 0, 12, (risk) => isRecord(risk)
      && (risk.severity === 'critical' || risk.severity === 'warning')
      && isText(risk.title)
      && isText(risk.evidence))
    && isArrayOf(value.actions, 1, 12, (action) => isRecord(action)
      && (action.priority === 'high' || action.priority === 'medium' || action.priority === 'low')
      && isText(action.title)
      && isText(action.rationale)
      && isText(action.ownerRole)
      && isText(action.expectedImpact)
      && isText(action.validationMetric))
    && isArrayOf(value.followUps, 1, 12, (followUp) => isText(followUp) && /[?？]$/.test(followUp))
    && (value.source === 'deepseek' || value.source === 'local')
    && isIsoTimestamp(value.generatedAt)
    && (value.fallbackReason === undefined || fallbackReasons.includes(value.fallbackReason as string));
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export async function requestAnalysis(
  context: AnalysisContext,
  question?: string,
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  const trimmedQuestion = question?.trim();
  let response: Response;
  try {
    response = await fetch('/api/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...context, ...(trimmedQuestion ? { question: trimmedQuestion } : {}) }),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error('网络连接失败，请检查网络后重试');
  }

  if (!response.ok) throw new Error('分析服务暂时不可用，请稍后重试');

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error('分析结果无效，请重试');
  }
  if (!isAnalysisResult(result)) throw new Error('分析结果无效，请重试');
  return result;
}
