import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { AnalysisResult, DashboardAlert, DashboardFilters, DashboardSnapshot } from '../../domain/types';
import { AnalysisDashboard } from './AnalysisDashboard';

const snapshot: DashboardSnapshot = {
  comparisonLabel: '较昨日同期',
  kpis: {
    gmv: { value: 125600, comparisonValue: 112000, changeRate: 0.1214 },
    netSales: { value: 118000, comparisonValue: 110000, changeRate: 0.0727 },
    orderCount: { value: 836, comparisonValue: 760, changeRate: 0.1 },
    conversionRate: { value: 0.034, comparisonValue: 0.03, changeRate: 0.1333 },
    averageOrderValue: { value: 150.24, comparisonValue: 147.37, changeRate: 0.0195 },
    grossMarginRate: { value: 0.42, comparisonValue: 0.4, changeRate: 0.05 },
    refundRate: { value: 0.021, comparisonValue: 0.024, changeRate: -0.125 },
    targetAchievementRate: { value: 0.86, comparisonValue: 0.8, changeRate: 0.075 },
  },
  salesTrend: [],
  recentOrders: [],
  funnel: [],
  channelRanking: [{ platform: '天猫', gmv: 82000 }],
  productRanking: [{ productId: 'sku-1', name: '云感外套', gmv: 48000 }],
  regionRanking: [{ region: '华东', gmv: 65000 }],
  inventoryRisks: [],
  forecast7d: [
    { date: '2026-08-09', gmv: 18000 },
    { date: '2026-08-10', gmv: 19500 },
    { date: '2026-08-11', gmv: 18800 },
  ],
  targetProbability: 0.72,
};

const changedSnapshot: DashboardSnapshot = {
  ...snapshot,
  kpis: { ...snapshot.kpis, gmv: { value: 130000, comparisonValue: 112000, changeRate: 0.1607 } },
  channelRanking: [{ platform: '京东', gmv: 90000 }],
};

const alerts: DashboardAlert[] = [{
  id: 'alert-1',
  severity: 'warning',
  metric: 'refundRate',
  title: '退款率偏高',
  evidence: '退款率较昨日增加',
  impactAmount: 3200,
  suggestion: '检查尺码问题',
  createdAt: new Date('2026-08-08T12:00:00+08:00'),
}];

const filters: DashboardFilters = {
  start: new Date('2026-08-08T00:00:00+08:00'),
  end: new Date('2026-08-08T23:59:59+08:00'),
};

const result: AnalysisResult = {
  summary: 'GMV保持增长，但退款率需要优先关注。',
  signals: [
    { label: 'GMV', value: 125600, direction: 'up' },
    { label: '退款率', value: 0.021, direction: 'down' },
  ],
  causes: [
    { label: '天猫拉动', contribution: 13600, evidence: '天猫贡献了主要增量。' },
    { label: '退款拖累', contribution: -3200, evidence: '退款抵消部分收入。' },
  ],
  risks: [{ severity: 'warning', title: '退款率风险', evidence: '退款率仍高于目标。' }],
  actions: [
    { priority: 'low', title: '整理周报', rationale: '沉淀本周结论。' },
    { priority: 'high', title: '核查退款商品', rationale: '优先控制退款损失。' },
    { priority: 'medium', title: '追加渠道预算', rationale: '放大高贡献渠道。' },
  ],
  followUps: ['哪些商品导致退款上升？', '明天达标概率如何？'],
  source: 'local',
  generatedAt: '2026-08-09T00:00:00.000Z',
  fallbackReason: 'not_configured',
};

function response(body: unknown = result, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function renderDashboard(active = true) {
  return render(<AnalysisDashboard snapshot={snapshot} alerts={alerts} filters={filters} active={active} />);
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => response()));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('智能分析生命周期', () => {
  test('inactive时不请求，首次激活请求一次且保持挂载切换不重复请求', async () => {
    const { rerender } = renderDashboard(false);
    const fetchMock = vi.mocked(fetch);

    expect(fetchMock).not.toHaveBeenCalled();
    rerender(<AnalysisDashboard snapshot={snapshot} alerts={alerts} filters={filters} active />);
    await screen.findByText(result.summary);
    expect(fetchMock).toHaveBeenCalledOnce();

    rerender(<AnalysisDashboard snapshot={snapshot} alerts={alerts} filters={filters} active={false} />);
    rerender(<AnalysisDashboard snapshot={snapshot} alerts={alerts} filters={filters} active />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  });

  test('成功后实时数据变化只提示，点击重新分析才使用最新上下文', async () => {
    const { rerender } = renderDashboard();
    const fetchMock = vi.mocked(fetch);
    await screen.findByText(result.summary);

    rerender(<AnalysisDashboard snapshot={changedSnapshot} alerts={alerts} filters={filters} active />);
    expect(screen.getByText('数据已变化，重新分析')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: '数据已变化，重新分析' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const latestBody = JSON.parse(fetchMock.mock.calls[1][1]?.body as string);
    expect(latestBody.kpis.gmv.value).toBe(130000);
    expect(latestBody.topContributors.channels[0]).toEqual({ label: '京东', value: 90000 });
  });

  test('数据变化后预测保持已分析版本并在重新分析成功时原子切换', async () => {
    const { rerender } = renderDashboard();
    const fetchMock = vi.mocked(fetch);
    await screen.findByText(result.summary);
    const latestSnapshot: DashboardSnapshot = {
      ...changedSnapshot,
      forecast7d: [{ date: '2026-08-12', gmv: 99000 }],
      targetProbability: 0.12,
    };
    let resolveLatest: ((value: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveLatest = resolve; }));

    rerender(<AnalysisDashboard snapshot={latestSnapshot} alerts={alerts} filters={filters} active />);

    expect(screen.getByText('数据已变化，重新分析')).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
    expect(screen.getByText('¥1.80万')).toBeInTheDocument();
    expect(screen.queryByText('12%')).not.toBeInTheDocument();
    expect(screen.queryByText('¥9.90万')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '数据已变化，重新分析' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText('72%')).toBeInTheDocument();
    expect(screen.queryByText('12%')).not.toBeInTheDocument();

    await act(async () => { resolveLatest?.(response()); });
    await waitFor(() => expect(screen.getByText('12%')).toBeInTheDocument());
    expect(screen.getByText('¥9.90万')).toBeInTheDocument();
    expect(screen.queryByText('72%')).not.toBeInTheDocument();
  });

  test('卸载时取消未完成请求', async () => {
    let aborted = false;
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        aborted = true;
        reject(new DOMException('Aborted', 'AbortError'));
      });
    })));

    const { unmount } = renderDashboard();
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    unmount();

    expect(aborted).toBe(true);
  });
});

