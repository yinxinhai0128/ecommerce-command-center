import { lazy, Suspense, useState, type JSX } from 'react';
import { DashboardProvider } from './app/DashboardProvider';
import { PilotDashboardProvider } from './app/PilotDashboardProvider';
import { useDashboard } from './app/useDashboard';
import { usePilotDashboard } from './app/usePilotDashboard';
import { AppShell } from './coreui/AppShell';
import type { ProductView } from './coreui/navigation';
import { AnalysisDashboard } from './features/analysis/AnalysisDashboard';
import { RealtimeDashboard } from './features/realtime/RealtimeDashboard';
import { GlobalFilters } from './ui/GlobalFilters';

const OverviewPage = lazy(async () => ({ default: (await import('./features/overview/OverviewPage')).OverviewPage }));
const OperationsPage = lazy(async () => ({ default: (await import('./features/operations/OperationsPage')).OperationsPage }));

function Loading(): JSX.Element { return <p className="workspace-loading" role="status">正在加载</p>; }

function StandardWorkspace({ view }: { view: Exclude<ProductView, 'operations'> }): JSX.Element {
  const { snapshot, alerts, filters, isRunning } = useDashboard();
  if (view === 'overview') return <OverviewPage snapshot={snapshot} />;
  return <><GlobalFilters />{view === 'analysis' ? <AnalysisDashboard snapshot={snapshot} alerts={alerts} filters={filters} active /> : <RealtimeDashboard snapshot={snapshot} alerts={alerts} isRunning={isRunning} />}</>;
}

function OperationsWorkspace(): JSX.Element {
  const { status, snapshot, isLoading, error, retry } = usePilotDashboard();
  if (error) return <section className="workspace-state" role="alert"><span>{error.message}</span><button type="button" onClick={retry}>重试</button></section>;
  if (isLoading || !status) return <Loading />;
  if (!status.ready || !snapshot) return <section className="workspace-state"><p>经营数据暂不可用</p><button type="button" onClick={retry}>重试</button></section>;
  return <OperationsPage snapshot={snapshot} />;
}

function Workspace({ view }: { view: ProductView }): JSX.Element {
  if (view === 'operations') return <PilotDashboardProvider><OperationsWorkspace /></PilotDashboardProvider>;
  return <DashboardProvider><StandardWorkspace view={view} /></DashboardProvider>;
}

export function App(): JSX.Element {
  const [activeView, setActiveView] = useState<ProductView>('overview');
  return <main className="dashboard-app"><AppShell activeView={activeView} onViewChange={setActiveView}><Suspense fallback={<Loading />}><Workspace view={activeView} /></Suspense></AppShell></main>;
}
