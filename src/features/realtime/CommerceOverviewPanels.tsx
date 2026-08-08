import type { JSX } from 'react';
import type { DashboardSnapshot } from '../../domain/types';

const stageLabels: Record<DashboardSnapshot['funnel'][number]['stage'], string> = {
  visitors: '访客',
  productViewers: '商品浏览',
  addToCartUsers: '加购',
  checkoutUsers: '结算',
  paidBuyers: '支付',
};

const emptyState = <p className="panel-empty">当前筛选条件下暂无数据</p>;

export function CommerceOverviewPanels({ snapshot }: { snapshot: DashboardSnapshot }): JSX.Element {
  const channelTotal = snapshot.channelRanking.reduce((total, item) => total + item.gmv, 0);
  const channelMaximum = Math.max(channelTotal, 1);

  return (
    <section className="panel commerce-overview" aria-label="转化漏斗与渠道贡献">
      <section className="overview-section" aria-labelledby="commerce-funnel-title">
        <h2 id="commerce-funnel-title">转化漏斗</h2>
        {snapshot.funnel.length === 0 ? emptyState : (
          <ol className="funnel-list">
            {snapshot.funnel.map((item) => <li key={item.stage}><span>{stageLabels[item.stage]}</span><strong>{item.value.toLocaleString('zh-CN')}</strong></li>)}
          </ol>
        )}
      </section>
      <section className="overview-section" aria-labelledby="commerce-channel-title">
        <h2 id="commerce-channel-title">渠道贡献</h2>
        {snapshot.channelRanking.length === 0 ? emptyState : (
          <ul className="channel-list">
            {snapshot.channelRanking.map((item) => (
              <li key={item.platform}>
                <span>{item.platform}</span>
                <strong>¥{item.gmv.toLocaleString('zh-CN')}</strong>
                <span className="channel-meter" role="meter" aria-label={`${item.platform}渠道贡献`} aria-valuemin={0} aria-valuemax={channelMaximum} aria-valuenow={item.gmv}>
                  <i style={{ width: `${item.gmv / channelMaximum * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
