import { Component, computed, inject, output } from '@angular/core';
import { CartService } from '../../core/cart.service';
import { formatRupees } from '../../core/money';

@Component({
  selector: 'app-cart-panel',
  template: `
    <div class="head">
      <h2>Current order</h2>
      @if (cart.count()) { <button class="ghost sm" (click)="cart.clear()">Clear</button> }
    </div>

    <div class="lines">
      @for (l of cart.lines(); track l.key) {
        <div class="line">
          @if (l.imageUrl) { <img class="thumb" [src]="l.imageUrl" alt="" /> } @else { <span class="thumb"></span> }
          <div class="info">
            <span class="nm">{{ l.name }}</span>
            <span class="muted small money">{{ money(l.price) }} each</span>
          </div>
          <div class="right">
            <span class="money amt">{{ money(l.price * l.qty) }}</span>
            <span class="qty-step">
              <button (click)="cart.change(l.key, -1)" [attr.aria-label]="'One less ' + l.name">−</button>
              <b>{{ l.qty }}</b>
              <button (click)="cart.change(l.key, 1)" [attr.aria-label]="'One more ' + l.name">+</button>
            </span>
          </div>
        </div>
      } @empty {
        <div class="empty">
          <span class="ico" aria-hidden="true">🛒</span>
          <span>Tap items on the menu to add them.</span>
        </div>
      }
    </div>

    @if (cart.count()) {
      <div class="totals" [class.stale]="cart.pricing()">
        <div class="t"><span>Subtotal</span><span class="money">{{ money(cart.subtotal()) }}</span></div>
        @for (o of offers(); track o.offerId) {
          <div class="t disc"><span>{{ o.name }}</span><span class="money">−{{ money(o.discountAmount) }}</span></div>
        }
        <div class="t grand"><span>Total</span><span class="money">{{ money(total()) }}</span></div>
      </div>
      <button class="primary lg block" (click)="checkout.emit()">Checkout · {{ money(total()) }}</button>
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
    .head { display: flex; align-items: center; justify-content: space-between; }
    .lines { display: grid; gap: 10px; overflow-y: auto; min-height: 0; flex: 1; align-content: start; padding-right: 2px; }
    .line { display: grid; grid-template-columns: 44px 1fr auto; gap: 10px; align-items: center; }
    .info { display: grid; min-width: 0; }
    .nm { font-weight: 600; font-size: .92rem; line-height: 1.25; }
    .right { display: grid; justify-items: end; gap: 4px; }
    .amt { font-weight: 700; }
    .totals { display: grid; gap: 6px; padding-top: 12px; border-top: 1px dashed var(--line-strong); transition: opacity .15s; }
    .totals.stale { opacity: .6; }
    .t { display: flex; justify-content: space-between; gap: 12px; font-size: .92rem; }
    .disc { color: var(--ok); font-size: .85rem; }
    .grand { font-size: 1.3rem; font-weight: 700; margin-top: 2px; }
  `],
})
export class CartPanel {
  cart = inject(CartService);
  checkout = output<void>();
  money = formatRupees;

  offers = computed(() => this.cart.priced()?.offers ?? []);
  total = computed(() => this.cart.priced()?.grandTotal ?? this.cart.subtotal());
}
