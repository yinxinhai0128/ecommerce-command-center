import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { ForecastPanel } from './ForecastPanel';

test('以紧凑人民币显示五位数预测金额', () => {
  render(<ForecastPanel
    forecast7d={[{ date: '2026-08-10', gmv: 34_759.08 }]}
    targetProbability={0.56}
  />);

  expect(screen.getByText('¥3.48万')).toBeInTheDocument();
});
