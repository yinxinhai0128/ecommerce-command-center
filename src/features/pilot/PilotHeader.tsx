import type { JSX, KeyboardEvent } from 'react';
import type { PilotReplayState } from '../../pilot/types';

export type PilotTab = 'realtime' | 'analysis';

type PilotHeaderProps = {
  activeTab: PilotTab;
  onTabChange: (tab: PilotTab) => void;
  replay: PilotReplayState;
  onStart: () => Promise<void>;
  onPause: () => Promise<void>;
  onReset: () => Promise<void>;
};

export function PilotHeader({ activeTab, onTabChange, replay, onStart, onPause, onReset }: PilotHeaderProps): JSX.Element {
  function selectTab(tab: PilotTab): void {
    onTabChange(tab);
    document.getElementById(`pilot-tab-${tab}`)?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    selectTab(activeTab === 'realtime' ? 'analysis' : 'realtime');
  }

  return (
    <header className="app-header pilot-header">
      <div>
        <h1>Olist 真实数据试点</h1>
        <p className="pilot-source-mark">真实匿名历史数据回放</p>
      </div>
      <div className="app-tabs" role="tablist" aria-label="试点模块">
        {(['realtime', 'analysis'] as const).map((tab) => (
          <button key={tab} id={`pilot-tab-${tab}`} type="button" role="tab" aria-selected={activeTab === tab} aria-controls={`pilot-panel-${tab}`} tabIndex={activeTab === tab ? 0 : -1} onClick={() => selectTab(tab)} onKeyDown={handleTabKeyDown}>
            {tab === 'realtime' ? '实时监控' : '智能分析'}
          </button>
        ))}
      </div>
      <div className="pilot-runtime">
        <span className={`runtime-status ${replay.isRunning ? 'is-running' : 'is-paused'}`}><span aria-hidden="true" className="status-dot" />{replay.isRunning ? '回放中' : '已暂停'}</span>
        <time dateTime={replay.sourceLocalNow.replace(' ', 'T')}>源数据本地时间 {replay.sourceLocalNow}</time>
        <a href="https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce" target="_blank" rel="noreferrer">Olist · CC BY-NC-SA 4.0</a>
        <button type="button" className="runtime-control" onClick={() => void (replay.isRunning ? onPause() : onStart())}>{replay.isRunning ? '暂停回放' : '开始回放'}</button>
        <button type="button" className="runtime-control" onClick={() => void onReset()}>重置回放</button>
      </div>
    </header>
  );
}
