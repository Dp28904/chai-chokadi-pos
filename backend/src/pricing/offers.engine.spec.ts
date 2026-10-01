import { applyOffers, EngineLine, OfferRule } from './offers.engine';

const offer = (p: Partial<OfferRule>): OfferRule => ({
  id: 1,
  name: 'o',
  type: 'PERCENT_OFF',
  scope: 'ITEM',
  targetId: 1,
  value: 10,
  minBillAmount: 0,
  minQty: 0,
  maxDiscount: null,
  buyQty: null,
  getQty: null,
  startsAt: null,
  endsAt: null,
  isActive: true,
  ...p,
});
const entry = (itemId: number, unitPrice: number, qty: number, categoryId = 10): EngineLine => ({
  categoryId,
  line: { itemId, nameSnapshot: 'x', unitPrice, qty, lineDiscount: 0, lineTotal: unitPrice * qty },
});

describe('applyOffers', () => {
  it('percent off one item', () => {
    const e = [entry(1, 10000, 2), entry(2, 5000, 1)];
    const r = applyOffers(e, [offer({ value: 10 })]);
    expect(r).toEqual([{ offerId: 1, name: 'o', discountAmount: 2000 }]);
    expect(e[0].line.lineTotal).toBe(18000);
    expect(e[1].line.lineDiscount).toBe(0);
  });

  it('category scope hits every item in the category', () => {
    const e = [entry(1, 1000, 1, 10), entry(2, 2000, 1, 10), entry(3, 4000, 1, 11)];
    const r = applyOffers(e, [offer({ scope: 'CATEGORY', targetId: 10, value: 50 })]);
    expect(r[0].discountAmount).toBe(1500);
  });

  it('buy 2 get 1 free gives a free unit per group of three', () => {
    const e = [entry(1, 3000, 7)];
    const r = applyOffers(e, [offer({ type: 'BUY_X_GET_Y', buyQty: 2, getQty: 1 })]);
    expect(r[0].discountAmount).toBe(6000); // 2 groups of 3 -> 2 free
  });

  it('picks the best line offer and does not stack', () => {
    const e = [entry(1, 10000, 1)];
    const r = applyOffers(e, [offer({ id: 1, value: 10 }), offer({ id: 2, type: 'FLAT_OFF', value: 2500 })]);
    expect(r).toHaveLength(1);
    expect(r[0].offerId).toBe(2);
  });

  it('bill offer needs the minimum and applies after line offers', () => {
    const e = [entry(1, 20000, 1)];
    const offers = [
      offer({ id: 1, value: 10 }), // line: -2000 -> 18000
      offer({ id: 2, scope: 'BILL', targetId: null, type: 'FLAT_OFF', value: 1000, minBillAmount: 25000 }),
      offer({ id: 3, scope: 'BILL', targetId: null, type: 'PERCENT_OFF', value: 10, minBillAmount: 15000 }),
    ];
    const r = applyOffers(e, offers);
    expect(r.find((x) => x.offerId === 3)?.discountAmount).toBe(1800); // 10% of 18000
    expect(r.find((x) => x.offerId === 2)).toBeUndefined(); // below its minimum
  });

  it('ignores inactive and out-of-date offers', () => {
    const now = new Date('2026-10-05T12:00:00Z');
    const e = [entry(1, 1000, 1)];
    expect(applyOffers(e, [offer({ isActive: false })], now)).toEqual([]);
    expect(applyOffers(e, [offer({ endsAt: new Date('2026-10-04T00:00:00Z') })], now)).toEqual([]);
    expect(applyOffers(e, [offer({ startsAt: new Date('2026-10-06T00:00:00Z') })], now)).toEqual([]);
  });

  it('combo lines (no categoryId, other itemId) are not discounted', () => {
    const e: EngineLine[] = [
      { line: { comboId: 5, nameSnapshot: 'c', unitPrice: 5000, qty: 1, lineDiscount: 0, lineTotal: 5000 } },
    ];
    expect(applyOffers(e, [offer({ scope: 'CATEGORY', targetId: 10 })])).toEqual([]);
  });

  it('minQty: "pick any 2 maska buns" needs 2 units across the category', () => {
    const o = offer({ scope: 'CATEGORY', targetId: 10, value: 10, minQty: 2 });
    expect(applyOffers([entry(1, 4000, 1)], [o])).toEqual([]);
    expect(applyOffers([entry(1, 4000, 1), entry(2, 5000, 1)], [o])[0].discountAmount).toBe(900);
  });

  it('maxDiscount caps the offer total and keeps line totals consistent', () => {
    // 10% of 4000 + 10% of 5000 = 900, capped to 500
    const e = [entry(1, 4000, 1), entry(2, 5000, 1)];
    const r = applyOffers(e, [
      offer({ scope: 'CATEGORY', targetId: 10, value: 10, minQty: 2, maxDiscount: 500 }),
    ]);
    expect(r[0].discountAmount).toBe(500);
    expect(e[0].line.lineDiscount + e[1].line.lineDiscount).toBe(500);
    expect(e[0].line.lineTotal + e[1].line.lineTotal).toBe(8500);
  });

  it('bill offer: 10% above Rs 100, upto Rs 15', () => {
    const o = offer({
      id: 9,
      scope: 'BILL',
      targetId: null,
      value: 10,
      minBillAmount: 10000,
      maxDiscount: 1500,
    });
    expect(applyOffers([entry(1, 9000, 1)], [o])).toEqual([]);
    expect(applyOffers([entry(1, 12000, 1)], [o])[0].discountAmount).toBe(1200);
    expect(applyOffers([entry(1, 30000, 1)], [o])[0].discountAmount).toBe(1500);
  });

  it('rounds percentage discounts to whole rupees', () => {
    // 10% of Rs 145 = Rs 14.50 -> Rs 15 (nearest rupee)
    const o = offer({ id: 9, scope: 'BILL', targetId: null, value: 10 });
    expect(applyOffers([entry(1, 14500, 1)], [o])[0].discountAmount).toBe(1500);
    // 10% of Rs 144 = Rs 14.40 -> Rs 14
    expect(applyOffers([entry(1, 14400, 1)], [o])[0].discountAmount).toBe(1400);
  });
});
