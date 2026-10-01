import { Injectable } from '@nestjs/common';
import type { Combo, ComboItem, Item, Offer } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CatalogSnapshot {
  items: Map<number, Item>;
  combos: Map<number, Combo & { items: ComboItem[] }>;
  offers: Offer[];
  comboParts: ComboItem[];
}

/** Safety net if a write ever bypasses invalidate() (e.g. a second instance). */
const TTL_MS = 30_000;

/**
 * Menu + offers held in memory for pricing and stock deduction.
 * The cart is re-priced on every change from every device; without this each
 * preview costs 3 queries for data that changes a few times a night.
 * Writes through Menu/Offers clear it immediately (see InvalidateCatalog).
 */
@Injectable()
export class CatalogCache {
  private snap?: { at: number; data: CatalogSnapshot };
  private inflight?: Promise<CatalogSnapshot>;
  private generation = 0;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<CatalogSnapshot> {
    if (this.snap && Date.now() - this.snap.at < TTL_MS) return this.snap.data;
    // Concurrent callers share one load instead of each hitting the database.
    this.inflight ??= this.load().finally(() => (this.inflight = undefined));
    return this.inflight;
  }

  invalidate() {
    this.generation++;
    this.snap = undefined;
  }

  private async load(): Promise<CatalogSnapshot> {
    const gen = this.generation;
    const [items, combos, offers] = await Promise.all([
      this.prisma.item.findMany(),
      this.prisma.combo.findMany({ include: { items: true } }),
      this.prisma.offer.findMany(),
    ]);
    const data: CatalogSnapshot = {
      items: new Map(items.map((i) => [i.id, i])),
      combos: new Map(combos.map((c) => [c.id, c])),
      offers,
      comboParts: combos.flatMap((c) => c.items),
    };
    // A write that landed mid-load must not be overwritten by stale data.
    if (gen === this.generation) this.snap = { at: Date.now(), data };
    return data;
  }
}
