import type { JSX } from 'react';

export function App(): JSX.Element {
  return (
    <main>
      <header>
        <h1>电商经营驾驶舱</h1>
        <div role="tablist" aria-label="驾驶舱视图">
          <button type="button" role="tab" aria-selected="true">
            实时监控
          </button>
          <button type="button" role="tab" aria-selected="false">
            智能分析
          </button>
        </div>
      </header>
      <section aria-label="内容区域" />
    </main>
  );
}
