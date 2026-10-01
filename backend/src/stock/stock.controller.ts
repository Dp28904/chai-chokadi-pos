import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { IsInt, Min } from 'class-validator';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/roles';
import { PrismaService } from '../prisma/prisma.service';
import { expandLine } from '../pricing/expand';
import { recommend } from './recommend';

class QtyDto {
  @IsInt() itemId: number;
  @IsInt() @Min(1) qty: number;
}

class CountDto {
  @IsInt() itemId: number;
  @IsInt() @Min(0) qtyOnHand: number;
}

@Controller('stock')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class StockController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const items = await this.prisma.item.findMany({
      where: { trackStock: true, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, qtyOnHand: true, lowStockAt: true },
    });
    return items.map((i) => ({ ...i, low: i.qtyOnHand <= i.lowStockAt }));
  }

  @Post('restock')
  restock(@Body() dto: QtyDto) {
    return this.move(dto.itemId, dto.qty, 'RESTOCK');
  }

  @Post('wastage')
  wastage(@Body() dto: QtyDto) {
    return this.move(dto.itemId, -dto.qty, 'WASTAGE');
  }

  // Set the true count after a physical check.
  @Post('count')
  async count(@Body() dto: CountDto) {
    const item = await this.tracked(dto.itemId);
    return this.move(dto.itemId, dto.qtyOnHand - item.qtyOnHand, 'ADJUST');
  }

  @Get('movements')
  movements() {
    return this.prisma.stockMovement.findMany({
      where: { reason: { not: 'SALE' } },
      include: { item: { select: { name: true } } },
      orderBy: { id: 'desc' },
      take: 50,
    });
  }

  /** What to prepare/buy for tomorrow, from the last 3 trading days of paid sales. */
  @Get('recommendations')
  async recommendations(@Query('peak') peakRaw?: string) {
    const peak = Math.min(3, Math.max(0.5, Number(peakRaw) || 1));

    const days = await this.prisma.order.groupBy({
      by: ['businessDate'],
      where: { status: 'PAID' },
      orderBy: { businessDate: 'desc' },
      take: 3,
    });
    const dates = days.map((d) => d.businessDate);

    const [orders, combos, items] = await Promise.all([
      this.prisma.order.findMany({
        where: { status: 'PAID', businessDate: { in: dates } },
        select: {
          businessDate: true,
          lines: { select: { itemId: true, comboId: true, qty: true, choiceItemIds: true } },
        },
      }),
      this.prisma.comboItem.findMany(),
      this.prisma.item.findMany({
        where: { isActive: true },
        select: { id: true, name: true, qtyOnHand: true, trackStock: true },
      }),
    ]);

    // units sold per item per day (combos expanded into their items)
    const sold = new Map<number, Map<string, number>>();
    const add = (itemId: number, date: Date, qty: number) => {
      const key = date.toISOString().slice(0, 10);
      const perDay = sold.get(itemId) ?? new Map<string, number>();
      perDay.set(key, (perDay.get(key) ?? 0) + qty);
      sold.set(itemId, perDay);
    };
    for (const o of orders) {
      for (const l of o.lines) {
        for (const [itemId, qty] of expandLine(l, combos)) add(itemId, o.businessDate, qty);
      }
    }

    const keys = dates.map((d) => d.toISOString().slice(0, 10)); // newest first
    const rows = items.map((i) => {
      const perDay = sold.get(i.id);
      const daily = keys.map((k) => perDay?.get(k) ?? 0);
      return {
        id: i.id,
        name: i.name,
        tracked: i.trackStock,
        onHand: i.qtyOnHand,
        ...recommend(daily, i.qtyOnHand, peak),
      };
    });
    return {
      peak,
      basedOnDays: keys,
      items: rows.sort((a, b) => b.toPrepare - a.toPrepare || b.avgDaily - a.avgDaily),
    };
  }

  private async tracked(itemId: number) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new BadRequestException('Item not found');
    if (!item.trackStock) throw new BadRequestException('Turn on "Track stock" for this item first');
    return item;
  }

  private async move(itemId: number, change: number, reason: 'RESTOCK' | 'WASTAGE' | 'ADJUST') {
    await this.tracked(itemId);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.item.update({
        where: { id: itemId },
        data: { qtyOnHand: { increment: change } },
      });
      await tx.stockMovement.create({ data: { itemId, change, reason } });
      return { id: item.id, name: item.name, qtyOnHand: item.qtyOnHand };
    });
  }
}
