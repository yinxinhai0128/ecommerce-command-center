import type { JSX } from 'react';
import type { PilotSnapshot } from '../../pilot/types';
import { Panel } from '../../ui/Panel';

type OperationsPageProps = { snapshot: PilotSnapshot };

function currency(value: number): string { return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export function OperationsPage({ snapshot }: OperationsPageProps): JSX.Element {
  return (
    <section className="operations-page" aria-label="经营数据">
      <Panel title="支付方式"><ul>{snapshot.payments.byType.map((item) => <li key={item.paymentType}>{item.paymentType}：{currency(item.paymentAmount)}</li>)}</ul></Panel>
      <Panel title="客户结构"><p>独立买家：{snapshot.commerce.uniqueBuyerCount.value.toLocaleString('zh-CN')}</p><p>复购买家：{snapshot.commerce.repeatBuyerCount.value.toLocaleString('zh-CN')}</p></Panel>
      <Panel title="履约状态"><ul>{snapshot.fulfillment.statusDistribution.map((item) => <li key={item.status}>{item.status}：{item.value.toLocaleString('zh-CN')}</li>)}</ul><p>平均送达：{snapshot.fulfillment.averageDeliveryDays.toFixed(1)} 天</p></Panel>
      <Panel title="服务体验"><ul>{snapshot.experience.scoreDistribution.map((item) => <li key={item.score}>{item.score} 分：{item.value.toLocaleString('zh-CN')}</li>)}</ul><p>低分占比：{(snapshot.experience.lowScoreRate * 100).toFixed(1)}%</p></Panel>
      <Panel title="贡献排行"><ol>{snapshot.contributions.categories.slice(0, 5).map((item) => <li key={item.category}>{item.label}：{currency(item.itemGmv)}</li>)}</ol></Panel>
    </section>
  );
}
