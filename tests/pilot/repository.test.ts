import { DatabaseSync } from 'node:sqlite';
import { cp, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { createPilotSchema, openPilotDatabase } from '../../server/pilot/database';
import { importOlistDataset } from '../../server/pilot/importer';
import { resolveOlistPaths } from '../../server/pilot/paths';
import { createPilotRepository } from '../../server/pilot/repository';

const databases: DatabaseSync[] = [];
const replayNow = new Date('2018-01-31T23:59:59');
const filters = { start: '2018-01-01', end: '2018-01-31' };

afterEach(() => databases.splice(0).forEach((database) => database.close()));

function createRepository() {
  const database = new DatabaseSync(':memory:');
  databases.push(database);
  createPilotSchema(database);

  database.exec(`
    INSERT INTO customers VALUES ('c-sp', 'u-sp', '01000', 'sao paulo', 'SP'), ('c-rj', 'u-rj', '20000', 'rio de janeiro', 'RJ');
    INSERT INTO sellers VALUES ('seller-1', '30000', 'belo horizonte', 'MG'), ('seller-2', '40000', 'curitiba', 'PR');
    INSERT INTO products VALUES
      ('p-books', 'books', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
      ('p-books-alt', 'books', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
      ('p-beauty', 'beauty', NULL, NULL, NULL, NULL, NULL, NULL, NULL);
    INSERT INTO orders VALUES
      ('o1', 'c-sp', 'delivered', '2018-01-01 10:00:00', '2018-01-01 11:00:00', '2018-01-02 09:00:00', '2018-01-05 10:00:00', '2018-01-06 10:00:00'),
      ('o2', 'c-rj', 'delivered', '2018-01-02 10:00:00', '2018-01-02 11:00:00', '2018-01-03 09:00:00', '2018-01-08 10:00:00', '2018-01-07 10:00:00'),
      ('o3', 'c-sp', 'delivered', '2018-01-03 10:00:00', '2018-01-03 11:00:00', '2018-01-04 09:00:00', '2018-01-09 10:00:00', '2018-01-10 10:00:00'),
      ('o4', 'c-rj', 'delivered', '2018-01-04 10:00:00', '2018-01-04 11:00:00', '2018-01-05 09:00:00', '2018-01-12 10:00:00', NULL),
      ('o5', 'c-sp', 'canceled', '2018-01-05 10:00:00', '2018-01-05 11:00:00', NULL, NULL, NULL),
      ('o6', 'c-rj', 'unavailable', '2018-01-06 10:00:00', '2018-01-06 11:00:00', '2018-01-07 09:00:00', NULL, NULL),
      ('o7', 'c-sp', 'unavailable', '2018-01-07 10:00:00', '2018-01-07 11:00:00', NULL, NULL, NULL),
      ('o8', 'c-rj', 'processing', '2018-01-08 10:00:00', NULL, NULL, NULL, NULL),
      ('previous', 'c-sp', 'delivered', '2017-12-31 10:00:00', '2017-12-31 11:00:00', '2017-12-31 12:00:00', '2018-01-01 10:00:00', '2018-01-02 10:00:00');
    INSERT INTO order_items VALUES
      ('o1', 1, 'p-books', 'seller-1', '2018-01-02 00:00:00', 100, 0),
      ('o2', 1, 'p-beauty', 'seller-2', '2018-01-03 00:00:00', 110, 0),
      ('o3', 1, 'p-books', 'seller-1', '2018-01-04 00:00:00', 130, 0),
      ('o4', 1, 'p-beauty', 'seller-2', '2018-01-05 00:00:00', 150, 0),
      ('o5', 1, 'p-books', 'seller-1', '2018-01-06 00:00:00', 0, 0),
      ('o6', 1, 'p-beauty', 'seller-2', '2018-01-07 00:00:00', 0, 0),
      ('o7', 1, 'p-books', 'seller-1', '2018-01-08 00:00:00', 0, 0),
      ('o8', 1, 'p-beauty', 'seller-2', '2018-01-09 00:00:00', 0, 0),
      ('previous', 1, 'p-books', 'seller-1', '2017-12-31 00:00:00', 50, 0);
    INSERT INTO reviews VALUES
      ('r1', 'o1', 5, NULL, NULL, '2018-01-06 00:00:00', '2018-01-06 01:00:00'),
      ('r2', 'o2', 3, NULL, NULL, '2018-01-09 00:00:00', '2018-01-09 01:00:00'),
      ('r3', 'o3', 4, NULL, NULL, '2018-01-10 00:00:00', '2018-01-10 01:00:00'),
      ('r4', 'o4', 4, NULL, NULL, '2018-01-13 00:00:00', '2018-01-13 01:00:00');
  `);

  return createPilotRepository(database);
}

test('calculates only metrics supported by Olist facts', () => {
  // Removing a delivered order from the KPI cohort must fail this test.
  const snapshot = createRepository().getSnapshot(filters, replayNow);

  expect(snapshot.kpis.itemGmv.value).toBe(490);
  expect(snapshot.kpis.validOrderCount.value).toBe(4);
  expect(snapshot.kpis.averageOrderValue.value).toBe(122.5);
  expect(snapshot.kpis.cancellationRate.value).toBe(1 / 6);
  expect(snapshot.kpis.onTimeDeliveryRate.value).toBe(2 / 3);
  expect(snapshot.kpis.averageDeliveryDays.value).toBe(6);
  expect(snapshot.kpis.averageReviewScore.value).toBe(4);
  expect(Object.keys(snapshot.kpis)).not.toContain('grossMarginRate');
});

test('uses one cohort for the fulfillment funnel', () => {
  // Counting approvals from a different date or filter cohort must fail this test.
  expect(createRepository().getSnapshot(filters, replayNow).fulfillmentFunnel).toEqual([
    { stage: 'purchased', value: 8 },
    { stage: 'approved', value: 7 },
    { stage: 'carrier', value: 5 },
    { stage: 'delivered', value: 4 },
  ]);
});

test('applies category seller and customer-state filters to every module', () => {
  // Ignoring any item or order filter in a module must fail this test.
  const snapshot = createRepository().getSnapshot({ ...filters, category: 'books', sellerId: 'seller-1', customerState: 'SP' }, replayNow);

  expect(snapshot.dailyTrend).toEqual([
    { date: '2018-01-01', itemGmv: 100, validOrderCount: 1 },
    { date: '2018-01-03', itemGmv: 130, validOrderCount: 1 },
    { date: '2018-01-05', itemGmv: 0, validOrderCount: 0 },
    { date: '2018-01-07', itemGmv: 0, validOrderCount: 0 },
  ]);
  expect(snapshot.recentOrders.every((order) => order.customerState === 'SP')).toBe(true);
  expect(snapshot.categoryRanking.map((row) => row.category)).toEqual(['books']);
  expect(snapshot.sellerRanking.map((row) => row.sellerId)).toEqual(['seller-1']);
  expect(snapshot.customerStateRanking.map((row) => row.customerState)).toEqual(['SP']);
});

test('caps the inclusive end date at replay time and returns zero for empty denominators', () => {
  // Letting future source rows leak into a replay must fail this test.
  const snapshot = createRepository().getSnapshot({ start: '2018-01-01', end: '2018-01-31', category: 'missing' }, new Date('2018-01-04T12:00:00'));

  expect(snapshot.sourceLocalNow).toBe('2018-01-04 12:00:00');
  expect(snapshot.dailyTrend).toEqual([]);
  expect(snapshot.kpis).toEqual({
    itemGmv: { value: 0, comparisonValue: 0, changeRate: 0 },
    validOrderCount: { value: 0, comparisonValue: 0, changeRate: 0 },
    averageOrderValue: { value: 0, comparisonValue: 0, changeRate: 0 },
    cancellationRate: { value: 0, comparisonValue: 0, changeRate: 0 },
    onTimeDeliveryRate: { value: 0, comparisonValue: 0, changeRate: 0 },
    averageDeliveryDays: { value: 0, comparisonValue: 0, changeRate: 0 },
    averageReviewScore: { value: 0, comparisonValue: 0, changeRate: 0 },
  });
});

test('keeps a replay timestamp as source-local wall time', () => {
  // Parsing a source-local replay timestamp as UTC must fail this test.
  const snapshot = createRepository().getSnapshot({ start: '2018-01-01', end: '2018-01-31' }, '2018-01-04 12:00:00');

  expect(snapshot.sourceLocalNow).toBe('2018-01-04 12:00:00');
  expect(snapshot.kpis.itemGmv.value).toBe(490);
});

test('compares with the immediately preceding equal-length calendar interval', () => {
  // Shifting the comparison boundary by a day must fail this test.
  const snapshot = createRepository().getSnapshot(filters, replayNow);

  expect(snapshot.kpis.itemGmv).toEqual({ value: 490, comparisonValue: 50, changeRate: 8.8 });
  expect(snapshot.comparisonLabel).toBe('2017-12-01 to 2017-12-31');
});

test('keeps unitemized orders in an unfiltered cohort', () => {
  // Requiring every order to have an item must fail this test.
  const database = new DatabaseSync(':memory:');
  databases.push(database);
  createPilotSchema(database);
  database.exec(`
    INSERT INTO customers VALUES ('customer', 'unique', '01000', 'sao paulo', 'SP');
    INSERT INTO orders VALUES
      ('canceled', 'customer', 'canceled', '2018-01-01 10:00:00', NULL, NULL, NULL, NULL),
      ('delivered', 'customer', 'delivered', '2018-01-01 11:00:00', NULL, NULL, '2018-01-02 11:00:00', '2018-01-03 11:00:00');
  `);

  const snapshot = createPilotRepository(database).getSnapshot({ start: '2018-01-01', end: '2018-01-01' }, '2018-01-01 23:59:59');

  expect(snapshot.kpis.cancellationRate.value).toBe(1 / 2);
  expect(snapshot.fulfillmentFunnel).toEqual([
    { stage: 'purchased', value: 2 },
    { stage: 'approved', value: 0 },
    { stage: 'carrier', value: 0 },
    { stage: 'delivered', value: 1 },
  ]);
  expect(snapshot.recentOrders.map((order) => [order.orderId, order.itemGmv, order.itemCount])).toEqual([
    ['delivered', 0, 0],
    ['canceled', 0, 0],
  ]);
});

test('returns distinct category filter options', () => {
  // Returning one option per product rather than per category must fail this test.
  expect(createRepository().getFilterOptions().categories).toEqual(['beauty', 'books']);
});

test('caps every module at the exact local replay timestamp', () => {
  // Including a row after the exact replay second must fail this test.
  const database = new DatabaseSync(':memory:');
  databases.push(database);
  createPilotSchema(database);
  database.exec(`
    INSERT INTO customers VALUES ('customer', 'unique', '01000', 'sao paulo', 'SP');
    INSERT INTO sellers VALUES ('seller-1', '30000', 'belo horizonte', 'MG');
    INSERT INTO products VALUES ('book', 'books', NULL, NULL, NULL, NULL, NULL, NULL, NULL);
    INSERT INTO orders VALUES
      ('before', 'customer', 'delivered', '2018-01-04 11:59:59', '2018-01-04 11:59:59', '2018-01-04 11:59:59', '2018-01-04 11:59:59', '2018-01-04 12:00:00'),
      ('exact', 'customer', 'delivered', '2018-01-04 12:00:00', '2018-01-04 12:00:00', '2018-01-04 12:00:00', '2018-01-04 12:00:00', '2018-01-04 12:00:01'),
      ('after', 'customer', 'delivered', '2018-01-04 12:00:01', '2018-01-04 12:00:01', '2018-01-04 12:00:01', '2018-01-04 12:00:01', '2018-01-04 12:00:02'),
      ('day-end', 'customer', 'delivered', '2018-01-04 23:59:59', '2018-01-04 23:59:59', '2018-01-04 23:59:59', '2018-01-04 23:59:59', '2018-01-05 00:00:00'),
      ('next-day', 'customer', 'delivered', '2018-01-05 00:00:00', '2018-01-05 00:00:00', '2018-01-05 00:00:00', '2018-01-05 00:00:00', '2018-01-05 00:00:01');
    INSERT INTO order_items VALUES
      ('before', 1, 'book', 'seller-1', '2018-01-04 11:59:59', 10, 0),
      ('exact', 1, 'book', 'seller-1', '2018-01-04 12:00:00', 20, 0),
      ('after', 1, 'book', 'seller-1', '2018-01-04 12:00:01', 30, 0),
      ('day-end', 1, 'book', 'seller-1', '2018-01-04 23:59:59', 40, 0),
      ('next-day', 1, 'book', 'seller-1', '2018-01-05 00:00:00', 50, 0);
  `);

  const snapshot = createPilotRepository(database).getSnapshot({ start: '2018-01-04', end: '2018-01-05', category: 'books' }, '2018-01-04 12:00:00');

  expect(snapshot.kpis.itemGmv.value).toBe(30);
  expect(snapshot.dailyTrend).toEqual([{ date: '2018-01-04', itemGmv: 30, validOrderCount: 2 }]);
  expect(snapshot.fulfillmentFunnel).toEqual([
    { stage: 'purchased', value: 2 },
    { stage: 'approved', value: 2 },
    { stage: 'carrier', value: 2 },
    { stage: 'delivered', value: 2 },
  ]);
  expect(snapshot.categoryRanking).toEqual([{ category: 'books', itemGmv: 30 }]);
  expect(snapshot.sellerRanking).toEqual([{ sellerId: 'seller-1', itemGmv: 30 }]);
  expect(snapshot.customerStateRanking).toEqual([{ customerState: 'SP', itemGmv: 30 }]);
  expect(snapshot.recentOrders.map((order) => order.orderId)).toEqual(['exact', 'before']);
});

test('includes the requested end date through 23:59:59 before a later replay time', () => {
  // Normalizing a requested end date to noon must fail this test.
  const database = new DatabaseSync(':memory:');
  databases.push(database);
  createPilotSchema(database);
  database.exec(`
    INSERT INTO customers VALUES ('customer', 'unique', '01000', 'sao paulo', 'SP');
    INSERT INTO sellers VALUES ('seller-1', '30000', 'belo horizonte', 'MG');
    INSERT INTO products VALUES ('book', 'books', NULL, NULL, NULL, NULL, NULL, NULL, NULL);
    INSERT INTO orders VALUES
      ('before', 'customer', 'delivered', '2018-01-04 11:59:59', '2018-01-04 11:59:59', '2018-01-04 11:59:59', '2018-01-04 11:59:59', '2018-01-05 00:00:00'),
      ('exact', 'customer', 'delivered', '2018-01-04 12:00:00', '2018-01-04 12:00:00', '2018-01-04 12:00:00', '2018-01-04 12:00:00', '2018-01-05 00:00:00'),
      ('after', 'customer', 'delivered', '2018-01-04 12:00:01', '2018-01-04 12:00:01', '2018-01-04 12:00:01', '2018-01-04 12:00:01', '2018-01-05 00:00:00'),
      ('day-end', 'customer', 'delivered', '2018-01-04 23:59:59', '2018-01-04 23:59:59', '2018-01-04 23:59:59', '2018-01-04 23:59:59', '2018-01-05 00:00:00'),
      ('next-day', 'customer', 'delivered', '2018-01-05 00:00:00', '2018-01-05 00:00:00', '2018-01-05 00:00:00', '2018-01-05 00:00:00', '2018-01-06 00:00:00');
    INSERT INTO order_items VALUES
      ('before', 1, 'book', 'seller-1', '2018-01-04 11:59:59', 10, 0),
      ('exact', 1, 'book', 'seller-1', '2018-01-04 12:00:00', 20, 0),
      ('after', 1, 'book', 'seller-1', '2018-01-04 12:00:01', 30, 0),
      ('day-end', 1, 'book', 'seller-1', '2018-01-04 23:59:59', 40, 0),
      ('next-day', 1, 'book', 'seller-1', '2018-01-05 00:00:00', 50, 0);
  `);

  const snapshot = createPilotRepository(database).getSnapshot({ start: '2018-01-04', end: '2018-01-04', category: 'books' }, '2018-01-05 12:00:00');

  expect(snapshot.kpis.itemGmv.value).toBe(100);
  expect(snapshot.kpis.validOrderCount.value).toBe(4);
  expect(snapshot.kpis.averageOrderValue.value).toBe(25);
  expect(snapshot.dailyTrend).toEqual([{ date: '2018-01-04', itemGmv: 100, validOrderCount: 4 }]);
  expect(snapshot.fulfillmentFunnel).toEqual([
    { stage: 'purchased', value: 4 },
    { stage: 'approved', value: 4 },
    { stage: 'carrier', value: 4 },
    { stage: 'delivered', value: 4 },
  ]);
  expect(snapshot.categoryRanking).toEqual([{ category: 'books', itemGmv: 100 }]);
  expect(snapshot.sellerRanking).toEqual([{ sellerId: 'seller-1', itemGmv: 100 }]);
  expect(snapshot.customerStateRanking).toEqual([{ customerState: 'SP', itemGmv: 100 }]);
  expect(snapshot.recentOrders.map((order) => order.orderId)).toEqual(['day-end', 'after', 'exact', 'before']);
});

test('uses matching line-item GMV without duplicating filtered orders', () => {
  // Summing an unselected line item or counting its order twice must fail this test.
  const database = new DatabaseSync(':memory:');
  databases.push(database);
  createPilotSchema(database);
  database.exec(`
    INSERT INTO customers VALUES ('customer', 'unique', '01000', 'sao paulo', 'SP');
    INSERT INTO sellers VALUES ('seller-1', '30000', 'belo horizonte', 'MG'), ('seller-2', '40000', 'curitiba', 'PR');
    INSERT INTO products VALUES
      ('book', 'books', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
      ('beauty', 'beauty', NULL, NULL, NULL, NULL, NULL, NULL, NULL);
    INSERT INTO orders VALUES
      ('multi', 'customer', 'delivered', '2018-01-01 10:00:00', '2018-01-01 10:00:00', '2018-01-01 10:00:00', '2018-01-02 10:00:00', '2018-01-03 10:00:00'),
      ('canceled', 'customer', 'canceled', '2018-01-02 10:00:00', '2018-01-02 10:00:00', NULL, NULL, NULL);
    INSERT INTO order_items VALUES
      ('multi', 1, 'book', 'seller-1', '2018-01-01 10:00:00', 100, 0),
      ('multi', 2, 'beauty', 'seller-2', '2018-01-01 10:00:00', 200, 0),
      ('canceled', 1, 'book', 'seller-1', '2018-01-02 10:00:00', 25, 0);
  `);

  const snapshot = createPilotRepository(database).getSnapshot({ start: '2018-01-01', end: '2018-01-02', category: 'books', sellerId: 'seller-1' }, '2018-01-02 23:59:59');

  expect(snapshot.kpis.itemGmv.value).toBe(100);
  expect(snapshot.kpis.validOrderCount.value).toBe(1);
  expect(snapshot.kpis.cancellationRate.value).toBe(1 / 2);
  expect(snapshot.fulfillmentFunnel).toEqual([
    { stage: 'purchased', value: 2 },
    { stage: 'approved', value: 2 },
    { stage: 'carrier', value: 1 },
    { stage: 'delivered', value: 1 },
  ]);
  expect(snapshot.categoryRanking).toEqual([{ category: 'books', itemGmv: 100 }]);
  expect(snapshot.sellerRanking).toEqual([{ sellerId: 'seller-1', itemGmv: 100 }]);
  expect(snapshot.recentOrders.map((order) => [order.orderId, order.itemGmv, order.itemCount])).toEqual([
    ['canceled', 25, 1],
    ['multi', 100, 1],
  ]);
});

test('changes only the review KPI when an order has two reviews', () => {
  // Folding reviews into an order-item aggregate must fail this test.
  const database = new DatabaseSync(':memory:');
  databases.push(database);
  createPilotSchema(database);
  database.exec(`
    INSERT INTO customers VALUES ('customer', 'unique', '01000', 'sao paulo', 'SP');
    INSERT INTO sellers VALUES ('seller-1', '30000', 'belo horizonte', 'MG');
    INSERT INTO products VALUES ('book', 'books', NULL, NULL, NULL, NULL, NULL, NULL, NULL);
    INSERT INTO orders VALUES ('order', 'customer', 'delivered', '2018-01-01 10:00:00', '2018-01-01 11:00:00', '2018-01-01 12:00:00', '2018-01-02 10:00:00', '2018-01-03 10:00:00');
    INSERT INTO order_items VALUES ('order', 1, 'book', 'seller-1', '2018-01-01 10:00:00', 100, 0);
    INSERT INTO reviews VALUES ('first', 'order', 5, NULL, NULL, '2018-01-02 10:00:00', '2018-01-02 11:00:00');
  `);
  const repository = createPilotRepository(database);
  const before = repository.getSnapshot({ start: '2018-01-01', end: '2018-01-01' }, '2018-01-01 23:59:59');
  database.exec("INSERT INTO reviews VALUES ('second', 'order', 1, NULL, NULL, '2018-01-02 12:00:00', '2018-01-02 13:00:00')");
  const after = repository.getSnapshot({ start: '2018-01-01', end: '2018-01-01' }, '2018-01-01 23:59:59');

  expect(before.kpis.averageReviewScore.value).toBe(5);
  expect(after.kpis.averageReviewScore.value).toBe(3);
  expect(after.kpis.itemGmv.value).toBe(before.kpis.itemGmv.value);
  expect(after.kpis.validOrderCount.value).toBe(before.kpis.validOrderCount.value);
  expect(after.fulfillmentFunnel).toEqual(before.fulfillmentFunnel);
});

test('keeps imported Olist timestamp columns distinct at a replay boundary', async () => {
  // Swapping an imported order timestamp column must fail this test.
  const tempDir = await mkdtemp(join(tmpdir(), 'olist-repository-'));
  const sourceDir = join(tempDir, 'source');
  const dataDir = join(tempDir, 'data');
  try {
    await cp(join(process.cwd(), 'tests', 'fixtures', 'olist'), sourceDir, { recursive: true });
    await writeFile(join(sourceDir, 'olist_orders_dataset.csv'), `order_id,customer_id,order_status,order_purchase_timestamp,order_approved_at,order_delivered_carrier_date,order_delivered_customer_date,order_estimated_delivery_date
o1,c1,delivered,2017-01-01 23:59:55,2017-01-01 23:59:56,2017-01-01 23:59:57,2017-01-01 23:59:58,2017-01-01 23:59:59
o2,c2,delivered,2017-02-01 10:00:00,2017-02-01 11:00:00,2017-02-02 09:00:00,2017-02-10 12:00:00,2017-02-08 12:00:00
o3,c1,canceled,2017-03-01 10:00:00,2017-03-01 10:20:00,,,
o4,c2,unavailable,2017-04-01 10:00:00,2017-04-01 10:20:00,,,
o5,c1,shipped,2017-05-01 10:00:00,2017-05-01 10:20:00,2017-05-02 09:00:00,,2017-05-08 12:00:00
o6,c2,processing,2017-06-01 10:00:00,2017-06-01 10:20:00,,,2017-06-08 12:00:00
o7,c1,delivered,2017-07-01 10:00:00,2017-07-01 10:20:00,2017-07-02 09:00:00,2017-07-05 12:00:00,2017-07-06 12:00:00
o8,c2,delivered,2017-08-01 10:00:00,2017-08-01 10:20:00,2017-08-02 09:00:00,2017-08-04 12:00:00,2017-08-06 12:00:00
`);
    await importOlistDataset({ sourceDir, dataDir, now: new Date('2026-08-09T00:00:00.000Z') });
    const database = openPilotDatabase(resolveOlistPaths(dataDir).databasePath);
    const row = database.prepare("SELECT purchase_at, approved_at, carrier_at, delivered_at, estimated_delivery_at FROM orders WHERE order_id = 'o1'").get() as Record<string, string>;
    const snapshot = createPilotRepository(database).getSnapshot({ start: '2017-01-01', end: '2017-01-01' }, '2017-01-01 23:59:59');

    expect(row).toEqual({ purchase_at: '2017-01-01 23:59:55', approved_at: '2017-01-01 23:59:56', carrier_at: '2017-01-01 23:59:57', delivered_at: '2017-01-01 23:59:58', estimated_delivery_at: '2017-01-01 23:59:59' });
    expect(snapshot.recentOrders).toEqual([{ orderId: 'o1', purchasedAt: '2017-01-01 23:59:55', status: 'delivered', itemGmv: 30.75, itemCount: 2, customerState: 'SP' }]);
    expect(snapshot.fulfillmentFunnel).toEqual([
      { stage: 'purchased', value: 1 },
      { stage: 'approved', value: 1 },
      { stage: 'carrier', value: 1 },
      { stage: 'delivered', value: 1 },
    ]);
    expect(snapshot.kpis.onTimeDeliveryRate.value).toBe(1);
    expect(snapshot.kpis.averageDeliveryDays.value).toBeCloseTo(3 / 86_400, 8);
    database.close();
  } finally {
    // DatabaseSync closes with sqlite3_close_v2; Windows releases its file handle after this worker exits.
  }
});
