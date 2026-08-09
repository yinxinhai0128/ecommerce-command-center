import { act, render, renderHook, screen } from '@testing-library/react';
import type { PropsWithChildren, ReactElement } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PilotDashboardProvider } from '../../src/app/PilotDashboardProvider';
import { usePilotDashboard } from '../../src/app/usePilotDashboard';

const filters = { start: '2018-01-01', end: '2018-01-31' };
const snapshot = {
  filters,
  sourceLocalNow: '2018-01-31 00:00:00', comparisonLabel: '较上期',
  kpis: Object.fromEntries(['itemGmv', 'validOrderCount', 'averageOrderValue', 'cancellationRate', 'onTimeDeliveryRate', 'averageDeliveryDays', 'averageReviewScore'].map((key) => [key, { value: 490, comparisonValue: 400, changeRate: 0.225 }])),
  dailyTrend: [], fulfillmentFunnel: [], categoryRanking: [], sellerRanking: [], customerStateRanking: [], recentOrders: [], capabilities: [],
};

function response(body: unknown): Response { return new Response(JSON.stringify(body)); }
function wrapper({ children }: PropsWithChildren): ReactElement { return <PilotDashboardProvider>{children}</PilotDashboardProvider>; }

function Probe() {
  const dashboard = usePilotDashboard();
  return <>
    <span>{dashboard.snapshot ? `￥${dashboard.snapshot.kpis.itemGmv.value.toFixed(2)}` : 'no snapshot'}</span>
    {dashboard.error && <span role="alert">{dashboard.error.message}</span>}
    <span>{dashboard.status?.ready ? (dashboard.status.replay.isRunning ? '回放中' : '已暂停') : '未就绪'}</span>
    <span>{dashboard.filters ? `${dashboard.filters.start}/${dashboard.filters.end}` : 'no filters'}</span>
    <button onClick={() => void dashboard.pauseReplay()}>暂停回放</button>
    <button onClick={dashboard.retry}>重试</button>
  </>;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test('仅在已挂载且就绪时轮询，并在瞬时失败后保留上一份快照', async () => {
  let snapshotRequests = 0;
  const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
    const path = String(url);
    if (path === '/api/pilot/status') return response({ ready: true, range: filters, replay: { sourceLocalNow: '2018-01-31 00:00:00', isRunning: true } });
    if (path === '/api/pilot/filter-options') return response({ categories: [], sellerIds: [], customerStates: [] });
    if (path.startsWith('/api/pilot/snapshot')) {
      snapshotRequests += 1;
      if (snapshotRequests === 2) throw new TypeError('offline');
      return response(snapshot);
    }
    throw new Error(`unexpected ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const { unmount } = render(<PilotDashboardProvider><Probe /></PilotDashboardProvider>);

  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(screen.getByText('￥490.00')).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(screen.getByText('￥490.00')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('璇曠偣鏈嶅姟缃戠粶杩炴帴澶辫触');
  unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(snapshotRequests).toBe(2);
});

test('未就绪时不请求选项或快照', async () => {
  const fetchMock = vi.fn(async () => response({ ready: false, importCommand: 'pnpm data:olist:import' }));
  vi.stubGlobal('fetch', fetchMock);
  render(<PilotDashboardProvider><Probe /></PilotDashboardProvider>);

  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText('未就绪')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('暂停操作采用服务器返回的状态，而不在客户端伪造回放时间', async () => {
  let isRunning = true;
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    if (path === '/api/pilot/status') return response({ ready: true, range: filters, replay: { sourceLocalNow: '2018-01-31 00:00:00', isRunning } });
    if (path === '/api/pilot/filter-options') return response({ categories: [], sellerIds: [], customerStates: [] });
    if (path.startsWith('/api/pilot/snapshot')) return response(snapshot);
    if (path === '/api/pilot/replay') {
      expect(JSON.parse(init?.body as string)).toEqual({ action: 'pause' });
      isRunning = false;
      return response({ sourceLocalNow: '2018-01-31 12:00:00', isRunning: false });
    }
    throw new Error(`unexpected ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<PilotDashboardProvider><Probe /></PilotDashboardProvider>);

  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(screen.getByText('回放中')).toBeInTheDocument();
  await act(async () => { screen.getByRole('button', { name: '暂停回放' }).click(); await Promise.resolve(); });
  expect(screen.getByText('已暂停')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith('/api/pilot/replay', expect.objectContaining({ signal: expect.any(AbortSignal) }));
});

test('从未就绪恢复时按服务端回放日重建 30 天筛选，且不会留下旧快照或错误', async () => {
  let statusRequests = 0;
  const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
    const path = String(url);
    if (path === '/api/pilot/status') {
      statusRequests += 1;
      return response(statusRequests === 1
        ? { ready: false, importCommand: 'pnpm data:olist:import' }
        : { ready: true, range: { start: '2018-01-05', end: '2018-12-31' }, replay: { sourceLocalNow: '2018-02-01 12:00:00', isRunning: true } });
    }
    if (path === '/api/pilot/filter-options') return response({ categories: [], sellerIds: [], customerStates: [] });
    if (path.startsWith('/api/pilot/snapshot')) return response({ ...snapshot, filters: { start: '2018-01-05', end: '2018-02-01' } });
    throw new Error(`unexpected ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<PilotDashboardProvider><Probe /></PilotDashboardProvider>);
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

  expect(screen.getByText('2018-01-05/2018-02-01')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith('/api/pilot/snapshot?start=2018-01-05&end=2018-02-01', expect.anything());
});

test('重复重试不额外创建轮询计时器', async () => {
  const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
    const path = String(url);
    if (path === '/api/pilot/status') return response({ ready: false, importCommand: 'pnpm data:olist:import' });
    throw new Error(`unexpected ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<PilotDashboardProvider><Probe /></PilotDashboardProvider>);
  await act(async () => { await Promise.resolve(); });
  await act(async () => { screen.getByRole('button', { name: '重试' }).click(); screen.getByRole('button', { name: '重试' }).click(); await Promise.resolve(); });
  const beforePoll = fetchMock.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(fetchMock.mock.calls.length).toBe(beforePoll + 1);
});

test('卸载会取消分析请求；即使旧请求忽略取消并随后返回，也只得到 AbortError', async () => {
  let resolveAnalysis: (value: Response) => void = () => undefined;
  let analysisSignal: AbortSignal | undefined;
  const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    if (path === '/api/pilot/status') return Promise.resolve(response({ ready: true, range: filters, replay: { sourceLocalNow: '2018-01-31 00:00:00', isRunning: true } }));
    if (path === '/api/pilot/filter-options') return Promise.resolve(response({ categories: [], sellerIds: [], customerStates: [] }));
    if (path.startsWith('/api/pilot/snapshot')) return Promise.resolve(response(snapshot));
    if (path === '/api/pilot/analysis') {
      analysisSignal = init?.signal ?? undefined;
      return new Promise<Response>((resolve) => { resolveAnalysis = resolve; });
    }
    throw new Error(`unexpected ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const { result, unmount } = renderHook(() => usePilotDashboard(), { wrapper });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  const pending = result.current.requestAnalysis('表现如何？');
  unmount();
  expect(analysisSignal?.aborted).toBe(true);
  resolveAnalysis(response({ summary: 'ok', signals: [], causes: [], risks: [], actions: [], followUps: [], source: 'local', generatedAt: '2018-01-31T00:00:00Z', metadata: { sourceLocalNow: '2018-01-31 00:00:00' } }));
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});

test('回放变更进行中跳过轮询，并在最新服务器回放状态后只刷新一次', async () => {
  let resolveReplay: (value: Response) => void = () => undefined;
  let isRunning = true;
  const fetchMock = vi.fn((url: RequestInfo | URL) => {
    const path = String(url);
    if (path === '/api/pilot/status') return Promise.resolve(response({ ready: true, range: filters, replay: { sourceLocalNow: '2018-01-31 00:00:00', isRunning } }));
    if (path === '/api/pilot/filter-options') return Promise.resolve(response({ categories: [], sellerIds: [], customerStates: [] }));
    if (path.startsWith('/api/pilot/snapshot')) return Promise.resolve(response(snapshot));
    if (path === '/api/pilot/replay') return new Promise<Response>((resolve) => { resolveReplay = resolve; });
    throw new Error(`unexpected ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<PilotDashboardProvider><Probe /></PilotDashboardProvider>);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  screen.getByRole('button', { name: '暂停回放' }).click();
  const pendingCalls = fetchMock.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(fetchMock.mock.calls.length).toBe(pendingCalls);
  isRunning = false;
  resolveReplay(response({ sourceLocalNow: '2018-01-31 12:00:00', isRunning: false }));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(screen.getByText('已暂停')).toBeInTheDocument();
  expect(fetchMock.mock.calls.length).toBe(pendingCalls + 2);
});
