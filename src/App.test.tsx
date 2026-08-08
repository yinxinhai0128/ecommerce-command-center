import { render, screen } from '@testing-library/react';
import { App } from './App';

test('renders the dashboard shell with realtime monitoring selected', () => {
  render(<App />);

  expect(screen.getByRole('heading', { name: '电商经营驾驶舱' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: '实时监控' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: '智能分析' })).toBeInTheDocument();
});
