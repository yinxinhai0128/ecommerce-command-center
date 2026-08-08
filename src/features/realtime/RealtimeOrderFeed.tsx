import type { JSX } from 'react';
import type { DashboardSnapshot } from '../../domain/types';

function amount(value: number): string {
  return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function RealtimeOrderFeed({ orders }: { orders: DashboardSnapshot['recentOrders'] }): JSX.Element {
  return (
    <section className="panel order-feed" aria-labelledby="realtime-orders-title">
      <h2 id="realtime-orders-title">实时订单</h2>
      {orders.length === 0 ? <p className="panel-empty">当前筛选条件下暂无数据</p> : (
        <ul>
          {orders.slice(0, 8).map((order) => <li key={order.id} className="order-feed-item"><span>{order.id}</span><span>{order.platform}</span><strong>{amount(order.amount)}</strong><span>{order.status}</span><time dateTime={order.at.toISOString()}>{order.at.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</time></li>)}
        </ul>
      )}
    </section>
  );
}
