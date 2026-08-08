export type Platform = '天猫' | '京东' | '抖音电商' | '自营小程序';

export type DashboardFilters = {
  start: Date;
  end: Date;
  platform?: Platform;
  storeId?: string;
  categoryId?: string;
};

export type Order = {
  id: string;
  customerId: string;
  platform: Platform;
  storeId: string;
  campaignId?: string;
  createdAt: Date;
  paidAt?: Date;
  status: 'created' | 'paid' | 'fulfilled' | 'cancelled';
  shippingFee: number;
  discountAmount: number;
};

export type OrderItem = {
  orderId: string;
  productId: string;
  categoryId: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
};

export type TrafficRecord = {
  at: Date;
  platform: Platform;
  storeId: string;
  categoryId: string;
  visitors: number;
  productViewers: number;
  addToCartUsers: number;
  checkoutUsers: number;
  paidBuyers: number;
};

export type Refund = {
  id: string;
  orderId: string;
  amount: number;
  createdAt: Date;
  status: 'requested' | 'approved' | 'completed';
  reason: string;
};

export type Product = {
  id: string;
  name: string;
  categoryId: string;
  stock: number;
};

export type Customer = { id: string; name: string };
export type Store = { id: string; name: string; region: string };
export type Category = { id: string; name: string };

export type Campaign = {
  id: string;
  platform: Platform;
  storeId: string;
  channel: '信息流' | '搜索' | '联盟' | '私域';
  startAt: Date;
  endAt: Date;
  impressions: number;
  clicks: number;
  spend: number;
  attributedRevenue: number;
};

export type Target = {
  date: string;
  gmv: number;
  platform?: Platform;
  storeId?: string;
  categoryId?: string;
};

export type CommerceDataset = {
  orders: Order[];
  orderItems: OrderItem[];
  traffic: TrafficRecord[];
  refunds: Refund[];
  products: Product[];
  targets: Target[];
  customers: Customer[];
  stores: Store[];
  categories: Category[];
  campaigns: Campaign[];
};

export type Kpi = {
  value: number;
  comparisonValue: number;
  changeRate: number;
};

export type DashboardSnapshot = {
  comparisonLabel: string;
  kpis: {
    gmv: Kpi;
    netSales: Kpi;
    orderCount: Kpi;
    conversionRate: Kpi;
    averageOrderValue: Kpi;
    grossMarginRate: Kpi;
    refundRate: Kpi;
    targetAchievementRate: Kpi;
  };
  salesTrend: Array<{ at: Date; gmv: number }>;
  funnel: Array<{ stage: 'visitors' | 'productViewers' | 'addToCartUsers' | 'checkoutUsers' | 'paidBuyers'; value: number }>;
  channelRanking: Array<{ platform: Platform; gmv: number }>;
  productRanking: Array<{ productId: string; name: string; gmv: number }>;
  regionRanking: Array<{ region: string; gmv: number }>;
  inventoryRisks: Array<{ productId: string; name: string; stock: number; dailySales: number; daysAvailable: number }>;
  forecast7d: Array<{ date: string; gmv: number }>;
  targetProbability: number;
};

export type DashboardAlert = {
  id: string;
  severity: 'critical' | 'warning';
  metric: 'refundRate' | 'conversionRate' | 'targetAchievementRate' | 'inventoryDays';
  title: string;
  evidence: string;
  impactAmount: number;
  suggestion: string;
  createdAt: Date;
};
