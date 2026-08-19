export const supportedContributionDimensions = ['category', 'seller', 'customerState'] as const;

export const metricDefinitions = {
  commerce: {
    paymentAmount: { label: '支付金额', unit: 'currency' },
    uniqueBuyerCount: { label: '独立买家数', unit: 'count' },
    repeatBuyerCount: { label: '复购买家数', unit: 'count' },
  },
  payments: {
    byType: { label: '支付方式', dimensions: ['category', 'seller', 'customerState'] },
    installments: { label: '分期付款', dimensions: ['category', 'seller', 'customerState'] },
  },
  fulfillment: {
    statusDistribution: { label: '订单状态分布', unit: 'count' },
    averageApprovalDays: { label: '平均审批天数', unit: 'days' },
    averageCarrierDays: { label: '平均交运天数', unit: 'days' },
    averageDeliveryDays: { label: '平均送达天数', unit: 'days' },
    lateDeliveryRate: { label: '延迟送达率', unit: 'ratio' },
    averageLateDays: { label: '平均延迟天数', unit: 'days' },
  },
  experience: {
    scoreDistribution: { label: '评价分数分布', unit: 'count' },
    lowScoreRate: { label: '低分评价率', unit: 'ratio' },
    averageReplyDays: { label: '平均回复天数', unit: 'days' },
  },
  contributions: {
    categories: { label: '品类贡献', dimensions: ['category', 'seller', 'customerState'] },
    sellers: { label: '卖家贡献', dimensions: ['category', 'seller', 'customerState'] },
    customerStates: { label: '客户州贡献', dimensions: ['category', 'seller', 'customerState'] },
  },
} as const;
