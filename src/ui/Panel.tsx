import type { JSX, ReactNode } from 'react';

type PanelProps = {
  title: string;
  status?: 'ready' | 'empty' | 'error';
  children?: ReactNode;
  onRetry?: () => void;
  onClearFilters?: () => void;
};

export function Panel({ title, status = 'ready', children, onRetry, onClearFilters }: PanelProps): JSX.Element {
  return (
    <section className="panel" aria-labelledby={`panel-${title}`}>
      <h2 id={`panel-${title}`}>{title}</h2>
      {status === 'ready' && children}
      {status === 'empty' && (
        <div className="panel-state">
          <span>当前筛选条件下无数据</span>
          {onClearFilters && <button type="button" onClick={onClearFilters}>清除筛选</button>}
        </div>
      )}
      {status === 'error' && (
        <div className="panel-state" role="alert">
          <span>加载失败</span>
          {onRetry && <button type="button" onClick={onRetry}>重试</button>}
        </div>
      )}
    </section>
  );
}
