import type {
  Category,
  Campaign,
  CommerceDataset,
  Customer,
  Order,
  OrderItem,
  Platform,
  Product,
  Refund,
  Store,
  Target,
  TrafficRecord,
} from '../domain/types';
import { createSeededRandom } from './seed';

const platforms: Platform[] = ['天猫', '京东', '抖音电商', '自营小程序'];
const regions = ['华东', '华南', '华北', '西南'];
const dayMs = 24 * 60 * 60 * 1000;

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function generateDataset(seed: number, now: Date): CommerceDataset {
  const random = createSeededRandom(seed);
  const categories: Category[] = ['数码', '家居', '美妆', '食品', '服饰', '母婴'].map((name, index) => ({
    id: `category-${index + 1}`,
    name,
  }));
  const stores: Store[] = platforms.map((platform, index) => ({
    id: `store-${index + 1}`,
    name: `${platform}旗舰店`,
    region: regions[index],
  }));
  const customers: Customer[] = Array.from({ length: 800 }, (_, index) => ({
    id: `customer-${index + 1}`,
    name: `客户${index + 1}`,
  }));
  const products: Product[] = Array.from({ length: 36 }, (_, index) => ({
    id: `product-${index + 1}`,
    name: `商品${index + 1}`,
    categoryId: categories[index % categories.length].id,
    stock: 20 + Math.floor(random() * 380),
  }));
  const campaigns: Campaign[] = platforms.flatMap((platform, platformIndex) => (
    (['信息流', '搜索'] as const).map((channel, channelIndex) => ({
      id: `campaign-${platformIndex + 1}-${channelIndex + 1}`,
      platform,
      storeId: stores[platformIndex].id,
      channel,
      startAt: new Date(now.getTime() - (80 - channelIndex * 10) * dayMs),
      endAt: new Date(now.getTime() + (20 + channelIndex * 10) * dayMs),
      impressions: 20000 + Math.floor(random() * 30000),
      clicks: 1000 + Math.floor(random() * 4000),
      spend: 10000 + Math.floor(random() * 20000),
      attributedRevenue: 30000 + Math.floor(random() * 50000),
    }))
  ));
  const orders: Order[] = [];
  const orderItems: OrderItem[] = [];
  const refunds: Refund[] = [];
  const traffic: TrafficRecord[] = [];
  const targets: Target[] = [];
  let refundNumber = 0;

  for (let day = 89; day >= 0; day -= 1) {
    const date = new Date(now.getTime() - day * dayMs);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    let dayGmv = 0;

    for (let index = 0; index < 72; index += 1) {
      const orderNumber = orders.length + 1;
      const platformIndex = orderNumber % platforms.length;
      const product = products[Math.floor(random() * products.length)];
      const quantity = 1 + Math.floor(random() * 3);
      const unitPrice = 49 + Math.floor(random() * 451);
      const unitCost = Math.floor(unitPrice * (0.45 + random() * 0.25));
      const itemAmount = quantity * unitPrice;
      const shippingFee = Math.floor(random() * 16);
      const discountAmount = Math.floor(random() * Math.min(itemAmount * 0.2, 50));
      const lastMinute = day === 0 ? now.getHours() * 60 + now.getMinutes() : 20 * 60;
      const firstMinute = day === 0 && lastMinute < 8 * 60 ? 0 : Math.min(8 * 60, lastMinute);
      const createdAt = new Date(dayStart + (firstMinute + Math.floor(random() * (lastMinute - firstMinute + 1))) * 60 * 1000);
      const statusRoll = random();
      const status: Order['status'] = statusRoll < 0.06
        ? 'cancelled'
        : statusRoll < 0.1
          ? 'created'
          : statusRoll < 0.55
            ? 'paid'
            : 'fulfilled';
      const order: Order = {
        id: `order-${orderNumber}`,
        customerId: customers[Math.floor(random() * customers.length)].id,
        platform: platforms[platformIndex],
        storeId: stores[platformIndex].id,
        ...(random() < 0.55 ? { campaignId: campaigns[platformIndex * 2 + Math.floor(random() * 2)].id } : {}),
        createdAt,
        ...(status === 'paid' || status === 'fulfilled'
          ? { paidAt: new Date(Math.min(createdAt.getTime() + (5 + Math.floor(random() * 56)) * 60 * 1000, now.getTime())) }
          : {}),
        status,
        shippingFee,
        discountAmount,
      };

      orders.push(order);
      orderItems.push({
        orderId: order.id,
        productId: product.id,
        categoryId: product.categoryId,
        quantity,
        unitPrice,
        unitCost,
      });
      dayGmv += itemAmount + shippingFee - discountAmount;

      if ((status === 'paid' || status === 'fulfilled') && random() < 0.08) {
        refundNumber += 1;
        const refundAt = new Date(createdAt.getTime() + (1 + Math.floor(random() * 10)) * dayMs);
        if (refundAt <= now) {
          refunds.push({
            id: `refund-${refundNumber}`,
            orderId: order.id,
            amount: Math.floor((itemAmount + shippingFee - discountAmount) * (0.2 + random() * 0.8)),
            createdAt: refundAt,
            status: random() < 0.15 ? 'requested' : random() < 0.5 ? 'approved' : 'completed',
            reason: '商品不符合预期',
          });
        }
      }
    }

    for (let index = 0; index < platforms.length; index += 1) {
      const visitors = 1400 + Math.floor(random() * 1600);
      const productViewers = Math.floor(visitors * (0.45 + random() * 0.2));
      const addToCartUsers = Math.floor(productViewers * (0.2 + random() * 0.15));
      const checkoutUsers = Math.floor(addToCartUsers * (0.5 + random() * 0.2));
      const paidBuyers = Math.floor(checkoutUsers * (0.55 + random() * 0.2));
      traffic.push({
        at: new Date(Math.min(dayStart + 12 * 60 * 60 * 1000, now.getTime())),
        platform: platforms[index],
        storeId: stores[index].id,
        categoryId: categories[index % categories.length].id,
        visitors,
        productViewers,
        addToCartUsers,
        checkoutUsers,
        paidBuyers,
      });
    }

    targets.push({ date: dateKey(new Date(dayStart)), gmv: Math.round(dayGmv * (0.9 + random() * 0.2)) });
    const dimensionIndex = day % platforms.length;
    targets.push({
      date: dateKey(new Date(dayStart)),
      gmv: 5000 + Math.floor(random() * 10000),
      platform: platforms[dimensionIndex],
      storeId: stores[dimensionIndex].id,
      categoryId: categories[dimensionIndex].id,
    });
  }

  for (let day = 1; day <= 7; day += 1) {
    const date = new Date(startOfDay(now).getTime() + day * dayMs);
    targets.push({ date: dateKey(date), gmv: 50000 + Math.floor(random() * 20000) });
  }

  return { orders, orderItems, traffic, refunds, products, targets, customers, stores, categories, campaigns };
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
