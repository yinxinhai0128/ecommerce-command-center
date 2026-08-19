import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { PilotDashboardContextValue } from '../../app/PilotDashboardProvider';
import { PilotDashboardContext } from '../../app/PilotDashboardProvider';
import { PilotApp } from './PilotApp';

function renderPilot(value: Partial<PilotDashboardContextValue>): void {
  const context: PilotDashboardContextValue = {
    status: { ready: false, importCommand: 'pnpm data:import' }, snapshot: null, filters: null, options: null,
    isLoading: false, error: null, setFilters: () => undefined, retry: () => undefined,
    startReplay: async () => undefined, pauseReplay: async () => undefined, resetReplay: async () => undefined,
    requestAnalysis: async () => ({ summary: '', signals: [], causes: [], risks: [], actions: [], followUps: [], source: 'local', generatedAt: '2018-01-01T00:00:00Z', metadata: { sourceLocalNow: '2018-01-01 00:00:00' } }),
    ...value,
  };
  render(<PilotDashboardContext.Provider value={context}><PilotApp /></PilotDashboardContext.Provider>);
}

test('经营数据请求失败时提供重试操作', () => {
  const retry = vi.fn();
  renderPilot({ error: new Error('连接失败'), isLoading: false, retry });

  expect(screen.getByRole('alert')).toHaveTextContent('连接失败');
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  expect(retry).toHaveBeenCalledOnce();
});
