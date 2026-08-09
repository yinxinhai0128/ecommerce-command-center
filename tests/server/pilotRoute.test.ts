import request from 'supertest';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../server/index';
import { createPilotSchema, openPilotDatabase } from '../../server/pilot/database';
import { resolveOlistPaths } from '../../server/pilot/paths';
import { DatabaseSync } from 'node:sqlite';

const directories: string[] = [];
const applications: Array<ReturnType<typeof createApp>> = [];

afterEach(async () => {
  applications.splice(0).forEach((app) => (app as ReturnType<typeof createApp> & { dispose?: () => void }).dispose?.());
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

function createPilotApp(dataDir: string) {
  const app = createApp({ pilot: { dataDir } });
  applications.push(app);
  return app;
}

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'olist-pilot-route-'));
  directories.push(directory);
  return directory;
}

async function readyDataDirectory() {
  const dataDir = await temporaryDirectory();
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
    const response = await request(createPilotApp(emptyDir)).get('/api/pilot/status');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ready: false, importCommand: 'pnpm data:olist:import' });
  });

  test('导入清单存在但数据库不可用时返回稳定错误码', async () => {
    const response = await request(createPilotApp(await manifestWithoutDatabaseDirectory())).get('/api/pilot/status');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'PILOT_DATABASE_UNAVAILABLE' });
  });

  test('返回服务器计算的快照并拒绝倒序日期范围', async () => {
    const app = createPilotApp(await readyDataDirectory());
    const ok = await request(app).get('/api/pilot/snapshot?start=2018-01-01&end=2018-01-31');
    const bad = await request(app).get('/api/pilot/snapshot?start=2018-02-01&end=2018-01-01');

    expect(ok.status).toBe(200);
    expect(ok.body.kpis.itemGmv.value).toBe(490);
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: 'INVALID_DATE_RANGE' });
  });

  test.each([
    ['category', 'missing'],
    ['sellerId', 'missing'],
    ['customerState', 'RJ'],
  ])('拒绝不在筛选选项内的 %s', async (key, value) => {
    const app = createPilotApp(await readyDataDirectory());
    const response = await request(app).get(`/api/pilot/snapshot?start=2018-01-01&end=2018-01-31&${key}=${value}`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'INVALID_QUERY' });
  });

  test('允许 366 天日期范围并拒绝 367 天范围', async () => {
    const app = createPilotApp(await readyDataDirectory());
    const allowed = await request(app).get('/api/pilot/snapshot?start=2018-01-01&end=2019-01-01');
    const rejected = await request(app).get('/api/pilot/snapshot?start=2018-01-01&end=2019-01-02');

    expect(allowed.status).toBe(200);
    expect(rejected.status).toBe(400);
    expect(rejected.body).toEqual({ error: 'INVALID_DATE_RANGE' });
  });

  test('拒绝格式正确但不存在的日期', async () => {
    const app = createPilotApp(await readyDataDirectory());
    const response = await request(app).get('/api/pilot/snapshot?start=2018-02-30&end=2018-03-01');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'INVALID_QUERY' });
  });

  test('通过服务端控制开始、暂停和重置', async () => {
    const app = createPilotApp(await readyDataDirectory());

    expect((await request(app).post('/api/pilot/replay').send({ action: 'pause' })).body.isRunning).toBe(false);
    expect((await request(app).post('/api/pilot/replay').send({ action: 'start' })).body.isRunning).toBe(true);
    expect((await request(app).post('/api/pilot/replay').send({ action: 'reset' })).body.sourceLocalNow).toBe('2018-01-31 00:00:00');
  });

  test('仅在精确 filter-options 路径暴露筛选选项', async () => {
    const app = createPilotApp(await readyDataDirectory());
    const exact = await request(app).get('/api/pilot/filter-options');
    const alias = await request(app).get('/api/pilot/filters');

    expect(exact.status).toBe(200);
    expect(exact.body).toEqual({ categories: ['books'], sellerIds: ['seller-1'], customerStates: ['SP'] });
    expect(alias.status).toBe(404);
  });

  test('HTTP server 关闭时清理 replay timer 和数据库', async () => {
    const dataDir = await readyDataDirectory();
    const clearInterval = vi.spyOn(globalThis, 'clearInterval');
    const closeDatabase = vi.spyOn(DatabaseSync.prototype, 'close');
    const app = createPilotApp(dataDir);
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP listener');

    await request(`http://127.0.0.1:${address.port}`).post('/api/pilot/replay').send({ action: 'start' }).expect(200);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));

    expect(clearInterval).toHaveBeenCalledOnce();
    expect(closeDatabase).toHaveBeenCalledOnce();
  });
});
