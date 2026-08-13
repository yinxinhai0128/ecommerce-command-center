import type { AnalysisResult } from '../../src/domain/types';

export type OlistManifest = {
  ready: true;
  importedAt: string;
  importerVersion: 1;
  source: {
    dataset: 'olistbr/brazilian-ecommerce';
    url: 'https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce';
    license: 'CC BY-NC-SA 4.0';
    archiveSha256?: string;
  };
  files: Record<string, { sha256: string }>;
  tables: Record<string, { sourceRows: number; importedRows: number }>;
  range: { start: string; end: string };
};

export type OlistVerification = {
  valid: boolean;
  tableRows: Record<string, number>;
  itemGmv: number;
  duplicatePrimaryKeys: number;
  orphanReferences: number;
  range: { start: string; end: string };
};

export type OlistPaths = {
  dataDir: string;
  sourceDir: string;
  archivePath: string;
  databasePath: string;
  manifestPath: string;
};

export type DownloadOptions = {
  dataDir: string;
  fetchImpl?: typeof fetch;
};

export type OlistSourceReceipt = {
  archivePath: string;
  sourceDir: string;
  archiveSha256: string;
};

export type ImportOptions = { sourceDir: string; dataDir: string; now?: Date };
export type VerifyOptions = { dataDir: string };

export type PilotStatus = 'available' | 'unavailable';

export type PilotFilterOptions = {
  categories: string[];
  sellerIds: string[];
  customerStates: string[];
};

export type PilotFilters = {
  start: string;
  end: string;
  category?: string;
  sellerId?: string;
  customerState?: string;
};

export type PilotKpi = { value: number; comparisonValue: number; changeRate: number };

export type PilotCapability = {
  key: string;
  status: PilotStatus;
  reason?: string;
};

export type PilotSnapshot = {
  filters: PilotFilters;
  sourceLocalNow: string;
  comparisonLabel: string;
  kpis: {
    itemGmv: PilotKpi;
    validOrderCount: PilotKpi;
    averageOrderValue: PilotKpi;
    cancellationRate: PilotKpi;
    onTimeDeliveryRate: PilotKpi;
    averageDeliveryDays: PilotKpi;
    averageReviewScore: PilotKpi;
  };
  dailyTrend: Array<{ date: string; itemGmv: number; validOrderCount: number }>;
  fulfillmentFunnel: Array<{ stage: 'purchased' | 'approved' | 'carrier' | 'delivered'; value: number }>;
  categoryRanking: Array<{ category: string; itemGmv: number }>;
  sellerRanking: Array<{ sellerId: string; itemGmv: number }>;
  customerStateRanking: Array<{ customerState: string; itemGmv: number }>;
  recentOrders: Array<{ orderId: string; purchasedAt: string; status: string; itemGmv: number; itemCount: number; customerState: string }>;
  capabilities: PilotCapability[];
  commerce: {
    paymentAmount: PilotKpi;
    uniqueBuyerCount: PilotKpi;
    repeatBuyerCount: PilotKpi;
  };
  payments: {
    byType: Array<{ paymentType: string; paymentAmount: number }>;
    installments: Array<{ installments: number; paymentAmount: number }>;
  };
  fulfillment: {
    statusDistribution: Array<{ status: string; value: number }>;
    averageApprovalDays: number;
    averageCarrierDays: number;
    averageDeliveryDays: number;
    lateDeliveryRate: number;
    averageLateDays: number;
  };
  experience: {
    scoreDistribution: Array<{ score: number; value: number }>;
    lowScoreRate: number;
    averageReplyDays: number;
  };
  contributions: {
    categories: Array<{ category: string; label: string; itemGmv: number; itemCount: number }>;
    sellers: Array<{ sellerId: string; itemGmv: number; validOrderCount: number }>;
    customerStates: Array<{ customerState: string; itemGmv: number; validOrderCount: number }>;
  };
};

export type PilotReplayState = {
  sourceLocalNow: string;
  isRunning: boolean;
};

export type PilotAnalysisUnit = 'currency' | 'count' | 'ratio' | 'days' | 'score';

export type PilotAnalysisResult = Omit<AnalysisResult, 'signals' | 'causes'> & {
  signals: Array<AnalysisResult['signals'][number] & { factId: string; unit: PilotAnalysisUnit }>;
  causes: Array<AnalysisResult['causes'][number] & { factId: string; unit: PilotAnalysisUnit }>;
};

export type PilotAnalysisContext = {
  question?: string;
  sourceLocalNow: string;
  filters: PilotFilters;
  comparisonLabel: string;
  facts: Array<{ id: string; label: string; value: number; unit: PilotAnalysisUnit }>;
  trendChanges: Array<{ id: string; label: string; value: number; unit: 'currency' | 'count' | 'ratio' }>;
  contributors: Array<{ id: string; dimension: 'category' | 'seller' | 'customerState'; label: string; itemGmv: number }>;
};

export type PilotAnalysisResponse = PilotAnalysisResult & {
  metadata: { sourceLocalNow: string };
};
