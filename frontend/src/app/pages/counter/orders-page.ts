import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { businessToday, shortDate } from '../../core/dates';
import { DialogService } from '../../core/dialog.service';
import { Order } from '../../core/models';
import { formatRupees } from '../../core/money';
import { ToastService } from '../../core/toast.service';
import { Checkout } from './checkout';

type Filter = 'ALL' | 'PENDING' | 'PAID' | 'CANCELLED';

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
          <div class="bill" [class.open]="open() === o.id">
            <button class="bill-row ghost" (click)="open.set(open() === o.id ? null : o.id)" [attr.aria-expanded]="open() === o.id">
              <span class="no">#{{ o.billNo }}</span>
              <span class="who"><b>{{ o.customer.name }}</b><span class="muted small">{{ o.customer.phone }} · {{ o.createdAt | date: 'h:mm a' }}</span></span>
              <span class="st">
                @switch (o.status) {
                  @case ('PAID') { <span class="badge ok">{{ o.paymentMethod === 'CASH' ? 'Cash' : 'Online' }}</span> }
                  @case ('PENDING') { <span class="badge warn">Pending</span> }
                  @case ('CANCELLED') { <span class="badge">Cancelled</span> }
                }
              </span>
              <span class="amt money">{{ money(o.grandTotal) }}</span>
            </button>
            @if (open() === o.id) {
              <div class="detail">
                @for (l of o.lines; track $index) {
                  <div class="r"><span>{{ l.qty }} × {{ l.nameSnapshot }}</span><span class="money">{{ money(l.unitPrice * l.qty) }}</span></div>
                }
                @if (o.discountTotal) {
                  <div class="r disc"><span>Discounts</span><span class="money">−{{ money(o.discountTotal) }}</span></div>
                }
                @if (o.status === 'PENDING') {
                  <div class="form-actions">
                    <button class="danger sm" (click)="cancel(o)">Cancel bill</button>
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
    .bill-row { width: 100%; display: grid; grid-template-columns: 56px 1fr auto 90px; gap: 12px; align-items: center;
                padding: 12px 4px; border-radius: 0; text-align: left; font-weight: 400; white-space: normal; min-height: 0; }
    .no { font-weight: 700; color: var(--muted); }
    .who { display: grid; }
    .amt { text-align: right; font-weight: 700; font-size: 1.02rem; }
    .detail { display: grid; gap: 6px; padding: 4px 4px 14px 72px; }
    .r { display: flex; justify-content: space-between; font-size: .9rem; }
    .disc { color: var(--ok); }
    .seg { overflow-x: auto; max-width: 100%; }
    @media (max-width: 560px) {
      .bill-row { grid-template-columns: 1fr auto; }
      .no { display: none; }
      .st { grid-row: 2; }
      .amt { grid-row: 1; grid-column: 2; }
      .detail { padding-left: 4px; }
    }
  `],
})
export class OrdersPage implements OnInit {
  private api = inject(ApiService);
  private dialog = inject(DialogService);
  private toast = inject(ToastService);
  money = formatRupees;
  day = shortDate;
  today = businessToday();

  filters: { id: Filter; label: string }[] = [
    { id: 'ALL', label: 'All' }, { id: 'PENDING', label: 'Pending' }, { id: 'PAID', label: 'Paid' }, { id: 'CANCELLED', label: 'Cancelled' },
  ];
  date = signal(this.today);
  filter = signal<Filter>('ALL');
  orders = signal<Order[]>([]);
  loading = signal(false);
  open = signal<number | null>(null);
  resume = signal<Order | null>(null);

  paid = computed(() => this.orders().filter((o) => o.status === 'PAID'));
  total = computed(() => this.paid().reduce((s, o) => s + o.grandTotal, 0));
  shown = computed(() => (this.filter() === 'ALL' ? this.orders() : this.orders().filter((o) => o.status === this.filter())));

  ngOnInit() {
    this.load();
    // Pending bills are what staff come here for.
  }

  setDate(d: string) { if (d) { this.date.set(d); this.load(); } }

  load() {
    this.loading.set(true);
    this.api.orders(this.date()).subscribe({
      next: (o) => {
        this.orders.set(o);
        this.loading.set(false);
        if (this.filter() === 'ALL' && o.some((x) => x.status === 'PENDING')) this.filter.set('PENDING');
      },
      error: () => this.loading.set(false),
    });
  }

  countOf(f: Filter) { return f === 'ALL' ? 0 : this.orders().filter((o) => o.status === f).length; }

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
