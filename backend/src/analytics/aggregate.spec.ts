import { aggregate, csvCell, OrderRow } from './aggregate';

const order = (p: Partial<OrderRow> & { total: number }): OrderRow => ({
  businessDate: new Date('2026-10-01T00:00:00Z'),
  paidAt: new Date('2026-10-01T14:30:00Z'), // 20:00 IST
  createdAt: new Date('2026-10-01T14:00:00Z'),
  grandTotal: p.total,
  discountTotal: 0,
  paymentMethod: 'CASH',
  customer: { id: 1, name: 'A', phone: '9999999999' },
  lines: [],
  offers: [],
  ...p,
});

describe('aggregate', () => {
  it('totals, averages and cash/online split', () => {
    const r = aggregate([order({ total: 10000 }), order({ total: 5000, paymentMethod: 'ONLINE' })]);
    expect(r.kpis).toMatchObject({ total: 15000, bills: 2, avgBill: 7500, cash: 10000, online: 5000 });
  });

  it('groups by business date in order', () => {
    const r = aggregate([
      order({ total: 100, businessDate: new Date('2026-10-02T00:00:00Z') }),
      order({ total: 200 }),
    ]);
    expect(r.daily.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-02']);
  });

  it('buckets hours in India time', () => {
    const r = aggregate([order({ total: 100 })]);
    expect(r.hourly[20]).toMatchObject({ bills: 1, total: 100 });
  });

  it('separates customers who came once from those who came back', () => {
    const r = aggregate([
      order({ total: 100 }),
      order({ total: 100 }),
      order({ total: 100, customer: { id: 2, name: 'B', phone: '8888888888' } }),
    ]);
    expect(r.customers).toMatchObject({ total: 2, cameOnce: 1, cameBack: 1 });
  });

  it('ranks products and folds combos into a Combos category', () => {
    const r = aggregate([
      order({
        total: 100,
        lines: [
          {
            itemId: 1,
            comboId: null,
            nameSnapshot: 'Dabeli',
            qty: 2,
            lineTotal: 6000,
            categoryName: 'Snacks',
          },
          { itemId: null, comboId: 9, nameSnapshot: 'Duo', qty: 1, lineTotal: 5000, categoryName: null },
        ],
      }),
    ]);
    expect(r.products[0].name).toBe('Dabeli');
    expect(r.categories.map((c) => c.name)).toEqual(['Snacks', 'Combos']);
  });
});

describe('csvCell', () => {
  it('quotes commas and quotes', () => expect(csvCell('a,"b"')).toBe('"a,""b"""'));
  it('neutralises formulas', () => expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)"));
});
