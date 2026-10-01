// Pure aggregation over paid orders. All money in paise.

export interface OrderRow {
  businessDate: Date;
  paidAt: Date | null;
  createdAt: Date;
  grandTotal: number;
  discountTotal: number;
  paymentMethod: 'CASH' | 'ONLINE' | null;
  customer: { id: number; name: string; phone: string };
  lines: {
    itemId: number | null;
    comboId: number | null;
    nameSnapshot: string;
    qty: number;
    lineTotal: number;
    categoryName: string | null;
  }[];
  offers: { discountAmount: number; offerName: string }[];
}

const IST_OFFSET_MS = 5.5 * 3600_000;
const dateKey = (d: Date) => d.toISOString().slice(0, 10);
const round = (n: number) => Math.round(n);

export function aggregate(orders: OrderRow[]) {
  const total = orders.reduce((s, o) => s + o.grandTotal, 0);
  const sumBy = (m: 'CASH' | 'ONLINE') =>
    orders.filter((o) => o.paymentMethod === m).reduce((s, o) => s + o.grandTotal, 0);

  const daily = new Map<
    string,
    { date: string; total: number; cash: number; online: number; bills: number }
  >();
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, total: 0, bills: 0 }));
  const products = new Map<string, { name: string; qty: number; revenue: number }>();
  const categories = new Map<string, number>();
  const offers = new Map<string, { name: string; bills: number; discount: number }>();
  const customers = new Map<number, { name: string; phone: string; bills: number; spent: number }>();

  for (const o of orders) {
    const key = dateKey(o.businessDate);
    const d = daily.get(key) ?? { date: key, total: 0, cash: 0, online: 0, bills: 0 };
    d.total += o.grandTotal;
    d.bills += 1;
    if (o.paymentMethod === 'CASH') d.cash += o.grandTotal;
    if (o.paymentMethod === 'ONLINE') d.online += o.grandTotal;
    daily.set(key, d);

    const when = o.paidAt ?? o.createdAt;
    const h = new Date(when.getTime() + IST_OFFSET_MS).getUTCHours();
    hourly[h].total += o.grandTotal;
    hourly[h].bills += 1;

    for (const l of o.lines) {
      const pk = l.itemId ? `i${l.itemId}` : `c${l.comboId}`;
      const p = products.get(pk) ?? { name: l.nameSnapshot, qty: 0, revenue: 0 };
      p.qty += l.qty;
      p.revenue += l.lineTotal;
      products.set(pk, p);
      const cat = l.categoryName ?? 'Combos';
      categories.set(cat, (categories.get(cat) ?? 0) + l.lineTotal);
    }

    for (const of of o.offers) {
      const x = offers.get(of.offerName) ?? { name: of.offerName, bills: 0, discount: 0 };
      x.bills += 1;
      x.discount += of.discountAmount;
      offers.set(of.offerName, x);
    }

    const c = customers.get(o.customer.id) ?? {
      name: o.customer.name,
      phone: o.customer.phone,
      bills: 0,
      spent: 0,
    };
    c.bills += 1;
    c.spent += o.grandTotal;
    customers.set(o.customer.id, c);
  }

  const custList = [...customers.values()];
  return {
    kpis: {
      total,
      bills: orders.length,
      avgBill: orders.length ? round(total / orders.length) : 0,
      cash: sumBy('CASH'),
      online: sumBy('ONLINE'),
      discountGiven: orders.reduce((s, o) => s + o.discountTotal, 0),
    },
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    hourly,
    products: [...products.values()].sort((a, b) => b.revenue - a.revenue),
    categories: [...categories.entries()]
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue),
    offers: [...offers.values()].sort((a, b) => b.discount - a.discount),
    customers: {
      total: custList.length,
      cameOnce: custList.filter((c) => c.bills === 1).length,
      cameBack: custList.filter((c) => c.bills > 1).length,
      top: custList.sort((a, b) => b.spent - a.spent).slice(0, 10),
    },
  };
}

/** Spreadsheet apps run cells starting with = + - @ as formulas; neutralise them. */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
