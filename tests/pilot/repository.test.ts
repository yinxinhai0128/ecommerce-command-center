import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, test } from 'vitest';
import { createPilotSchema } from '../../server/pilot/database';
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
