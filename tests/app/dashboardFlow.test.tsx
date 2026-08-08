import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren, ReactElement } from 'react';
import { DashboardProvider } from '../../src/app/DashboardProvider';
import { useDashboard } from '../../src/app/useDashboard';

const start = new Date('2026-08-08T10:00:00+08:00');

function wrapper({ children }: PropsWithChildren): ReactElement {
  return <DashboardProvider>{children}</DashboardProvider>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(start);
});

afterEach(() => {
  vi.useRealTimers();
});

test('运行时每三秒更新最后时间和 KPI', () => {
  const { result } = renderHook(() => useDashboard(), { wrapper });
  const initialGmv = result.current.snapshot.kpis.gmv.value;

  act(() => vi.advanceTimersByTime(3000));

  expect(result.current.lastUpdatedAt).toEqual(new Date(start.getTime() + 3000));
  expect(result.current.snapshot.kpis.gmv.value).not.toBe(initialGmv);
});

test('暂停后六秒不更新，恢复后继续更新', () => {
  const { result } = renderHook(() => useDashboard(), { wrapper });

  act(() => result.current.toggleRunning());
  const pausedAt = result.current.lastUpdatedAt;
  const pausedGmv = result.current.snapshot.kpis.gmv.value;
  act(() => vi.advanceTimersByTime(6000));

  expect(result.current.lastUpdatedAt).toEqual(pausedAt);
  expect(result.current.snapshot.kpis.gmv.value).toBe(pausedGmv);

  act(() => result.current.toggleRunning());
  act(() => vi.advanceTimersByTime(3000));

  expect(result.current.lastUpdatedAt).toEqual(new Date(start.getTime() + 9000));
  expect(result.current.snapshot.kpis.gmv.value).not.toBe(pausedGmv);
});
