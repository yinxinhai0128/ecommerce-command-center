import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { controlPilotReplay, requestPilotAnalysis, requestPilotFilterOptions, requestPilotSnapshot, requestPilotStatus } from '../api/pilotClient';
import type { PilotAnalysis, PilotFilterOptions, PilotFilters, PilotReplayAction, PilotSnapshot, PilotStatus } from '../pilot/types';

export type PilotDashboardContextValue = {
  status: PilotStatus | null; snapshot: PilotSnapshot | null; filters: PilotFilters | null; options: PilotFilterOptions | null;
  isLoading: boolean; error: Error | null; setFilters: (filters: PilotFilters) => void; retry: () => void;
  startReplay: () => Promise<void>; pauseReplay: () => Promise<void>; resetReplay: () => Promise<void>;
  requestAnalysis: (question: string) => Promise<PilotAnalysis>;
};

export const PilotDashboardContext = createContext<PilotDashboardContextValue | null>(null);

function isAbortError(error: unknown): boolean { return error instanceof DOMException && error.name === 'AbortError'; }
function abortError(): DOMException { return new DOMException('Aborted', 'AbortError'); }
function resetFilters(status: Extract<PilotStatus, { ready: true }>): PilotFilters {
  const end = status.replay.sourceLocalNow.slice(0, 10);
  const date = new Date(`${end}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 29);
  const start = date.toISOString().slice(0, 10) < status.range.start ? status.range.start : date.toISOString().slice(0, 10);
  return { start, end };
}

export function PilotDashboardProvider({ children }: { children: ReactNode }): ReactNode {
  const [status, setStatus] = useState<PilotStatus | null>(null);
  const [snapshot, setSnapshot] = useState<PilotSnapshot | null>(null);
  const [filters, setFiltersState] = useState<PilotFilters | null>(null);
  const [options, setOptions] = useState<PilotFilterOptions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const analysisGeneration = useRef(0);
  const needsInitialization = useRef(false);
  const filtersRef = useRef<PilotFilters | null>(null);
  const optionsRef = useRef<PilotFilterOptions | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const replayController = useRef<AbortController | null>(null);
  const analysisController = useRef<AbortController | null>(null);
  const refreshRef = useRef<(loadOptions: boolean) => void>(() => undefined);

  const refresh = useCallback((loadOptions: boolean) => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    const requestGeneration = ++generation.current;
    const current = () => mounted.current && requestGeneration === generation.current && requestController.current === controller;
    setIsLoading(true);
    setError(null);
    void (async () => {
      try {
        const nextStatus = await requestPilotStatus(controller.signal);
        if (!current()) return;
        setStatus(nextStatus);
        if (!nextStatus.ready) {
          needsInitialization.current = true;
          filtersRef.current = null;
          optionsRef.current = null;
          setFiltersState(null);
          setOptions(null);
          setSnapshot(null);
          setError(null);
          return;
        }
        const nextFilters = needsInitialization.current ? resetFilters(nextStatus) : filtersRef.current ?? { start: nextStatus.range.start, end: nextStatus.range.end };
        needsInitialization.current = false;
        if (filtersRef.current !== nextFilters) {
          filtersRef.current = nextFilters;
          setFiltersState(nextFilters);
        }
        const nextOptions = loadOptions || !optionsRef.current ? await requestPilotFilterOptions(controller.signal) : optionsRef.current;
        const nextSnapshot = await requestPilotSnapshot(nextFilters, controller.signal);
        if (!current()) return;
        if (nextOptions) { optionsRef.current = nextOptions; setOptions(nextOptions); }
        setSnapshot(nextSnapshot);
      } catch (cause) {
        if (!current() || isAbortError(cause)) return;
        setError(cause instanceof Error ? cause : new Error('璇曠偣鏁版嵁鍔犺浇澶辫触'));
      } finally {
        if (current()) setIsLoading(false);
      }
    })();
  }, []);
  refreshRef.current = refresh;

  useEffect(() => {
    mounted.current = true;
    refreshRef.current(true);
    const timer = window.setInterval(() => refreshRef.current(false), 3000);
    return () => {
      mounted.current = false;
      generation.current += 1;
      analysisGeneration.current += 1;
      window.clearInterval(timer);
      requestController.current?.abort();
      replayController.current?.abort();
      analysisController.current?.abort();
    };
  }, []);

  const setFilters = useCallback((nextFilters: PilotFilters) => {
    filtersRef.current = nextFilters;
    setFiltersState(nextFilters);
    refreshRef.current(false);
  }, []);
  const retry = useCallback(() => refreshRef.current(true), []);
  const replay = useCallback(async (action: PilotReplayAction) => {
    requestController.current?.abort();
    const requestGeneration = ++generation.current;
    replayController.current?.abort();
    const controller = new AbortController();
    replayController.current = controller;
    try {
      const nextReplay = await controlPilotReplay(action, controller.signal);
      if (!mounted.current || requestGeneration !== generation.current || replayController.current !== controller) return;
      setStatus((current) => current?.ready ? { ...current, replay: nextReplay } : current);
      setError(null);
      refreshRef.current(false);
    } catch (cause) {
      if (mounted.current && requestGeneration === generation.current && !isAbortError(cause)) setError(cause instanceof Error ? cause : new Error('璇曠偣鍥炴斁鎿嶄綔澶辫触'));
    }
  }, []);
  const requestAnalysis = useCallback(async (question: string) => {
    if (!filtersRef.current) throw new Error('璇曠偣灏氭湭灏辩华');
    analysisController.current?.abort();
    const controller = new AbortController();
    analysisController.current = controller;
    const requestGeneration = ++analysisGeneration.current;
    const result = await requestPilotAnalysis(filtersRef.current, question, controller.signal);
    if (!mounted.current || requestGeneration !== analysisGeneration.current || analysisController.current !== controller) throw abortError();
    return result;
  }, []);

  const value = useMemo<PilotDashboardContextValue>(() => ({
    status, snapshot, filters, options, isLoading, error, setFilters, retry,
    startReplay: () => replay('start'), pauseReplay: () => replay('pause'), resetReplay: () => replay('reset'), requestAnalysis,
  }), [error, filters, isLoading, options, replay, requestAnalysis, retry, setFilters, snapshot, status]);
  return <PilotDashboardContext.Provider value={value}>{children}</PilotDashboardContext.Provider>;
}
