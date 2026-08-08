import { createContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { applyEvent, createNextEvent } from '../data/eventSimulator';
import { generateDataset } from '../data/generateDataset';
import type { DashboardAlert, DashboardFilters, DashboardSnapshot } from '../domain/types';
import { detectAnomalies } from '../metrics/detectAnomalies';
import { calculateSnapshot } from '../metrics/calculateMetrics';

export type DashboardContextValue = {
  snapshot: DashboardSnapshot;
  alerts: DashboardAlert[];
  filters: DashboardFilters;
  setFilters: Dispatch<SetStateAction<DashboardFilters>>;
  isRunning: boolean;
  toggleRunning: () => void;
  lastUpdatedAt: Date;
};

export const DashboardContext = createContext<DashboardContextValue | null>(null);

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function DashboardProvider({ children }: { children: ReactNode }): ReactNode {
  const [initialNow] = useState(() => new Date());
  const [dataset, setDataset] = useState(() => generateDataset(20260808, initialNow));
  const [filters, setFilters] = useState<DashboardFilters>(() => ({ start: startOfDay(initialNow), end: initialNow }));
  const [isRunning, setIsRunning] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(initialNow);
  const eventSeed = useRef(20260808);

  useEffect(() => {
    if (!isRunning) return undefined;
    const timer = window.setInterval(() => {
      const now = new Date();
      eventSeed.current += 1;
      setDataset((previous) => applyEvent(previous, createNextEvent(previous, eventSeed.current, now)));
      setFilters((previous) => previous.end.getTime() === lastUpdatedAt.getTime() ? { ...previous, end: now } : previous);
      setLastUpdatedAt(now);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [isRunning, lastUpdatedAt]);

  const snapshot = useMemo(() => calculateSnapshot(dataset, filters, lastUpdatedAt), [dataset, filters, lastUpdatedAt]);
  const alerts = useMemo(() => detectAnomalies(snapshot), [snapshot]);
  const value = useMemo<DashboardContextValue>(() => ({
    snapshot,
    alerts,
    filters,
    setFilters,
    isRunning,
    toggleRunning: () => setIsRunning((running) => !running),
    lastUpdatedAt,
  }), [alerts, filters, isRunning, lastUpdatedAt, snapshot]);

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}
