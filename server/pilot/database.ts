import { DatabaseSync } from 'node:sqlite';

export function openPilotDatabase(path: string): DatabaseSync {
  const database = new DatabaseSync(path);
  database.exec('PRAGMA foreign_keys = ON');
  return database;
}

export function createPilotSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE orders (order_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(customer_id), order_status TEXT NOT NULL, purchase_at TEXT NOT NULL, approved_at TEXT, carrier_at TEXT, delivered_at TEXT, estimated_delivery_at TEXT);
    CREATE TABLE customers (customer_id TEXT PRIMARY KEY, customer_unique_id TEXT NOT NULL, zip_code_prefix TEXT NOT NULL, city TEXT NOT NULL, state TEXT NOT NULL);
    CREATE TABLE sellers (seller_id TEXT PRIMARY KEY, zip_code_prefix TEXT NOT NULL, city TEXT NOT NULL, state TEXT NOT NULL);
    CREATE TABLE category_translations (category_name TEXT PRIMARY KEY, category_name_english TEXT NOT NULL);
    CREATE TABLE products (product_id TEXT PRIMARY KEY, category_name TEXT, name_length INTEGER, description_length INTEGER, photos_qty INTEGER, weight_g INTEGER, length_cm INTEGER, height_cm INTEGER, width_cm INTEGER);
    CREATE TABLE order_items (order_id TEXT NOT NULL REFERENCES orders(order_id), order_item_id INTEGER NOT NULL, product_id TEXT NOT NULL REFERENCES products(product_id), seller_id TEXT NOT NULL REFERENCES sellers(seller_id), shipping_limit_at TEXT NOT NULL, price REAL NOT NULL, freight_value REAL NOT NULL, PRIMARY KEY (order_id, order_item_id));
    CREATE TABLE reviews (review_id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(order_id), review_score INTEGER NOT NULL, review_comment_title TEXT, review_comment_message TEXT, review_creation_at TEXT NOT NULL, review_answer_at TEXT NOT NULL);
    CREATE TABLE replay_state (id INTEGER PRIMARY KEY CHECK (id = 1), imported_at TEXT NOT NULL);
  `);
}
