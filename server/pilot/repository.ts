import { DatabaseSync } from 'node:sqlite';
import type { PilotCapability, PilotFilterOptions, PilotFilters, PilotKpi, PilotSnapshot } from './contracts';

type QueryParameters = {
  start: string;
  end: string;
  category: string | null;
  sellerId: string | null;
  customerState: string | null;
};

type MetricRow = {
  itemGmv: number | null;
  validOrderCount: number | null;
  cancellationRate: number | null;
  onTimeDeliveryRate: number | null;
  averageDeliveryDays: number | null;
  averageReviewScore: number | null;
};

export type PilotRepository = {
  getFilterOptions(): PilotFilterOptions;
  getSnapshot(filters: PilotFilters, replayNow: Date | string): PilotSnapshot;
};

const filteredOrdersCte = `
  WITH filtered_orders AS (
    SELECT
      orders.order_id,
      orders.order_status,
      orders.purchase_at,
      orders.approved_at,
      orders.carrier_at,
      orders.delivered_at,
      orders.estimated_delivery_at,
      customers.state AS customer_state,
      SUM(order_items.price) AS item_gmv,
      COUNT(*) AS item_count
    FROM orders
    JOIN customers ON customers.customer_id = orders.customer_id
    JOIN order_items ON order_items.order_id = orders.order_id
    JOIN products ON products.product_id = order_items.product_id
    WHERE orders.purchase_at >= :start
      AND orders.purchase_at <= :end
      AND (:category IS NULL OR products.category_name = :category)
      AND (:sellerId IS NULL OR order_items.seller_id = :sellerId)
      AND (:customerState IS NULL OR customers.state = :customerState)
    GROUP BY orders.order_id
  )
`;

const capabilities: PilotCapability[] = [
  { key: 'itemGmv', status: 'available' },
  { key: 'grossMarginRate', status: 'unavailable', reason: 'Olist 原始数据不包含成本或毛利事实。' },
];

function toNumber(value: number | null | undefined) {
  return value ?? 0;
}

function asKpi(value: number, comparisonValue: number): PilotKpi {
  return {
    value,
    comparisonValue,
    changeRate: comparisonValue === 0 ? 0 : (value - comparisonValue) / comparisonValue,
  };
}

function formatLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function sourceLocalTime(replayNow: Date | string) {
  return typeof replayNow === 'string' ? replayNow : formatLocal(replayNow);
}

function dateOnly(value: string) {
  return value.slice(0, 10);
}

