import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type Granularity = 'day' | 'week' | 'month';

const REVENUE_STATUSES: OrderStatus[] = [OrderStatus.PAID, OrderStatus.FULFILLED];
const LOW_STOCK_THRESHOLD = 5;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function bucketKey(d: Date, g: Granularity): string {
  const day = startOfDay(d);
  if (g === 'day') return day.toISOString().slice(0, 10);
  if (g === 'month') return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}`;
  // week: ISO-ish, bucket by the Monday of that week
  const weekday = (day.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(day);
  monday.setDate(day.getDate() - weekday);
  return monday.toISOString().slice(0, 10);
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(days = 30, granularity: Granularity = 'day') {
    const now = new Date();
    const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const prevStart = new Date(periodStart.getTime() - days * 24 * 60 * 60 * 1000);

    const [current, previous, statusGroups, lowStockVariants, newCustomers] = await Promise.all([
      this.prisma.order.findMany({
        where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: periodStart } },
        select: { total: true, createdAt: true },
      }),
      this.prisma.order.findMany({
        where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: prevStart, lt: periodStart } },
        select: { total: true },
      }),
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.productVariant.findMany({
        where: { stock: { lte: LOW_STOCK_THRESHOLD } },
        orderBy: { stock: 'asc' },
        take: 10,
        include: { product: { select: { name: true, slug: true } } },
      }),
      this.prisma.user.count({ where: { role: 'CUSTOMER', createdAt: { gte: periodStart } } }),
    ]);

    // --- stat cards (current vs previous period) ---
    const revenue = current.reduce((s, o) => s + o.total, 0);
    const prevRevenue = previous.reduce((s, o) => s + o.total, 0);
    const orders = current.length;
    const prevOrders = previous.length;
    const aov = orders ? Math.round(revenue / orders) : 0;
    const prevAov = prevOrders ? Math.round(prevRevenue / prevOrders) : 0;

    const stats = {
      revenue: { value: revenue, delta: pctDelta(revenue, prevRevenue) },
      orders: { value: orders, delta: pctDelta(orders, prevOrders) },
      averageOrderValue: { value: aov, delta: pctDelta(aov, prevAov) },
      newCustomers: { value: newCustomers, delta: null as number | null },
    };

    // --- revenue series (bucketed) ---
    const buckets = new Map<string, { revenue: number; orders: number }>();
    for (const o of current) {
      const key = bucketKey(o.createdAt, granularity);
      const b = buckets.get(key) ?? { revenue: 0, orders: 0 };
      b.revenue += o.total;
      b.orders += 1;
      buckets.set(key, b);
    }
    const revenueSeries = [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, revenue: v.revenue, orders: v.orders }));

    // --- orders by status ---
    const ordersByStatus = Object.values(OrderStatus).map((status) => ({
      status,
      count: statusGroups.find((g) => g.status === status)?._count._all ?? 0,
    }));

    // --- top products (by revenue, PAID/FULFILLED, in window) ---
    const items = await this.prisma.orderItem.findMany({
      where: { order: { status: { in: REVENUE_STATUSES }, createdAt: { gte: periodStart } } },
      select: { productName: true, sku: true, quantity: true, lineTotal: true, imageUrl: true },
    });
    const topMap = new Map<string, { name: string; units: number; revenue: number; image: string | null }>();
    for (const it of items) {
      const key = it.productName;
      const t = topMap.get(key) ?? { name: it.productName, units: 0, revenue: 0, image: it.imageUrl };
      t.units += it.quantity;
      t.revenue += it.lineTotal;
      topMap.set(key, t);
    }
    const topProducts = [...topMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    const lowStock = lowStockVariants.map((v) => ({
      variantId: v.id,
      productName: v.product.name,
      productSlug: v.product.slug,
      variantName: v.name,
      sku: v.sku,
      stock: v.stock,
    }));

    return {
      range: { days, granularity, from: periodStart, to: now },
      stats,
      revenueSeries,
      ordersByStatus,
      topProducts,
      lowStock,
    };
  }

  async recentOrders(limit = 8) {
    const rows = await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: true },
    });
    return rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      email: o.email,
      status: o.status,
      total: o.total,
      currency: o.currency,
      itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
      createdAt: o.createdAt,
    }));
  }
}

/** Percent change, rounded. null when there's no prior baseline. */
function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}
