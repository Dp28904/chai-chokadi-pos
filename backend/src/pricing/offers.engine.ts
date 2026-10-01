import type { AppliedOffer, PricedLine } from './pricing.service';

export interface OfferRule {
  id: number;
  name: string;
  type: 'PERCENT_OFF' | 'FLAT_OFF' | 'BUY_X_GET_Y';
  scope: 'ITEM' | 'CATEGORY' | 'BILL';
  targetId: number | null;
  value: number; // percent, or paise for FLAT_OFF
  minBillAmount: number;
  minQty: number;
  maxDiscount: number | null;
  /** BILL offers: count only items bought separately (combos are ignored for the minimum and the discount). */
  excludeCombos: boolean;
  /** BILL offers: when this applies, no other offer applies to the bill. */
  exclusive: boolean;
  /** Repeat-customer ladder (see loyalty.ts); loyaltyStep 0 = off. */
  loyaltyStep: number;
  loyaltyMax: number | null;
  loyaltyGapHours: number;
  buyQty: number | null;
  getQty: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
}

export interface EngineLine {
  line: PricedLine;
  categoryId?: number; // only for plain item lines; combos are never discounted
}

/**
 * Percentage discounts are whole rupees, always rounded DOWN (Rs 22.75 -> Rs 22), so the stall
 * never gives away more than the advertised percent. Integer maths: no floating-point surprises.
 */
const percentOf = (paise: number, pct: number) => Math.floor((paise * pct) / 10000) * 100;

export function isLive(o: OfferRule, now: Date): boolean {
  return o.isActive && (!o.startsAt || o.startsAt <= now) && (!o.endsAt || o.endsAt >= now);
}

function matches(o: OfferRule, l: EngineLine): boolean {
  if (o.scope === 'ITEM') return l.line.itemId === o.targetId;
  if (o.scope === 'CATEGORY') return l.categoryId !== undefined && l.categoryId === o.targetId;
  return false;
}

/** Discount in paise an offer gives on a single line (before any other offer). */
function lineDiscountFor(o: OfferRule, line: PricedLine): number {
  const gross = line.unitPrice * line.qty;
  if (o.type === 'PERCENT_OFF') return percentOf(gross, o.value);
  if (o.type === 'FLAT_OFF') return Math.min(gross, o.value * line.qty);
  if (o.type === 'BUY_X_GET_Y' && o.buyQty && o.getQty) {
    const free = Math.floor(line.qty / (o.buyQty + o.getQty)) * o.getQty;
    return free * line.unitPrice;
  }
  return 0;
}

/**
 * Rules:
 *  1. Each item line gets the single best line-level offer (ITEM/CATEGORY scope).
 *     A line offer with minQty needs that many matching units across the bill.
 *  2. Then the single best BILL offer applies to what remains, if the
 *     pre-discount subtotal reaches its minimum.
 *  3. maxDiscount caps an offer's total across all lines it touched.
 * Offers never stack within the same level. Mutates lines (lineDiscount/lineTotal).
 */
/** Percent to use for an offer (repeat customers can get more than the offer's base value). */
export type PercentFor = (o: OfferRule) => number;

/** Bill-level discount for an offer on a given amount, with the "upto" cap. */
function billAmount(o: OfferRule, amount: number, pct: number): number {
  let d =
    o.type === 'PERCENT_OFF' ? percentOf(amount, pct) : o.type === 'FLAT_OFF' ? Math.min(amount, o.value) : 0;
  if (o.maxDiscount !== null) d = Math.min(d, o.maxDiscount);
  return d;
}

/** Bill label; ladder offers show the level, e.g. "Make Your Own Combo (10%)". */
const labelFor = (o: OfferRule, pct: number) =>
  o.loyaltyStep && o.type === 'PERCENT_OFF' ? `${o.name} (${pct}%)` : o.name;

export function applyOffers(
  entries: EngineLine[],
  offers: OfferRule[],
  now = new Date(),
  percentFor: PercentFor = (o) => o.value,
): AppliedOffer[] {
  const live = offers.filter((o) => isLive(o, now));
  const gross = (es: EngineLine[]) => es.reduce((s, e) => s + e.line.unitPrice * e.line.qty, 0);
  const itemEntries = entries.filter((e) => !e.line.comboId);
  // "Make your own combo": the minimum is met by items picked individually, not ready-made combos.
  const base = (o: OfferRule) => (o.scope === 'BILL' && o.excludeCombos ? itemEntries : entries);
  const eligible = live.filter((o) => gross(base(o)) >= o.minBillAmount);

  // An exclusive bill offer (e.g. Make Your Own Combo) replaces every other offer when it applies,
  // so it is worked out on undiscounted lines and returned on its own.
  let bestExclusive: { o: OfferRule; amount: number; pct: number } | null = null;
  for (const o of eligible.filter((x) => x.scope === 'BILL' && x.exclusive)) {
    const pct = percentFor(o);
    const amount = billAmount(o, gross(base(o)), pct);
    if (amount > (bestExclusive?.amount ?? 0)) bestExclusive = { o, amount, pct };
  }
  if (bestExclusive) {
    const { o, amount, pct } = bestExclusive;
    return [{ offerId: o.id, name: labelFor(o, pct), discountAmount: amount }];
  }
  const groupQty = (o: OfferRule) => entries.filter((e) => matches(o, e)).reduce((s, e) => s + e.line.qty, 0);
  const lineOffers = eligible.filter((o) => o.scope !== 'BILL' && groupQty(o) >= o.minQty);

  // offer id -> lines it discounted
  const hits = new Map<number, { o: OfferRule; lines: PricedLine[] }>();
  for (const e of entries) {
    let best: { o: OfferRule; amount: number } | null = null;
    for (const o of lineOffers.filter((x) => matches(x, e))) {
      const amount = lineDiscountFor(o, e.line);
      if (amount > (best?.amount ?? 0)) best = { o, amount };
    }
    if (best) {
      e.line.lineDiscount = best.amount;
      e.line.lineTotal = e.line.unitPrice * e.line.qty - best.amount;
      const h = hits.get(best.o.id) ?? { o: best.o, lines: [] };
      h.lines.push(e.line);
      hits.set(best.o.id, h);
    }
  }

  const applied: AppliedOffer[] = [];
  for (const { o, lines } of hits.values()) {
    let total = lines.reduce((s, l) => s + l.lineDiscount, 0);
    // Over the cap: hand back the excess, last line first.
    for (let i = lines.length - 1; o.maxDiscount !== null && total > o.maxDiscount && i >= 0; i--) {
      const give = Math.min(lines[i].lineDiscount, total - o.maxDiscount);
      lines[i].lineDiscount -= give;
      lines[i].lineTotal += give;
      total -= give;
    }
    applied.push({ offerId: o.id, name: o.name, discountAmount: total });
  }

  let bestBill: { o: OfferRule; amount: number; pct: number } | null = null;
  for (const o of eligible.filter((x) => x.scope === 'BILL' && !x.exclusive)) {
    const remaining = base(o).reduce((s, e) => s + e.line.lineTotal, 0);
    const pct = percentFor(o);
    const amount = billAmount(o, remaining, pct);
    if (amount > (bestBill?.amount ?? 0)) bestBill = { o, amount, pct };
  }
  if (bestBill)
    applied.push({
      offerId: bestBill.o.id,
      name: labelFor(bestBill.o, bestBill.pct),
      discountAmount: bestBill.amount,
    });

  return applied.filter((a) => a.discountAmount > 0);
}
