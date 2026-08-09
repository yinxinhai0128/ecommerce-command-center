import request from 'supertest';
import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../server/index';
import { createPilotSchema, openPilotDatabase } from '../../server/pilot/database';
import { resolveOlistPaths } from '../../server/pilot/paths';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'olist-pilot-route-'));
  directories.push(directory);
  return directory;
}

async function readyDataDirectory() {
  const dataDir = await temporaryDirectory();
  directories.splice(directories.indexOf(dataDir), 1);
  const paths = resolveOlistPaths(dataDir);
  const database = openPilotDatabase(paths.databasePath);
  createPilotSchema(database);
  database.prepare("INSERT INTO customers VALUES ('customer-1', 'unique-1', '01000', 'Sao Paulo', 'SP')").run();
  database.prepare("INSERT INTO sellers VALUES ('seller-1', '01000', 'Sao Paulo', 'SP')").run();
  database.prepare("INSERT INTO products VALUES ('product-1', 'books', NULL, NULL, NULL, NULL, NULL, NULL, NULL)").run();
  database.prepare("INSERT INTO orders VALUES ('order-1', 'customer-1', 'delivered', '2018-01-01 00:00:00', '2018-01-01 01:00:00', '2018-01-01 02:00:00', '2018-01-02 00:00:00', '2018-01-03 00:00:00')").run();
  database.prepare("INSERT INTO order_items VALUES ('order-1', 1, 'product-1', 'seller-1', '2018-01-01 02:00:00', 490, 0)").run();
  database.close();
  await writeFile(paths.manifestPath, JSON.stringify({
    ready: true,
    importedAt: '2026-08-09T00:00:00.000Z',
    importerVersion: 1,
    source: { dataset: 'olistbr/brazilian-ecommerce', url: 'https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce', license: 'CC BY-NC-SA 4.0' },
    files: {},
    tables: {},
    range: { start: '2018-01-01 00:00:00', end: '2018-01-31 23:59:59' },
  }));
  return dataDir;
}

async function manifestWithoutDatabaseDirectory() {
  const dataDir = await temporaryDirectory();
  const paths = resolveOlistPaths(dataDir);
  await writeFile(paths.manifestPath, JSON.stringify({
    ready: true,
    importedAt: '2026-08-09T00:00:00.000Z',
    importerVersion: 1,
    source: { dataset: 'olistbr/brazilian-ecommerce', url: 'https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce', license: 'CC BY-NC-SA 4.0' },
    files: {},
    tables: {},
    range: { start: '2018-01-01 00:00:00', end: '2018-01-31 23:59:59' },
  }));
  return dataDir;
}

describe('Olist Pilot API', () => {
  test('未就绪时返回可操作状态且不影响模拟 API', async () => {
    const emptyDir = await temporaryDirectory();
    const response = await request(createApp({ pilot: { dataDir: emptyDir } })).get('/api/pilot/status');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ready: false, importCommand: 'pnpm data:olist:import' });
  });

  test('导入清单存在但数据库不可用时返回稳定错误码', async () => {
    const response = await request(createApp({ pilot: { dataDir: await manifestWithoutDatabaseDirectory() } })).get('/api/pilot/status');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'PILOT_DATABASE_UNAVAILABLE' });
  });

  test('返回服务器计算的快照并拒绝倒序日期范围', async () => {
    const app = createApp({ pilot: { dataDir: await readyDataDirectory() } });
    const ok = await request(app).get('/api/pilot/snapshot?start=2018-01-01&end=2018-01-31');
    const bad = await request(app).get('/api/pilot/snapshot?start=2018-02-01&end=2018-01-01');

    expect(ok.status).toBe(200);
    expect(ok.body.kpis.itemGmv.value).toBe(490);
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: 'INVALID_DATE_RANGE' });
  });

  test('拒绝格式正确但不存在的日期', async () => {
    const app = createApp({ pilot: { dataDir: await readyDataDirectory() } });
    const response = await request(app).get('/api/pilot/snapshot?start=2018-02-30&end=2018-03-01');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'INVALID_QUERY' });
  });

  test('通过服务端控制开始、暂停和重置', async () => {
    const app = createApp({ pilot: { dataDir: await readyDataDirectory() } });

    expect((await request(app).post('/api/pilot/replay').send({ action: 'pause' })).body.isRunning).toBe(false);
    expect((await request(app).post('/api/pilot/replay').send({ action: 'start' })).body.isRunning).toBe(true);
    expect((await request(app).post('/api/pilot/replay').send({ action: 'reset' })).body.sourceLocalNow).toBe('2018-01-01 00:00:00');
  });
});
