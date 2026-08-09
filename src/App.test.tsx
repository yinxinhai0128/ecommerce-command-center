import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from './App';
import { Panel } from './ui/Panel';

vi.mock('echarts-for-react', () => ({
  default: ({ 'aria-label': ariaLabel }: { 'aria-label'?: string }) => <div role="img" aria-label={ariaLabel} />,
}));

test('默认展示实时监控、运行状态和全局筛选', () => {
  render(<App />);

  expect(screen.getByRole('heading', { name: '经营驾驶舱' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: '实时监控' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: '智能分析' })).toBeInTheDocument();
  expect(screen.getByText('实时运行中')).toBeInTheDocument();
  expect(screen.getByLabelText('平台')).toHaveValue('全部平台');
});

test('点击和左右方向键可切换一级模块', () => {
  render(<App />);

  const realtimeTab = screen.getByRole('tab', { name: '实时监控' });
  const analysisTab = screen.getByRole('tab', { name: '智能分析' });

  fireEvent.click(analysisTab);
  expect(analysisTab).toHaveAttribute('aria-selected', 'true');

  fireEvent.keyDown(analysisTab, { key: 'ArrowLeft' });
  expect(realtimeTab).toHaveAttribute('aria-selected', 'true');

  fireEvent.keyDown(realtimeTab, { key: 'ArrowRight' });
  expect(analysisTab).toHaveAttribute('aria-selected', 'true');
});

test('每个标签始终关联对应的内容面板', () => {
  render(<App />);

  const realtimeTab = screen.getByRole('tab', { name: '实时监控' });
  const analysisTab = screen.getByRole('tab', { name: '智能分析' });
  const realtimePanel = document.getElementById(realtimeTab.getAttribute('aria-controls')!);
  const analysisPanel = document.getElementById(analysisTab.getAttribute('aria-controls')!);

  expect(realtimePanel).toHaveAttribute('role', 'tabpanel');
  expect(analysisPanel).toHaveAttribute('role', 'tabpanel');
  expect(analysisPanel).toHaveAttribute('hidden');

  fireEvent.click(analysisTab);

  expect(realtimePanel).toHaveAttribute('hidden');
  expect(analysisPanel).not.toHaveAttribute('hidden');
});

test('日期范围的两个原生输入各有可区分的标签', () => {
  render(<App />);

  expect(screen.getByLabelText('开始日期')).toHaveAttribute('id', 'filter-start');
  expect(screen.getByLabelText('结束日期')).toHaveAttribute('id', 'filter-end');
});

test('修改全局筛选会保留所选实际数据选项', () => {
  render(<App />);

  const platform = screen.getByLabelText('平台');
  const store = screen.getByLabelText('店铺');
  const category = screen.getByLabelText('类目');

  fireEvent.change(platform, { target: { value: '天猫' } });
  fireEvent.change(store, { target: { value: 'store-1' } });
  fireEvent.change(category, { target: { value: 'category-1' } });

  expect(platform).toHaveValue('天猫');
  expect(store).toHaveValue('store-1');
  expect(category).toHaveValue('category-1');
});

test('暂停和恢复更新会反映 Provider 的真实运行状态', () => {
  render(<App />);

  const control = screen.getByRole('button', { name: '暂停更新' });
  fireEvent.click(control);

  expect(screen.getByText('已暂停')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '恢复更新' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '恢复更新' }));
  expect(screen.getByText('实时运行中')).toBeInTheDocument();
});

test('Panel 空态提供清除筛选操作', () => {
  const clearFilters = vi.fn();
  render(<Panel status="empty" title="商品排行" onClearFilters={clearFilters} />);

  expect(screen.getByText('当前筛选条件下无数据')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '清除筛选' }));
  expect(clearFilters).toHaveBeenCalledOnce();
});

test('Panel 错误态提供重试操作', () => {
  const retry = vi.fn();
  render(<Panel status="error" title="商品排行" onRetry={retry} />);

  expect(screen.getByRole('alert')).toHaveTextContent('加载失败');
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  expect(retry).toHaveBeenCalledOnce();
});

test('切换到隔离的真实数据试点时卸载模拟运行时', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ready: false, importCommand: 'pnpm data:olist:import' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: '真实数据试点' }));

  expect(await screen.findByText('真实匿名历史数据回放')).toBeInTheDocument();
  expect(screen.queryByText('支付转化率')).not.toBeInTheDocument();
  expect(screen.queryByText('毛利率')).not.toBeInTheDocument();
  vi.unstubAllGlobals();
});

test('应用真实装配分析仪表盘且仅在首次激活时请求一次', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({
    summary: '经营结论已生成。',
    signals: [{ label: 'GMV', value: 1, direction: 'up' }],
    causes: [],
    risks: [],
    actions: [{
      priority: 'high',
      title: '继续观察',
      rationale: '保持实时监测。',
      ownerRole: '经营分析负责人',
      expectedImpact: '维持经营稳定',
      validationMetric: '未来 7 天 GMV',
    }],
    followUps: ['下一步看什么？'],
    source: 'local',
    generatedAt: '2026-08-09T00:00:00.000Z',
  }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);

  const { unmount } = render(<App />);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(document.getElementById('dashboard-panel-analysis')).toHaveTextContent('今日经营结论');

  fireEvent.click(screen.getByRole('tab', { name: '智能分析' }));
  await screen.findByText('经营结论已生成。');
  expect(fetchMock).toHaveBeenCalledOnce();

  fireEvent.click(screen.getByRole('tab', { name: '实时监控' }));
  fireEvent.click(screen.getByRole('tab', { name: '智能分析' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  expect(document.getElementById('dashboard-panel-realtime')).toHaveAttribute('hidden');
  expect(document.getElementById('dashboard-panel-analysis')).not.toHaveAttribute('hidden');

  unmount();
  vi.unstubAllGlobals();
});
