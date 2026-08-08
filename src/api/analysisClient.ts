import type { AnalysisContext, AnalysisResult } from '../domain/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!isRecord(value)) return false;
  return typeof value.summary === 'string'
    && Array.isArray(value.signals)
    && Array.isArray(value.causes)
    && Array.isArray(value.risks)
    && Array.isArray(value.actions)
    && Array.isArray(value.followUps)
    && (value.source === 'deepseek' || value.source === 'local')
    && typeof value.generatedAt === 'string';
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