function calendarDate(value: string) {
  const [year, month, day] = dateOnly(value).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function comparisonRange(start: string, end: string) {
  const startDate = calendarDate(start);
  const endDate = calendarDate(end);
  const dayCount = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  const comparisonEnd = new Date(startDate);
  comparisonEnd.setDate(comparisonEnd.getDate() - 1);
  const comparisonStart = new Date(comparisonEnd);
  comparisonStart.setDate(comparisonStart.getDate() - dayCount + 1);
  return { start: formatDate(comparisonStart), end: formatDate(comparisonEnd) };
}

function endAtReplayTime(filters: PilotFilters, replayNow: Date | string) {
  const requestedEnd = `${dateOnly(filters.end)} 23:59:59`;
  const sourceLocalNow = sourceLocalTime(replayNow);
  return requestedEnd < sourceLocalNow ? requestedEnd : sourceLocalNow;
}

function parameters(filters: PilotFilters, start: string, end: string): QueryParameters {
  return {
    start: `${dateOnly(start)} 00:00:00`,
    end,
    category: filters.category ?? null,
    sellerId: filters.sellerId ?? null,
    customerState: filters.customerState ?? null,
  };
}

function rankItemPrices(database: DatabaseSync, field: 'category' | 'sellerId', parameters: QueryParameters) {
  const selection = field === 'category'
    ? 'products.category_name AS key'
    : 'order_items.seller_id AS key';
  const rows = database.prepare(`${filteredOrdersCte}
    SELECT ${selection}, SUM(order_items.price) AS itemGmv
    FROM filtered_orders
    JOIN order_items ON order_items.order_id = filtered_orders.order_id
    JOIN products ON products.product_id = order_items.product_id
    WHERE filtered_orders.order_status = 'delivered'
      AND (:category IS NULL OR products.category_name = :category)
      AND (:sellerId IS NULL OR order_items.seller_id = :sellerId)
    GROUP BY key
    ORDER BY itemGmv DESC, key ASC
  `).all(parameters) as Array<{ key: string | null; itemGmv: number }>;
  return rows.filter((row) => row.key !== null).map((row) => ({ key: row.key as string, itemGmv: row.itemGmv }));
}

function snapshotMetrics(database: DatabaseSync, parameters: QueryParameters): MetricRow {
  return database.prepare(`${filteredOrdersCte}
    SELECT
      COALESCE(SUM(CASE WHEN order_status = 'delivered' THEN item_gmv ELSE 0 END), 0) AS itemGmv,
      COALESCE(SUM(CASE WHEN order_status = 'delivered' THEN 1 ELSE 0 END), 0) AS validOrderCount,
      COALESCE(SUM(CASE WHEN order_status = 'canceled' THEN 1.0 ELSE 0 END) / NULLIF(SUM(CASE WHEN order_status != 'unavailable' THEN 1 ELSE 0 END), 0), 0) AS cancellationRate,
      COALESCE(SUM(CASE WHEN order_status = 'delivered' AND estimated_delivery_at IS NOT NULL AND delivered_at <= estimated_delivery_at THEN 1.0 ELSE 0 END) / NULLIF(SUM(CASE WHEN order_status = 'delivered' AND estimated_delivery_at IS NOT NULL THEN 1 ELSE 0 END), 0), 0) AS onTimeDeliveryRate,
      COALESCE(AVG(CASE WHEN order_status = 'delivered' AND delivered_at IS NOT NULL THEN julianday(delivered_at) - julianday(purchase_at) END), 0) AS averageDeliveryDays,
      COALESCE((SELECT AVG(reviews.review_score) FROM reviews JOIN filtered_orders AS reviewed_orders ON reviewed_orders.order_id = reviews.order_id), 0) AS averageReviewScore
    FROM filtered_orders
  `).get(parameters) as MetricRow;
}

export function createPilotRepository(database: DatabaseSync): PilotRepository {
  return {
    getFilterOptions() {
      return {
        categories: (database.prepare('SELECT category_name FROM products WHERE category_name IS NOT NULL ORDER BY category_name').all() as Array<{ category_name: string }>).map((row) => row.category_name),
        sellerIds: (database.prepare('SELECT seller_id FROM sellers ORDER BY seller_id').all() as Array<{ seller_id: string }>).map((row) => row.seller_id),
        customerStates: (database.prepare('SELECT DISTINCT state FROM customers ORDER BY state').all() as Array<{ state: string }>).map((row) => row.state),
      };
    },

    getSnapshot(filters, replayNow) {
      const sourceLocalNow = sourceLocalTime(replayNow);
      const effectiveEnd = endAtReplayTime(filters, replayNow);
      const currentParameters = parameters(filters, filters.start, effectiveEnd);
      const comparison = comparisonRange(filters.start, dateOnly(effectiveEnd));
      const comparisonParameters = parameters(filters, comparison.start, `${comparison.end} 23:59:59`);
      const current = snapshotMetrics(database, currentParameters);
      const previous = snapshotMetrics(database, comparisonParameters);
      const itemGmv = toNumber(current.itemGmv);
      const validOrderCount = toNumber(current.validOrderCount);
      const comparisonItemGmv = toNumber(previous.itemGmv);
      const comparisonValidOrderCount = toNumber(previous.validOrderCount);

      const dailyTrend = database.prepare(`${filteredOrdersCte}
        SELECT
          date(purchase_at) AS date,
          COALESCE(SUM(CASE WHEN order_status = 'delivered' THEN item_gmv ELSE 0 END), 0) AS itemGmv,
          COALESCE(SUM(CASE WHEN order_status = 'delivered' THEN 1 ELSE 0 END), 0) AS validOrderCount
        FROM filtered_orders
        GROUP BY date(purchase_at)
        ORDER BY date ASC
      `).all(currentParameters) as PilotSnapshot['dailyTrend'];

      const funnel = database.prepare(`${filteredOrdersCte}
        SELECT
          COUNT(*) AS purchased,
          SUM(CASE WHEN approved_at IS NOT NULL THEN 1 ELSE 0 END) AS approved,
          SUM(CASE WHEN carrier_at IS NOT NULL THEN 1 ELSE 0 END) AS carrier,
          SUM(CASE WHEN delivered_at IS NOT NULL THEN 1 ELSE 0 END) AS delivered
        FROM filtered_orders
      `).get(currentParameters) as { purchased: number; approved: number | null; carrier: number | null; delivered: number | null };

      const customerStateRanking = database.prepare(`${filteredOrdersCte}
        SELECT customer_state AS customerState, SUM(item_gmv) AS itemGmv
        FROM filtered_orders
        WHERE order_status = 'delivered'
        GROUP BY customer_state
        ORDER BY itemGmv DESC, customerState ASC
      `).all(currentParameters) as PilotSnapshot['customerStateRanking'];

      const recentOrders = database.prepare(`${filteredOrdersCte}
        SELECT
          order_id AS orderId,
          purchase_at AS purchasedAt,
          order_status AS status,
          item_gmv AS itemGmv,
          item_count AS itemCount,
          customer_state AS customerState
        FROM filtered_orders
        ORDER BY purchase_at DESC, order_id DESC
        LIMIT 20
      `).all(currentParameters) as PilotSnapshot['recentOrders'];

      const categoryRanking = rankItemPrices(database, 'category', currentParameters).map((row) => ({ category: row.key, itemGmv: row.itemGmv }));
      const sellerRanking = rankItemPrices(database, 'sellerId', currentParameters).map((row) => ({ sellerId: row.key, itemGmv: row.itemGmv }));

      return {
        filters,
        sourceLocalNow,
        comparisonLabel: `${comparison.start} to ${comparison.end}`,
        kpis: {
          itemGmv: asKpi(itemGmv, comparisonItemGmv),
          validOrderCount: asKpi(validOrderCount, comparisonValidOrderCount),
          averageOrderValue: asKpi(validOrderCount === 0 ? 0 : itemGmv / validOrderCount, comparisonValidOrderCount === 0 ? 0 : comparisonItemGmv / comparisonValidOrderCount),
          cancellationRate: asKpi(toNumber(current.cancellationRate), toNumber(previous.cancellationRate)),
          onTimeDeliveryRate: asKpi(toNumber(current.onTimeDeliveryRate), toNumber(previous.onTimeDeliveryRate)),
          averageDeliveryDays: asKpi(toNumber(current.averageDeliveryDays), toNumber(previous.averageDeliveryDays)),
          averageReviewScore: asKpi(toNumber(current.averageReviewScore), toNumber(previous.averageReviewScore)),
        },
        dailyTrend,
        fulfillmentFunnel: [
          { stage: 'purchased', value: toNumber(funnel.purchased) },
          { stage: 'approved', value: toNumber(funnel.approved) },
          { stage: 'carrier', value: toNumber(funnel.carrier) },
          { stage: 'delivered', value: toNumber(funnel.delivered) },
        ],
        categoryRanking,
        sellerRanking,
        customerStateRanking,
        recentOrders,
        capabilities,
      };
    },
  };
}
