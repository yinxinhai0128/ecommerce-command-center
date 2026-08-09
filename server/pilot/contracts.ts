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
};
