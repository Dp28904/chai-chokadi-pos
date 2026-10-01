import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CatalogCache } from '../catalog/catalog-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { expandLine } from '../pricing/expand';
import { PricingService } from '../pricing/pricing.service';
import { CreateOrderDto } from './orders.dto';

// Stall runs past midnight: a sale at 1 am still belongs to the previous
// night. Business day rolls over at 05:00 India time.
const IST_OFFSET_MS = 5.5 * 3600_000;
const DAY_ROLLOVER_MS = 5 * 3600_000;

export function businessDateOf(now = new Date()): Date {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS - DAY_ROLLOVER_MS);
  return new Date(shifted.toISOString().slice(0, 10) + 'T00:00:00Z');
}

/** What the Bills page shows: no ids or offer rows it never reads. */
const include = {
  lines: { select: { nameSnapshot: true, qty: true, unitPrice: true } },
  customer: { select: { name: true, phone: true } },
  servedBy: { select: { name: true } },
} as const;
/** After create/pay/served the client only needs the bill header. */
const slim = {
  customer: { select: { name: true, phone: true } },
  servedBy: { select: { name: true } },
} as const;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly catalog: CatalogCache,
  ) {}

  preview(lines: CreateOrderDto['lines']) {
    return this.pricing.calculate(lines);
  }

  async create(dto: CreateOrderDto, userId: number) {
    // A retried request (double tap, flaky network) returns the bill already made.
    if (dto.clientRef) {
      const existing = await this.prisma.order.findUnique({
        where: { clientRef: dto.clientRef },
        include: slim,
      });
      if (existing) return existing;
    }
    const priced = await this.pricing.calculate(dto.lines);
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: { phone: dto.phone },
        update: { name: dto.customerName },
        create: { name: dto.customerName, phone: dto.phone },
      });
      return tx.order.create({
        data: {
          customerId: customer.id,
          createdById: userId,
          clientRef: dto.clientRef,
          subtotal: priced.subtotal,
          discountTotal: priced.discountTotal,
          grandTotal: priced.grandTotal,
          businessDate: businessDateOf(),
          // one INSERT for all lines/offers instead of one per row
          lines: { createMany: { data: priced.lines } },
          offers: {
            createMany: {
              data: priced.offers.map((o) => ({ offerId: o.offerId, discountAmount: o.discountAmount })),
            },
          },
        },
        include: slim,
      });
    });
  }

  async pay(id: number, method: 'CASH' | 'ONLINE') {
    const catalog = await this.catalog.get();
    return this.prisma.$transaction(async (tx) => {
      // Conditional update: if two devices confirm the same bill at once, only one
      // wins, so stock is never deducted twice.
      const won = await tx.order.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'PAID', paymentMethod: method, paidAt: new Date() },
      });
      if (won.count === 0) {
        const order = await tx.order.findUnique({ where: { id }, select: { status: true } });
        if (!order) throw new NotFoundException('Order not found');
        throw new BadRequestException(`Order is already ${order.status}`);
      }

      // Expand combo lines into the items they contain, then count per tracked item.
      const lines = await tx.orderLine.findMany({
        where: { orderId: id },
        select: { itemId: true, comboId: true, qty: true, choiceItemIds: true },
      });
      const used = new Map<number, number>();
      for (const l of lines) {
        for (const [itemId, qty] of expandLine(l, catalog.comboParts)) {
          if (catalog.items.get(itemId)?.trackStock) used.set(itemId, (used.get(itemId) ?? 0) + qty);
        }
      }
      if (used.size) {
        const rows = [...used].map(([itemId, qty]) => Prisma.sql`(${itemId}::int, ${qty}::int)`);
        await tx.$executeRaw`
          UPDATE "Item" AS i SET "qtyOnHand" = i."qtyOnHand" - v.qty
          FROM (VALUES ${Prisma.join(rows)}) AS v(id, qty) WHERE i.id = v.id`;
        await tx.stockMovement.createMany({
          data: [...used].map(([itemId, qty]) => ({
            itemId,
            change: -qty,
            reason: 'SALE' as const,
            orderId: id,
          })),
        });
      }
      return tx.order.findUniqueOrThrow({ where: { id }, include: slim });
    });
  }

  async cancel(id: number) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'PENDING') throw new BadRequestException(`Order is already ${order.status}`);
    // Food already handed over is a real sale; cancelling it would hide it.
    if (order.servedAt) throw new BadRequestException('This order was already served');
    return this.prisma.order.update({ where: { id }, data: { status: 'CANCELLED' }, include: slim });
  }

  /** Tick (or untick, to undo a mis-tap) "served" on a paid or pending bill. */
  async setServed(id: number, served: boolean, userId: number) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'CANCELLED') throw new BadRequestException("Cancelled bills can't be served");
    return this.prisma.order.update({
      where: { id },
      data: served ? { servedAt: new Date(), servedById: userId } : { servedAt: null, servedById: null },
      include: slim,
    });
  }

  list(date?: string) {
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('Date must be YYYY-MM-DD');
    const day = date ? new Date(`${date}T00:00:00Z`) : businessDateOf();
    // Polled every 20 s by each device: send only what the Bills page shows.
    return this.prisma.order.findMany({
      where: { businessDate: day },
      select: {
        id: true,
        billNo: true,
        subtotal: true,
        discountTotal: true,
        grandTotal: true,
        status: true,
        paymentMethod: true,
        createdAt: true,
        servedAt: true,
        ...include,
      },
      orderBy: { id: 'desc' },
    });
  }
}
