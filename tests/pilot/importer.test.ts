import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { importOlistDataset } from '../../server/pilot/importer';
import { verifyOlistDataset } from '../../server/pilot/verifier';

const fixtureDir = join(process.cwd(), 'tests', 'fixtures', 'olist');
const fixedNow = new Date('2026-08-09T00:00:00.000Z');
const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'olist-pilot-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

test('imports required Olist files and records matching source rows', async () => {
  const tempDir = await temporaryDirectory();
  const result = await importOlistDataset({ sourceDir: fixtureDir, dataDir: tempDir, now: fixedNow });

  expect(result.ready).toBe(true);
  expect(result.tables.orders).toEqual({ sourceRows: 8, importedRows: 8 });
  expect(result.tables.orderItems).toEqual({ sourceRows: 9, importedRows: 9 });
  expect(result.tables.payments).toEqual({ sourceRows: 2, importedRows: 2 });
  expect(result.tables.geolocations).toEqual({ sourceRows: 2, importedRows: 2 });
  expect(Object.keys(result.files)).toEqual(expect.arrayContaining([
    'olist_order_payments_dataset.csv',
    'olist_geolocation_dataset.csv',
  ]));
  const manifest = JSON.parse(await readFile(join(tempDir, 'manifest.json'), 'utf8'));
  for (const filename of ['olist_order_payments_dataset.csv', 'olist_geolocation_dataset.csv']) {
    const sha256 = createHash('sha256').update(await readFile(join(fixtureDir, filename))).digest('hex');
    expect(result.files[filename].sha256).toBe(sha256);
    expect(manifest.files[filename].sha256).toBe(sha256);
  }
  expect(manifest.tables.payments).toEqual({ sourceRows: 2, importedRows: 2 });
  expect(manifest.tables.geolocations).toEqual({ sourceRows: 2, importedRows: 2 });
  expect(result.range).toEqual({ start: '2017-01-01', end: '2017-08-01' });
  expect(result.source.license).toBe('CC BY-NC-SA 4.0');
});

test('reimporting the same source is idempotent', async () => {
  const tempDir = await temporaryDirectory();
  await importOlistDataset({ sourceDir: fixtureDir, dataDir: tempDir, now: fixedNow });
  const first = verifyOlistDataset({ dataDir: tempDir });
  await importOlistDataset({ sourceDir: fixtureDir, dataDir: tempDir, now: fixedNow });
  const second = verifyOlistDataset({ dataDir: tempDir });

  expect(second.tableRows).toEqual(first.tableRows);
  expect(second.itemGmv).toBe(first.itemGmv);
});

test('imports CSV exports whose first header includes a UTF-8 BOM', async () => {
  const tempDir = await temporaryDirectory();
  const sourceDir = join(tempDir, 'source');
  await cp(fixtureDir, sourceDir, { recursive: true });
  const translations = join(sourceDir, 'product_category_name_translation.csv');
  await writeFile(translations, `\uFEFF${await readFile(translations, 'utf8')}`);

  const result = await importOlistDataset({ sourceDir, dataDir: tempDir, now: fixedNow });

  expect(result.tables.categoryTranslations).toEqual({ sourceRows: 2, importedRows: 2 });
});

test('keeps source reviews that reuse one review ID for different orders', async () => {
  const tempDir = await temporaryDirectory();
  const sourceDir = join(tempDir, 'source');
  await cp(fixtureDir, sourceDir, { recursive: true });
  const reviews = join(sourceDir, 'olist_order_reviews_dataset.csv');
  await writeFile(reviews, (await readFile(reviews, 'utf8')).replace('r2,o2,1', 'r1,o2,1'));

  const result = await importOlistDataset({ sourceDir, dataDir: tempDir, now: fixedNow });

  expect(result.tables.reviews).toEqual({ sourceRows: 7, importedRows: 7 });
  expect(verifyOlistDataset({ dataDir: tempDir }).valid).toBe(true);
});

test('rolls back when an order item references a missing product', async () => {
  const tempDir = await temporaryDirectory();
  const brokenFixtureDir = join(tempDir, 'broken');
  await cp(fixtureDir, brokenFixtureDir, { recursive: true });
  const itemFile = join(brokenFixtureDir, 'olist_order_items_dataset.csv');
  await writeFile(itemFile, (await readFile(itemFile, 'utf8')).replace(',p1,s1,2017-01-03', ',missing-product,s1,2017-01-03'));

  await expect(importOlistDataset({ sourceDir: brokenFixtureDir, dataDir: tempDir, now: fixedNow }))
    .rejects.toThrow('订单明细引用不存在的商品');
  expect(existsSync(join(tempDir, 'manifest.json'))).toBe(false);
});
