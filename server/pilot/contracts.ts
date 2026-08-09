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
