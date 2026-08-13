import type { JSX } from 'react';

export type DataSource = 'simulation' | 'pilot';

type DataSourceSwitchProps = { value: DataSource; onChange: (value: DataSource) => void };

export function DataSourceSwitch({ value, onChange }: DataSourceSwitchProps): JSX.Element {
  return (
    <div className="data-source-switch" role="group" aria-label="数据视图">
      <button type="button" aria-pressed={value === 'simulation'} onClick={() => onChange('simulation')}>标准视图</button>
      <button type="button" aria-pressed={value === 'pilot'} onClick={() => onChange('pilot')}>运营视图</button>
    </div>
  );
}
