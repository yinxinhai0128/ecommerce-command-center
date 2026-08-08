import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { RealtimeOrderFeed } from './RealtimeOrderFeed';

test('用中文显示订单状态而不改变领域状态值', () => {
  render(<RealtimeOrderFeed orders={[
    { id: 'created', platform: '天猫', amount: 100, status: 'created', at: new Date('2026-08-08T04:00:00+08:00') },
    { id: 'paid', platform: '京东', amount: 100, status: 'paid', at: new Date('2026-08-08T04:01:00+08:00') },
    { id: 'fulfilled', platform: '抖音电商', amount: 100, status: 'fulfilled', at: new Date('2026-08-08T04:02:00+08:00') },
    { id: 'cancelled', platform: '自营小程序', amount: 100, status: 'cancelled', at: new Date('2026-08-08T04:03:00+08:00') },
  ]} />);

  for (const status of ['待支付', '已支付', '已完成', '已取消']) expect(screen.getByText(status)).toBeInTheDocument();
  expect(screen.getByText('fulfilled').closest('li')?.children[3]).toHaveTextContent('已完成');
});
