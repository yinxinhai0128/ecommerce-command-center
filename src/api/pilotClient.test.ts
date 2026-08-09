import { afterEach, expect, test, vi } from 'vitest';
import { controlPilotReplay, requestPilotAnalysis, requestPilotSnapshot, requestPilotStatus } from './pilotClient';

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

test.each([
  ['不存在的筛选日期', { ...snapshot, filters: { ...filters, start: '2018-02-30' } }],
  ['不存在的趋势日期', { ...snapshot, dailyTrend: [{ date: '2018-02-30', itemGmv: 490, validOrderCount: 1 }] }],
  ['不存在的源本地时间', { ...snapshot, sourceLocalNow: '2018-02-30 25:00:00' }],
  ['不存在的订单本地时间', { ...snapshot, recentOrders: [{ ...snapshot.recentOrders[0], purchasedAt: '2018-02-30 00:00:00' }] }],
  ['无穷 KPI', { ...snapshot, kpis: { ...snapshot.kpis, itemGmv: { value: null, comparisonValue: 1, changeRate: 1 } } }],
])('拒绝%s，避免日期或数值越过客户端边界', async (_name, invalid) => {
  vi.stubGlobal('fetch', vi.fn(async () => response(invalid)));
  await expect(requestPilotSnapshot(filters)).rejects.toThrow('璇曠偣鏁版嵁鍝嶅簲鏃犳晥');
});

test('拒绝无效 ISO 分析生成时间与嵌套元数据本地时间', async () => {
  const validAnalysis = {
    summary: 'ok', signals: [], causes: [], risks: [], actions: [], followUps: [], source: 'local',
    generatedAt: '2018-02-30T00:00:00Z', metadata: { sourceLocalNow: '2018-02-30 00:00:00' },
  };
  vi.stubGlobal('fetch', vi.fn(async () => response(validAnalysis)));
  await expect(requestPilotAnalysis(filters, '问题')).rejects.toThrow('璇曠偣鏁版嵁鍝嶅簲鏃犳晥');
});
