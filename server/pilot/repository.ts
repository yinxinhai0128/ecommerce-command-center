import { DatabaseSync } from 'node:sqlite';
import type { PilotCapability, PilotFilterOptions, PilotFilters, PilotKpi, PilotSnapshot } from './contracts';
import { supportedContributionDimensions } from './metricDefinitions';

type QueryParameters = {
  start: string;
  end: string;
  replayNow: string;
  category: string | null;
  sellerId: string | null;
  customerState: string | null;
};

type ContributionParameters = Pick<QueryParameters, 'category' | 'sellerId'>;

type SummaryRow = {
  itemGmv: number | null;
  validOrderCount: number | null;
  cancellationRate: number | null;
  onTimeDeliveryRate: number | null;
  averageDeliveryDays: number | null;
  averageReviewScore: number | null;
  paymentAmount: number | null;
  uniqueBuyerCount: number | null;
  repeatBuyerCount: number | null;
};

type Contributions = NonNullable<PilotSnapshot['contributions']>;
type FulfillmentMetrics = Omit<NonNullable<PilotSnapshot['fulfillment']>, 'statusDistribution'>;
type ExperienceMetrics = Omit<NonNullable<PilotSnapshot['experience']>, 'scoreDistribution'>;

export type PilotRepository = {
  getFilterOptions(): PilotFilterOptions;
  getSnapshot(filters: PilotFilters, replayNow: Date | string): PilotSnapshot;
};

const filteredOrdersCte = `
  WITH matching_items AS (
    SELECT order_items.order_id, SUM(order_items.price) AS item_gmv, COUNT(*) AS item_count
    FROM order_items
    JOIN products ON products.product_id = order_items.product_id
    WHERE (:category IS NULL OR products.category_name = :category)
      AND (:sellerId IS NULL OR order_items.seller_id = :sellerId)
    GROUP BY order_items.order_id
  ),
  all_order_items AS (
    SELECT order_id, SUM(price) AS item_gmv
    FROM order_items
    GROUP BY order_id
  ),
  order_payments AS (
    SELECT order_id, SUM(payment_value) AS payment_amount
    FROM payments
    GROUP BY order_id
  ),
  filtered_orders AS (
    SELECT
      orders.order_id,
      orders.order_status,
      orders.purchase_at,
      orders.approved_at,
      orders.carrier_at,
      orders.delivered_at,
      orders.estimated_delivery_at,
      customers.customer_unique_id,
      customers.state AS customer_state,
      COALESCE(matching_items.item_gmv, 0) AS item_gmv,
      COALESCE(matching_items.item_count, 0) AS item_count,
      COALESCE(all_order_items.item_gmv, 0) AS all_order_item_gmv,
      COALESCE(order_payments.payment_amount, 0) AS payment_amount
    FROM orders
    JOIN customers ON customers.customer_id = orders.customer_id
    LEFT JOIN matching_items ON matching_items.order_id = orders.order_id
    LEFT JOIN all_order_items ON all_order_items.order_id = orders.order_id
    LEFT JOIN order_payments ON order_payments.order_id = orders.order_id
    WHERE orders.purchase_at >= :start
      AND orders.purchase_at <= :end
      AND (:customerState IS NULL OR customers.state = :customerState)
      AND ((:category IS NULL AND :sellerId IS NULL) OR matching_items.order_id IS NOT NULL)
  ),
  selected_orders AS (
    SELECT *,
      CASE WHEN order_status = 'delivered' AND delivered_at IS NOT NULL AND delivered_at <= :replayNow THEN 'delivered'
        WHEN carrier_at IS NOT NULL AND carrier_at <= :replayNow THEN 'carrier'
        WHEN approved_at IS NOT NULL AND approved_at <= :replayNow THEN 'approved'
        ELSE 'purchased'
      END AS known_status,
      CASE
        WHEN :category IS NULL AND :sellerId IS NULL THEN payment_amount
        WHEN all_order_item_gmv = 0 THEN 0
        ELSE payment_amount * item_gmv / all_order_item_gmv
      END AS selected_payment_amount
    FROM filtered_orders
    WHERE :replayNow IS NOT NULL
  )
`;

