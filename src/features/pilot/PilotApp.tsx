import { useState, type JSX } from 'react';
import { usePilotDashboard } from '../../app/usePilotDashboard';
import { PilotAnalysisDashboard } from './PilotAnalysisDashboard';
import { PilotFilters } from './PilotFilters';
import { PilotHeader, type PilotTab } from './PilotHeader';
import { PilotRealtimeDashboard } from './PilotRealtimeDashboard';

export function PilotApp(): JSX.Element {
  const [activeTab, setActiveTab] = useState<PilotTab>('realtime');
  const { status, snapshot, filters, options, isLoading, error, setFilters, retry, startReplay, pauseReplay, resetReplay } = usePilotDashboard();
  if (isLoading && !status) return <p className="pilot-loading" role="status">正在加载运营状态</p>;
  if (!status || !status.ready) {
    return <section className="pilot-import-guide" aria-labelledby="pilot-import-title"><h1 id="pilot-import-title">运营数据准备</h1><p>历史经营数据回放</p><p>本地运营数据尚未准备完毕。请在数据管理流程中执行导入命令。</p></section>;
  }
  if (!snapshot || !filters || !options) return <p className="pilot-loading" role="status">正在加载经营快照</p>;
  return (
    <>
      <PilotHeader activeTab={activeTab} onTabChange={setActiveTab} replay={status.replay} onStart={startReplay} onPause={pauseReplay} onReset={resetReplay} />
      <PilotFilters filters={filters} options={options} onChange={setFilters} />
      {error && <div className="pilot-request-error" role="alert"><span>{error.message}</span><button type="button" onClick={retry}>重试</button></div>}
      <section id="pilot-panel-realtime" className="dashboard-content" role="tabpanel" aria-labelledby="pilot-tab-realtime" hidden={activeTab !== 'realtime'}><PilotRealtimeDashboard snapshot={snapshot} onClearFilters={() => setFilters({ start: filters.start, end: filters.end })} /></section>
      <section id="pilot-panel-analysis" className="dashboard-content" role="tabpanel" aria-labelledby="pilot-tab-analysis" hidden={activeTab !== 'analysis'}><PilotAnalysisDashboard active={activeTab === 'analysis'} /></section>
    </>
  );
}
