import type { JSX } from 'react';
import type { PilotSnapshot } from '../../pilot/types';

export function PilotSalesChart({ trend }: { trend: PilotSnapshot['dailyTrend'] }): JSX.Element {
  const maximum = Math.max(1, ...trend.map((point) => point.itemGmv));
  return (
    <div className="pilot-sales-chart" role="img" aria-label="每日商品成交额与有效订单数趋势">
      {trend.length === 0 ? <p className="panel-empty">当前筛选条件下暂无趋势数据</p> : <ol>{trend.map((point) => <li key={point.date}><span className="pilot-bar" style={{ height: `${Math.max(4, point.itemGmv / maximum * 100)}%` }} /><strong>¥{point.itemGmv.toLocaleString('zh-CN')}</strong><small>{point.date.slice(5)} · {point.validOrderCount} 单</small></li>)}</ol>}
    </div>
  );
}
