import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parse } from 'csv-parse/sync';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { ImportOptions, OlistManifest } from './contracts';
import { createPilotSchema, openPilotDatabase } from './database';
import { resolveOlistPaths } from './paths';
import { verifyOlistDatabase } from './verifier';

const files = {
  orders: 'olist_orders_dataset.csv',
  orderItems: 'olist_order_items_dataset.csv',
  reviews: 'olist_order_reviews_dataset.csv',
  products: 'olist_products_dataset.csv',
  customers: 'olist_customers_dataset.csv',
  sellers: 'olist_sellers_dataset.csv',
  categoryTranslations: 'product_category_name_translation.csv',
  payments: 'olist_order_payments_dataset.csv',
  geolocations: 'olist_geolocation_dataset.csv',
} as const;

type Row = Record<string, string>;

function timestamp(value: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) throw new Error(`无效的源时间戳: ${value}`);
  return value;
}

function numberOrNull(value: string) {
  return value ? Number(value) : null;
}

function insert(database: DatabaseSync, sql: string, values: SQLInputValue[]) {
  database.prepare(sql).run(...values);
}

export async function importOlistDataset({ sourceDir, dataDir, now = new Date() }: ImportOptions): Promise<OlistManifest> {
  const parsed = {} as Record<keyof typeof files, Row[]>;
  const hashes: Record<string, { sha256: string }> = {};
  for (const [name, filename] of Object.entries(files) as [keyof typeof files, string][]) {
    const contents = await readFile(join(sourceDir, filename));
    parsed[name] = parse(contents, { columns: true, skip_empty_lines: true, trim: false }) as Row[];
    hashes[filename] = { sha256: createHash('sha256').update(contents).digest('hex') };
  }

  const products = new Set(parsed.products.map((row) => row.product_id));
  if (parsed.orderItems.some((row) => !products.has(row.product_id))) throw new Error('订单明细引用不存在的商品');

  const paths = resolveOlistPaths(dataDir);
  await mkdir(paths.dataDir, { recursive: true });
  const temporaryDatabasePath = join(paths.dataDir, `${basename(paths.databasePath)}.tmp-${process.pid}-${Date.now()}`);
  const temporaryManifestPath = `${paths.manifestPath}.tmp-${process.pid}-${Date.now()}`;
  const database = openPilotDatabase(temporaryDatabasePath);
  try {
    createPilotSchema(database);
    database.exec('BEGIN');
    for (const row of parsed.customers) insert(database, 'INSERT INTO customers VALUES (?, ?, ?, ?, ?)', [row.customer_id, row.customer_unique_id, row.customer_zip_code_prefix, row.customer_city, row.customer_state]);
    for (const row of parsed.sellers) insert(database, 'INSERT INTO sellers VALUES (?, ?, ?, ?)', [row.seller_id, row.seller_zip_code_prefix, row.seller_city, row.seller_state]);
    for (const row of parsed.categoryTranslations) insert(database, 'INSERT INTO category_translations VALUES (?, ?)', [row.product_category_name, row.product_category_name_english]);
    for (const row of parsed.products) insert(database, 'INSERT INTO products VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [row.product_id, row.product_category_name || null, numberOrNull(row.product_name_lenght), numberOrNull(row.product_description_lenght), numberOrNull(row.product_photos_qty), numberOrNull(row.product_weight_g), numberOrNull(row.product_length_cm), numberOrNull(row.product_height_cm), numberOrNull(row.product_width_cm)]);
    for (const row of parsed.orders) insert(database, 'INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [row.order_id, row.customer_id, row.order_status, timestamp(row.order_purchase_timestamp), timestamp(row.order_approved_at), timestamp(row.order_delivered_carrier_date), timestamp(row.order_delivered_customer_date), timestamp(row.order_estimated_delivery_date)]);
    for (const row of parsed.orderItems) insert(database, 'INSERT INTO order_items VALUES (?, ?, ?, ?, ?, ?, ?)', [row.order_id, Number(row.order_item_id), row.product_id, row.seller_id, timestamp(row.shipping_limit_date), Number(row.price), Number(row.freight_value)]);
    for (const row of parsed.payments) insert(database, 'INSERT INTO payments VALUES (?, ?, ?, ?, ?)', [row.order_id, Number(row.payment_sequential), row.payment_type, Number(row.payment_installments), Number(row.payment_value)]);
    for (const row of parsed.geolocations) insert(database, 'INSERT INTO geolocations VALUES (?, ?, ?, ?, ?)', [row.geolocation_zip_code_prefix, Number(row.geolocation_lat), Number(row.geolocation_lng), row.geolocation_city, row.geolocation_state]);
    for (const row of parsed.reviews) insert(database, 'INSERT INTO reviews VALUES (?, ?, ?, ?, ?, ?, ?)', [row.review_id, row.order_id, Number(row.review_score), row.review_comment_title || null, row.review_comment_message || null, timestamp(row.review_creation_date), timestamp(row.review_answer_timestamp)]);
    const importedAt = now.toISOString();
    insert(database, 'INSERT INTO replay_state VALUES (1, ?)', [importedAt]);
    database.exec('COMMIT');
    const verification = verifyOlistDatabase(temporaryDatabasePath);
    if (!verification.valid) throw new Error('导入后的数据未通过独立对账');
    const manifest: OlistManifest = {
      ready: true,
      importedAt,
      importerVersion: 1,
      source: { dataset: 'olistbr/brazilian-ecommerce', url: 'https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce', license: 'CC BY-NC-SA 4.0' },
      files: hashes,
      tables: Object.fromEntries(Object.entries(files).map(([name, filename]) => [name, { sourceRows: parsed[name as keyof typeof files].length, importedRows: verification.tableRows[name] }])),
      range: { start: verification.range.start.slice(0, 10), end: verification.range.end.slice(0, 10) },
    };
    await writeFile(temporaryManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    database.close();
    await rename(temporaryDatabasePath, paths.databasePath);
    await rename(temporaryManifestPath, paths.manifestPath);
    return manifest;
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch { /* no active transaction */ }
    database.close();
    await rm(temporaryDatabasePath, { force: true });
    await rm(temporaryManifestPath, { force: true });
    throw error;
  }
}
