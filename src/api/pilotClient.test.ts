import { afterEach, expect, test, vi } from 'vitest';
import { controlPilotReplay, requestPilotSnapshot, requestPilotStatus } from './pilotClient';

const filters = { start: '2018-01-01', end: '2018-01-31', category: 'books' };

const snapshot = {
  filters,
  sourceLocalNow: '2018-01-31 00:00:00',
  comparisonLabel: '较上期',
  kpis: Object.fromEntries(['itemGmv', 'validOrderCount', 'averageOrderValue', 'cancellationRate', 'onTimeDeliveryRate', 'averageDeliveryDays', 'averageReviewScore'].map((key) => [key, { value: 490, comparisonValue: 400, changeRate: 0.225 }])),
  dailyTrend: [{ date: '2018-01-01', itemGmv: 490, validOrderCount: 1 }],
  fulfillmentFunnel: [{ stage: 'purchased', value: 1 }],
  categoryRanking: [{ category: 'books', itemGmv: 490 }],
  sellerRanking: [{ sellerId: 'seller-1', itemGmv: 490 }],
  customerStateRanking: [{ customerState: 'SP', itemGmv: 490 }],
  recentOrders: [{ orderId: 'order-1', purchasedAt: '2018-01-01 00:00:00', status: 'delivered', itemGmv: 490, itemCount: 1, customerState: 'SP' }],
  capabilities: [{ key: 'analysis', status: 'available' }],
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => vi.unstubAllGlobals());

test('拒绝嵌套 KPI 非数值的试点快照，防止错误数据进入仪表盘', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response({ ...snapshot, kpis: { ...snapshot.kpis, itemGmv: { value: '490' } } })));

  await expect(requestPilotSnapshot(filters)).rejects.toThrow('璇曠偣鏁版嵁鍝嶅簲鏃犳晥');
});

test('请求快照时仅把筛选条件编码进查询串，防止客户端泄漏或回传快照数据', async () => {
  const fetchMock = vi.fn(async () => response(snapshot));
  vi.stubGlobal('fetch', fetchMock);
  const controller = new AbortController();

  await expect(requestPilotSnapshot(filters, controller.signal)).resolves.toEqual(snapshot);

  expect(fetchMock).toHaveBeenCalledWith('/api/pilot/snapshot?start=2018-01-01&end=2018-01-31&category=books', { signal: controller.signal });
  expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('kpis');
});

test('回放控制仅发送 action，并返回服务器给出的回放状态', async () => {
  const fetchMock = vi.fn(async () => response({ sourceLocalNow: '2018-01-31 00:00:00', isRunning: false }));
  vi.stubGlobal('fetch', fetchMock);
  const controller = new AbortController();

  await expect(controlPilotReplay('pause', controller.signal)).resolves.toEqual({ sourceLocalNow: '2018-01-31 00:00:00', isRunning: false });
  expect(fetchMock).toHaveBeenCalledWith('/api/pilot/replay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'pause' }),
    signal: controller.signal,
  });
});

test('状态响应缺少已就绪回放状态时拒绝响应', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response({ ready: true, range: { start: '2018-01-01', end: '2018-12-31' } })));

  await expect(requestPilotStatus()).rejects.toThrow('璇曠偣鏁版嵁鍝嶅簲鏃犳晥');
});