describe('智能分析内容与问答', () => {
  test('呈现完整经营结论、本地来源、真实预测和按优先级排序的行动', async () => {
    renderDashboard();
    await screen.findByText(result.summary);

    for (const title of ['今日经营结论', '变化归因', '未来 7 天', '行动建议']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText('GMV')).toBeInTheDocument();
    expect(screen.getByText('退款率风险')).toBeInTheDocument();
    expect(screen.getByText('天猫贡献了主要增量。')).toBeInTheDocument();
    expect(screen.getByText('退款抵消部分收入。')).toBeInTheDocument();
    expect(document.querySelector('[data-direction="positive"]')).toBeInTheDocument();
    expect(document.querySelector('[data-direction="negative"]')).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
    expect(screen.getByText('¥1.80万')).toBeInTheDocument();
    expect(screen.getByText('¥1.95万')).toBeInTheDocument();
    expect(screen.getByText('本地分析')).toBeInTheDocument();
    expect(screen.queryByText('not_configured')).not.toBeInTheDocument();
    expect(screen.getByText(/生成于/).closest('time')).toHaveAttribute('dateTime', '2026-08-09T00:00:00.000Z');

    const actions = within(screen.getByRole('region', { name: '行动建议' })).getAllByRole('listitem');
    expect(actions.map((action) => action.textContent)).toEqual([
      expect.stringContaining('核查退款商品'),
      expect.stringContaining('追加渠道预算'),
      expect.stringContaining('整理周报'),
    ]);
    expect(screen.getByText('优先控制退款损失。')).toBeInTheDocument();
  });

  test('预置问题以精确文本请求最新上下文并记录最小历史', async () => {
    renderDashboard();
    const fetchMock = vi.mocked(fetch);
    await screen.findByText(result.summary);

    fireEvent.click(screen.getByRole('button', { name: '今天 GMV 变化的主要原因是什么？' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(fetchMock.mock.calls[1][1]?.body as string);
    expect(body.question).toBe('今天 GMV 变化的主要原因是什么？');
    expect(JSON.stringify(body)).not.toContain(result.summary);
    expect(screen.getByRole('log')).toHaveTextContent('今天 GMV 变化的主要原因是什么？');
    expect(screen.getByRole('log')).toHaveTextContent(result.summary);
  });

  test('自由提问可访问、最多500字、裁剪输入且加载时禁用', async () => {
    renderDashboard();
    const fetchMock = vi.mocked(fetch);
    await screen.findByText(result.summary);
    const input = screen.getByLabelText('自由提问');
    const submit = screen.getByRole('button', { name: '发送问题' });

    expect(input).toHaveAttribute('maxlength', '500');
    fireEvent.change(input, { target: { value: '   ' } });
    expect(submit).toBeDisabled();

    let resolveRequest: ((value: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveRequest = resolve; }));
    fireEvent.change(input, { target: { value: '  华东增长来自哪里？  ' } });
    fireEvent.click(submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string).question).toBe('华东增长来自哪里？');
    expect(input).toBeDisabled();
    expect(submit).toBeDisabled();
    await act(async () => { resolveRequest?.(response()); });
  });

  test('点击后续问题会发起新请求并记录问题与本次摘要', async () => {
    const followUpResult = { ...result, summary: '退款主要来自云感外套尺码问题。' };
    renderDashboard();
    const fetchMock = vi.mocked(fetch);
    await screen.findByText(result.summary);
    fetchMock.mockResolvedValueOnce(response(followUpResult));

    fireEvent.click(screen.getByRole('button', { name: '哪些商品导致退款上升？' }));
    await waitFor(() => expect(screen.getAllByText(followUpResult.summary)).toHaveLength(2));

    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string).question).toBe('哪些商品导致退款上升？');
    expect(screen.getByRole('log')).toHaveTextContent('哪些商品导致退款上升？');
    expect(screen.getByRole('log')).toHaveTextContent(followUpResult.summary);
  });

  test('重复的相同问答历史不会产生重复React key警告', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderDashboard();
    const fetchMock = vi.mocked(fetch);
    await screen.findByText(result.summary);

    fireEvent.click(screen.getByRole('button', { name: '哪些商品导致退款上升？' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: '哪些商品导致退款上升？' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/same key|unique key/i);
    consoleError.mockRestore();
  });

  test('错误状态可重试且Abort不会显示错误', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(response()));
    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent('网络连接失败，请检查网络后重试');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await screen.findByText(result.summary);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('初始加载时预置和自由提问均禁用', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    renderDashboard();

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: '今天 GMV 变化的主要原因是什么？' })).toBeDisabled();
    expect(screen.getByLabelText('自由提问')).toBeDisabled();
    expect(screen.getByRole('button', { name: '发送问题' })).toBeDisabled();
  });
});
