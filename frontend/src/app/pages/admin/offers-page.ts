import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { Category, Item, Offer, OfferScope, OfferType } from '../../core/models';
import { formatRupees, toPaise, toRupees } from '../../core/money';
import { ToastService } from '../../core/toast.service';

interface OfferForm {
  id?: number; name: string; type: OfferType; scope: OfferScope; targetId: number | null;
  value: number | null; minBill: number | null; minQty: number | null; cap: number | null;
  buyQty: number | null; getQty: number | null; startsAt: string; endsAt: string; isActive: boolean;
}

const blank = (): OfferForm => ({
  name: '', type: 'PERCENT_OFF', scope: 'CATEGORY', targetId: null, value: 10, minBill: null, minQty: null, cap: null,
  buyQty: 2, getQty: 1, startsAt: '', endsAt: '', isActive: true,
});

/** ISO -> value for <input type="datetime-local"> in the device's time zone. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

@Component({
  selector: 'app-offers-page',
  imports: [FormsModule],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Offers &amp; discounts</h1>
          <p>Applied automatically at the counter.</p>
        </div>
        <button class="primary" (click)="form.set(blank())">+ New offer</button>
      </div>

      <div class="card rules">
        <b>How offers combine</b>
        <ol>
          <li>Each item gets its <b>single best</b> item or category offer.</li>
          <li>Then <b>one</b> whole-bill offer applies to what's left.</li>
          <li>"Upto" caps the discount; combos are never discounted again.</li>
        </ol>
      </div>

      <div class="list">
        @for (o of offers(); track o.id) {
          <article class="offer card" [class.off]="!o.isActive">
            <div class="ico" aria-hidden="true">{{ o.type === 'BUY_X_GET_Y' ? '🎁' : o.type === 'FLAT_OFF' ? '₹' : '%' }}</div>
            <div class="info">
              <h3>{{ o.name }}</h3>
              <p class="muted">{{ describe(o) }}</p>
              @if (window(o); as w) { <span class="badge" [class.warn]="w.startsWith('Ended')">{{ w }}</span> }
            </div>
            <div class="actions">
              <label class="switch" [attr.aria-label]="(o.isActive ? 'Turn off ' : 'Turn on ') + o.name">
                <input type="checkbox" [checked]="o.isActive" (change)="toggle(o)" />
                <span></span>
              </label>
              <button class="sm" (click)="edit(o)">Edit</button>
            </div>
          </article>
        } @empty {
          <div class="card empty"><span class="ico">🏷️</span><span>No offers yet.</span></div>
        }
      </div>
    </div>

    @if (form(); as f) {
      <div class="backdrop" (click)="form.set(null)">
        <form class="modal wide form-grid" (click)="$event.stopPropagation()" (ngSubmit)="save(f)">
          <div class="modal-head"><h2>{{ f.id ? 'Edit offer' : 'New offer' }}</h2>
            <button type="button" class="ghost icon" (click)="form.set(null)" aria-label="Close">✕</button></div>

          <label class="field">Name <span class="hint">Shown on the bill</span>
            <input name="nm" [(ngModel)]="f.name" required maxlength="80" placeholder="e.g. Any 2 maska buns, 10% off" />
          </label>
          <div class="two">
            <label class="field">Discount type
              <select name="ty" [(ngModel)]="f.type" (ngModelChange)="f.type === 'BUY_X_GET_Y' && f.scope === 'BILL' ? f.scope = 'ITEM' : null">
                <option value="PERCENT_OFF">Percent off</option>
                <option value="FLAT_OFF">Flat ₹ off</option>
                <option value="BUY_X_GET_Y">Buy X, get Y free</option>
              </select>
            </label>
            <label class="field">Applies to
              <select name="sc" [(ngModel)]="f.scope" (ngModelChange)="f.targetId = null">
                <option value="ITEM">One item</option>
                <option value="CATEGORY">A whole category</option>
                @if (f.type !== 'BUY_X_GET_Y') { <option value="BILL">The whole bill</option> }
              </select>
            </label>
          </div>

          @if (f.scope === 'ITEM') {
            <label class="field">Item
              <select name="ti" [(ngModel)]="f.targetId" required>
                <option [ngValue]="null" disabled>Choose…</option>
                @for (i of items(); track i.id) { <option [ngValue]="i.id">{{ i.name }}</option> }
              </select>
            </label>
          }
          @if (f.scope === 'CATEGORY') {
            <label class="field">Category
              <select name="tc" [(ngModel)]="f.targetId" required>
                <option [ngValue]="null" disabled>Choose…</option>
                @for (c of categories(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
              </select>
            </label>
          }

          <div class="two">
            @switch (f.type) {
              @case ('PERCENT_OFF') { <label class="field">Percent off <input name="pv" type="number" min="1" max="100" [(ngModel)]="f.value" required /></label> }
              @case ('FLAT_OFF') { <label class="field">₹ off <span class="hint">{{ f.scope === 'BILL' ? 'per bill' : 'per unit' }}</span>
                <input name="fv" type="number" min="1" step="0.5" [(ngModel)]="f.value" required /></label> }
              @case ('BUY_X_GET_Y') {
                <label class="field">Buy <input name="bq" type="number" min="1" [(ngModel)]="f.buyQty" required /></label>
                <label class="field">Get free <input name="gq" type="number" min="1" [(ngModel)]="f.getQty" required /></label>
              }
            }
            @if (f.type !== 'BUY_X_GET_Y') {
              <label class="field">Max discount ₹ <span class="hint">"upto", optional</span>
                <input name="cap" type="number" min="1" step="0.5" [(ngModel)]="f.cap" /></label>
            }
          </div>

          <div class="two">
            <label class="field">Minimum bill ₹ <span class="hint">optional</span>
              <input name="mb" type="number" min="0" [(ngModel)]="f.minBill" /></label>
            @if (f.scope !== 'BILL') {
              <label class="field">Minimum quantity <span class="hint">e.g. 2 for "pick any 2"</span>
                <input name="mq" type="number" min="0" [(ngModel)]="f.minQty" /></label>
            }
          </div>

          <div class="two">
            <label class="field">Starts <span class="hint">optional</span><input name="st" type="datetime-local" [(ngModel)]="f.startsAt" /></label>
            <label class="field">Ends <span class="hint">optional</span><input name="en" type="datetime-local" [(ngModel)]="f.endsAt" /></label>
          </div>

          <div class="form-actions">
            <button type="button" (click)="form.set(null)">Cancel</button>
            <button class="primary" [disabled]="saving() || !f.name.trim()">{{ f.id ? 'Save changes' : 'Create offer' }}</button>
          </div>
        </form>
      </div>
    }
  `,
  styles: [`
    .rules { margin-bottom: 16px; background: var(--gold-soft); border-color: var(--gold); font-size: .9rem; }
    .rules ol { margin: 6px 0 0; padding-left: 20px; display: grid; gap: 2px; }
    .list { display: grid; gap: 12px; }
    .offer { display: grid; grid-template-columns: 48px 1fr auto; gap: 14px; align-items: center; padding: 14px 16px; }
    .offer.off .info, .offer.off .ico { opacity: .5; }
    .ico { width: 48px; height: 48px; border-radius: 12px; background: var(--brand-soft); color: var(--brand-text); display: grid; place-items: center; font-size: 1.3rem; font-weight: 700; }
    .info { display: grid; gap: 4px; justify-items: start; }
    .actions { display: flex; gap: 10px; align-items: center; }
    .switch { position: relative; width: 44px; height: 26px; flex: none; cursor: pointer; }
    .switch input { opacity: 0; width: 0; height: 0; position: absolute; }
    .switch span { position: absolute; inset: 0; background: var(--line-strong); border-radius: 999px; transition: background .15s; }
    .switch span::after { content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 999px; background: #fff; box-shadow: var(--shadow-sm); transition: transform .15s; }
    .switch input:checked + span { background: var(--ok); }
    .switch input:checked + span::after { transform: translateX(18px); }
    .switch input:focus-visible + span { box-shadow: var(--focus); }
    @media (max-width: 560px) { .offer { grid-template-columns: 1fr auto; } .ico { display: none; } }
  `],
})
export class OffersPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  offers = signal<Offer[]>([]);
  items = signal<Item[]>([]);
  categories = signal<Category[]>([]);
  form = signal<OfferForm | null>(null);
  saving = signal(false);
  blank = blank;

  ngOnInit() {
    this.api.items().subscribe((i) => this.items.set(i.filter((x) => x.isActive)));
    this.api.categories().subscribe((c) => this.categories.set(c));
    this.load();
  }
  load() { this.api.offers().subscribe((o) => this.offers.set(o)); }

  describe(o: Offer) {
    const target = o.scope === 'ITEM' ? this.items().find((i) => i.id === o.targetId)?.name
      : o.scope === 'CATEGORY' ? `any ${this.categories().find((c) => c.id === o.targetId)?.name ?? '?'}` : 'the whole bill';
    const what = o.type === 'PERCENT_OFF' ? `${o.value}% off`
      : o.type === 'FLAT_OFF' ? `${formatRupees(o.value)} off` : `Buy ${o.buyQty} get ${o.getQty} free`;
    const parts = [`${what} on ${target ?? '?'}`];
    if (o.minQty > 1) parts.push(`when ${o.minQty}+ bought`);
    if (o.minBillAmount) parts.push(`bill above ${formatRupees(o.minBillAmount)}`);
    if (o.maxDiscount) parts.push(`upto ${formatRupees(o.maxDiscount)}`);
    return parts.join(' · ');
  }

  window(o: Offer) {
    const fmt = (s: string) => new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    if (o.endsAt && new Date(o.endsAt) < new Date()) return `Ended ${fmt(o.endsAt)}`;
    if (o.startsAt && new Date(o.startsAt) > new Date()) return `Starts ${fmt(o.startsAt)}`;
    if (o.endsAt) return `Until ${fmt(o.endsAt)}`;
    return '';
  }

  private toForm(o: Offer): OfferForm {
    return {
      id: o.id, name: o.name, type: o.type, scope: o.scope, targetId: o.targetId,
      value: o.type === 'FLAT_OFF' ? toRupees(o.value) : o.value,
      minBill: o.minBillAmount ? toRupees(o.minBillAmount) : null,
      minQty: o.minQty || null, cap: o.maxDiscount ? toRupees(o.maxDiscount) : null,
      buyQty: o.buyQty, getQty: o.getQty,
      startsAt: toLocalInput(o.startsAt), endsAt: toLocalInput(o.endsAt), isActive: o.isActive,
    };
  }

  private body(f: OfferForm): Partial<Offer> {
    return {
      name: f.name.trim(), type: f.type, scope: f.scope, isActive: f.isActive,
      targetId: f.scope === 'BILL' ? null : f.targetId,
      value: f.type === 'PERCENT_OFF' ? (f.value ?? 0) : f.type === 'FLAT_OFF' ? toPaise(f.value ?? 0) : 0,
      minBillAmount: toPaise(f.minBill ?? 0),
      minQty: f.scope === 'BILL' ? 0 : (f.minQty ?? 0),
      maxDiscount: f.type !== 'BUY_X_GET_Y' && f.cap ? toPaise(f.cap) : null,
      buyQty: f.type === 'BUY_X_GET_Y' ? f.buyQty : null,
      getQty: f.type === 'BUY_X_GET_Y' ? f.getQty : null,
      startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null,
      endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null,
    };
  }

  edit(o: Offer) { this.form.set(this.toForm(o)); }

  save(f: OfferForm) {
    this.saving.set(true);
    const req = f.id ? this.api.updateOffer(f.id, this.body(f)) : this.api.createOffer(this.body(f));
    req.subscribe({
      next: () => { this.saving.set(false); this.form.set(null); this.toast.ok(f.id ? 'Offer updated' : 'Offer created'); this.load(); },
      error: () => this.saving.set(false),
    });
  }

  toggle(o: Offer) {
    this.api.updateOffer(o.id, { ...this.body(this.toForm(o)), isActive: !o.isActive }).subscribe({
      next: () => { this.toast.ok(o.isActive ? 'Offer turned off' : 'Offer is live'); this.load(); },
      error: () => this.load(),
    });
  }
}
