import { PricedLine, totalsFor } from './pricing.service';

const line = (unitPrice: number, qty: number): PricedLine => ({
  nameSnapshot: 'x',
  unitPrice,
  qty,
  lineDiscount: 0,
  lineTotal: unitPrice * qty,
});

describe('totalsFor', () => {
  it('sums line totals with no discount', () => {
    const r = totalsFor([line(3000, 2), line(5000, 1)], []);
    expect(r).toMatchObject({ subtotal: 11000, discountTotal: 0, grandTotal: 11000 });
  });

  it('subtracts offers', () => {
    const r = totalsFor([line(10000, 1)], [{ offerId: 1, name: 'o', discountAmount: 2000 }]);
    expect(r.grandTotal).toBe(8000);
  });

  it('never discounts below zero', () => {
    const r = totalsFor([line(1000, 1)], [{ offerId: 1, name: 'o', discountAmount: 5000 }]);
    expect(r).toMatchObject({ discountTotal: 1000, grandTotal: 0 });
  });
});
