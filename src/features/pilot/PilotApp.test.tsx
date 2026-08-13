import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { PilotDashboardContext, type PilotDashboardContextValue } from '../../app/PilotDashboardProvider';
import { PilotApp } from './PilotApp';

function renderPilot(value: Partial<PilotDashboardContextValue>): void {
  const context: PilotDashboardContextValue = {
    status: { ready: false, importCommand: 'pnpm data:olist:import' }, snapshot: null, filters: null, options: null,
    isLoading: false, error: null, setFilters: () => undefined, retry: () => undefined,
    startReplay: async () => undefined, pauseReplay: async () => undefined, resetReplay: async () => undefined,
    requestAnalysis: async () => ({ summary: '', signals: [], causes: [], risks: [], actions: [], followUps: [], source: 'local', generatedAt: '2018-01-01T00:00:00Z', metadata: { sourceLocalNow: '2018-01-01 00:00:00' } }),
    ...value,
  };
  render(<PilotDashboardContext.Provider value={context}>{context.status && <PilotApp />}</PilotDashboardContext.Provider>);
}

test('数据尚未导入时展示中性导入指引', () => {
  renderPilot({});

  expect(screen.getByRole('heading', { name: '运营数据准备' })).toBeInTheDocument();
  expect(screen.getByText('pnpm data:data:import')).toBeInTheDocument();
});
