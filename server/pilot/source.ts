import { createHash } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { unzipSync } from 'fflate';
import type { DownloadOptions, OlistSourceReceipt } from './contracts';
import { resolveOlistPaths } from './paths';

const downloadUrl = 'https://www.kaggle.com/api/v1/datasets/download/olistbr/brazilian-ecommerce';
const officialDatasetUrl = 'https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce';
const manualDownloadGuide = `请登录 ${officialDatasetUrl} 手动下载官方归档，将七个 CSV 解压到 var/olist/source 后运行 pnpm data:olist:import。`;
const requiredFiles = new Set(['olist_orders_dataset.csv', 'olist_order_items_dataset.csv', 'olist_order_reviews_dataset.csv', 'olist_products_dataset.csv', 'olist_customers_dataset.csv', 'olist_sellers_dataset.csv', 'product_category_name_translation.csv']);

export async function downloadOlistSource({ dataDir, fetchImpl = fetch }: DownloadOptions): Promise<OlistSourceReceipt> {
  let response: Response;
  try {
    response = await fetchImpl(downloadUrl);
  } catch {
    throw new Error(`Kaggle 网络连接失败。${manualDownloadGuide}`);
  }
  if (response.status === 401 || response.status === 403) throw new Error(`Kaggle 身份验证失败。${manualDownloadGuide}`);
  if (!response.ok) throw new Error(`Kaggle 下载失败: ${response.status}`);
  const archive = new Uint8Array(await response.arrayBuffer());
  if (archive.length < 4 || archive[0] !== 0x50 || archive[1] !== 0x4b) throw new Error('Kaggle 返回的不是非空 ZIP 文件');
  const paths = resolveOlistPaths(dataDir);
  await mkdir(paths.dataDir, { recursive: true });
  const temporaryArchivePath = `${paths.archivePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryArchivePath, archive);
  const entries = unzipSync(archive);
  const selected = new Map<string, Uint8Array>();
  for (const [entry, contents] of Object.entries(entries)) {
    const normalizedEntry = entry.replace(/\\/g, '/');
    if (normalizedEntry.startsWith('/') || /^[A-Za-z]:/.test(normalizedEntry) || normalizedEntry.split('/').includes('..')) throw new Error(`ZIP 包含不安全路径: ${entry}`);
    const filename = basename(normalizedEntry);
    if (requiredFiles.has(filename)) {
      if (selected.has(filename)) throw new Error(`ZIP 包含重复文件: ${filename}`);
      selected.set(filename, contents);
    }
  }
  if (selected.size !== requiredFiles.size) throw new Error('ZIP 缺少必需的 Olist CSV 文件');
  await rm(paths.sourceDir, { force: true, recursive: true });
  await mkdir(paths.sourceDir, { recursive: true });
  await Promise.all([...selected].map(([filename, contents]) => writeFile(join(paths.sourceDir, filename), contents)));
  await rm(paths.archivePath, { force: true });
  await rename(temporaryArchivePath, paths.archivePath);
  return { archivePath: paths.archivePath, sourceDir: paths.sourceDir, archiveSha256: createHash('sha256').update(archive).digest('hex') };
}
