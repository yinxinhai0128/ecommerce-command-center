import type { JSX } from 'react';
import type { DashboardAlert, DashboardSnapshot } from '../../domain/types';
import { AlertRail } from './AlertRail';
import { BreakdownPanels } from './BreakdownPanels';
import { CommerceOverviewPanels } from './CommerceOverviewPanels';
import { KpiStrip } from './KpiStrip';
import { RealtimeOrderFeed } from './RealtimeOrderFeed';
import { SalesPulseChart } from './SalesPulseChart';

type RealtimeDashboardProps = { snapshot: DashboardSnapshot; alerts: DashboardAlert[]; isRunning: boolean };

export function RealtimeDashboard({ snapshot, alerts, isRunning }: RealtimeDashboardProps): JSX.Element {
  return <div className={`realtime-dashboard ${isRunning ? 'is-running' : 'is-paused'}`}><KpiStrip snapshot={snapshot} /><CommerceOverviewPanels snapshot={snapshot} /><section className="panel sales-pulse"><h2>分钟经营脉冲</h2><SalesPulseChart salesTrend={snapshot.salesTrend} hasAnomaly={alerts.length > 0} /></section><div className="realtime-side-stack"><RealtimeOrderFeed orders={snapshot.recentOrders} /><AlertRail alerts={alerts} /></div><BreakdownPanels snapshot={snapshot} /></div>;
}
