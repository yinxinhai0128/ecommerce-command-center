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
    CREATE TABLE payments (order_id TEXT NOT NULL REFERENCES orders(order_id), payment_sequential INTEGER NOT NULL, payment_type TEXT NOT NULL, payment_installments INTEGER NOT NULL, payment_value REAL NOT NULL, PRIMARY KEY (order_id, payment_sequential));
    CREATE TABLE geolocations (zip_code_prefix TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL, city TEXT NOT NULL, state TEXT NOT NULL);
    CREATE TABLE reviews (review_id TEXT NOT NULL, order_id TEXT NOT NULL REFERENCES orders(order_id), review_score INTEGER NOT NULL, review_comment_title TEXT, review_comment_message TEXT, review_creation_at TEXT NOT NULL, review_answer_at TEXT NOT NULL, PRIMARY KEY (review_id, order_id));
    CREATE TABLE replay_state (id INTEGER PRIMARY KEY CHECK (id = 1), imported_at TEXT NOT NULL);
  `);
  createPilotIndexes(database);
}

export function createPilotIndexes(database: DatabaseSync) {
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_purchase_at ON orders(purchase_at);
    CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_seller_id ON order_items(seller_id);
    CREATE INDEX IF NOT EXISTS idx_products_category_name ON products(category_name);
    CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_order_created_at ON reviews(order_id, review_creation_at);
    CREATE INDEX IF NOT EXISTS idx_customers_state ON customers(state);
  `);
}
