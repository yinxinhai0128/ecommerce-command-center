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
        id={`dashboard-panel-${activeTab}`}
        className="dashboard-content"
        role="tabpanel"
        aria-labelledby={`dashboard-tab-${activeTab}`}
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
