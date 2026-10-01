import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { CartService } from '../../core/cart.service';
import { randomId } from '../../core/ids';
import { Order, PricedCart } from '../../core/models';
import { formatRupees, toPaise } from '../../core/money';

type Step = 'customer' | 'review' | 'method' | 'cash' | 'qr' | 'done';
const STEPS: { key: Step[]; label: string }[] = [
  { key: ['customer'], label: 'Customer' },
  { key: ['review'], label: 'Bill' },
  { key: ['method', 'cash', 'qr'], label: 'Payment' },
];

@Component({
  selector: 'app-checkout',
  imports: [FormsModule],
  template: `
    <div class="backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-label="Checkout">
        @if (step() !== 'done') {
          <div class="modal-head">
            <ol class="steps">
              @for (s of steps; track s.label; let i = $index) {
                <li [class.on]="stepIndex() === i" [class.past]="stepIndex() > i"><span>{{ i + 1 }}</span>{{ s.label }}</li>
              }
            </ol>
            @if (!order()) { <button class="ghost icon" (click)="closed.emit()" aria-label="Close">✕</button> }
          </div>
        }

        @switch (step()) {
          @case ('customer') {
            <form class="form-grid" (ngSubmit)="toReview()">
              <h2>Who is this order for?</h2>
              <label class="field">Mobile number
                <input name="ph" type="tel" inputmode="numeric" maxlength="14" [(ngModel)]="phone" (ngModelChange)="lookup()"
                       placeholder="10-digit number" autocomplete="off" required />
              </label>
              <label class="field">Name
                <input name="nm" [(ngModel)]="name" autocomplete="off" maxlength="80" required />
                @if (returning()) { <span class="hint">★ Returning customer</span> }
              </label>
              @if (error()) { <p class="error small">{{ error() }}</p> }
              <div class="form-actions">
                <button type="button" (click)="closed.emit()">Back to menu</button>
                <button class="primary" [disabled]="busy()">Review bill →</button>
              </div>
            </form>
          }
          @case ('review') {
            <div class="bill">
              <div class="bill-head">
                <h2>Bill</h2>
                <span class="muted small">{{ name }} · {{ digits() }}</span>
              </div>
              @if (priced(); as p) {
                <div class="rows">
                  @for (l of p.lines; track $index) {
                    <div class="r"><span>{{ l.qty }} × {{ l.nameSnapshot }}</span><span class="money">{{ money(l.unitPrice * l.qty) }}</span></div>
                  }
                  @if (p.offers.length) {
                    <hr class="sep" />
                    <div class="r sub"><span>Subtotal</span><span class="money">{{ money(p.subtotal) }}</span></div>
                    @for (o of p.offers; track o.offerId) {
                      <div class="r disc"><span>{{ o.name }}</span><span class="money">−{{ money(o.discountAmount) }}</span></div>
                    }
                  }
                  <div class="r total"><span>Total</span><span class="money">{{ money(p.grandTotal) }}</span></div>
                </div>
              }
            </div>
            <div class="form-actions">
              <button (click)="step.set('customer')">← Back</button>
              <button class="primary lg" [disabled]="busy()" (click)="createThenPay()">{{ busy() ? 'Saving…' : 'Take payment' }}</button>
            </div>
          }
          @case ('method') {
            <div class="amount">
              <span class="muted">Bill #{{ order()!.billNo }} · {{ order()!.customer.name }}</span>
              <span class="big money">{{ money(order()!.grandTotal) }}</span>
            </div>
            <div class="methods">
              <button class="method" (click)="step.set('cash')"><span class="ico">💵</span>Cash</button>
              <button class="method" (click)="step.set('qr')"><span class="ico">📱</span>Online / UPI</button>
            </div>
            <div class="form-actions split">
              <button class="danger" (click)="cancelOrder()" [disabled]="busy()">Cancel bill</button>
              <!-- The bill exists now: leaving must not keep the cart, or a second checkout would duplicate it. -->
              <button (click)="finished.emit()">Pay later</button>
            </div>
          }
          @case ('cash') {
            <div class="amount">
              <span class="muted">Collect cash</span>
              <span class="big money">{{ money(order()!.grandTotal) }}</span>
            </div>
            <label class="field">Cash received (optional)
              <input type="number" inputmode="decimal" min="0" [(ngModel)]="received" placeholder="₹" />
            </label>
            <div class="quick">
              @for (n of quickNotes(); track n) { <button class="sm" (click)="received = n">₹{{ n }}</button> }
            </div>
            @if (change() !== null) {
              <div class="change" [class.short]="change()! < 0">
                @if (change()! >= 0) { Return <b class="money">{{ money(change()!) }}</b> } @else { Short by <b class="money">{{ money(-change()!) }}</b> }
              </div>
            }
            <div class="form-actions">
              <button (click)="step.set('method')">← Back</button>
              <button class="primary lg" [disabled]="busy() || (change() !== null && change()! < 0)" (click)="confirm('CASH')">Cash received</button>
            </div>
          }
          @case ('qr') {
            <div class="amount">
              <span class="muted">Scan &amp; pay</span>
              <span class="big money">{{ money(order()!.grandTotal) }}</span>
            </div>
            <div class="qr-box">
              @if (qrUrl()) { <img class="qr" [src]="qrUrl()" alt="Payment QR code" /> }
              @else { <p class="error">No QR uploaded yet. Admin → Settings.</p> }
              @if (upi()) { <span class="upi">{{ upi() }}</span> }
            </div>
            <p class="muted small center">Check the payment arrived on your phone before confirming.</p>
            <div class="form-actions">
              <button (click)="step.set('method')">← Back</button>
              <button class="primary lg" [disabled]="busy()" (click)="confirm('ONLINE')">Payment received</button>
            </div>
          }
          @case ('done') {
            <div class="done">
              <span class="tick" aria-hidden="true">✓</span>
              <h2>Paid · Bill #{{ order()!.billNo }}</h2>
              <p class="muted"><span class="money">{{ money(order()!.grandTotal) }}</span> · {{ order()!.paymentMethod === 'CASH' ? 'Cash' : 'Online' }} · {{ order()!.customer.name }}</p>
              <div class="done-actions">
                <button class="green lg" [disabled]="busy()" (click)="servedNow()">✓ Served now</button>
                <button class="primary lg" (click)="finished.emit()">New order</button>
              </div>
              <p class="muted small">Not handed over yet? Tick it in Bills when it's served.</p>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    .steps { display: flex; gap: 6px; list-style: none; margin: 0; padding: 0; flex-wrap: wrap; }
    .steps li { display: flex; align-items: center; gap: 6px; font-size: .8rem; font-weight: 600; color: var(--muted); }
    .steps li + li::before { content: ''; width: 14px; height: 1px; background: var(--line-strong); margin-right: 2px; }
    .steps span { width: 20px; height: 20px; border-radius: 999px; display: grid; place-items: center; background: var(--surface-3); font-size: .72rem; }
    .steps li.on { color: var(--ink); }
    .steps li.on span { background: var(--brand); color: var(--brand-ink); }
    .steps li.past span { background: var(--ok-soft); color: var(--ok); }
    .bill { background: var(--surface-2); border-radius: var(--radius); padding: 16px; display: grid; gap: 12px; }
    .bill-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
    .rows { display: grid; gap: 8px; }
    .r { display: flex; justify-content: space-between; gap: 16px; font-size: .95rem; }
    .sub { color: var(--muted); }
    .disc { color: var(--ok); font-size: .88rem; }
    .total { font-size: 1.35rem; font-weight: 700; border-top: 1px solid var(--line-strong); padding-top: 10px; margin-top: 4px; }
    .amount { display: grid; justify-items: center; gap: 2px; padding: 4px 0; }
    .big { font-size: 2.6rem; font-weight: 700; letter-spacing: -.02em; color: var(--red); }
    .methods { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .method { flex-direction: column; min-height: 110px; font-size: 1.05rem; border-radius: var(--radius); border-width: 2px; }
    .method:hover { border-color: var(--brand); background: var(--brand-soft); }
    .method .ico { font-size: 2rem; }
    .split { justify-content: space-between; }
    .quick { display: flex; gap: 8px; flex-wrap: wrap; }
    .change { padding: 12px 14px; border-radius: var(--radius-sm); background: var(--ok-soft); color: var(--ok); font-size: 1.05rem; }
    .change.short { background: var(--danger-soft); color: var(--danger); }
    .qr-box { display: grid; justify-items: center; gap: 8px; background: #fff; border-radius: var(--radius); padding: 16px; border: 1px solid var(--line); }
    .qr { width: min(280px, 70vw); aspect-ratio: 1; object-fit: contain; }
    .upi { font-weight: 700; color: #2b1710; font-size: .95rem; }
    .center { text-align: center; }
    .done { display: grid; justify-items: center; text-align: center; gap: 10px; padding: 8px 0; }
    .tick { width: 72px; height: 72px; border-radius: 999px; background: var(--ok); color: #fff; font-size: 2.4rem; font-weight: 700;
            display: grid; place-items: center; animation: pop .25s ease-out; }
    .done-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; margin-top: 8px; }
  `],
})
export class Checkout implements OnInit {
  private api = inject(ApiService);
  private cart = inject(CartService);

