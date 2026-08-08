import { useState, type JSX } from 'react';
import type { DashboardAlert } from '../../domain/types';

function amount(value: number): string {
  return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AlertRail({ alerts }: { alerts: DashboardAlert[] }): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = alerts.find((alert) => alert.id === selectedId);

  return (
    <section className="panel alert-rail" aria-labelledby="alert-rail-title">
      <h2 id="alert-rail-title">经营预警</h2>
      {alerts.length === 0 ? <p className="panel-empty">暂无经营预警</p> : <div className="alert-list">{alerts.map((alert) => <button key={alert.id} type="button" className={`alert-item ${alert.severity}`} onClick={() => setSelectedId(alert.id)}>{alert.title}</button>)}</div>}
      {selected && <div className="alert-detail"><dl><div><dt>影响金额</dt><dd>{amount(selected.impactAmount)}</dd></div><div><dt>证据</dt><dd>{selected.evidence}</dd></div><div><dt>建议</dt><dd>{selected.suggestion}</dd></div></dl></div>}
    </section>
  );
}
