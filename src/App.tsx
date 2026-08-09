import { useState, type JSX } from 'react';
import { DashboardProvider } from './app/DashboardProvider';
import { AppHeader, type DashboardTab } from './ui/AppHeader';
import { GlobalFilters } from './ui/GlobalFilters';
import { useDashboard } from './app/useDashboard';
import { RealtimeDashboard } from './features/realtime/RealtimeDashboard';
import { AnalysisDashboard } from './features/analysis/AnalysisDashboard';
import { PilotDashboardProvider } from './app/PilotDashboardProvider';
import { PilotApp } from './features/pilot/PilotApp';
import { DataSourceSwitch, type DataSource } from './ui/DataSourceSwitch';

function DashboardApp(): JSX.Element {
  const [activeTab, setActiveTab] = useState<DashboardTab>('realtime');
  const { snapshot, alerts, filters, isRunning } = useDashboard();

  return (
    <>
      <AppHeader activeTab={activeTab} onTabChange={setActiveTab} />
      <GlobalFilters />
      <section
        id="dashboard-panel-realtime"
        className="dashboard-content"
        role="tabpanel"
        aria-labelledby="dashboard-tab-realtime"
        hidden={activeTab !== 'realtime'}
      ><RealtimeDashboard snapshot={snapshot} alerts={alerts} isRunning={isRunning} /></section>
      <section
        id="dashboard-panel-analysis"
        className="dashboard-content"
        role="tabpanel"
        aria-labelledby="dashboard-tab-analysis"
        hidden={activeTab !== 'analysis'}
      ><AnalysisDashboard snapshot={snapshot} alerts={alerts} filters={filters} active={activeTab === 'analysis'} /></section>
    </>
  );
}

export function App(): JSX.Element {
  const [source, setSource] = useState<DataSource>('simulation');
  return (
    <main className="dashboard-app">
      <DataSourceSwitch value={source} onChange={setSource} />
      {source === 'simulation' ? <DashboardProvider><DashboardApp /></DashboardProvider> : <PilotDashboardProvider><PilotApp /></PilotDashboardProvider>}
    </main>
  );
}
