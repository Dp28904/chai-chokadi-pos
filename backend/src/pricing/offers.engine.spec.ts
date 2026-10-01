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
  excludeCombos: false,
  exclusive: false,
  loyaltyStep: 0,
  loyaltyMax: null,
  loyaltyGapHours: 15,
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

  it('rounds percentage discounts DOWN to whole rupees', () => {
    const o = offer({ id: 9, scope: 'BILL', targetId: null, value: 10 });
    // 10% of Rs 145 = Rs 14.50 -> Rs 14
    expect(applyOffers([entry(1, 14500, 1)], [o])[0].discountAmount).toBe(1400);
    // 10% of Rs 149.90 = Rs 14.99 -> Rs 14
    expect(applyOffers([entry(1, 14990, 1)], [o])[0].discountAmount).toBe(1400);
    // exact amounts are untouched: 10% of Rs 150 = Rs 15
    expect(applyOffers([entry(1, 15000, 1)], [o])[0].discountAmount).toBe(1500);
    // the example: 15% of Rs 151.70 = Rs 22.755 -> Rs 22
    const p15 = offer({ id: 9, scope: 'BILL', targetId: null, value: 15 });
    expect(applyOffers([entry(1, 15170, 1)], [p15])[0].discountAmount).toBe(2200);
  });

  describe('Make Your Own Combo (exclusive, items only, min Rs 150, 5% up to Rs 50)', () => {
    const myoc = offer({
      id: 7,
      name: 'MYOC',
      scope: 'BILL',
      targetId: null,
      value: 5,
      minBillAmount: 15000,
      maxDiscount: 5000,
      excludeCombos: true,
      exclusive: true,
      loyaltyStep: 5,
      loyaltyMax: 20,
    });
    const maska = offer({
      id: 3,
      name: 'Maska',
      scope: 'CATEGORY',
      targetId: 10,
      value: 10,
      minQty: 2,
      maxDiscount: 500,
    });
    const combo = (price: number): EngineLine => ({
      line: {
        comboId: 5,
        nameSnapshot: 'Combo',
        unitPrice: price,
        qty: 1,
        lineDiscount: 0,
        lineTotal: price,
      },
    });

    it('needs Rs 150 of items picked separately; combos do not count', () => {
      expect(applyOffers([entry(1, 10000, 1), combo(8500)], [myoc])).toEqual([]);
      expect(applyOffers([combo(8500), combo(9500)], [myoc])).toEqual([]);
    });

    it('5% of the items, shown with its level', () => {
      // items Rs 160 -> 5% = Rs 8; the combo stays full price
      const r = applyOffers([entry(1, 8000, 1), entry(2, 8000, 1), combo(8500)], [myoc]);
      expect(r).toEqual([{ offerId: 7, name: 'MYOC (5%)', discountAmount: 800 }]);
    });

    it('replaces every other offer when it applies (no maska discount on top)', () => {
      // two maska buns (Rs 90) + Rs 70 other items = Rs 160 of items
      const e = [entry(1, 4000, 1, 10), entry(2, 5000, 1, 10), entry(3, 7000, 1, 11)];
      const r = applyOffers(e, [maska, myoc]);
      expect(r).toEqual([{ offerId: 7, name: 'MYOC (5%)', discountAmount: 800 }]);
      expect(e.every((x) => x.line.lineDiscount === 0)).toBe(true);
    });

    it('below Rs 150 the other offers still apply as usual', () => {
      const r = applyOffers([entry(1, 4000, 1, 10), entry(2, 5000, 1, 10)], [maska, myoc]);
      expect(r).toEqual([{ offerId: 3, name: 'Maska', discountAmount: 500 }]);
    });

    it('uses the repeat-customer percent and caps at Rs 50', () => {
      const pct20 = () => 20;
      expect(applyOffers([entry(1, 20000, 1)], [myoc], new Date(), pct20)).toEqual([
        { offerId: 7, name: 'MYOC (20%)', discountAmount: 4000 },
      ]);
      expect(applyOffers([entry(1, 50000, 1)], [myoc], new Date(), pct20)[0].discountAmount).toBe(5000);
    });

    it('a normal (non-exclusive) bill offer still counts combos and stacks', () => {
      const plain = offer({ id: 8, scope: 'BILL', targetId: null, value: 10, minBillAmount: 10000 });
      // 10% of Rs 145 = Rs 14.50 -> Rs 14 (rounded down)
      expect(applyOffers([entry(1, 6000, 1), combo(8500)], [plain])[0].discountAmount).toBe(1400);
    });
  });
});
