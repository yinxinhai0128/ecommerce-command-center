import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { PilotDashboardContext, type PilotDashboardContextValue } from '../../app/PilotDashboardProvider';
import type { PilotSnapshot } from '../../pilot/types';
import { PilotAnalysisDashboard } from './PilotAnalysisDashboard';

const filters = { start: '2018-01-01', end: '2018-01-31' };
const snapshot: PilotSnapshot = {
  filters, sourceLocalNow: '2018-01-31 00:00:00', comparisonLabel: '较上期',
  kpis: Object.fromEntries(['itemGmv', 'validOrderCount', 'averageOrderValue', 'cancellationRate', 'onTimeDeliveryRate', 'averageDeliveryDays', 'averageReviewScore'].map((key) => [key, { value: 490, comparisonValue: 400, changeRate: 0.225 }])) as PilotSnapshot['kpis'],
  dailyTrend: [], fulfillmentFunnel: [], categoryRanking: [], sellerRanking: [], customerStateRanking: [], recentOrders: [], capabilities: [],
};

const answer = { summary: '配送表现正常。', signals: [], causes: [], risks: [], actions: [], followUps: [], source: 'local' as const, generatedAt: '2018-01-31T00:00:00Z', metadata: { sourceLocalNow: snapshot.sourceLocalNow } };

function Harness(): ReactNode {
  const [current, setCurrent] = useState(snapshot);
  const requestAnalysis = vi.fn(async (question: string) => ({ ...answer, summary: `${question}：配送表现正常。` }));
  const value: PilotDashboardContextValue = {
    status: { ready: true, range: filters, replay: { sourceLocalNow: current.sourceLocalNow, isRunning: true } }, snapshot: current, filters, options: { categories: [], sellerIds: [], customerStates: [] },
    isLoading: false, error: null, setFilters: () => undefined, retry: () => undefined,
    startReplay: async () => undefined, pauseReplay: async () => undefined, resetReplay: async () => undefined, requestAnalysis,
  };
  return <PilotDashboardContext.Provider value={value}><button type="button" onClick={() => setCurrent({ ...current, sourceLocalNow: '2018-02-01 06:00:00' })}>推进回放</button><PilotAnalysisDashboard active /></PilotDashboardContext.Provider>;
}

test('提问后在回放时间变化时将旧分析标记为过期', async () => {
  render(<Harness />);
  fireEvent.change(screen.getByLabelText('经营问题'), { target: { value: '配送是否存在问题？' } });
  fireEvent.click(screen.getByRole('button', { name: '提问' }));

  expect(await within(screen.getByRole('log', { name: '分析对话记录' })).findByText('配送是否存在问题？：配送表现正常。')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '推进回放' }));
  expect(screen.getByText('数据已变化，重新分析')).toBeInTheDocument();
  expect(screen.queryByText('未来 7 天预测')).not.toBeInTheDocument();
});
