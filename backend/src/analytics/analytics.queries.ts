import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Dashboard figures computed in Postgres (GROUP BY), so the cost stays flat as
 * bills accumulate over the festival instead of loading every bill into memory.
 * All money is in paise. Business dates are inclusive bounds.
 */
export interface Range {
  gte?: Date;
  lte?: Date;
}

type Db = Pick<PrismaClient, '$queryRaw'>;

const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

/** WHERE clause for paid bills in the range (table alias "o"). */
function paidIn(r: Range) {
  return Prisma.sql`o.status = 'PAID'
    ${r.gte ? Prisma.sql`AND o."businessDate" >= ${r.gte}::date` : Prisma.empty}
    ${r.lte ? Prisma.sql`AND o."businessDate" <= ${r.lte}::date` : Prisma.empty}`;
}

function anyIn(r: Range) {
  return Prisma.sql`TRUE
    ${r.gte ? Prisma.sql`AND o."businessDate" >= ${r.gte}::date` : Prisma.empty}
    ${r.lte ? Prisma.sql`AND o."businessDate" <= ${r.lte}::date` : Prisma.empty}`;
}

export async function dashboardSummary(db: Db, r: Range) {
  const paid = paidIn(r);
  const [kpiRows, daily, hourly, products, categories, offers, customerStats, topCustomers] =
    await Promise.all([
      db.$queryRaw<
        {
          bills: bigint;
          total: bigint;
          discount: bigint;
          cash: bigint;
          online: bigint;
          pending: bigint;
          cancelled: bigint;
        }[]
      >`
      SELECT count(*) FILTER (WHERE o.status = 'PAID')                                   AS bills,
             sum(o."grandTotal") FILTER (WHERE o.status = 'PAID')                        AS total,
             sum(o."discountTotal") FILTER (WHERE o.status = 'PAID')                     AS discount,
             sum(o."grandTotal") FILTER (WHERE o.status = 'PAID' AND o."paymentMethod" = 'CASH')   AS cash,
             sum(o."grandTotal") FILTER (WHERE o.status = 'PAID' AND o."paymentMethod" = 'ONLINE') AS online,
             count(*) FILTER (WHERE o.status = 'PENDING')                                AS pending,
             count(*) FILTER (WHERE o.status = 'CANCELLED')                              AS cancelled
      FROM "Order" o WHERE ${anyIn(r)}`,
      db.$queryRaw<{ date: Date; total: bigint; cash: bigint; online: bigint; bills: bigint }[]>`
      SELECT o."businessDate" AS date, sum(o."grandTotal") AS total,
             coalesce(sum(o."grandTotal") FILTER (WHERE o."paymentMethod" = 'CASH'), 0)   AS cash,
             coalesce(sum(o."grandTotal") FILTER (WHERE o."paymentMethod" = 'ONLINE'), 0) AS online,
             count(*) AS bills
      FROM "Order" o WHERE ${paid}
      GROUP BY 1 ORDER BY 1`,
      // Timestamps are stored in UTC; the stall works in India time.
      db.$queryRaw<{ hour: number; total: bigint; bills: bigint }[]>`
      SELECT extract(hour FROM coalesce(o."paidAt", o."createdAt") + interval '5 hours 30 minutes')::int AS hour,
             sum(o."grandTotal") AS total, count(*) AS bills
      FROM "Order" o WHERE ${paid}
      GROUP BY 1`,
      // Grouped under the item's / combo's current name, so a renamed item stays one row.
      db.$queryRaw<{ name: string; qty: bigint; revenue: bigint }[]>`
      SELECT coalesce(i.name, c.name, min(l."nameSnapshot")) AS name,
             sum(l.qty) AS qty, sum(l."lineTotal") AS revenue
      FROM "OrderLine" l
      JOIN "Order" o ON o.id = l."orderId"
      LEFT JOIN "Item" i ON i.id = l."itemId"
      LEFT JOIN "Combo" c ON c.id = l."comboId"
      WHERE ${paid}
      GROUP BY l."itemId", l."comboId", i.name, c.name
      ORDER BY revenue DESC`,
      db.$queryRaw<{ name: string; revenue: bigint }[]>`
      SELECT coalesce(cat.name, 'Combos') AS name, sum(l."lineTotal") AS revenue
      FROM "OrderLine" l
      JOIN "Order" o ON o.id = l."orderId"
      LEFT JOIN "Item" i ON i.id = l."itemId"
      LEFT JOIN "Category" cat ON cat.id = i."categoryId"
      WHERE ${paid}
      GROUP BY 1 ORDER BY revenue DESC`,
      db.$queryRaw<{ name: string; bills: bigint; discount: bigint }[]>`
      SELECT f.name, count(*) AS bills, sum(x."discountAmount") AS discount
      FROM "OrderOffer" x
      JOIN "Order" o ON o.id = x."orderId"
      JOIN "Offer" f ON f.id = x."offerId"
      WHERE ${paid}
      GROUP BY f.name ORDER BY discount DESC`,
      db.$queryRaw<{ total: bigint; once: bigint; back: bigint }[]>`
      SELECT count(*) AS total, count(*) FILTER (WHERE bills = 1) AS once, count(*) FILTER (WHERE bills > 1) AS back
      FROM (SELECT o."customerId", count(*) AS bills FROM "Order" o WHERE ${paid} GROUP BY 1) s`,
      db.$queryRaw<{ name: string; phone: string; bills: bigint; spent: bigint }[]>`
      SELECT cu.name, cu.phone, s.bills, s.spent
      FROM (SELECT o."customerId", count(*) AS bills, sum(o."grandTotal") AS spent
            FROM "Order" o WHERE ${paid} GROUP BY 1 ORDER BY spent DESC, 1 LIMIT 10) s
      JOIN "Customer" cu ON cu.id = s."customerId"
      ORDER BY s.spent DESC, cu.id`,
    ]);

  const k = kpiRows[0];
  const bills = n(k.bills);
  const total = n(k.total);
  const byHour = new Map(hourly.map((h) => [h.hour, h]));
  return {
    kpis: {
      total,
      bills,
      avgBill: bills ? Math.round(total / bills) : 0,
      cash: n(k.cash),
      online: n(k.online),
      discountGiven: n(k.discount),
    },
    daily: daily.map((d) => ({
      date: d.date.toISOString().slice(0, 10),
      total: n(d.total),
      cash: n(d.cash),
      online: n(d.online),
      bills: n(d.bills),
    })),
    hourly: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      total: n(byHour.get(hour)?.total),
      bills: n(byHour.get(hour)?.bills),
    })),
    products: products.map((p) => ({ name: p.name, qty: n(p.qty), revenue: n(p.revenue) })),
    categories: categories.map((c) => ({ name: c.name, revenue: n(c.revenue) })),
    offers: offers.map((o) => ({ name: o.name, bills: n(o.bills), discount: n(o.discount) })),
    customers: {
      total: n(customerStats[0]?.total),
      cameOnce: n(customerStats[0]?.once),
      cameBack: n(customerStats[0]?.back),
      top: topCustomers.map((c) => ({ name: c.name, phone: c.phone, bills: n(c.bills), spent: n(c.spent) })),
    },
    pending: n(k.pending),
    cancelled: n(k.cancelled),
  };
}
