import type { DatabaseSync } from 'node:sqlite';
import type { OlistVerification, VerifyOptions } from './contracts';
import { openPilotDatabase } from './database';
import { resolveOlistPaths } from './paths';

const tables = { orders: 'orders', orderItems: 'order_items', reviews: 'reviews', products: 'products', customers: 'customers', sellers: 'sellers', categoryTranslations: 'category_translations' } as const;

function value(database: DatabaseSync, sql: string): number {
  return Number((database.prepare(sql).get() as { value: number }).value);
}

export function verifyOlistDatabase(databasePath: string): OlistVerification {
  const database = openPilotDatabase(databasePath);
  try {
    const tableRows = Object.fromEntries(Object.entries(tables).map(([name, table]) => [name, value(database, `SELECT COUNT(*) AS value FROM ${table}`)]));
    const duplicatePrimaryKeys = value(database, `
      SELECT COUNT(*) AS value FROM (
        SELECT order_id FROM orders GROUP BY order_id HAVING COUNT(*) > 1
        UNION ALL SELECT customer_id FROM customers GROUP BY customer_id HAVING COUNT(*) > 1
        UNION ALL SELECT seller_id FROM sellers GROUP BY seller_id HAVING COUNT(*) > 1
        UNION ALL SELECT product_id FROM products GROUP BY product_id HAVING COUNT(*) > 1
        UNION ALL SELECT review_id FROM reviews GROUP BY review_id HAVING COUNT(*) > 1
        UNION ALL SELECT order_id || ':' || order_item_id FROM order_items GROUP BY order_id, order_item_id HAVING COUNT(*) > 1
      )
    `);
    const orphanReferences = value(database, `
      SELECT COUNT(*) AS value FROM (
        SELECT items.order_id FROM order_items items LEFT JOIN orders ON orders.order_id = items.order_id WHERE orders.order_id IS NULL
        UNION ALL SELECT items.product_id FROM order_items items LEFT JOIN products ON products.product_id = items.product_id WHERE products.product_id IS NULL
        UNION ALL SELECT items.seller_id FROM order_items items LEFT JOIN sellers ON sellers.seller_id = items.seller_id WHERE sellers.seller_id IS NULL
        UNION ALL SELECT reviews.order_id FROM reviews LEFT JOIN orders ON orders.order_id = reviews.order_id WHERE orders.order_id IS NULL
        UNION ALL SELECT orders.customer_id FROM orders LEFT JOIN customers ON customers.customer_id = orders.customer_id WHERE customers.customer_id IS NULL
      )
    `);
    const range = database.prepare('SELECT MIN(purchase_at) AS start, MAX(purchase_at) AS end FROM orders').get() as { start: string; end: string };
    const itemGmv = value(database, "SELECT COALESCE(SUM(items.price), 0) AS value FROM order_items items JOIN orders ON orders.order_id = items.order_id WHERE orders.order_status NOT IN ('canceled', 'unavailable')");
    return { valid: duplicatePrimaryKeys === 0 && orphanReferences === 0, tableRows, itemGmv, duplicatePrimaryKeys, orphanReferences, range };
  } finally {
    database.close();
  }
}

export function verifyOlistDataset({ dataDir }: VerifyOptions): OlistVerification {
  return verifyOlistDatabase(resolveOlistPaths(dataDir).databasePath);
}
