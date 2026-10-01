import { BadRequestException, Injectable } from '@nestjs/common';
import { CatalogCache } from '../catalog/catalog-cache.service';
import { applyOffers, EngineLine } from './offers.engine';

export interface CartLineInput {
  itemId?: number;
  comboId?: number;
  choiceItemIds?: number[];
  qty: number;
}

export interface PricedLine {
  itemId?: number;
  comboId?: number;
  choiceItemIds?: number[];
  nameSnapshot: string;
  unitPrice: number;
  qty: number;
  lineDiscount: number;
  lineTotal: number;
}

export interface AppliedOffer {
  offerId: number;
  name: string;
  discountAmount: number;
}

export interface PricedCart {
  lines: PricedLine[];
  offers: AppliedOffer[];
  subtotal: number;
  discountTotal: number;
  grandTotal: number;
}

/** Pure totals calculation; all amounts in paise. */
export function totalsFor(lines: PricedLine[], offers: AppliedOffer[]): PricedCart {
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const discountTotal = Math.min(
    subtotal,
    offers.reduce((s, o) => s + o.discountAmount, 0),
  );
  return { lines, offers, subtotal, discountTotal, grandTotal: subtotal - discountTotal };
}

@Injectable()
export class PricingService {
  constructor(private readonly catalog: CatalogCache) {}

  async calculate(cart: CartLineInput[]): Promise<PricedCart> {
    if (!cart.length) throw new BadRequestException('Cart is empty');

    const catalog = await this.catalog.get();
    const item = (id: number) => {
      const i = catalog.items.get(id);
      return i?.isActive ? i : undefined;
    };
    const comboById = (id: number) => {
      const c = catalog.combos.get(id);
      return c?.isActive ? c : undefined;
    };

    const lines: PricedLine[] = cart.map((l) => {
      if (!!l.itemId === !!l.comboId) {
        throw new BadRequestException('Each cart line needs exactly one of itemId or comboId');
      }
      if (l.itemId) {
        const it = item(l.itemId);
        if (!it) throw new BadRequestException('An item in the cart is unavailable');
        return {
          itemId: it.id,
          nameSnapshot: it.name,
          unitPrice: it.price,
          qty: l.qty,
          lineDiscount: 0,
          lineTotal: it.price * l.qty,
        };
      }
      const combo = comboById(l.comboId!);
      if (!combo) throw new BadRequestException('A combo in the cart is unavailable');
      const picks = l.choiceItemIds ?? [];
      let nameSnapshot = combo.name;
      if (combo.choiceCategoryId) {
        const picked = picks.map((id) => {
          const i = item(id);
          return i?.categoryId === combo.choiceCategoryId ? i : undefined;
        });
        if (picks.length !== combo.choiceQty || picked.some((i) => !i)) {
          throw new BadRequestException(`${combo.name}: pick ${combo.choiceQty} items from the menu`);
        }
        nameSnapshot = `${combo.name} (${picked.map((i) => i!.name).join(' + ')})`;
      } else if (picks.length) {
        throw new BadRequestException(`${combo.name} has fixed items`);
      }
      return {
        comboId: combo.id,
        choiceItemIds: picks,
        nameSnapshot,
        unitPrice: combo.price,
        qty: l.qty,
        lineDiscount: 0,
        lineTotal: combo.price * l.qty,
      };
    });

    const entries: EngineLine[] = lines.map((line) => ({
      line,
      categoryId: line.itemId ? item(line.itemId)?.categoryId : undefined,
    }));
    return totalsFor(lines, applyOffers(entries, catalog.offers));
  }
}
