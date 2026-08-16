import { act, render, renderHook, screen } from '@testing-library/react';
import type { PropsWithChildren, ReactElement } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PilotDashboardProvider } from '../../src/app/PilotDashboardProvider';
import { usePilotDashboard } from '../../src/app/usePilotDashboard';

const filters = { start: '2018-01-01', end: '2018-01-31' };
const metric = { value: 490, comparisonValue: 400, changeRate: 0.225 };
const snapshot = {
  filters,
  sourceLocalNow: '2018-01-31 00:00:00', comparisonLabel: '较上期',
  kpis: Object.fromEntries(['itemGmv', 'validOrderCount', 'averageOrderValue', 'cancellationRate', 'onTimeDeliveryRate', 'averageDeliveryDays', 'averageReviewScore'].map((key) => [key, metric])),
  dailyTrend: [], fulfillmentFunnel: [], categoryRanking: [], sellerRanking: [], customerStateRanking: [], recentOrders: [], capabilities: [],
  commerce: { paymentAmount: metric, uniqueBuyerCount: metric, repeatBuyerCount: metric },
  payments: { byType: [], installments: [] },
  fulfillment: { statusDistribution: [], averageApprovalDays: 0, averageCarrierDays: 0, averageDeliveryDays: 0, lateDeliveryRate: 0, averageLateDays: 0 },
  experience: { scoreDistribution: [], lowScoreRate: 0, averageReplyDays: 0 },
  contributions: { categories: [], sellers: [], customerStates: [] },
};

function response(body: unknown): Response { return new Response(JSON.stringify(body)); }
function wrapper({ children }: PropsWithChildren): ReactElement { return <PilotDashboardProvider>{children}</PilotDashboardProvider>; }
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  });
}

function Probe() {
  const dashboard = usePilotDashboard();
  return <>
    <span>{dashboard.snapshot ? `￥${dashboard.snapshot.kpis.itemGmv.value.toFixed(2)}` : 'no snapshot'}</span>
    {dashboard.error && <span role="alert">{dashboard.error.message}</span>}
    <span>{dashboard.status?.ready ? (dashboard.status.replay.isRunning ? '回放中' : '已暂停') : '未就绪'}</span>
    <span>{dashboard.filters ? `${dashboard.filters.start}/${dashboard.filters.end}` : 'no filters'}</span>
    <span>{dashboard.isLoading ? 'loading' : 'idle'}</span>
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
  expect(screen.getByRole('alert')).toHaveTextContent('经营数据服务网络连接失败');
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

test('暂停后忽略晚到的运行中轮询状态', async () => {
  let statusRequests = 0;
  const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
    const path = String(url);
    if (path === '/api/pilot/status') {
      statusRequests += 1;
      if (statusRequests === 1) return response({ ready: true, range: filters, replay: { sourceLocalNow: '2018-01-31 00:00:00', isRunning: true } });
      if (statusRequests === 2) return response({ ready: true, range: filters, replay: { sourceLocalNow: '2018-01-31 06:00:00', isRunning: false } });
      return response({ ready: true, range: filters, replay: { sourceLocalNow: '2018-01-31 12:00:00', isRunning: true } });
    }
    if (path === '/api/pilot/filter-options') return response({ categories: [], sellerIds: [], customerStates: [] });
    if (path.startsWith('/api/pilot/snapshot')) return response(snapshot);
    if (path === '/api/pilot/replay') return response({ sourceLocalNow: '2018-01-31 06:00:00', isRunning: false });
    throw new Error(`unexpected ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const { result } = renderHook(() => usePilotDashboard(), { wrapper });
  await flushMicrotasks();

  await act(async () => { await result.current.pauseReplay(); });
  await flushMicrotasks();
  expect(result.current.status).toMatchObject({ ready: true, replay: { sourceLocalNow: '2018-01-31 06:00:00', isRunning: false } });

  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  await flushMicrotasks();
  expect(result.current.status).toMatchObject({ ready: true, replay: { sourceLocalNow: '2018-01-31 06:00:00', isRunning: false } });
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
    if (path === '/api/pilot/status') return Promise.resolve(response({ ready: true, range: filters, replay: { sourceLocalNow: isRunning ? '2018-01-31 00:00:00' : '2018-01-31 12:00:00', isRunning } }));
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

test('回放使旧刷新失效并在失败时立即解除 loading、显示错误', async () => {
  let rejectReplay: (reason: Error) => void = () => undefined;
  const fetchMock = vi.fn((url: RequestInfo | URL) => {
    const path = String(url);
    if (path === '/api/pilot/status') return Promise.resolve(response({ ready: true, range: filters, replay: { sourceLocalNow: '2018-01-31 00:00:00', isRunning: true } }));
    if (path === '/api/pilot/filter-options') return Promise.resolve(response({ categories: [], sellerIds: [], customerStates: [] }));
    if (path.startsWith('/api/pilot/snapshot')) return Promise.resolve(response(snapshot));
    if (path === '/api/pilot/replay') return new Promise<Response>((_resolve, reject) => { rejectReplay = reject; });
    throw new Error(`unexpected ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<PilotDashboardProvider><Probe /></PilotDashboardProvider>);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  await act(async () => { screen.getByRole('button', { name: '暂停回放' }).click(); await Promise.resolve(); });
  expect(screen.getByText('idle')).toBeInTheDocument();
  rejectReplay(new TypeError('offline'));
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByRole('alert')).toHaveTextContent('经营数据服务网络连接失败');
  expect(screen.getByText('idle')).toBeInTheDocument();
});

