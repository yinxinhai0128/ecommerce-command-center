import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { AppShell } from './AppShell';

test('导航可访问并将用户选择通知给受控调用方', () => {
  const onViewChange = vi.fn();

  render(
    <AppShell activeView="overview" onViewChange={onViewChange}>
      <p>页面内容</p>
    </AppShell>,
  );

  expect(screen.getByRole('button', { name: '概览' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '实时监控' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '智能分析' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '经营数据' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '实时监控' }));
  expect(onViewChange).toHaveBeenCalledWith('realtime');

  expect(screen.getByRole('button', { name: '概览' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('button', { name: '实时监控' })).not.toHaveAttribute('aria-current');
  expect(screen.getByRole('button', { name: '智能分析' })).not.toHaveAttribute('aria-current');
  expect(screen.getByRole('button', { name: '经营数据' })).not.toHaveAttribute('aria-current');

  expect(screen.getByRole('button', { name: '收起导航' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '收起导航' }));
  expect(screen.getByRole('button', { name: '展开导航' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '智能分析' }));
  expect(onViewChange).toHaveBeenCalledWith('analysis');

  expect(screen.getByRole('main')).toHaveTextContent('页面内容');
});

test('导航原生按钮通过 Enter 仅激活一次', () => {
  const onViewChange = vi.fn();
  render(<AppShell activeView="overview" onViewChange={onViewChange}><p>页面内容</p></AppShell>);

  const analysisButton = screen.getByRole('button', { name: '智能分析' });
  fireEvent.keyDown(analysisButton, { key: 'Enter' });
  fireEvent.click(analysisButton);

  expect(onViewChange).toHaveBeenCalledTimes(1);
  expect(onViewChange).toHaveBeenCalledWith('analysis');
});

test('导航原生按钮通过 Space 仅激活一次', () => {
  const onViewChange = vi.fn();
  render(<AppShell activeView="overview" onViewChange={onViewChange}><p>页面内容</p></AppShell>);

  const analysisButton = screen.getByRole('button', { name: '智能分析' });
  fireEvent.keyDown(analysisButton, { key: ' ' });
  fireEvent.click(analysisButton);

  expect(onViewChange).toHaveBeenCalledTimes(1);
  expect(onViewChange).toHaveBeenCalledWith('analysis');
});
