import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

const include = {
  lines: true,
  offers: true,
  customer: true,
  servedBy: { select: { name: true } },
} as const;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  preview(lines: CreateOrderDto['lines']) {
    return this.pricing.calculate(lines);
  }

  async create(dto: CreateOrderDto, userId: number) {
    // A retried request (double tap, flaky network) returns the bill already made.
    if (dto.clientRef) {
      const existing = await this.prisma.order.findUnique({ where: { clientRef: dto.clientRef }, include });
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
          lines: { create: priced.lines },
          offers: {
            create: priced.offers.map((o) => ({ offerId: o.offerId, discountAmount: o.discountAmount })),
          },
        },
        include,
      });
    });
  }

  async pay(id: number, method: 'CASH' | 'ONLINE') {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id }, include: { lines: true } });
      if (!order) throw new NotFoundException('Order not found');
      if (order.status !== 'PENDING') throw new BadRequestException(`Order is already ${order.status}`);

      // Expand combo lines into the items they contain, then count per item.
      const comboIds = order.lines.filter((l) => l.comboId).map((l) => l.comboId!);
      const parts = await tx.comboItem.findMany({ where: { comboId: { in: comboIds } } });
      const used = new Map<number, number>();
      for (const l of order.lines) {
        for (const [itemId, qty] of expandLine(l, parts)) used.set(itemId, (used.get(itemId) ?? 0) + qty);
      }
      const tracked = await tx.item.findMany({
        where: { id: { in: [...used.keys()] }, trackStock: true },
        select: { id: true },
      });
      for (const { id: itemId } of tracked) {
        const qty = used.get(itemId)!;
        await tx.item.update({ where: { id: itemId }, data: { qtyOnHand: { decrement: qty } } });
        await tx.stockMovement.create({ data: { itemId, change: -qty, reason: 'SALE', orderId: id } });
      }

      return tx.order.update({
        where: { id },
        data: { status: 'PAID', paymentMethod: method, paidAt: new Date() },
        include,
      });
    });
  }

  async cancel(id: number) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'PENDING') throw new BadRequestException(`Order is already ${order.status}`);
    // Food already handed over is a real sale; cancelling it would hide it.
    if (order.servedAt) throw new BadRequestException('This order was already served');
    return this.prisma.order.update({ where: { id }, data: { status: 'CANCELLED' }, include });
  }

  /** Tick (or untick, to undo a mis-tap) "served" on a paid or pending bill. */
  async setServed(id: number, served: boolean, userId: number) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'CANCELLED') throw new BadRequestException("Cancelled bills can't be served");
    return this.prisma.order.update({
      where: { id },
      data: served ? { servedAt: new Date(), servedById: userId } : { servedAt: null, servedById: null },
      include,
    });
  }

  list(date?: string) {
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('Date must be YYYY-MM-DD');
    const day = date ? new Date(`${date}T00:00:00Z`) : businessDateOf();
    return this.prisma.order.findMany({
      where: { businessDate: day },
      include,
      orderBy: { id: 'desc' },
    });
  }
}
