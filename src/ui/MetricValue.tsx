import type { JSX } from 'react';

type MetricValueProps = {
  value: string | number;
  change?: string;
};

export function MetricValue({ value, change }: MetricValueProps): JSX.Element {
  return (
    <div className="metric-value">
      <strong>{value}</strong>
      {change && <span>{change}</span>}
    </div>
  );
}
