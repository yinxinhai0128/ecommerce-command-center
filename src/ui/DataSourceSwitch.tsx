import type { JSX } from 'react';

export type DataSource = 'simulation' | 'pilot';

type DataSourceSwitchProps = { value: DataSource; onChange: (value: DataSource) => void };

export function DataSourceSwitch({ value, onChange }: DataSourceSwitchProps): JSX.Element {
  return (
    <div className="data-source-switch" role="group" aria-label="数据源">
      <button type="button" aria-pressed={value === 'simulation'} onClick={() => onChange('simulation')}>模拟演示</button>
      <button type="button" aria-pressed={value === 'pilot'} onClick={() => onChange('pilot')}>真实数据试点</button>
    </div>
  );
}
