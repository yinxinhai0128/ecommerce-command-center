import { useState, type JSX } from 'react';
import { DashboardProvider } from './app/DashboardProvider';
import { AppHeader, type DashboardTab } from './ui/AppHeader';
import { GlobalFilters } from './ui/GlobalFilters';

function DashboardApp(): JSX.Element {
  const [activeTab, setActiveTab] = useState<DashboardTab>('realtime');

  return (
    <main className="dashboard-app">
      <AppHeader activeTab={activeTab} onTabChange={setActiveTab} />
      <GlobalFilters />
      <section
        id="dashboard-panel-realtime"
        className="dashboard-content"
        role="tabpanel"
        aria-labelledby="dashboard-tab-realtime"
        hidden={activeTab !== 'realtime'}
      />
      <section
        id="dashboard-panel-analysis"
        className="dashboard-content"
        role="tabpanel"
        aria-labelledby="dashboard-tab-analysis"
        hidden={activeTab !== 'analysis'}
      />
    </main>
  );
}

export function App(): JSX.Element {
  return (
    <DashboardProvider>
      <DashboardApp />
    </DashboardProvider>
  );
}
