import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { afterEach, expect, test, vi } from 'vitest';
import { downloadOlistSource } from '../../server/pilot/source';

const requiredFiles = ['olist_orders_dataset.csv', 'olist_order_items_dataset.csv', 'olist_order_payments_dataset.csv', 'olist_order_reviews_dataset.csv', 'olist_products_dataset.csv', 'olist_customers_dataset.csv', 'olist_sellers_dataset.csv', 'olist_geolocation_dataset.csv', 'product_category_name_translation.csv'];
const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'olist-source-'));
  temporaryDirectories.push(directory);
  return directory;
}

function archive(entries: Record<string, string> = Object.fromEntries(requiredFiles.map((filename) => [filename, filename]))) {
  return zipSync(Object.fromEntries(Object.entries(entries).map(([filename, contents]) => [filename, new TextEncoder().encode(contents)])));
}

function fetchResponse(response: Response): typeof fetch {
  return async () => response;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

test('downloads the official archive and extracts exactly the required CSV files', async () => {
  const dataDir = await temporaryDirectory();
  const zip = archive();

  const result = await downloadOlistSource({ dataDir, fetchImpl: fetchResponse(new Response(zip)) });

  expect(await readFile(result.archivePath)).toEqual(Buffer.from(zip));
  await expect(readFile(join(result.sourceDir, 'olist_orders_dataset.csv'), 'utf8')).resolves.toBe('olist_orders_dataset.csv');
});

test('streams archive extraction without materializing the response body', async () => {
  const dataDir = await temporaryDirectory();
  const response = new Response(archive());
  vi.spyOn(response, 'arrayBuffer').mockRejectedValue(new Error('whole archive allocation is forbidden'));

  await expect(downloadOlistSource({ dataDir, fetchImpl: fetchResponse(response) })).resolves.toMatchObject({ sourceDir: expect.stringContaining('source') });
  await expect(readFile(join(dataDir, 'source', 'olist_order_payments_dataset.csv'), 'utf8')).resolves.toBe('olist_order_payments_dataset.csv');
});

test.each([401, 403])('links to Kaggle manual download when authentication returns %i', async (status) => {
  await expect(downloadOlistSource({ dataDir: await temporaryDirectory(), fetchImpl: fetchResponse(new Response('', { status })) }))
    .rejects.toThrow('https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce');
});

test('links to the official manual download and local source path when the network resets', async () => {
  const networkError = Object.assign(new Error('socket reset'), { code: 'ECONNRESET' });

  await expect(downloadOlistSource({ dataDir: await temporaryDirectory(), fetchImpl: async () => { throw networkError; } }))
    .rejects.toThrow(/https:\/\/www\.kaggle\.com\/datasets\/olistbr\/brazilian-ecommerce[\s\S]*var\/olist\/source/);
});

test('rejects a successful response that is not a ZIP archive', async () => {
  await expect(downloadOlistSource({ dataDir: await temporaryDirectory(), fetchImpl: fetchResponse(new Response('not a zip')) }))
    .rejects.toThrow('不是非空 ZIP 文件');
});

test.each(['../olist_orders_dataset.csv', '..\\olist_orders_dataset.csv', '/olist_orders_dataset.csv', 'C:\\olist_orders_dataset.csv', 'C:olist_orders_dataset.csv'])('rejects unsafe ZIP path %s', async (unsafePath) => {
  const entries = Object.fromEntries(requiredFiles.map((filename) => [filename, filename]));
  delete entries['olist_orders_dataset.csv'];
  entries[unsafePath] = 'unsafe';
  await expect(downloadOlistSource({ dataDir: await temporaryDirectory(), fetchImpl: fetchResponse(new Response(archive(entries)))}))
    .rejects.toThrow('不安全路径');
});

test('rejects duplicate required filenames inside different ZIP paths', async () => {
  const entries = Object.fromEntries(requiredFiles.map((filename) => [filename, filename]));
  delete entries['olist_orders_dataset.csv'];
  entries['first/olist_orders_dataset.csv'] = 'first';
  entries['second/olist_orders_dataset.csv'] = 'second';
  await expect(downloadOlistSource({ dataDir: await temporaryDirectory(), fetchImpl: fetchResponse(new Response(archive(entries)))}))
    .rejects.toThrow('重复文件');
});
