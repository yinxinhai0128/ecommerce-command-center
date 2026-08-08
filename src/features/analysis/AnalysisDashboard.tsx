import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { requestAnalysis } from '../../api/analysisClient';
import type { AnalysisContext, AnalysisResult, DashboardAlert, DashboardFilters, DashboardSnapshot } from '../../domain/types';
import { buildAnalysisContext } from '../../metrics/buildAnalysisContext';
import { ActionList } from './ActionList';
import { AnalysisChat, type AnalysisHistoryEntry } from './AnalysisChat';
import { ContributionChart } from './ContributionChart';
import { ExecutiveSummary } from './ExecutiveSummary';
import { ForecastPanel } from './ForecastPanel';

export type AnalysisDashboardProps = {
  snapshot: DashboardSnapshot;
  alerts: DashboardAlert[];
  filters: DashboardFilters;
  active: boolean;
};

type RequestState = 'idle' | 'loading' | 'success' | 'error';

export function AnalysisDashboard({ snapshot, alerts, filters, active }: AnalysisDashboardProps): JSX.Element {
  const context = useMemo(() => buildAnalysisContext(snapshot, alerts, filters), [alerts, filters, snapshot]);
  const contextFingerprint = useMemo(() => JSON.stringify(context), [context]);
  const [result, setResult] = useState<AnalysisResult>();
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [error, setError] = useState<string>();
  const [stale, setStale] = useState(false);
  const [history, setHistory] = useState<AnalysisHistoryEntry[]>([]);
  const [analyzedForecast, setAnalyzedForecast] = useState<Pick<AnalysisContext, 'forecast7d' | 'targetProbability'>>();
  const requestedOnce = useRef(false);
  const nextHistoryId = useRef(0);
  const lastRequestedFingerprint = useRef<string | undefined>(undefined);
  const lastQuestion = useRef<string | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);

  const runAnalysis = useCallback(async (question?: string): Promise<void> => {
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    const trimmedQuestion = question?.trim() || undefined;
    const requestedContext = context;
    lastQuestion.current = trimmedQuestion;
    lastRequestedFingerprint.current = contextFingerprint;
    setRequestState('loading');
    setError(undefined);
    setStale(false);
    try {
      const nextResult = await requestAnalysis(context, trimmedQuestion, nextController.signal);
      if (controller.current !== nextController) return;
      setResult(nextResult);
      setAnalyzedForecast({
        forecast7d: requestedContext.forecast7d,
        targetProbability: requestedContext.targetProbability,
      });
      setRequestState('success');
      if (trimmedQuestion) {
        const id = nextHistoryId.current;
        nextHistoryId.current += 1;
        setHistory((current) => [...current, { id, question: trimmedQuestion, summary: nextResult.summary }].slice(-3));
      }
    } catch (caught) {
      if (nextController.signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) return;
      if (controller.current !== nextController) return;
      setError(caught instanceof Error ? caught.message : '分析失败，请重试');
      setRequestState('error');
    }
  }, [context, contextFingerprint]);

  useEffect(() => {
    if (!active || requestedOnce.current) return;
    requestedOnce.current = true;
    void runAnalysis();
  }, [active, runAnalysis]);

  useEffect(() => {
    if (result && lastRequestedFingerprint.current !== contextFingerprint) setStale(true);
  }, [contextFingerprint, result]);

  useEffect(() => () => controller.current?.abort(), []);

  const loading = requestState === 'loading';
  return (
    <div className="analysis-dashboard" aria-busy={loading}>
      <div className="analysis-main">
        {stale && <div className="analysis-stale"><button type="button" disabled={loading} onClick={() => void runAnalysis()}>数据已变化，重新分析</button></div>}
        {loading && <p className="analysis-status" role="status">正在分析最新经营数据…</p>}
        {error && (
          <div className="analysis-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void runAnalysis(lastQuestion.current)}>重试</button>
          </div>
        )}
        <ExecutiveSummary result={result} />
        <div className="analysis-middle">
          <ContributionChart causes={result?.causes} />
          <ForecastPanel forecast7d={analyzedForecast?.forecast7d ?? []} targetProbability={analyzedForecast?.targetProbability ?? 0} />
        </div>
        <ActionList actions={result?.actions} />
      </div>
      <AnalysisChat result={result} loading={loading} history={history} onQuestion={(question) => void runAnalysis(question)} />
    </div>
  );
}
