import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

  async calculate(cart: CartLineInput[]): Promise<PricedCart> {
    if (!cart.length) throw new BadRequestException('Cart is empty');

    const itemIds = [
      ...cart.filter((l) => l.itemId).map((l) => l.itemId!),
      ...cart.flatMap((l) => l.choiceItemIds ?? []),
    ];
    const comboIds = cart.filter((l) => l.comboId).map((l) => l.comboId!);
    const [items, combos] = await Promise.all([
      this.prisma.item.findMany({ where: { id: { in: itemIds }, isActive: true } }),
      this.prisma.combo.findMany({ where: { id: { in: comboIds }, isActive: true } }),
    ]);

    const lines: PricedLine[] = cart.map((l) => {
      if (!!l.itemId === !!l.comboId) {
        throw new BadRequestException('Each cart line needs exactly one of itemId or comboId');
      }
      if (l.itemId) {
        const item = items.find((i) => i.id === l.itemId);
        if (!item) throw new BadRequestException('An item in the cart is unavailable');
        return {
          itemId: item.id,
          nameSnapshot: item.name,
          unitPrice: item.price,
          qty: l.qty,
          lineDiscount: 0,
          lineTotal: item.price * l.qty,
        };
      }
      const combo = combos.find((c) => c.id === l.comboId);
      if (!combo) throw new BadRequestException('A combo in the cart is unavailable');
      const picks = l.choiceItemIds ?? [];
      let nameSnapshot = combo.name;
      if (combo.choiceCategoryId) {
        const picked = picks.map((id) =>
          items.find((i) => i.id === id && i.categoryId === combo.choiceCategoryId),
        );
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
      categoryId: line.itemId ? items.find((i) => i.id === line.itemId)?.categoryId : undefined,
    }));
    const offers = await this.prisma.offer.findMany({ where: { isActive: true } });
    return totalsFor(lines, applyOffers(entries, offers));
  }
}
