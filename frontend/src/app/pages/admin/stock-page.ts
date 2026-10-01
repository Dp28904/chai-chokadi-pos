import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { RecommendationResult, StockMove, StockRow } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { shortDate } from '../../core/dates';

type Action = 'restock' | 'wastage' | 'count';
const ACTION_LABEL: Record<Action, string> = { restock: 'Added', wastage: 'Wasted', count: 'Counted' };

@Component({
  selector: 'app-stock-page',
  imports: [FormsModule, DatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Stock</h1><p>Sales reduce stock automatically when a bill is paid.</p></div>
        @if (lowCount()) { <span class="badge warn">{{ lowCount() }} running low</span> }
      </div>

      <div class="layout">
        <section class="card">
          <div class="card-head"><h2>In stock</h2></div>
          @if (rows().length) {
            <div class="table-wrap">
              <table class="table">
                <thead><tr><th>Item</th><th class="r">Qty</th><th>Update</th></tr></thead>
                <tbody>
                  @for (r of rows(); track r.id) {
                    <tr>
                      <td><b>{{ r.name }}</b>
                        @if (r.low) { <span class="badge warn">Low</span> }
                        <div class="muted small">Alert at {{ r.lowStockAt }}</div></td>
                      <td class="r"><span class="qty" [class.low]="r.low">{{ r.qtyOnHand }}</span></td>
                      <td>
                        <form class="act" (ngSubmit)="apply(r)">
                          <select [name]="'a' + r.id" [(ngModel)]="action[r.id]" aria-label="Action">
                            <option value="restock">+ Add</option>
                            <option value="wastage">− Waste</option>
                            <option value="count">= Set to</option>
                          </select>
                          <input [name]="'q' + r.id" type="number" min="0" inputmode="numeric" [(ngModel)]="qty[r.id]" placeholder="Qty" aria-label="Quantity" />
                          <button class="sm primary" [disabled]="qty[r.id] === null || qty[r.id] === undefined">Save</button>
                        </form>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty"><span class="ico">📦</span>
              <span>No items track stock yet. Edit an item in Menu and tick "Track stock".</span></div>
          }
        </section>

        <section class="card">
          <div class="card-head">
            <div><h2>Prepare for tomorrow</h2>
              @if (recs()?.basedOnDays?.length) { <p class="muted small">From the last {{ recs()!.basedOnDays.length }} trading day(s), +15% buffer</p> }</div>
            <div class="seg" role="radiogroup" aria-label="Expected demand">
              @for (p of peaks; track p.v) {
                <button role="radio" [attr.aria-checked]="peak() === p.v" [class.on]="peak() === p.v" (click)="setPeak(p.v)">{{ p.label }}</button>
              }
            </div>
          </div>
          @if (recs(); as r) {
            @if (!r.basedOnDays.length) {
              <div class="empty"><span class="ico">📈</span><span>Suggestions appear after the first day of sales.</span></div>
            } @else {
              <div class="table-wrap">
                <table class="table">
                  <thead><tr><th>Item</th><th class="r">Avg / day</th><th class="r">Have</th><th class="r">Prepare</th></tr></thead>
                  <tbody>
                    @for (i of r.items; track i.id) {
                      <tr [class.dim]="i.slow">
                        <td>{{ i.name }} @if (i.slow) { <span class="badge">No sales</span> }</td>
                        <td class="r num">{{ i.avgDaily }}</td>
                        <td class="r num">{{ i.tracked ? i.onHand : '—' }}</td>
                        <td class="r"><b class="num prep" [class.zero]="!i.toPrepare">{{ i.toPrepare }}</b></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }
        </section>
      </div>

      <section class="card moves">
        <div class="card-head"><h2>Recent changes</h2></div>
        @for (m of moves(); track m.id) {
          <div class="move">
            <span class="badge" [class.ok]="m.change > 0" [class.danger]="m.reason === 'WASTAGE'">{{ reason(m.reason) }}</span>
            <span class="grow">{{ m.item.name }}</span>
            <b class="num">{{ m.change > 0 ? '+' : '' }}{{ m.change }}</b>
            <span class="muted small">{{ m.createdAt | date: 'd MMM, h:mm a' }}</span>
          </div>
        } @empty { <p class="muted">Nothing yet.</p> }
      </section>
    </div>
  `,
  styles: [`
    .layout { display: grid; grid-template-columns: 1.1fr 1fr; gap: 16px; align-items: start; margin-bottom: 16px; }
    @media (max-width: 980px) { .layout { grid-template-columns: 1fr; } }
    .act { display: grid; grid-template-columns: 110px 80px auto; gap: 6px; }
    .act select, .act input { min-height: 34px; padding: 5px 8px; font-size: .88rem; }
    .qty { font-weight: 700; font-size: 1.1rem; font-variant-numeric: tabular-nums; }
    .qty.low { color: var(--warn); }
    .prep { font-size: 1.1rem; color: var(--brand-text); }
    .prep.zero { color: var(--muted); font-weight: 400; }
    .moves { display: grid; }
    .move { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-top: 1px solid var(--line); font-size: .92rem; }
    .grow { flex: 1; }
  `],
})
export class StockPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  rows = signal<StockRow[]>([]);
  moves = signal<StockMove[]>([]);
  recs = signal<RecommendationResult | null>(null);
  peak = signal(1);
  lowCount = computed(() => this.rows().filter((r) => r.low).length);
  qty: Record<number, number | null> = {};
  action: Record<number, Action> = {};
  day = shortDate;
  peaks = [{ v: 0.8, label: 'Slow' }, { v: 1, label: 'Normal' }, { v: 1.3, label: 'Busy' }, { v: 1.5, label: 'Peak' }];

  ngOnInit() { this.reload(); }

  reload() {
    this.api.stock().subscribe((r) => { this.rows.set(r); r.forEach((x) => (this.action[x.id] ??= 'restock')); });
    this.api.stockMoves().subscribe((m) => this.moves.set(m));
    this.api.recommendations(this.peak()).subscribe((r) => this.recs.set(r));
  }

  setPeak(v: number) {
    this.peak.set(v);
    this.api.recommendations(v).subscribe((r) => this.recs.set(r));
  }

  reason(r: string) { return ({ RESTOCK: 'Added', WASTAGE: 'Wasted', ADJUST: 'Count fix', SALE: 'Sold' } as Record<string, string>)[r] ?? r; }

  apply(r: StockRow) {
    const q = Number(this.qty[r.id]);
    const a = this.action[r.id];
    if (!Number.isInteger(q) || q < (a === 'count' ? 0 : 1)) { this.toast.error('Enter a whole number'); return; }
    const req = a === 'restock' ? this.api.restock(r.id, q) : a === 'wastage' ? this.api.wastage(r.id, q) : this.api.countStock(r.id, q);
    req.subscribe(() => { this.qty[r.id] = null; this.toast.ok(`${ACTION_LABEL[a]} · ${r.name}`); this.reload(); });
  }
}
