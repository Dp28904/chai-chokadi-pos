import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/roles';
import { PrismaService } from '../prisma/prisma.service';
import { csvCell } from './csv';
import { dashboardSummary } from './analytics.queries';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  private range(from?: string, to?: string) {
    const r: { gte?: Date; lte?: Date } = {};
    if (from && DATE.test(from)) r.gte = new Date(`${from}T00:00:00Z`);
    if (to && DATE.test(to)) r.lte = new Date(`${to}T00:00:00Z`);
    return r;
  }

  @Get('summary')
  summary(@Query('from') from?: string, @Query('to') to?: string) {
    return dashboardSummary(this.prisma, this.range(from, to));
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(@Query('from') from?: string, @Query('to') to?: string) {
    const orders = await this.prisma.order.findMany({
      where: { businessDate: this.range(from, to) },
      include: { customer: true, lines: true },
      orderBy: { id: 'asc' },
    });
    const head = [
      'Bill',
      'Business date',
      'Paid at (IST)',
      'Served at (IST)',
      'Customer',
      'Phone',
      'Items',
      'Subtotal',
      'Discount',
      'Total',
      'Status',
      'Payment',
    ];
    const rs = (p: number) => (p / 100).toFixed(2);
    const ist = (d: Date | null) =>
      d ? new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') : '';
    const lines = orders.map((o) =>
      [
        o.billNo,
        o.businessDate.toISOString().slice(0, 10),
        ist(o.paidAt),
        ist(o.servedAt),
        o.customer.name,
        o.customer.phone,
        o.lines.map((l) => `${l.qty}x ${l.nameSnapshot}`).join('; '),
        rs(o.subtotal),
        rs(o.discountTotal),
        rs(o.grandTotal),
        o.status,
        o.paymentMethod ?? '',
      ]
        .map(csvCell)
        .join(','),
    );
    return [head.join(','), ...lines].join('\n');
  }
}
