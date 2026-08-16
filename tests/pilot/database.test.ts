import { DatabaseSync } from 'node:sqlite';
import { expect, test } from 'vitest';
import { createPilotIndexes, createPilotSchema } from '../../server/pilot/database';

test('creates the indexes used by filtered orders, payments and review snapshots', () => {
  const database = new DatabaseSync(':memory:');
  try {
    createPilotSchema(database);
    createPilotIndexes(database);

    const names = database.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as Array<{ name: string }>;

    expect(names.map(({ name }) => name)).toEqual(expect.arrayContaining([
      'idx_orders_purchase_at',
      'idx_order_items_order_id',
      'idx_order_items_product_id',
      'idx_payments_order_id',
      'idx_reviews_order_created_at',
    ]));
  } finally {
    database.close();
  }
});
