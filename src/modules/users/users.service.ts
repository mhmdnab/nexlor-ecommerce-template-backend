import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listCustomers(query: PaginationQueryDto & { q?: string }) {
    const where: Prisma.UserWhereInput = {};
    if (query.q) {
      where.OR = [
        { email: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const { skip, take } = toSkipTake(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { orders: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);

    // Lifetime spend per customer (PAID/FULFILLED only).
    const data = await Promise.all(
      rows.map(async (u) => {
        const agg = await this.prisma.order.aggregate({
          where: { userId: u.id, status: { in: ['PAID', 'FULFILLED'] } },
          _sum: { total: true },
        });
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          orderCount: u._count.orders,
          lifetimeValue: agg._sum.total ?? 0,
          createdAt: u.createdAt,
        };
      }),
    );
    return paginate(data, total, query);
  }

  async getCustomer(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        orders: { orderBy: { createdAt: 'desc' }, include: { items: true } },
        addresses: true,
      },
    });
    if (!user) throw new NotFoundException('Customer not found.');

    const lifetime = user.orders
      .filter((o) => o.status === 'PAID' || o.status === 'FULFILLED')
      .reduce((s, o) => s + o.total, 0);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      lifetimeValue: lifetime,
      orderCount: user.orders.length,
      addresses: user.addresses,
      orders: user.orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        total: o.total,
        currency: o.currency,
        itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
        createdAt: o.createdAt,
      })),
    };
  }

  // Helper for dashboard: new customers in a window.
  async newCustomerCount(since: Date): Promise<number> {
    return this.prisma.user.count({ where: { role: Role.CUSTOMER, createdAt: { gte: since } } });
  }
}
