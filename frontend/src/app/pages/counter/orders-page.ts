import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { businessToday, shortDate } from '../../core/dates';
import { DialogService } from '../../core/dialog.service';
import { Order } from '../../core/models';
import { formatRupees } from '../../core/money';
import { ToastService } from '../../core/toast.service';
import { Checkout } from './checkout';

type Filter = 'TODO' | 'ALL' | 'PENDING' | 'PAID' | 'CANCELLED';

/** Other devices' ticks show up without pressing Refresh. */
const REFRESH_MS = 20_000;

const toServe = (o: Order) => o.status !== 'CANCELLED' && !o.servedAt;

@Component({
  selector: 'app-orders-page',
  imports: [FormsModule, DatePipe, Checkout],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Bills</h1>
          <p>{{ date() === today ? 'Today' : day(date()) }} · the day runs until 5 am</p>
        </div>
        <div class="row">
          <input type="date" [max]="today" [ngModel]="date()" (ngModelChange)="setDate($event)" aria-label="Day" />
          <button (click)="load()" [disabled]="loading()">Refresh</button>
        </div>
      </div>

      <div class="tiles">
        <div class="tile-stat todo"><span class="lbl">To serve</span><span class="val">{{ countOf('TODO') }}</span></div>
        <div class="tile-stat"><span class="lbl">Collected</span><span class="val">{{ money(total()) }}</span></div>
        <div class="tile-stat"><span class="lbl">Cash</span><span class="val">{{ money(byMethod('CASH')) }}</span></div>
        <div class="tile-stat"><span class="lbl">Online</span><span class="val">{{ money(byMethod('ONLINE')) }}</span></div>
        <div class="tile-stat"><span class="lbl">Paid bills</span><span class="val">{{ paid().length }}</span></div>
      </div>

      <div class="card list">
        <div class="card-head">
          <div class="seg" role="tablist">
            @for (f of filters; track f.id) {
              <button role="tab" [class.on]="filter() === f.id" (click)="filter.set(f.id)">
                {{ f.label }} @if (countOf(f.id)) { <span class="muted">{{ countOf(f.id) }}</span> }
              </button>
            }
          </div>
        </div>

        @for (o of shown(); track o.id) {
          <div class="bill" [class.open]="open() === o.id" [class.served]="o.servedAt">
            <div class="line">
            @if (o.status !== 'CANCELLED') {
              <label class="tick" [title]="o.servedAt ? 'Served, tap to undo' : 'Mark as served'">
                <input type="checkbox" [checked]="!!o.servedAt" (change)="toggleServed(o)"
                       [attr.aria-label]="(o.servedAt ? 'Unmark' : 'Mark') + ' bill ' + o.billNo + ' as served'" />
                <span aria-hidden="true">✓</span>
              </label>
            } @else { <span class="tick-gap"></span> }
            <button class="bill-row ghost" (click)="open.set(open() === o.id ? null : o.id)" [attr.aria-expanded]="open() === o.id">
              <span class="no">#{{ o.billNo }}</span>
              <span class="who"><b>{{ o.customer.name }}</b><span class="muted small">{{ o.customer.phone }} · {{ o.createdAt | date: 'h:mm a' }}</span></span>
              <span class="st">
                @switch (o.status) {
                  @case ('PAID') { <span class="badge ok">{{ o.paymentMethod === 'CASH' ? 'Cash' : 'Online' }}</span> }
                  @case ('PENDING') { <span class="badge warn">Pending</span> }
                  @case ('CANCELLED') { <span class="badge">Cancelled</span> }
                }
                @if (o.servedAt) { <span class="badge served">Served</span> }
              </span>
              <span class="amt money">{{ money(o.grandTotal) }}</span>
            </button>
            </div>
            @if (open() === o.id) {
              <div class="detail">
                @for (l of o.lines; track $index) {
                  <div class="r"><span>{{ l.qty }} × {{ l.nameSnapshot }}</span><span class="money">{{ money(l.unitPrice * l.qty) }}</span></div>
                }
                @if (o.discountTotal) {
                  <div class="r disc"><span>Discounts</span><span class="money">−{{ money(o.discountTotal) }}</span></div>
                }
                @if (o.servedAt) {
                  <p class="muted small">Served{{ o.servedBy ? ' by ' + o.servedBy.name : '' }} at {{ o.servedAt | date: 'h:mm a' }}</p>
                }
                @if (o.status === 'PENDING') {
                  <div class="form-actions">
                    @if (!o.servedAt) { <button class="danger sm" (click)="cancel(o)">Cancel bill</button> }
                    <button class="primary sm" (click)="resume.set(o)">Take payment</button>
                  </div>
                }
              </div>
            }
          </div>
        } @empty {
          <div class="empty"><span class="ico">🧾</span><span>{{ loading() ? 'Loading…' : 'No bills here.' }}</span></div>
        }
      </div>
    </div>

    @if (resume(); as o) {
      <app-checkout [resume]="o" (closed)="resume.set(null); load()" (finished)="resume.set(null); load()" />
    }
  `,
  styles: [`
    .tiles { margin-bottom: 16px; }
    .list { padding: 12px 18px; }
    .bill { border-bottom: 1px solid var(--line); }
    .bill:last-child { border-bottom: 0; }
    .line { display: grid; grid-template-columns: 52px 1fr; align-items: center; }
    .tick { position: relative; width: 42px; height: 42px; cursor: pointer; }
    .tick input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
    .tick span { position: absolute; inset: 0; display: grid; place-items: center; border-radius: 12px; border: 2px solid var(--line-strong);
                 background: var(--field); color: transparent; font-size: 1.35rem; font-weight: 700; transition: background .12s, border-color .12s, color .12s; }
    .tick:hover span { border-color: var(--green); }
    .tick input:checked + span { background: var(--green); border-color: var(--green); color: #fff8e8; }
    .tick input:focus-visible + span { box-shadow: var(--focus); }
    .tick-gap { width: 42px; }
    .bill.served .who, .bill.served .no, .bill.served .amt { opacity: .55; }
    .badge.served { background: var(--green); color: #fff8e8; }
    .st { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
    .todo { border: 2px solid var(--brand); }
    .bill-row { width: 100%; display: grid; grid-template-columns: 56px 1fr auto 90px; gap: 12px; align-items: center;
                padding: 12px 4px; border-radius: 0; text-align: left; font-weight: 400; white-space: normal; min-height: 0; }
    .no { font-weight: 700; color: var(--muted); }
    .who { display: grid; }
    .amt { text-align: right; font-weight: 700; font-size: 1.02rem; }
    .detail { display: grid; gap: 6px; padding: 4px 4px 14px 124px; }
    .r { display: flex; justify-content: space-between; font-size: .9rem; }
    .disc { color: var(--ok); }
    .seg { overflow-x: auto; max-width: 100%; }
    @media (max-width: 560px) {
      .bill-row { grid-template-columns: 1fr auto; }
      .no { display: none; }
      .st { grid-row: 2; justify-content: flex-start; }
      .amt { grid-row: 1; grid-column: 2; }
      .detail { padding-left: 56px; }
    }
  `],
})
export class OrdersPage implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private dialog = inject(DialogService);
  private toast = inject(ToastService);
  money = formatRupees;
  day = shortDate;
  today = businessToday();

  filters: { id: Filter; label: string }[] = [
    { id: 'TODO', label: 'To serve' }, { id: 'ALL', label: 'All' }, { id: 'PENDING', label: 'Pending' }, { id: 'PAID', label: 'Paid' }, { id: 'CANCELLED', label: 'Cancelled' },
  ];
  date = signal(this.today);
  filter = signal<Filter>('TODO');
  orders = signal<Order[]>([]);
  loading = signal(false);
  open = signal<number | null>(null);
  resume = signal<Order | null>(null);

  paid = computed(() => this.orders().filter((o) => o.status === 'PAID'));
  total = computed(() => this.paid().reduce((s, o) => s + o.grandTotal, 0));
  shown = computed(() => {
    const f = this.filter();
    if (f === 'ALL') return this.orders();
    // Oldest first in the queue: that's the next order to hand over.
    if (f === 'TODO') return this.orders().filter(toServe).reverse();
    return this.orders().filter((o) => o.status === f);
  });

  private timer?: ReturnType<typeof setInterval>;
  private firstLoad = true;

  ngOnInit() {
    this.load();
    this.timer = setInterval(() => this.refresh(), REFRESH_MS);
  }

  ngOnDestroy() { clearInterval(this.timer); }

  /** Background refresh: quiet, and skipped while a payment is being taken. */
  private refresh() {
    if (this.resume() || this.loading()) return;
    this.api.orders(this.date(), true).subscribe({ next: (o) => this.orders.set(o), error: () => {} });
  }

  setDate(d: string) { if (d) { this.date.set(d); this.load(); } }

  load() {
    this.loading.set(true);
    this.api.orders(this.date()).subscribe({
      next: (o) => {
        this.orders.set(o);
        this.loading.set(false);
        // Open on the queue; if nothing is waiting to be served, show everything instead.
        if (this.firstLoad && !o.some(toServe)) this.filter.set('ALL');
        this.firstLoad = false;
      },
      error: () => this.loading.set(false),
    });
  }

  countOf(f: Filter) {
    if (f === 'ALL') return 0;
    return this.orders().filter((o) => (f === 'TODO' ? toServe(o) : o.status === f)).length;
  }

  toggleServed(o: Order) {
    const served = !o.servedAt;
    // Show the tick immediately; the server's answer (who/when) replaces it.
    this.patchLocal(o.id, { servedAt: served ? new Date().toISOString() : null, servedBy: null });
    this.api.setServed(o.id, served).subscribe({
      next: (fresh) => {
        this.patchLocal(o.id, fresh);
        if (served) this.toast.ok(`Bill #${o.billNo} served`);
      },
      error: () => this.load(),
    });
  }

  private patchLocal(id: number, change: Partial<Order>) {
    this.orders.update((os) => os.map((x) => (x.id === id ? { ...x, ...change } : x)));
  }

  byMethod(m: 'CASH' | 'ONLINE') {
    return this.paid().filter((o) => o.paymentMethod === m).reduce((s, o) => s + o.grandTotal, 0);
  }

  async cancel(o: Order) {
    const ok = await this.dialog.confirm({
      title: `Cancel bill #${o.billNo}?`, message: `${o.customer.name} · ${formatRupees(o.grandTotal)}. This cannot be undone.`,
      okLabel: 'Cancel bill', danger: true,
    });
    if (!ok) return;
    this.api.cancelOrder(o.id).subscribe(() => { this.toast.ok(`Bill #${o.billNo} cancelled`); this.load(); });
  }
}
