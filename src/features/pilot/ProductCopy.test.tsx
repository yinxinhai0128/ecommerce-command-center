import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import { PilotDashboardContext, type PilotDashboardContextValue } from '../../app/PilotDashboardProvider';
import { DataSourceSwitch } from '../../ui/DataSourceSwitch';
import { PilotApp } from './PilotApp';
import { PilotHeader } from './PilotHeader';
import { PilotRealtimeDashboard } from './PilotRealtimeDashboard';

const forbiddenProductCopy = /Olist|Kaggle|CC BY|试点|模拟数据|Demo/i;

const unavailableDashboard: PilotDashboardContextValue = {
  status: { ready: false, importCommand: 'pnpm data:olist:import' }, snapshot: null, filters: null, options: null,
  isLoading: false, error: null, setFilters: () => undefined, retry: () => undefined,
  startReplay: async () => undefined, pauseReplay: async () => undefined, resetReplay: async () => undefined,
  requestAnalysis: async () => ({ summary: '', signals: [], causes: [], risks: [], actions: [], followUps: [], source: 'local', generatedAt: '2018-01-01T00:00:00Z', metadata: { sourceLocalNow: '2018-01-01 00:00:00' } }),
};

test('产品页面不暴露数据来源、许可或演示声明', () => {
  const { container: sourceSwitch } = render(<DataSourceSwitch value="simulation" onChange={() => undefined} />);
  expect(sourceSwitch).not.toHaveTextContent(forbiddenProductCopy);

  const { container: app } = render(<PilotDashboardContext.Provider value={unavailableDashboard}><PilotApp /></PilotDashboardContext.Provider>);
  expect(app).not.toHaveTextContent(forbiddenProductCopy);

  const { container: header } = render(
    <PilotHeader
      activeTab="realtime"
      onTabChange={() => undefined}
      replay={{ isRunning: false, sourceLocalNow: '2018-01-31 09:30:00' }}
      onStart={async () => undefined}
      onPause={async () => undefined}
      onReset={async () => undefined}
    />,
  );
  expect(header).not.toHaveTextContent(forbiddenProductCopy);

  const { container: dashboard } = render(
    <PilotRealtimeDashboard
      snapshot={{
        filters: { start: '2018-01-01', end: '2018-01-31' }, sourceLocalNow: '2018-01-31 09:30:00', comparisonLabel: '较上期',
        kpis: Object.fromEntries(['itemGmv', 'validOrderCount', 'averageOrderValue', 'cancellationRate', 'onTimeDeliveryRate', 'averageDeliveryDays', 'averageReviewScore'].map((key) => [key, { value: 0, comparisonValue: 0, changeRate: 0 }])) as never,
        dailyTrend: [], fulfillmentFunnel: [], categoryRanking: [], sellerRanking: [], customerStateRanking: [], recentOrders: [], capabilities: [],
        commerce: { paymentAmount: { value: 0, comparisonValue: 0, changeRate: 0 }, uniqueBuyerCount: { value: 0, comparisonValue: 0, changeRate: 0 }, repeatBuyerCount: { value: 0, comparisonValue: 0, changeRate: 0 } },
        payments: { byType: [], installments: [] }, fulfillment: { statusDistribution: [], averageApprovalDays: 0, averageCarrierDays: 0, averageDeliveryDays: 0, lateDeliveryRate: 0, averageLateDays: 0 }, experience: { scoreDistribution: [], lowScoreRate: 0, averageReplyDays: 0 }, contributions: { categories: [], sellers: [], customerStates: [] },
      }}
      onClearFilters={() => undefined}
    />,
  );
  expect(dashboard).not.toHaveTextContent(forbiddenProductCopy);
});
