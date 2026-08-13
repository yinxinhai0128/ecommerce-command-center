import { lazy, Suspense, useState, type JSX } from 'react';
import { DashboardProvider } from './app/DashboardProvider';
import { PilotDashboardProvider } from './app/PilotDashboardProvider';
import { useDashboard } from './app/useDashboard';
import { AppShell } from './coreui/AppShell';
import type { ProductView } from './coreui/navigation';
import { AnalysisDashboard } from './features/analysis/AnalysisDashboard';
import { PilotApp } from './features/pilot/PilotApp';
import { RealtimeDashboard } from './features/realtime/RealtimeDashboard';
import { GlobalFilters } from './ui/GlobalFilters';

const OverviewPage = lazy(async () => ({ default: (await import('./features/overview/OverviewPage')).OverviewPage }));

function Loading(): JSX.Element { return <p className="workspace-loading" role="status">正在加载</p>; }

function StandardWorkspace({ view }: { view: Exclude<ProductView, 'operations'> }): JSX.Element {
  const { snapshot, alerts, filters, isRunning } = useDashboard();
  if (view === 'overview') return <OverviewPage snapshot={snapshot} />;
  return <><GlobalFilters />{view === 'analysis' ? <AnalysisDashboard snapshot={snapshot} alerts={alerts} filters={filters} active /> : <RealtimeDashboard snapshot={snapshot} alerts={alerts} isRunning={isRunning} />}</>;
}

function OperationsWorkspace(): JSX.Element {
  return <PilotApp />;
}

function Workspace({ view }: { view: ProductView }): JSX.Element {
  if (view === 'operations') return <PilotDashboardProvider><OperationsWorkspace /></PilotDashboardProvider>;
  return <DashboardProvider><StandardWorkspace view={view} /></DashboardProvider>;
}

export function App(): JSX.Element {
  const [activeView, setActiveView] = useState<ProductView>('overview');
  return <main className="dashboard-app"><AppShell activeView={activeView} onViewChange={setActiveView}><Suspense fallback={<Loading />}><Workspace view={activeView} /></Suspense></AppShell></main>;
}
