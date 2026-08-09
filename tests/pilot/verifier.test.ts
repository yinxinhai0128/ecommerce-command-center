import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { importOlistDataset } from '../../server/pilot/importer';
import { verifyOlistDataset } from '../../server/pilot/verifier';

const fixtureDir = join(process.cwd(), 'tests', 'fixtures', 'olist');
const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'olist-pilot-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

test('independently reconciles counts, range, and eligible item GMV', async () => {
  const dataDir = await temporaryDirectory();
  await importOlistDataset({ sourceDir: fixtureDir, dataDir, now: new Date('2026-08-09T00:00:00.000Z') });

  expect(verifyOlistDataset({ dataDir })).toMatchObject({
    valid: true,
    tableRows: { orders: 8, orderItems: 9, reviews: 7, products: 8, customers: 2, sellers: 2, categoryTranslations: 2 },
    itemGmv: 363.75,
    duplicatePrimaryKeys: 0,
    orphanReferences: 0,
    range: { start: '2017-01-01 10:00:00', end: '2017-08-01 10:00:00' },
  });
});