const capabilities: PilotCapability[] = [
  { key: 'itemGmv', status: 'available' },
  { key: 'grossMarginRate', status: 'unavailable', reason: 'Olist 原始数据不包含成本或毛利事实。' },
];

const toNumber = (value: number | null | undefined) => value ?? 0;

function asKpi(value: number, comparisonValue: number): PilotKpi {
  return { value, comparisonValue, changeRate: comparisonValue === 0 ? 0 : (value - comparisonValue) / comparisonValue };
}

function formatLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function sourceLocalTime(replayNow: Date | string) {
  return typeof replayNow === 'string' ? replayNow : formatLocal(replayNow);
}

const dateOnly = (value: string) => value.slice(0, 10);

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

function parameters(filters: PilotFilters, start: string, end: string, replayNow: string): QueryParameters {
  return {
    start: `${dateOnly(start)} 00:00:00`, end, replayNow,
    category: filters.category ?? null, sellerId: filters.sellerId ?? null, customerState: filters.customerState ?? null,
  };
}

const currentSelection = 'pilot_current_selection';
const comparisonSelection = 'pilot_comparison_selection';

function materializeSelection(database: DatabaseSync, table: typeof currentSelection | typeof comparisonSelection, queryParameters: QueryParameters) {
  database.exec(`DROP TABLE IF EXISTS ${table}`);
  database.prepare(`CREATE TEMP TABLE ${table} AS ${filteredOrdersCte}
    SELECT * FROM selected_orders`).run(queryParameters);
  database.exec(`CREATE INDEX idx_${table}_order_id ON ${table}(order_id);
    CREATE INDEX idx_${table}_status ON ${table}(known_status);`);
}

function removeSelections(database: DatabaseSync) {
  database.exec(`DROP TABLE IF EXISTS ${currentSelection}; DROP TABLE IF EXISTS ${comparisonSelection};`);
}

