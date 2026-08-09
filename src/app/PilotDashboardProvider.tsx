import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { controlPilotReplay, requestPilotAnalysis, requestPilotFilterOptions, requestPilotSnapshot, requestPilotStatus } from '../api/pilotClient';
import type { PilotAnalysis, PilotFilterOptions, PilotFilters, PilotReplayAction, PilotSnapshot, PilotStatus } from '../pilot/types';

export type PilotDashboardContextValue = {
  status: PilotStatus | null;
  snapshot: PilotSnapshot | null;
  filters: PilotFilters | null;
  options: PilotFilterOptions | null;
  isLoading: boolean;
  error: Error | null;
  setFilters: (filters: PilotFilters) => void;
  retry: () => void;
  startReplay: () => Promise<void>;
  pauseReplay: () => Promise<void>;
  resetReplay: () => Promise<void>;
  requestAnalysis: (question: string) => Promise<PilotAnalysis>;
};

export const PilotDashboardContext = createContext<PilotDashboardContextValue | null>(null);

export function PilotDashboardProvider({ children }: { children: ReactNode }): ReactNode {
  const [status, setStatus] = useState<PilotStatus | null>(null);
  const [snapshot, setSnapshot] = useState<PilotSnapshot | null>(null);
  const [filters, setFiltersState] = useState<PilotFilters | null>(null);
  const [options, setOptions] = useState<PilotFilterOptions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mounted = useRef(false);
  const filtersRef = useRef<PilotFilters | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const replayController = useRef<AbortController | null>(null);
  const refreshRef = useRef<(loadOptions: boolean) => void>(() => undefined);

  const refresh = useCallback((loadOptions: boolean) => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setIsLoading(true);
    setError(null);
    void (async () => {
      try {
        const nextStatus = await requestPilotStatus(controller.signal);
        if (!mounted.current || controller.signal.aborted) return;
        setStatus(nextStatus);
        if (!nextStatus.ready) {
          setOptions(null);
          setIsLoading(false);
          return;
        }
        const nextFilters = filtersRef.current ?? { start: nextStatus.range.start, end: nextStatus.range.end };
        if (!filtersRef.current) {
          filtersRef.current = nextFilters;
          setFiltersState(nextFilters);
        }
        const [nextOptions, nextSnapshot] = await Promise.all([
          loadOptions || !options ? requestPilotFilterOptions(controller.signal) : Promise.resolve(options),
          requestPilotSnapshot(nextFilters, controller.signal),
        ]);
        if (!mounted.current || controller.signal.aborted) return;
        if (nextOptions) setOptions(nextOptions);
        setSnapshot(nextSnapshot);
        setError(null);
      } catch (cause) {
        if (controller.signal.aborted || !mounted.current) return;
        setError(cause instanceof Error ? cause : new Error('璇曠偣鏁版嵁鍔犺浇澶辫触'));
      } finally {
        if (mounted.current && requestController.current === controller) setIsLoading(false);
      }
    })();
  }, [options]);
  refreshRef.current = refresh;

  useEffect(() => {
    mounted.current = true;
    refreshRef.current(true);
    const timer = window.setInterval(() => refreshRef.current(false), 3000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      requestController.current?.abort();
      replayController.current?.abort();
    };
  }, []);

  const setFilters = useCallback((nextFilters: PilotFilters) => {
    filtersRef.current = nextFilters;
    setFiltersState(nextFilters);
    refreshRef.current(false);
  }, []);
  const retry = useCallback(() => refreshRef.current(true), []);
  const replay = useCallback(async (action: PilotReplayAction) => {
    replayController.current?.abort();
    const controller = new AbortController();
    replayController.current = controller;
    try {
      const nextReplay = await controlPilotReplay(action, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      setStatus((current) => current?.ready ? { ...current, replay: nextReplay } : current);
      setError(null);
    } catch (cause) {
      if (!controller.signal.aborted && mounted.current) setError(cause instanceof Error ? cause : new Error('璇曠偣鍥炴斁鎿嶄綔澶辫触'));
    }
  }, []);
  const requestAnalysis = useCallback((question: string) => {
    if (!filtersRef.current) return Promise.reject(new Error('璇曠偣灏氭湭灏辩华'));
    return requestPilotAnalysis(filtersRef.current, question);
  }, []);

  const value = useMemo<PilotDashboardContextValue>(() => ({
    status, snapshot, filters, options, isLoading, error, setFilters, retry,
    startReplay: () => replay('start'), pauseReplay: () => replay('pause'), resetReplay: () => replay('reset'), requestAnalysis,
  }), [error, filters, isLoading, options, replay, requestAnalysis, retry, setFilters, snapshot, status]);
  return <PilotDashboardContext.Provider value={value}>{children}</PilotDashboardContext.Provider>;
}
