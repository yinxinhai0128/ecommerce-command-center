import type { JSX } from 'react';
import type { AnalysisResult } from '../../domain/types';
import { Panel } from '../../ui/Panel';

type ContributionChartProps = { causes?: AnalysisResult['causes'] };

export function ContributionChart({ causes = [] }: ContributionChartProps): JSX.Element {
  const maximum = Math.max(1, ...causes.map((cause) => Math.abs(cause.contribution)));
  return (
    <div className="contribution-chart">
      <Panel title="变化归因">
        {causes.length > 0 ? (
          <ul className="analysis-causes">
            {causes.map((cause) => {
              const direction = cause.contribution >= 0 ? 'positive' : 'negative';
              return (
                <li key={`${cause.label}-${cause.evidence}`} data-direction={direction}>
                  <div className="cause-heading">
                    <strong>{cause.label}</strong>
                    <span>{cause.contribution > 0 ? '+' : ''}{cause.contribution.toLocaleString('zh-CN')}</span>
                  </div>
                  <div className="cause-track" aria-hidden="true"><i style={{ width: `${Math.abs(cause.contribution) / maximum * 100}%` }} /></div>
                  <p>{cause.evidence}</p>
                </li>
              );
            })}
          </ul>
        ) : <p className="panel-empty">等待归因结果</p>}
      </Panel>
    </div>
  );
}