  /** Resume payment for an order that already exists (PENDING). */
  resume = input<Order | null>(null);
  closed = output<void>();
  finished = output<void>();

  steps = STEPS;
  step = signal<Step>('customer');
  stepIndex = computed(() => STEPS.findIndex((s) => s.key.includes(this.step())));
  order = signal<Order | null>(null);
  priced = signal<PricedCart | null>(null);
  qrUrl = signal('');
  upi = signal('');
  error = signal('');
  busy = signal(false);
  returning = signal(false);
  name = '';
  phone = '';
  received: number | null = null;
  money = formatRupees;
  /** One id per checkout: a retried "Take payment" returns the same bill. */
  private clientRef = randomId();

  digits = () => this.phone.replace(/\D/g, '').slice(-10);

  change = () => {
    if (this.received === null || this.received === undefined || (this.received as unknown) === '') return null;
    return toPaise(this.received) - this.order()!.grandTotal;
  };

  quickNotes = computed(() => {
    const total = (this.order()?.grandTotal ?? 0) / 100;
    const notes = [50, 100, 200, 500].map((n) => Math.ceil(total / n) * n);
    return [...new Set(notes)].filter((n) => n >= total).slice(0, 4);
  });

  ngOnInit() {
    this.api.settings().subscribe((s) => { this.qrUrl.set(s.paymentQrUrl); this.upi.set(s.upiId); });
    const existing = this.resume();
    if (existing) { this.order.set(existing); this.step.set('method'); }
  }

