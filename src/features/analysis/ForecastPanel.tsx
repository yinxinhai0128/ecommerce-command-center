import type { JSX } from 'react';
import type { DashboardSnapshot } from '../../domain/types';
import { MetricValue } from '../../ui/MetricValue';
import { Panel } from '../../ui/Panel';

type ForecastPanelProps = Pick<DashboardSnapshot, 'forecast7d' | 'targetProbability'>;

export function ForecastPanel({ forecast7d, targetProbability }: ForecastPanelProps): JSX.Element {
  const maximum = Math.max(1, ...forecast7d.map((point) => point.gmv));
  return (
    <div className="forecast-panel">
      <Panel title="未来 7 天">
        <div className="forecast-probability">
          <span>目标达成概率</span>
          <MetricValue value={`${Math.round(targetProbability * 100)}%`} />
        </div>
        {forecast7d.length > 0 ? (
          <ol className="forecast-trend" aria-label="未来7天GMV趋势">
            {forecast7d.map((point) => (
              <li key={point.date}>
                <i aria-hidden="true" style={{ height: `${Math.max(8, point.gmv / maximum * 100)}%` }} />
                <strong>¥{point.gmv.toLocaleString('zh-CN')}</strong>
                <time dateTime={point.date}>{point.date.slice(5)}</time>
              </li>
            ))}
          </ol>
        ) : <p className="panel-empty">暂无预测数据</p>}
      </Panel>
    </div>
  );
}