function summary(database: DatabaseSync, table: typeof currentSelection | typeof comparisonSelection, replayNow: string): SummaryRow {
  return database.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN known_status = 'delivered' THEN item_gmv ELSE 0 END), 0) AS itemGmv,
      COALESCE(SUM(CASE WHEN known_status = 'delivered' THEN 1 ELSE 0 END), 0) AS validOrderCount,
      COALESCE(SUM(CASE WHEN known_status = 'canceled' THEN 1.0 ELSE 0 END) / NULLIF(COUNT(*), 0), 0) AS cancellationRate,
      COALESCE(SUM(CASE WHEN known_status = 'delivered' AND estimated_delivery_at IS NOT NULL AND estimated_delivery_at <= :replayNow AND delivered_at <= estimated_delivery_at THEN 1.0 ELSE 0 END) / NULLIF(SUM(CASE WHEN known_status = 'delivered' AND estimated_delivery_at IS NOT NULL AND estimated_delivery_at <= :replayNow THEN 1 ELSE 0 END), 0), 0) AS onTimeDeliveryRate,
      COALESCE(AVG(CASE WHEN known_status = 'delivered' THEN julianday(delivered_at) - julianday(purchase_at) END), 0) AS averageDeliveryDays,
      COALESCE((SELECT AVG(reviews.review_score) FROM reviews JOIN ${table} current_orders ON current_orders.order_id = reviews.order_id WHERE reviews.review_creation_at <= :replayNow), 0) AS averageReviewScore,
      COALESCE(SUM(selected_payment_amount), 0) AS paymentAmount,
      COUNT(DISTINCT customer_unique_id) AS uniqueBuyerCount,
      COALESCE((SELECT COUNT(*) FROM (SELECT customer_unique_id FROM ${table} WHERE purchase_at <= :replayNow GROUP BY customer_unique_id HAVING COUNT(*) >= 2)), 0) AS repeatBuyerCount
    FROM ${table}
  `).get({ replayNow }) as SummaryRow;
}

function contributionRows(database: DatabaseSync, table: typeof currentSelection, queryParameters: ContributionParameters): Contributions {
  const categories = database.prepare(`
    SELECT products.category_name AS category, COALESCE(category_translations.category_name_english, products.category_name) AS label,
      SUM(order_items.price) AS itemGmv, COUNT(*) AS itemCount
    FROM ${table} selected_orders
    JOIN order_items ON order_items.order_id = selected_orders.order_id
    JOIN products ON products.product_id = order_items.product_id
    LEFT JOIN category_translations ON category_translations.category_name = products.category_name
    WHERE selected_orders.known_status = 'delivered'
      AND (:category IS NULL OR products.category_name = :category)
      AND (:sellerId IS NULL OR order_items.seller_id = :sellerId)
      AND products.category_name IS NOT NULL
    GROUP BY products.category_name, label
    ORDER BY itemGmv DESC, category ASC
  `).all(queryParameters) as Contributions['categories'];
  const sellers = database.prepare(`
    SELECT order_items.seller_id AS sellerId, SUM(order_items.price) AS itemGmv, COUNT(DISTINCT selected_orders.order_id) AS validOrderCount
    FROM ${table} selected_orders
    JOIN order_items ON order_items.order_id = selected_orders.order_id
    JOIN products ON products.product_id = order_items.product_id
    WHERE selected_orders.known_status = 'delivered'
      AND (:category IS NULL OR products.category_name = :category)
      AND (:sellerId IS NULL OR order_items.seller_id = :sellerId)
    GROUP BY order_items.seller_id
    ORDER BY itemGmv DESC, sellerId ASC
  `).all(queryParameters) as Contributions['sellers'];
  const customerStates = database.prepare(`
    SELECT customer_state AS customerState, SUM(item_gmv) AS itemGmv, COUNT(*) AS validOrderCount
    FROM ${table} selected_orders
    WHERE known_status = 'delivered'
    GROUP BY customer_state
    ORDER BY itemGmv DESC, customerState ASC
  `).all() as Contributions['customerStates'];
  return { categories, sellers, customerStates };
}

export function createPilotRepository(database: DatabaseSync): PilotRepository {
  return {
    getFilterOptions() {
      return {
        categories: (database.prepare('SELECT DISTINCT category_name FROM products WHERE category_name IS NOT NULL ORDER BY category_name').all() as Array<{ category_name: string }>).map((row) => row.category_name),
        sellerIds: (database.prepare('SELECT seller_id FROM sellers ORDER BY seller_id').all() as Array<{ seller_id: string }>).map((row) => row.seller_id),
        customerStates: (database.prepare('SELECT DISTINCT state FROM customers ORDER BY state').all() as Array<{ state: string }>).map((row) => row.state),
      };
    },

    getSnapshot(filters, replayNow) {
      const sourceLocalNow = sourceLocalTime(replayNow);
      const effectiveEnd = endAtReplayTime(filters, replayNow);
      const currentParameters = parameters(filters, filters.start, effectiveEnd, sourceLocalNow);
      const comparison = comparisonRange(filters.start, dateOnly(effectiveEnd));
      const comparisonParameters = parameters(filters, comparison.start, `${comparison.end} 23:59:59`, sourceLocalNow);
      materializeSelection(database, currentSelection, currentParameters);
      materializeSelection(database, comparisonSelection, comparisonParameters);
      try {
        const current = summary(database, currentSelection, sourceLocalNow);
        const previous = summary(database, comparisonSelection, sourceLocalNow);
        const itemGmv = toNumber(current.itemGmv);
        const validOrderCount = toNumber(current.validOrderCount);
        const comparisonItemGmv = toNumber(previous.itemGmv);
        const comparisonValidOrderCount = toNumber(previous.validOrderCount);

        const dailyTrend = database.prepare(`
        SELECT date(purchase_at) AS date, COALESCE(SUM(CASE WHEN known_status = 'delivered' THEN item_gmv ELSE 0 END), 0) AS itemGmv,
          COALESCE(SUM(CASE WHEN known_status = 'delivered' THEN 1 ELSE 0 END), 0) AS validOrderCount
          FROM ${currentSelection} GROUP BY date(purchase_at) ORDER BY date ASC
        `).all() as PilotSnapshot['dailyTrend'];
        const funnel = database.prepare(`
        SELECT COUNT(*) AS purchased, SUM(CASE WHEN approved_at IS NOT NULL AND approved_at <= :replayNow THEN 1 ELSE 0 END) AS approved,
          SUM(CASE WHEN carrier_at IS NOT NULL AND carrier_at <= :replayNow THEN 1 ELSE 0 END) AS carrier, SUM(CASE WHEN known_status = 'delivered' THEN 1 ELSE 0 END) AS delivered
          FROM ${currentSelection}
        `).get({ replayNow: sourceLocalNow }) as { purchased: number; approved: number | null; carrier: number | null; delivered: number | null };
        const recentOrders = database.prepare(`
        SELECT order_id AS orderId, purchase_at AS purchasedAt, known_status AS status, item_gmv AS itemGmv, item_count AS itemCount, customer_state AS customerState
          FROM ${currentSelection} ORDER BY purchase_at DESC, order_id DESC LIMIT 20
        `).all() as PilotSnapshot['recentOrders'];
        const payments = {
          byType: database.prepare(`
          SELECT payments.payment_type AS paymentType, COALESCE(SUM(payments.payment_value * CASE WHEN :category IS NULL AND :sellerId IS NULL THEN 1 WHEN selected_orders.all_order_item_gmv = 0 THEN 0 ELSE selected_orders.item_gmv / selected_orders.all_order_item_gmv END), 0) AS paymentAmount
            FROM ${currentSelection} selected_orders JOIN payments ON payments.order_id = selected_orders.order_id
          GROUP BY payments.payment_type ORDER BY paymentAmount DESC, paymentType ASC
          `).all({ category: filters.category ?? null, sellerId: filters.sellerId ?? null }) as NonNullable<PilotSnapshot['payments']>['byType'],
          installments: database.prepare(`
          SELECT payments.payment_installments AS installments, COALESCE(SUM(payments.payment_value * CASE WHEN :category IS NULL AND :sellerId IS NULL THEN 1 WHEN selected_orders.all_order_item_gmv = 0 THEN 0 ELSE selected_orders.item_gmv / selected_orders.all_order_item_gmv END), 0) AS paymentAmount
            FROM ${currentSelection} selected_orders JOIN payments ON payments.order_id = selected_orders.order_id
          GROUP BY payments.payment_installments ORDER BY installments ASC
          `).all({ category: filters.category ?? null, sellerId: filters.sellerId ?? null }) as NonNullable<PilotSnapshot['payments']>['installments'],
        };
        const fulfillmentRow = database.prepare(`
        SELECT
          COALESCE(AVG(CASE WHEN order_status = 'delivered' AND delivered_at IS NOT NULL AND delivered_at <= :replayNow AND approved_at IS NOT NULL AND approved_at <= :replayNow THEN julianday(approved_at) - julianday(purchase_at) END), 0) AS averageApprovalDays,
          COALESCE(AVG(CASE WHEN order_status = 'delivered' AND delivered_at IS NOT NULL AND delivered_at <= :replayNow AND carrier_at IS NOT NULL AND carrier_at <= :replayNow THEN julianday(carrier_at) - julianday(purchase_at) END), 0) AS averageCarrierDays,
          COALESCE(AVG(CASE WHEN known_status = 'delivered' THEN julianday(delivered_at) - julianday(purchase_at) END), 0) AS averageDeliveryDays,
          COALESCE(SUM(CASE WHEN known_status = 'delivered' AND estimated_delivery_at IS NOT NULL AND estimated_delivery_at <= :replayNow AND delivered_at > estimated_delivery_at THEN 1.0 ELSE 0 END) / NULLIF(SUM(CASE WHEN known_status = 'delivered' AND estimated_delivery_at IS NOT NULL AND estimated_delivery_at <= :replayNow THEN 1 ELSE 0 END), 0), 0) AS lateDeliveryRate,
          COALESCE(AVG(CASE WHEN known_status = 'delivered' AND estimated_delivery_at IS NOT NULL AND estimated_delivery_at <= :replayNow AND delivered_at > estimated_delivery_at THEN julianday(delivered_at) - julianday(estimated_delivery_at) END), 0) AS averageLateDays
          FROM ${currentSelection}
        `).get({ replayNow: sourceLocalNow }) as unknown as FulfillmentMetrics;
        const fulfillment = {
          statusDistribution: database.prepare(`
            SELECT known_status AS status, COUNT(*) AS value FROM ${currentSelection} GROUP BY known_status ORDER BY status ASC
          `).all() as NonNullable<PilotSnapshot['fulfillment']>['statusDistribution'],
        ...fulfillmentRow,
      };
        const experience = {
          scoreDistribution: database.prepare(`
            SELECT reviews.review_score AS score, COUNT(*) AS value FROM reviews JOIN ${currentSelection} selected_orders ON selected_orders.order_id = reviews.order_id
            WHERE reviews.review_creation_at <= :replayNow GROUP BY reviews.review_score ORDER BY score ASC
          `).all({ replayNow: sourceLocalNow }) as NonNullable<PilotSnapshot['experience']>['scoreDistribution'],
          ...(database.prepare(`
          SELECT COALESCE(COUNT(DISTINCT CASE WHEN reviews.review_score IN (1, 2) THEN reviews.order_id END) * 1.0 / NULLIF(COUNT(DISTINCT reviews.order_id), 0), 0) AS lowScoreRate,
            COALESCE(AVG(CASE WHEN reviews.review_answer_at IS NOT NULL AND reviews.review_answer_at <= :replayNow THEN julianday(reviews.review_answer_at) - julianday(reviews.review_creation_at) END), 0) AS averageReplyDays
            FROM reviews JOIN ${currentSelection} selected_orders ON selected_orders.order_id = reviews.order_id WHERE reviews.review_creation_at <= :replayNow
          `).get({ replayNow: sourceLocalNow }) as unknown as ExperienceMetrics),
        };
        const contributions = contributionRows(database, currentSelection, { category: filters.category ?? null, sellerId: filters.sellerId ?? null });
        void supportedContributionDimensions;

        return {
          filters, sourceLocalNow, comparisonLabel: `${comparison.start} to ${comparison.end}`,
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
            { stage: 'purchased', value: toNumber(funnel.purchased) }, { stage: 'approved', value: toNumber(funnel.approved) },
            { stage: 'carrier', value: toNumber(funnel.carrier) }, { stage: 'delivered', value: toNumber(funnel.delivered) },
          ],
          categoryRanking: contributions.categories.map(({ category, itemGmv: rankingItemGmv }) => ({ category, itemGmv: rankingItemGmv })),
          sellerRanking: contributions.sellers.map(({ sellerId, itemGmv: rankingItemGmv }) => ({ sellerId, itemGmv: rankingItemGmv })),
          customerStateRanking: contributions.customerStates.map(({ customerState, itemGmv: rankingItemGmv }) => ({ customerState, itemGmv: rankingItemGmv })),
          recentOrders, capabilities,
          commerce: {
            paymentAmount: asKpi(toNumber(current.paymentAmount), toNumber(previous.paymentAmount)),
            uniqueBuyerCount: asKpi(toNumber(current.uniqueBuyerCount), toNumber(previous.uniqueBuyerCount)),
            repeatBuyerCount: asKpi(toNumber(current.repeatBuyerCount), toNumber(previous.repeatBuyerCount)),
          },
          payments, fulfillment, experience, contributions,
        };
      } finally {
        removeSelections(database);
      }
    },
  };
}
