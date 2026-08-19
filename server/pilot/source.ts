import { createHash } from 'node:crypto';
import { closeSync, createReadStream, createWriteStream, openSync, writeSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { finished } from 'node:stream/promises';
import { Unzip, UnzipInflate } from 'fflate';
import type { DownloadOptions, OlistSourceReceipt } from './contracts';
import { resolveOlistPaths } from './paths';

const downloadUrl = 'https://www.kaggle.com/api/v1/datasets/download/olistbr/brazilian-ecommerce';
const officialDatasetUrl = 'https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce';
const manualDownloadGuide = `请登录 ${officialDatasetUrl} 手动下载官方归档，将九个 CSV 解压到 var/olist/source 后运行 pnpm data:olist:import。`;
const requiredFiles = new Set(['olist_orders_dataset.csv', 'olist_order_items_dataset.csv', 'olist_order_reviews_dataset.csv', 'olist_products_dataset.csv', 'olist_customers_dataset.csv', 'olist_sellers_dataset.csv', 'product_category_name_translation.csv', 'olist_order_payments_dataset.csv', 'olist_geolocation_dataset.csv']);

async function saveArchive(response: Response, archivePath: string): Promise<string> {
  if (!response.body) throw new Error('Kaggle 返回的响应没有可读取的数据流');
  const hash = createHash('sha256');
  const writer = createWriteStream(archivePath);
  const complete = finished(writer);
  const reader = response.body.getReader();
  const header: number[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      for (const byte of value) if (header.length < 4) header.push(byte);
      if (!writer.write(value)) await new Promise<void>((resolve) => writer.once('drain', resolve));
    }
    writer.end();
    await complete;
  } catch (error) {
    writer.destroy();
    await complete.catch(() => undefined);
    throw error;
  }
  if (header.length < 4 || header[0] !== 0x50 || header[1] !== 0x4b) throw new Error('Kaggle 返回的不是非空 ZIP 文件');
  return hash.digest('hex');
}

async function extractRequiredFiles(archivePath: string, sourceDir: string) {
  const selected = new Set<string>();
  const descriptors = new Set<number>();
  let extractionError: Error | undefined;
  const close = (descriptor: number) => {
    if (!descriptors.delete(descriptor)) return;
    closeSync(descriptor);
  };
  const unzip = new Unzip((file) => {
    const normalizedEntry = file.name.replace(/\\/g, '/');
    if (normalizedEntry.startsWith('/') || /^[A-Za-z]:/.test(normalizedEntry) || normalizedEntry.split('/').includes('..')) {
      extractionError = new Error(`ZIP 包含不安全路径: ${file.name}`);
      file.terminate();
      return;
    }
    const filename = basename(normalizedEntry);
    if (!requiredFiles.has(filename)) return;
    if (selected.has(filename)) {
      extractionError = new Error(`ZIP 包含重复文件: ${filename}`);
      file.terminate();
      return;
    }
    selected.add(filename);
    const descriptor = openSync(join(sourceDir, filename), 'w');
    descriptors.add(descriptor);
    file.ondata = (error, chunk, final) => {
      if (error) {
        extractionError = error instanceof Error ? error : new Error(String(error));
        close(descriptor);
        return;
      }
      if (chunk.length > 0) writeSync(descriptor, chunk);
      if (final) close(descriptor);
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    for await (const chunk of createReadStream(archivePath)) {
      if (extractionError) break;
      unzip.push(chunk);
    }
    if (!extractionError) unzip.push(new Uint8Array(), true);
  } finally {
    descriptors.forEach(close);
  }
  if (extractionError) throw extractionError;
  if (selected.size !== requiredFiles.size) throw new Error('ZIP 缺少必需的 Olist CSV 文件');
}

export async function downloadOlistSource({ dataDir, fetchImpl = fetch }: DownloadOptions): Promise<OlistSourceReceipt> {
  let response: Response;
  try {
    response = await fetchImpl(downloadUrl);
  } catch {
    throw new Error(`Kaggle 网络连接失败。${manualDownloadGuide}`);
  }
  if (response.status === 401 || response.status === 403) throw new Error(`Kaggle 身份验证失败。${manualDownloadGuide}`);
  if (!response.ok) throw new Error(`Kaggle 下载失败: ${response.status}`);
  const paths = resolveOlistPaths(dataDir);
  await mkdir(paths.dataDir, { recursive: true });
  const temporaryArchivePath = `${paths.archivePath}.tmp-${process.pid}-${Date.now()}`;
  const temporarySourceDir = `${paths.sourceDir}.tmp-${process.pid}-${Date.now()}`;
  try {
    const archiveSha256 = await saveArchive(response, temporaryArchivePath);
    await mkdir(temporarySourceDir, { recursive: true });
    await extractRequiredFiles(temporaryArchivePath, temporarySourceDir);
    await rm(paths.sourceDir, { force: true, recursive: true });
    await rename(temporarySourceDir, paths.sourceDir);
    await rm(paths.archivePath, { force: true });
    await rename(temporaryArchivePath, paths.archivePath);
    return { archivePath: paths.archivePath, sourceDir: paths.sourceDir, archiveSha256 };
  } catch (error) {
    await rm(temporaryArchivePath, { force: true });
    await rm(temporarySourceDir, { force: true, recursive: true });
    throw error;
  }
}
