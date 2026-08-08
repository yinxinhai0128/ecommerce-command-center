import { useContext } from 'react';
import { DashboardContext, type DashboardContextValue } from './DashboardProvider';

export function useDashboard(): DashboardContextValue {
  const dashboard = useContext(DashboardContext);
  if (!dashboard) throw new Error('useDashboard 必须在 DashboardProvider 内使用');
  return dashboard;
}
