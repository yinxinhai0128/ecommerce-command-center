import type { JSX, KeyboardEvent } from 'react';
import { useDashboard } from '../app/useDashboard';

export type DashboardTab = 'realtime' | 'analysis';

type AppHeaderProps = {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
};

export function AppHeader({ activeTab, onTabChange }: AppHeaderProps): JSX.Element {
  const { isRunning, lastUpdatedAt, toggleRunning } = useDashboard();

  function selectTab(tab: DashboardTab): void {
    onTabChange(tab);
    document.getElementById(`dashboard-tab-${tab}`)?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    selectTab(activeTab === 'realtime' ? 'analysis' : 'realtime');
  }

  return (
    <header className="app-header">
      <h1>经营驾驶舱</h1>
      <div className="app-tabs" role="tablist" aria-label="一级模块">
        <button
          id="dashboard-tab-realtime"
          type="button"
          role="tab"
          aria-selected={activeTab === 'realtime'}
          aria-controls="dashboard-panel-realtime"
          tabIndex={activeTab === 'realtime' ? 0 : -1}
          onClick={() => selectTab('realtime')}
          onKeyDown={handleTabKeyDown}
        >
          实时监控
        </button>
        <button
          id="dashboard-tab-analysis"
          type="button"
          role="tab"
          aria-selected={activeTab === 'analysis'}
          aria-controls="dashboard-panel-analysis"
          tabIndex={activeTab === 'analysis' ? 0 : -1}
          onClick={() => selectTab('analysis')}
          onKeyDown={handleTabKeyDown}
        >
          智能分析
        </button>
      </div>
      <div className="app-runtime">
        <span className={`runtime-status ${isRunning ? 'is-running' : 'is-paused'}`}>
          <span aria-hidden="true" className="status-dot" />
          {isRunning ? '实时运行中' : '已暂停'}
        </span>
        <time dateTime={lastUpdatedAt.toISOString()}>更新时间 {lastUpdatedAt.toLocaleString('zh-CN', { hour12: false })}</time>
        <button type="button" className="runtime-control" onClick={toggleRunning}>
          {isRunning ? '暂停更新' : '恢复更新'}
        </button>
      </div>
    </header>
  );
}