test('回放后的刷新完成后，忽略取消的旧状态、快照和错误响应都不能回写', async () => {
  const staleSnapshot = deferred<Response>();
  const staleStatus = deferred<Response>();
  const staleError = deferred<Response>();
  const replay = deferred<Response>();
  const oldSignals: AbortSignal[] = [];
  let statusRequests = 0;
  let snapshotRequests = 0;
  const finalSnapshot = {
    ...snapshot,
    sourceLocalNow: '2018-03-31 00:00:00',
    kpis: { ...snapshot.kpis, itemGmv: { value: 900, comparisonValue: 800, changeRate: 0.125 } },
  };
  const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    if (path === '/api/pilot/status') {
      statusRequests += 1;
      if (statusRequests === 1) return Promise.resolve(response({ ready: true, range: filters, replay: { sourceLocalNow: '2018-01-31 00:00:00', isRunning: true } }));
      if (statusRequests === 2) return Promise.resolve(response({ ready: true, range: filters, replay: { sourceLocalNow: '2018-01-30 00:00:00', isRunning: false } }));
      oldSignals.push(init?.signal as AbortSignal);
      if (statusRequests === 3) return staleStatus.promise;
      if (statusRequests === 4) return staleError.promise;
      return Promise.resolve(response({ ready: true, range: { start: '2018-01-01', end: '2018-12-31' }, replay: { sourceLocalNow: '2018-03-31 00:00:00', isRunning: true } }));
    }
    if (path === '/api/pilot/filter-options') return Promise.resolve(response({ categories: ['final'], sellerIds: [], customerStates: [] }));
    if (path.startsWith('/api/pilot/snapshot')) {
      snapshotRequests += 1;
      if (snapshotRequests === 2) {
        oldSignals.push(init?.signal as AbortSignal);
        return staleSnapshot.promise;
      }
      return Promise.resolve(response(snapshotRequests === 1 ? snapshot : finalSnapshot));
    }
    if (path === '/api/pilot/replay') return replay.promise;
    throw new Error(`unexpected ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const { result } = renderHook(() => usePilotDashboard(), { wrapper });
  await flushMicrotasks();

  act(() => result.current.retry());
  await flushMicrotasks();
  expect(snapshotRequests).toBe(2);
  act(() => result.current.retry());
  await flushMicrotasks();
  act(() => result.current.retry());
  await flushMicrotasks();
  expect(statusRequests).toBe(4);

  let replayPromise!: Promise<void>;
  act(() => { replayPromise = result.current.startReplay(); });
  expect(oldSignals).toHaveLength(3);
  expect(oldSignals.every((signal) => signal.aborted)).toBe(true);
  replay.resolve(response({ sourceLocalNow: '2018-03-31 00:00:00', isRunning: true }));
  await flushMicrotasks();
  await replayPromise;
  expect(result.current.status).toMatchObject({ ready: true, replay: { sourceLocalNow: '2018-03-31 00:00:00', isRunning: true } });
  expect(result.current.snapshot?.kpis.itemGmv.value).toBe(900);
  expect(result.current.error).toBeNull();

  staleStatus.resolve(response({ ready: false, importCommand: 'old-import' }));
  await flushMicrotasks();
  expect(result.current.status).toMatchObject({ ready: true, replay: { sourceLocalNow: '2018-03-31 00:00:00' } });
  staleSnapshot.resolve(response({ ...snapshot, kpis: { ...snapshot.kpis, itemGmv: { value: 111, comparisonValue: 100, changeRate: 0.11 } } }));
  await flushMicrotasks();
  expect(result.current.snapshot?.kpis.itemGmv.value).toBe(900);
  staleError.reject(new TypeError('old offline'));
  await flushMicrotasks();
  expect(result.current.error).toBeNull();
  expect({ statusRequests, snapshotRequests }).toEqual({ statusRequests: 5, snapshotRequests: 3 });
});

test('ready 完整生命周期会清空旧状态，并按新的回放日重建 30 天筛选与快照', async () => {
  let statusRequests = 0;
  let snapshotRequests = 0;
  const firstOptions = { categories: ['old'], sellerIds: ['seller-old'], customerStates: ['SP'] };
  const nextOptions = { categories: ['new'], sellerIds: ['seller-new'], customerStates: ['RJ'] };
  const nextFilters = { start: '2018-03-17', end: '2018-04-15' };
  const nextSnapshot = {
    ...snapshot,
    filters: nextFilters,
    sourceLocalNow: '2018-04-15 18:30:00',
    kpis: { ...snapshot.kpis, itemGmv: { value: 750, comparisonValue: 700, changeRate: 0.0714 } },
  };
  const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
    const path = String(url);
    if (path === '/api/pilot/status') {
      statusRequests += 1;
      if (statusRequests <= 2) return response({ ready: true, range: filters, replay: { sourceLocalNow: '2018-01-31 00:00:00', isRunning: true } });
      if (statusRequests === 3) return response({ ready: false, importCommand: 'pnpm data:olist:import' });
      return response({ ready: true, range: { start: '2018-03-01', end: '2018-12-31' }, replay: { sourceLocalNow: '2018-04-15 18:30:00', isRunning: false } });
    }
    if (path === '/api/pilot/filter-options') return response(statusRequests === 4 ? nextOptions : firstOptions);
    if (path.startsWith('/api/pilot/snapshot')) {
      snapshotRequests += 1;
      if (snapshotRequests === 2) throw new TypeError('offline');
      return response(snapshotRequests === 1 ? snapshot : nextSnapshot);
    }
    throw new Error(`unexpected ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const { result } = renderHook(() => usePilotDashboard(), { wrapper });
  await flushMicrotasks();
  expect(result.current.snapshot?.kpis.itemGmv.value).toBe(490);
  expect(result.current.options).toEqual(firstOptions);

  act(() => result.current.retry());
  await flushMicrotasks();
  expect(result.current.snapshot?.kpis.itemGmv.value).toBe(490);
  expect(result.current.error).toBeInstanceOf(Error);

  act(() => result.current.retry());
  await flushMicrotasks();
  expect(result.current.status).toEqual({ ready: false, importCommand: 'pnpm data:olist:import' });
  expect(result.current.snapshot).toBeNull();
  expect(result.current.options).toBeNull();
  expect(result.current.filters).toBeNull();
  expect(result.current.error).toBeNull();

  act(() => result.current.retry());
  await flushMicrotasks();
  expect(result.current.status).toMatchObject({ ready: true, range: { start: '2018-03-01', end: '2018-12-31' }, replay: { sourceLocalNow: '2018-04-15 18:30:00' } });
  expect(result.current.filters).toEqual(nextFilters);
  expect(result.current.options).toEqual(nextOptions);
  expect(result.current.snapshot).toMatchObject({ filters: nextFilters, sourceLocalNow: '2018-04-15 18:30:00', kpis: { itemGmv: { value: 750 } } });
  expect(fetchMock).toHaveBeenCalledWith('/api/pilot/snapshot?start=2018-03-17&end=2018-04-15', expect.anything());
  expect(result.current.error).toBeNull();
});

test('连续 pause/start 忽略晚到的 pause，只提交 start 状态并执行一次 start 后刷新', async () => {
  const pause = deferred<Response>();
  const start = deferred<Response>();
  let statusRequests = 0;
  let snapshotRequests = 0;
  const replayActions: string[] = [];
  const replaySignals: AbortSignal[] = [];
  const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    if (path === '/api/pilot/status') {
      statusRequests += 1;
      return Promise.resolve(response({ ready: true, range: filters, replay: { sourceLocalNow: statusRequests === 1 ? '2018-01-31 00:00:00' : '2018-02-01 12:00:00', isRunning: true } }));
    }
    if (path === '/api/pilot/filter-options') return Promise.resolve(response({ categories: [], sellerIds: [], customerStates: [] }));
    if (path.startsWith('/api/pilot/snapshot')) {
      snapshotRequests += 1;
      return Promise.resolve(response({ ...snapshot, sourceLocalNow: snapshotRequests === 1 ? '2018-01-31 00:00:00' : '2018-02-01 12:00:00' }));
    }
    if (path === '/api/pilot/replay') {
      const action = JSON.parse(init?.body as string).action as string;
      replayActions.push(action);
      replaySignals.push(init?.signal as AbortSignal);
      return action === 'pause' ? pause.promise : start.promise;
    }
    throw new Error(`unexpected ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const { result } = renderHook(() => usePilotDashboard(), { wrapper });
  await flushMicrotasks();

  let pausePromise!: Promise<void>;
  let startPromise!: Promise<void>;
  act(() => { pausePromise = result.current.pauseReplay(); });
  await flushMicrotasks();
  act(() => { startPromise = result.current.startReplay(); });
  expect(replayActions).toEqual(['pause', 'start']);
  expect(replaySignals[0].aborted).toBe(true);

  start.resolve(response({ sourceLocalNow: '2018-02-01 12:00:00', isRunning: true }));
  await flushMicrotasks();
  await startPromise;
  expect(result.current.status).toMatchObject({ ready: true, replay: { sourceLocalNow: '2018-02-01 12:00:00', isRunning: true } });
  expect({ statusRequests, snapshotRequests }).toEqual({ statusRequests: 2, snapshotRequests: 2 });

  pause.resolve(response({ sourceLocalNow: '2018-01-31 12:00:00', isRunning: false }));
  await flushMicrotasks();
  await pausePromise;
  expect(result.current.status).toMatchObject({ ready: true, replay: { sourceLocalNow: '2018-02-01 12:00:00', isRunning: true } });
  expect(result.current.snapshot?.sourceLocalNow).toBe('2018-02-01 12:00:00');
  expect(result.current.error).toBeNull();
  expect({ statusRequests, snapshotRequests }).toEqual({ statusRequests: 2, snapshotRequests: 2 });
});
