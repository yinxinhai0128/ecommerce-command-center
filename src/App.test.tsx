import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from './App';
import { Panel } from './ui/Panel';

vi.mock('echarts-for-react', () => ({
  default: ({ 'aria-label': ariaLabel }: { 'aria-label'?: string }) => <div role="img" aria-label={ariaLabel} />,
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function select(view: '概览' | '实时监控' | '智能分析' | '经营数据'): void {
  fireEvent.click(screen.getByRole('button', { name: view }));
}

test('默认展示概览，实时工作区仍展示核心看板和全局筛选', async () => {
  render(<App />);
  expect(await screen.findByRole('heading', { name: '经营概览' })).toBeInTheDocument();

  select('实时监控');
  expect(screen.getByRole('heading', { name: '分钟经营脉冲' })).toBeInTheDocument();
  expect(screen.getByLabelText('平台')).toHaveValue('全部平台');
});

test('实时与分析工作区保持既有切换和分析请求行为', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({
    summary: '经营结论已生成。', signals: [{ label: '成交额', value: 1, direction: 'up' }], causes: [], risks: [], actions: [{ priority: 'high', title: '继续观察', rationale: '保持监测', ownerRole: '经营负责人', expectedImpact: '维持稳定', validationMetric: '成交额' }], followUps: ['下一步看什么？'], source: 'local', generatedAt: '2026-08-09T00:00:00.000Z',
  }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);

  select('智能分析');
  await screen.findByText('经营结论已生成。');
  expect(fetchMock).toHaveBeenCalledOnce();
  select('实时监控');
  select('智能分析');
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
});

test('全局筛选在实时工作区继续可用', () => {
  render(<App />);
  select('实时监控');
  const platform = screen.getByLabelText('平台');
  fireEvent.change(platform, { target: { value: '天猫' } });
  expect(platform).toHaveValue('天猫');
});

test('Panel 空态提供清除筛选操作', () => {
  const clearFilters = vi.fn();
  render(<Panel status="empty" title="商品排行" onClearFilters={clearFilters} />);
  fireEvent.click(screen.getByRole('button', { name: '清除筛选' }));
  expect(clearFilters).toHaveBeenCalledOnce();
});

test('Panel 错误态提供重试操作', () => {
  const retry = vi.fn();
  render(<Panel status="error" title="商品排行" onRetry={retry} />);
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  expect(retry).toHaveBeenCalledOnce();
});

test('工作区切换时卸载先前的数据 Provider 并清理其轮询', () => {
  vi.useFakeTimers();
  const clearInterval = vi.spyOn(window, 'clearInterval');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ready: false, importCommand: 'pnpm data:import' }), { status: 200 })));
  render(<App />);

  select('经营数据');
  expect(clearInterval).toHaveBeenCalledTimes(1);
  select('概览');
  expect(clearInterval).toHaveBeenCalledTimes(2);
});

test('CoreUI 导航只呈现当前选中的工作区', async () => {
  render(<App />);
  expect(await screen.findByRole('heading', { name: '经营概览' })).toBeInTheDocument();
  select('智能分析');
  expect(screen.getByRole('heading', { name: '今日经营结论' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '经营概览' })).not.toBeInTheDocument();
});

test('经营数据工作区保留筛选、回放控制与数据更新时间', async () => {
  const metric = { value: 100, comparisonValue: 90, changeRate: 0.1 };
  let replayIsRunning = false;
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    if (path === '/api/pilot/status') return new Response(JSON.stringify({
      ready: true,
      range: { start: '2018-01-01', end: '2018-12-31' },
      replay: { sourceLocalNow: '2018-02-01 12:00:00', isRunning: replayIsRunning },
    }));
    if (path === '/api/pilot/filter-options') return new Response(JSON.stringify({ categories: ['家居'], sellerIds: ['seller-1'], customerStates: ['SP'] }));
    if (path === '/api/pilot/replay') {
      expect(JSON.parse(init?.body as string)).toEqual({ action: 'start' });
      replayIsRunning = true;
      return new Response(JSON.stringify({ sourceLocalNow: '2018-02-01 12:00:00', isRunning: true }));
    }
    if (path.startsWith('/api/pilot/snapshot')) return new Response(JSON.stringify({
      filters: { start: '2018-01-01', end: '2018-12-31' }, sourceLocalNow: '2018-02-01 12:00:00', comparisonLabel: '上期',
      kpis: { itemGmv: metric, validOrderCount: metric, averageOrderValue: metric, cancellationRate: metric, onTimeDeliveryRate: metric, averageDeliveryDays: metric, averageReviewScore: metric },
      dailyTrend: [], fulfillmentFunnel: [], categoryRanking: [], sellerRanking: [], customerStateRanking: [], recentOrders: [], capabilities: [],
      commerce: { paymentAmount: metric, uniqueBuyerCount: metric, repeatBuyerCount: metric },
      payments: { byType: [], installments: [] },
      fulfillment: { statusDistribution: [], averageApprovalDays: 0, averageCarrierDays: 0, averageDeliveryDays: 0, lateDeliveryRate: 0, averageLateDays: 0 },
      experience: { scoreDistribution: [], lowScoreRate: 0, averageReplyDays: 0 },
      contributions: { categories: [], sellers: [], customerStates: [] },
    }));
    throw new Error(`unexpected ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<App />);
  select('经营数据');

  expect(await screen.findByLabelText('经营数据筛选')).toBeInTheDocument();
  expect(screen.getAllByText('数据更新时间 2018-02-01 12:00:00')).not.toHaveLength(0);
  expect(screen.getByRole('button', { name: '开始回放' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '重置回放' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '开始回放' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/pilot/replay', expect.objectContaining({ method: 'POST' })));
  expect(await screen.findByRole('button', { name: '暂停回放' })).toBeInTheDocument();
});
