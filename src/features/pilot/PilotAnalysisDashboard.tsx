import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import type { AnalysisResult } from '../../domain/types';
import { usePilotDashboard } from '../../app/usePilotDashboard';
import type { PilotAnalysis } from '../../pilot/types';
import { ActionList } from '../analysis/ActionList';
import { AnalysisChat, type AnalysisHistoryEntry } from '../analysis/AnalysisChat';
import { ContributionChart } from '../analysis/ContributionChart';
import { ExecutiveSummary } from '../analysis/ExecutiveSummary';

type RequestState = 'idle' | 'loading' | 'success' | 'error';
type PilotAnalysisDashboardProps = { active: boolean };

function analysisFingerprint(sourceLocalNow: string, filters: unknown): string { return `${sourceLocalNow}:${JSON.stringify(filters)}`; }

export function PilotAnalysisDashboard({ active }: PilotAnalysisDashboardProps): JSX.Element {
  const { snapshot, requestAnalysis } = usePilotDashboard();
  const [result, setResult] = useState<PilotAnalysis>();
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [error, setError] = useState<string>();
  const [history, setHistory] = useState<AnalysisHistoryEntry[]>([]);
  const [stale, setStale] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const lastQuestion = useRef<string | undefined>(undefined);
  const resultFingerprint = useRef<string | undefined>(undefined);
  const nextHistoryId = useRef(0);
  const snapshotFingerprint = useMemo(() => snapshot ? analysisFingerprint(snapshot.sourceLocalNow, snapshot.filters) : '', [snapshot]);

  const runAnalysis = useCallback(async (question: string): Promise<void> => {
    const trimmed = question.trim();
    if (!trimmed) return;
    controller.current?.abort();
    const currentController = new AbortController();
    controller.current = currentController;
    lastQuestion.current = trimmed;
    setRequestState('loading');
    setError(undefined);
    setStale(false);
    try {
      const nextResult = await requestAnalysis(trimmed);
      if (controller.current !== currentController) return;
      setResult(nextResult);
      resultFingerprint.current = snapshotFingerprint;
      setHistory((current) => [...current, { id: nextHistoryId.current++, question: trimmed, summary: nextResult.summary }].slice(-3));
      setRequestState('success');
    } catch (caught) {
      if (currentController.signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError') || controller.current !== currentController) return;
      setError(caught instanceof Error ? caught.message : '分析失败，请重试');
      setRequestState('error');
    }
  }, [requestAnalysis, snapshotFingerprint]);

  useEffect(() => { if (result && resultFingerprint.current !== snapshotFingerprint) setStale(true); }, [result, snapshotFingerprint]);
  useEffect(() => () => controller.current?.abort(), []);

  if (!snapshot) return <p className="pilot-loading" role="status">正在等待可分析的数据快照</p>;
  const displayResult = result as unknown as AnalysisResult | undefined;
  const loading = requestState === 'loading';
  return (
    <div className="analysis-dashboard pilot-analysis-dashboard" aria-busy={loading} hidden={!active}>
      <div className="analysis-main">
        {stale && <div className="analysis-stale"><button type="button" disabled={loading} onClick={() => lastQuestion.current && void runAnalysis(lastQuestion.current)}>数据已变化，重新分析</button></div>}
        {loading && <p className="analysis-status" role="status">正在分析可信快照</p>}
        {error && <div className="analysis-error" role="alert"><span>{error}</span><button type="button" onClick={() => lastQuestion.current && void runAnalysis(lastQuestion.current)}>重试</button></div>}
        <ExecutiveSummary result={displayResult} />
        {result && <p className="pilot-analysis-metadata">可信快照：源数据本地时间 {result.metadata.sourceLocalNow} · {result.source === 'deepseek' ? 'DeepSeek 分析' : '本地规则分析'}</p>}
        <ContributionChart causes={displayResult?.causes} />
        <ActionList actions={displayResult?.actions} />
      </div>
      <AnalysisChat result={displayResult} loading={loading} history={history} onQuestion={(question) => void runAnalysis(question)} questionLabel="经营问题" submitLabel="提问" canAskWithoutResult />
    </div>
  );
}
