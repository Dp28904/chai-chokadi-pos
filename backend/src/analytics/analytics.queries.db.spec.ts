import { PrismaClient } from '@prisma/client';
import { dashboardSummary } from './analytics.queries';

/**
 * Runs the dashboard SQL against a real, disposable Postgres database.
 *   TEST_DATABASE_URL=postgresql://.../stall_test npm test
 * Skipped when TEST_DATABASE_URL is not set. Refuses any database whose name
 * doesn't contain "test", because it deletes all data.
 */
const url = process.env.TEST_DATABASE_URL;
const run = url && /test/i.test(new URL(url).pathname) ? describe : describe.skip;

run('dashboardSummary (database)', () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const day = (d: string) => new Date(`${d}T00:00:00Z`);
  let ids: { user: number; snacks: number; dabeli: number; puri: number; combo: number; offer: number };

  beforeAll(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE "StockMovement","OrderOffer","OrderLine","Order","Customer","ComboItem","Combo","Offer","Item","Category","User" RESTART IDENTITY CASCADE',
    );
    const user = await db.user.create({
      data: { name: 'T', username: 't', passwordHash: 'x', role: 'ADMIN' },
    });
    const snacks = await db.category.create({ data: { name: 'Snacks' } });
    const dabeli = await db.item.create({ data: { name: 'Dabeli', price: 3000, categoryId: snacks.id } });
    const puri = await db.item.create({ data: { name: 'Pani Puri', price: 2000, categoryId: snacks.id } });
    const combo = await db.combo.create({ data: { name: 'Duo', price: 5000 } });
    const offer = await db.offer.create({
      data: { name: '10% off', type: 'PERCENT_OFF', scope: 'BILL', value: 10 },
    });
    ids = {
      user: user.id,
      snacks: snacks.id,
      dabeli: dabeli.id,
      puri: puri.id,
      combo: combo.id,
      offer: offer.id,
    };
    const ravi = await db.customer.create({ data: { name: 'Ravi', phone: '9000000001' } });
    const meera = await db.customer.create({ data: { name: 'Meera', phone: '9000000002' } });

    const bill = (o: {
      customerId: number;
      date: string;
      paidAtUtc: string;
      total: number;
      method?: 'CASH' | 'ONLINE';
      status?: 'PAID' | 'PENDING' | 'CANCELLED';
      lines: { itemId?: number; comboId?: number; name: string; qty: number; lineTotal: number }[];
      discount?: number;
    }) =>
      db.order.create({
        data: {
          customerId: o.customerId,
          createdById: ids.user,
          subtotal: o.total + (o.discount ?? 0),
          discountTotal: o.discount ?? 0,
          grandTotal: o.total,
          status: o.status ?? 'PAID',
          paymentMethod: (o.status ?? 'PAID') === 'PAID' ? (o.method ?? 'CASH') : null,
          businessDate: day(o.date),
          paidAt: (o.status ?? 'PAID') === 'PAID' ? new Date(o.paidAtUtc) : null,
          lines: {
            create: o.lines.map((l) => ({
              itemId: l.itemId,
              comboId: l.comboId,
              nameSnapshot: l.name,
              unitPrice: l.lineTotal / l.qty,
              qty: l.qty,
              lineTotal: l.lineTotal,
            })),
          },
          offers: o.discount ? { create: [{ offerId: ids.offer, discountAmount: o.discount }] } : undefined,
        },
      });

    // 1 Oct: Ravi cash 110 (2 dabeli + duo combo) at 20:00 IST, with a 10 discount
    await bill({
      customerId: ravi.id,
      date: '2026-10-01',
      paidAtUtc: '2026-10-01T14:30:00Z',
      total: 10000,
      discount: 1000,
      lines: [
        { itemId: ids.dabeli, name: 'Dabeli', qty: 2, lineTotal: 6000 },
        { comboId: ids.combo, name: 'Duo', qty: 1, lineTotal: 5000 },
      ],
    });
    // 2 Oct: Ravi online 60 (3 pani puri) at 21:00 IST; Meera cash 30 at 21:15 IST
    await bill({
      customerId: ravi.id,
      date: '2026-10-02',
      paidAtUtc: '2026-10-02T15:30:00Z',
      total: 6000,
      method: 'ONLINE',
      lines: [{ itemId: ids.puri, name: 'Pani Puri', qty: 3, lineTotal: 6000 }],
    });
    await bill({
      customerId: meera.id,
      date: '2026-10-02',
      paidAtUtc: '2026-10-02T15:45:00Z',
      total: 3000,
      lines: [{ itemId: ids.dabeli, name: 'Dabeli', qty: 1, lineTotal: 3000 }],
    });
    // not counted in sales
    await bill({
      customerId: meera.id,
      date: '2026-10-02',
      paidAtUtc: '',
      total: 999,
      status: 'PENDING',
      lines: [],
    });
    await bill({
      customerId: meera.id,
      date: '2026-10-02',
      paidAtUtc: '',
      total: 999,
      status: 'CANCELLED',
      lines: [],
    });
  });

  afterAll(() => db.$disconnect());

  it('totals, average and cash/online split cover paid bills only', async () => {
    const r = await dashboardSummary(db, {});
    expect(r.kpis).toEqual({
      total: 19000,
      bills: 3,
      avgBill: 6333,
      cash: 13000,
      online: 6000,
      discountGiven: 1000,
    });
    expect(r).toMatchObject({ pending: 1, cancelled: 1 });
  });

  it('groups by business date in order', async () => {
    const r = await dashboardSummary(db, {});
    expect(r.daily).toEqual([
      { date: '2026-10-01', total: 10000, cash: 10000, online: 0, bills: 1 },
      { date: '2026-10-02', total: 9000, cash: 3000, online: 6000, bills: 2 },
    ]);
  });

  it('buckets hours in India time', async () => {
    const r = await dashboardSummary(db, {});
    expect(r.hourly).toHaveLength(24);
    expect(r.hourly[20]).toEqual({ hour: 20, total: 10000, bills: 1 });
    expect(r.hourly[21]).toEqual({ hour: 21, total: 9000, bills: 2 });
  });

  it('ranks products and folds combos into a Combos category', async () => {
    const r = await dashboardSummary(db, {});
    expect(r.products).toEqual([
      { name: 'Dabeli', qty: 3, revenue: 9000 },
      { name: 'Pani Puri', qty: 3, revenue: 6000 },
      { name: 'Duo', qty: 1, revenue: 5000 },
    ]);
    expect(r.categories).toEqual([
      { name: 'Snacks', revenue: 15000 },
      { name: 'Combos', revenue: 5000 },
    ]);
    expect(r.offers).toEqual([{ name: '10% off', bills: 1, discount: 1000 }]);
  });

  it('separates customers who came once from those who came back', async () => {
    const r = await dashboardSummary(db, {});
    expect(r.customers).toEqual({
      total: 2,
      cameOnce: 1,
      cameBack: 1,
      top: [
        { name: 'Ravi', phone: '9000000001', bills: 2, spent: 16000 },
        { name: 'Meera', phone: '9000000002', bills: 1, spent: 3000 },
      ],
    });
  });

  it('respects the date range, and an empty range is all zeros', async () => {
    const one = await dashboardSummary(db, { gte: day('2026-10-02'), lte: day('2026-10-02') });
    expect(one.kpis).toMatchObject({ total: 9000, bills: 2 });
    const none = await dashboardSummary(db, { gte: day('2027-01-01'), lte: day('2027-01-02') });
    expect(none.kpis).toEqual({ total: 0, bills: 0, avgBill: 0, cash: 0, online: 0, discountGiven: 0 });
    expect(none.daily).toEqual([]);
    expect(none.customers.top).toEqual([]);
  });
});
