import { useState, type JSX } from 'react';
import { usePilotDashboard } from '../../app/usePilotDashboard';
import { PilotAnalysisDashboard } from './PilotAnalysisDashboard';
import { PilotFilters } from './PilotFilters';
import { PilotHeader, type PilotTab } from './PilotHeader';
import { PilotRealtimeDashboard } from './PilotRealtimeDashboard';

const sourceUrl = 'https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce';

export function PilotApp(): JSX.Element {
  const [activeTab, setActiveTab] = useState<PilotTab>('realtime');
  const { status, snapshot, filters, options, isLoading, error, setFilters, retry, startReplay, pauseReplay, resetReplay } = usePilotDashboard();
  if (isLoading && !status) return <p className="pilot-loading" role="status">正在加载 Olist 试点状态</p>;
  if (!status || !status.ready) {
    const command = status?.ready === false ? status.importCommand : 'pnpm data:olist:import';
    return <section className="pilot-import-guide" aria-labelledby="pilot-import-title"><h1 id="pilot-import-title">Olist 真实数据试点</h1><p>真实匿名历史数据回放</p><p>尚未导入本地试点数据。请从 <a href={sourceUrl} target="_blank" rel="noreferrer">Olist 官方数据集</a> 下载后执行：</p><code>{command}</code></section>;
  }
  if (!snapshot || !filters || !options) return <p className="pilot-loading" role="status">正在加载试点快照</p>;
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
