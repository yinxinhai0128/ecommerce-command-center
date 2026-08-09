import { useContext } from 'react';
import { PilotDashboardContext, type PilotDashboardContextValue } from './PilotDashboardProvider';

export function usePilotDashboard(): PilotDashboardContextValue {
  const dashboard = useContext(PilotDashboardContext);
  if (!dashboard) throw new Error('usePilotDashboard 必须在 PilotDashboardProvider 内使用');
  return dashboard;
}