  lookup() {
    const d = this.digits();
    this.returning.set(false);
    if (d.length !== 10) return;
    this.api.customerByPhone(d).subscribe((c) => {
      if (!c) return;
      this.returning.set(true);
      if (!this.name.trim()) this.name = c.name;
    });
  }

  toReview() {
    this.error.set('');
    if (this.digits().length !== 10) { this.error.set('Enter a 10-digit mobile number'); return; }
    if (!this.name.trim()) { this.error.set('Enter the customer name'); return; }
    this.busy.set(true);
    this.api.preview(this.cart.payload()).subscribe({
      next: (p) => { this.busy.set(false); this.priced.set(p); this.step.set('review'); },
      error: () => this.busy.set(false),
    });
  }

  createThenPay() {
    this.busy.set(true);
    this.api.createOrder({ customerName: this.name.trim(), phone: this.digits(), clientRef: this.clientRef, lines: this.cart.payload() })
      .subscribe({
        next: (o) => { this.busy.set(false); this.order.set(o); this.step.set('method'); },
        error: () => this.busy.set(false),
      });
  }

  confirm(method: 'CASH' | 'ONLINE') {
    this.busy.set(true);
    this.api.payOrder(this.order()!.id, method).subscribe({
      next: (o) => { this.busy.set(false); this.order.set(o); this.step.set('done'); },
      error: () => this.busy.set(false),
    });
  }

  /** For orders handed over straight away at the counter. */
  servedNow() {
    this.busy.set(true);
    this.api.setServed(this.order()!.id, true).subscribe({
      next: () => { this.busy.set(false); this.finished.emit(); },
      error: () => this.busy.set(false),
    });
  }

  cancelOrder() {
    this.busy.set(true);
    this.api.cancelOrder(this.order()!.id).subscribe({
      next: () => { this.busy.set(false); this.finished.emit(); },
      error: () => this.busy.set(false),
    });
  }
}
