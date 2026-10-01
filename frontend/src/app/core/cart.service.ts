import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, of, switchMap } from 'rxjs';
import { ApiService } from './api.service';
import { CartLine, PricedCart } from './models';

@Injectable({ providedIn: 'root' })
export class CartService {
  private api = inject(ApiService);

  readonly lines = signal<CartLine[]>([]);
  readonly count = computed(() => this.lines().reduce((n, l) => n + l.qty, 0));
  readonly subtotal = computed(() => this.lines().reduce((s, l) => s + l.price * l.qty, 0));

  /** Server-priced cart (offers applied), refreshed shortly after every change. */
  readonly priced = signal<PricedCart | null>(null);
  readonly pricing = signal(false);

  constructor() {
    toObservable(this.lines)
      .pipe(
        debounceTime(250),
        switchMap((ls) => {
          if (!ls.length) return of(null);
          this.pricing.set(true);
          return this.api.preview(this.payload(), true).pipe(catchError(() => of(null)));
        }),
      )
      .subscribe((p) => { this.priced.set(p); this.pricing.set(false); });
  }

  add(p: { itemId?: number; comboId?: number; choiceItemIds?: number[]; name: string; price: number; imageUrl?: string | null }) {
    // Same combo with different picks is a separate line.
    const key = p.itemId ? `i${p.itemId}` : `c${p.comboId}:${[...(p.choiceItemIds ?? [])].sort().join(',')}`;
    this.lines.update((ls) =>
      ls.some((l) => l.key === key)
        ? ls.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l))
        : [...ls, { key, ...p, qty: 1 }],
    );
  }

  change(key: string, delta: number) {
    this.lines.update((ls) =>
      ls.map((l) => (l.key === key ? { ...l, qty: Math.min(999, l.qty + delta) } : l)).filter((l) => l.qty > 0),
    );
  }

  qtyOf(key: string) { return this.lines().find((l) => l.key === key)?.qty ?? 0; }

  clear() { this.lines.set([]); this.priced.set(null); }

  /** Wire format for the API. */
  payload() {
    return this.lines().map((l) => ({ itemId: l.itemId, comboId: l.comboId, choiceItemIds: l.choiceItemIds, qty: l.qty }));
  }
}
