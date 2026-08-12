export type PilotFilters = {
  start: string;
  end: string;
  category?: string;
  sellerId?: string;
  customerState?: string;
};

export type PilotFilterOptions = { categories: string[]; sellerIds: string[]; customerStates: string[] };
export type PilotReplayAction = 'start' | 'pause' | 'reset';
export type PilotReplayState = { sourceLocalNow: string; isRunning: boolean };
export type PilotStatus =
  | { ready: false; importCommand: string }
  | { ready: true; range: { start: string; end: string }; replay: PilotReplayState };
export type PilotKpi = { value: number; comparisonValue: number; changeRate: number };
export type PilotSnapshot = {
  filters: PilotFilters;
  sourceLocalNow: string;
  comparisonLabel: string;
  kpis: Record<'itemGmv' | 'validOrderCount' | 'averageOrderValue' | 'cancellationRate' | 'onTimeDeliveryRate' | 'averageDeliveryDays' | 'averageReviewScore', PilotKpi>;
  dailyTrend: Array<{ date: string; itemGmv: number; validOrderCount: number }>;
  fulfillmentFunnel: Array<{ stage: 'purchased' | 'approved' | 'carrier' | 'delivered'; value: number }>;
  categoryRanking: Array<{ category: string; itemGmv: number }>;
  sellerRanking: Array<{ sellerId: string; itemGmv: number }>;
  customerStateRanking: Array<{ customerState: string; itemGmv: number }>;
  recentOrders: Array<{ orderId: string; purchasedAt: string; status: string; itemGmv: number; itemCount: number; customerState: string }>;
  capabilities: Array<{ key: string; status: 'available' | 'unavailable'; reason?: string }>;
};

export type PilotAnalysis = {
  summary: string;
  signals: Array<{ label: string; value: number; direction: 'up' | 'down' | 'flat' }>;
  causes: Array<{ label: string; contribution: number; evidence: string }>;
  risks: Array<{ severity: 'critical' | 'warning'; title: string; evidence: string }>;
  actions: Array<{ priority: 'high' | 'medium' | 'low'; title: string; rationale: string; ownerRole: string; expectedImpact: string; validationMetric: string }>;
  followUps: string[];
  source: 'deepseek' | 'local';
  generatedAt: string;
  fallbackReason?: 'not_configured' | 'upstream_error' | 'timeout' | 'invalid_response' | 'network_error';
  metadata: { sourceLocalNow: string };
};
