import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AnalyticsSummary } from '../../core/models';
import { addDays, businessToday, shortDate } from '../../core/dates';
import { formatRupees } from '../../core/money';
import { ChartColumn, ChartSeries, ColumnChart } from '../../shared/column-chart';
import { RankBars, RankRow } from '../../shared/rank-bars';

type Preset = 'all' | 'today' | 'yesterday' | '3d' | '7d' | 'custom';

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;

@Component({
  selector: 'app-dashboard-page',
  imports: [FormsModule, ColumnChart, RankBars],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Dashboard</h1><p>{{ rangeLabel() }}</p></div>
        <button (click)="download()">⬇ Download bills (CSV)</button>
      </div>

      <div class="filters">
        <div class="chips">
          @for (p of presets; track p.id) {
            <button class="chip" [class.on]="preset() === p.id" (click)="choose(p.id)">{{ p.label }}</button>
          }
        </div>
        @if (preset() === 'custom') {
          <div class="row">
            <input type="date" [(ngModel)]="from" (change)="load()" aria-label="From" />
            <span class="muted">to</span>
            <input type="date" [(ngModel)]="to" (change)="load()" aria-label="To" />
          </div>
        }
      </div>

      @if (data(); as d) {
        <div class="stack" [class.loading]="loading()">
          @if (d.pending > 0) {
            <div class="notice">⚠ {{ d.pending }} bill{{ d.pending === 1 ? ' is' : 's are' }} waiting for payment and not counted below. Finish or cancel them in Bills.</div>
          }

          <div class="kpis">
            <div class="tile-stat hero">
              <span class="lbl">Total sales</span>
              <span class="val big">{{ money(d.kpis.total) }}</span>
              <span class="muted small">{{ d.kpis.bills }} paid bills</span>
            </div>
            <div class="tile-stat"><span class="lbl">Average bill</span><span class="val">{{ money(d.kpis.avgBill) }}</span></div>
            <div class="tile-stat"><span class="lbl"><i class="key k1"></i>Cash</span><span class="val">{{ money(d.kpis.cash) }}</span></div>
            <div class="tile-stat"><span class="lbl"><i class="key k2"></i>Online</span><span class="val">{{ money(d.kpis.online) }}</span></div>
            <div class="tile-stat"><span class="lbl">Discounts given</span><span class="val">{{ money(d.kpis.discountGiven) }}</span></div>
          </div>

          @if (!d.kpis.bills) {
            <div class="card empty"><span class="ico">📊</span><span>No paid bills in this period yet.</span></div>
          } @else {
            <section class="card">
              <div class="card-head">
                <h2>Sales by day</h2>
                <div class="seg">
                  <button [class.on]="!showTable()" (click)="showTable.set(false)">Chart</button>
                  <button [class.on]="showTable()" (click)="showTable.set(true)">Table</button>
                </div>
              </div>
              @if (showTable()) {
                <div class="table-wrap">
                  <table class="table">
                    <thead><tr><th>Day</th><th class="r">Bills</th><th class="r">Cash</th><th class="r">Online</th><th class="r">Total</th></tr></thead>
                    <tbody>
                      @for (x of d.daily; track x.date) {
                        <tr><td>{{ day(x.date) }}</td><td class="r num">{{ x.bills }}</td><td class="r num">{{ money(x.cash) }}</td>
                          <td class="r num">{{ money(x.online) }}</td><td class="r num"><b>{{ money(x.total) }}</b></td></tr>
                      }
                    </tbody>
                  </table>
                </div>
              } @else {
                <app-column-chart [columns]="dailyCols()" [series]="paySeries" unit="Daily sales" />
              }
            </section>

            <section class="card">
              <div class="card-head"><h2>Busiest hours</h2><span class="muted small">All selected days combined</span></div>
              <app-column-chart [columns]="hourCols()" [series]="oneSeries" unit="Sales by hour" />
            </section>

            <div class="two">
              <section class="card">
                <div class="card-head">
                  <h2>Top sellers</h2>
                  <div class="seg">
                    <button [class.on]="metric() === 'qty'" (click)="metric.set('qty')">Units</button>
                    <button [class.on]="metric() === 'revenue'" (click)="metric.set('revenue')">₹</button>
                  </div>
                </div>
                <app-rank-bars [rows]="topRows()" />
              </section>
              <section class="card">
                <div class="card-head"><h2>Slowest sellers</h2></div>
                <app-rank-bars [rows]="slowRows()" />
                <p class="muted small note">Only items that sold at least once. Stock → Prepare for tomorrow flags items with no sales.</p>
              </section>
            </div>

            <div class="two">
              <section class="card">
                <div class="card-head"><h2>Sales by category</h2></div>
                <app-rank-bars [rows]="catRows()" />
              </section>
              <section class="card">
                <div class="card-head"><h2>Offer impact</h2></div>
                <div class="table-wrap">
                  <table class="table">
                    <thead><tr><th>Offer</th><th class="r">Bills</th><th class="r">Given</th></tr></thead>
                    <tbody>
                      @for (o of d.offers; track o.name) {
                        <tr><td>{{ o.name }}</td><td class="r num">{{ o.bills }}</td><td class="r num">{{ money(o.discount) }}</td></tr>
                      } @empty { <tr><td colspan="3" class="muted">No offers used.</td></tr> }
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            <p class="muted small">Item and category figures are before bill-level discounts, so they can add up to slightly more than total sales.</p>

            <section class="card">
              <div class="card-head"><h2>Customers</h2></div>
              <div class="tiles cust">
                <div class="tile-stat"><span class="lbl">Customers</span><span class="val">{{ d.customers.total }}</span></div>
                <div class="tile-stat"><span class="lbl">Came once</span><span class="val">{{ d.customers.cameOnce }}</span></div>
                <div class="tile-stat"><span class="lbl">Came back</span><span class="val">{{ d.customers.cameBack }}</span></div>
              </div>
              <div class="table-wrap">
                <table class="table">
                  <thead><tr><th>Top spenders</th><th>Phone</th><th class="r">Bills</th><th class="r">Spent</th></tr></thead>
                  <tbody>
                    @for (c of d.customers.top; track c.phone) {
                      <tr><td>{{ c.name }}</td><td class="muted">{{ c.phone }}</td><td class="r num">{{ c.bills }}</td><td class="r num">{{ money(c.spent) }}</td></tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          }
        </div>
      } @else if (error()) {
        <div class="card empty"><span>{{ error() }}</span><button (click)="load()">Try again</button></div>
      } @else {
        <div class="card empty">Loading…</div>
      }
    </div>
  `,
  styles: [`
    .filters { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 18px; }
    .filters .chips { min-width: 0; }
    .filters .row input { width: auto; }
    .loading { opacity: .5; transition: opacity .15s; }
    .notice { background: var(--warn-soft); color: var(--warn); border-radius: var(--radius); padding: 12px 16px; font-weight: 600; font-size: .92rem; }
    .kpis { display: grid; grid-template-columns: 2fr repeat(4, 1fr); gap: 12px; }
    @media (max-width: 1000px) { .kpis { grid-template-columns: repeat(2, 1fr); } .hero { grid-column: span 2; } }
    .hero { background: linear-gradient(135deg, #b32a24, #6b1511); border: 1px solid rgba(245,184,61,.5); color: #fff8e8; }
    .hero .lbl, .hero .muted { color: rgba(255,248,232,.82); }
    .big { font-size: 2.6rem !important; line-height: 1.1; letter-spacing: -.02em; }
    .key { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: 0; }
    .k1 { background: var(--series-1); } .k2 { background: var(--series-2); }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 860px) { .two { grid-template-columns: 1fr; } }
    .cust { margin-bottom: 12px; }
    .note { margin-top: 10px; }
  `],
})
export class DashboardPage implements OnInit {
  private api = inject(ApiService);
  money = formatRupees;

  presets: { id: Preset; label: string }[] = [
    { id: 'all', label: 'Whole festival' }, { id: 'today', label: 'Today' }, { id: 'yesterday', label: 'Yesterday' },
    { id: '3d', label: 'Last 3 days' }, { id: '7d', label: 'Last 7 days' }, { id: 'custom', label: 'Custom' },
  ];
  paySeries: ChartSeries[] = [
    { name: 'Cash', color: 'var(--series-1)' },
    { name: 'Online', color: 'var(--series-2)' },
  ];
  oneSeries: ChartSeries[] = [{ name: 'Sales', color: 'var(--series-1)' }];

  preset = signal<Preset>('all');
  data = signal<AnalyticsSummary | null>(null);
  loading = signal(false);
  error = signal('');
  showTable = signal(false);
  metric = signal<'qty' | 'revenue'>('qty');
  from = '';
  to = '';

  day = shortDate;

  rangeLabel = computed(() => {
    const p = this.preset();
    if (p === 'all') return 'All days so far';
    if (!this.from) return '';
    return this.from === this.to ? shortDate(this.from) : `${shortDate(this.from)} – ${shortDate(this.to)}`;
  });

  dailyCols = computed<ChartColumn[]>(() =>
    (this.data()?.daily ?? []).map((x) => ({ label: shortDate(x.date), values: [x.cash, x.online] })));

  hourCols = computed<ChartColumn[]>(() => {
    const h = this.data()?.hourly ?? [];
    const used = h.filter((x) => x.bills > 0).map((x) => x.hour);
    if (!used.length) return [];
    const lo = Math.max(0, Math.min(...used) - 1), hi = Math.min(23, Math.max(...used) + 1);
    return h.filter((x) => x.hour >= lo && x.hour <= hi).map((x) => ({ label: hourLabel(x.hour), values: [x.total] }));
  });

  private sorted = computed(() => {
    const m = this.metric();
    return [...(this.data()?.products ?? [])].sort((a, b) => b[m] - a[m]);
  });
  private row = (p: { name: string; qty: number; revenue: number }): RankRow => {
    const byQty = this.metric() === 'qty';
    return {
      name: p.name, value: byQty ? p.qty : p.revenue,
      text: byQty ? `${p.qty}` : formatRupees(p.revenue),
      detail: byQty ? formatRupees(p.revenue) : `${p.qty} sold`,
    };
  };
  topRows = computed(() => this.sorted().slice(0, 8).map(this.row));
  slowRows = computed(() => [...this.sorted()].slice(-5).reverse().map(this.row));
  catRows = computed<RankRow[]>(() => {
    const cats = this.data()?.categories ?? [];
    const total = cats.reduce((s, c) => s + c.revenue, 0) || 1;
    return cats.map((c) => ({
      name: c.name, value: c.revenue,
      text: formatRupees(c.revenue), detail: `${Math.round((c.revenue / total) * 100)}% of item sales`,
    }));
  });

  ngOnInit() { this.load(); }

  choose(p: Preset) {
    this.preset.set(p);
    const today = businessToday();
    if (p === 'custom') { this.from ||= today; this.to ||= today; }
    else if (p === 'today') { this.from = today; this.to = today; }
    else if (p === 'yesterday') { this.from = this.to = addDays(today, -1); }
    else if (p === '3d') { this.from = addDays(today, -2); this.to = today; }
    else if (p === '7d') { this.from = addDays(today, -6); this.to = today; }
    else { this.from = ''; this.to = ''; }
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api.analytics(this.from || undefined, this.to || undefined).subscribe({
      next: (d) => { this.data.set(d); this.error.set(''); this.loading.set(false); },
      error: () => { this.error.set('Could not load analytics'); this.loading.set(false); },
    });
  }

  download() {
    this.api.exportCsv(this.from || undefined, this.to || undefined).subscribe((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bills-${this.from || 'all'}${this.to && this.to !== this.from ? '_to_' + this.to : ''}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
}
