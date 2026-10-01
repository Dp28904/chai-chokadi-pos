import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { BrandService } from '../core/brand.service';
import { CartService } from '../core/cart.service';
import { Category, Combo, Item, Offer } from '../core/models';
import { formatRupees } from '../core/money';
import { CartPanel } from './counter/cart-panel';
import { Checkout } from './counter/checkout';
import { ComboPicker } from './counter/combo-picker';

type View = 'home' | 'menu' | 'combos' | 'offers';

interface Product {
  key: string;
  kind: 'item' | 'combo';
  id: number;
  cat: number; // category id, or COMBOS
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  low: boolean;
  choice: number | null; // "pick N" combos
  fav: boolean;
}

interface Banner {
  id: number;
  title: string;
  lead: string; // small line above the headline, e.g. "PICK ANY 2 MASKA BUNS"
  big: string; // "10% OFF"
  sub: string; // "UP TO ₹5"
  badge: string; // gold tag, e.g. "10% OFF"
  images: string[];
  wide: boolean; // whole-bill offers get the big CTA treatment
  icon: string;
  target: number | null; // category to open
}

const COMBOS = -1;

@Component({
  selector: 'app-counter-page',
  imports: [FormsModule, NgTemplateOutlet, CartPanel, Checkout, ComboPicker],
  template: `
    <!-- one product card, reused by Favourites / Menu / Combos -->
    <ng-template #card let-p let-n="n">
      <button class="pcard" [class.in-cart]="cart.qtyOf(p.key) > 0" (click)="add(p)">
        <span class="pic">
          @if (p.imageUrl) { <img [src]="p.imageUrl" alt="" loading="lazy" decoding="async" /> }
          @if (n) { <span class="num-badge">{{ n }}</span> }
          @if (cart.qtyOf(p.key) > 0) { <span class="count">{{ cart.qtyOf(p.key) }}</span> }
          @if (p.low) { <span class="badge warn corner">Low stock</span> }
          @if (p.choice) { <span class="badge gold corner">Pick {{ p.choice }}</span> }
        </span>
        <span class="pbody">
          <span class="nm">{{ p.name }}</span>
          @if (p.description) { <span class="ds">{{ p.description }}</span> }
          <span class="prow">
            <span class="price-pill">{{ money(p.price) }}</span>
            <span class="plus" aria-hidden="true">+</span>
          </span>
        </span>
      </button>
    </ng-template>

    <div class="layout">
      <div class="main">
        <nav class="views" aria-label="Counter sections">
          @for (v of views; track v.id) {
            <button [class.on]="view() === v.id" (click)="go(v.id)"><span aria-hidden="true">{{ v.icon }}</span> {{ v.label }}</button>
          }
        </nav>

        @if (loading()) {
          <div class="grid">@for (n of [1, 2, 3, 4, 5, 6]; track n) { <div class="pcard skeleton"></div> }</div>
        } @else {
          @switch (view()) {
            @case ('home') {
              <section class="hero">
                <div class="bunting" aria-hidden="true"></div>
                <div class="hero-body">
                  <img class="hero-logo" src="logo.webp" alt="" width="132" height="132" />
                  <div class="hero-copy">
                    <h1 class="display">Welcome to {{ brand.stallName() }} <span aria-hidden="true">🪔</span></h1>
                    <p class="lead">Pick your favourites. Build your combo. Enjoy your Garba night!</p>
                    <p class="mini">Fresh Bites • Chai • Garba • Good Vibes</p>
                    <div class="cta">
                      <button class="primary lg" (click)="go('menu')">Order now</button>
                      <button class="green lg" (click)="go('menu')">View menu</button>
                      <button class="red lg" (click)="go('offers')">Special offers</button>
                    </div>
                  </div>
                </div>
              </section>

              @if (favourites().length) {
                <section class="block">
                  <h2 class="section-title">⭐ Chokadi Favourites</h2>
                  <div class="grid">
                    @for (p of favourites(); track p.key) { <ng-container [ngTemplateOutlet]="card" [ngTemplateOutletContext]="{ $implicit: p }" /> }
                  </div>
                </section>
              }

              @if (combos().length) {
                <section class="block">
                  <h2 class="section-title">🔥 Chokadi Food Combos</h2>
                  <div class="grid wide-cards">
                    @for (p of comboProducts(); track p.key; let i = $index) {
                      <ng-container [ngTemplateOutlet]="card" [ngTemplateOutletContext]="{ $implicit: p, n: pad(i + 1) }" />
                    }
                  </div>
                </section>
              }

              @if (banners().length) {
                <section class="block">
                  <h2 class="section-title">🎁 Special Offers</h2>
                  <ng-container [ngTemplateOutlet]="offerList" />
                </section>
              }
            }

            @case ('menu') {
              <div class="toolbar">
                <div class="chips" role="tablist" aria-label="Categories">
                  @for (c of categories(); track c.id) {
                    <button class="chip" role="tab" [class.on]="tab() === c.id && !query()" (click)="pickCategory(c.id)">{{ c.name }}</button>
                  }
                </div>
                <input class="search" type="search" placeholder="Search menu…" [ngModel]="query()" (ngModelChange)="query.set($event)" aria-label="Search menu" />
              </div>
              <div class="grid">
                @for (p of menuProducts(); track p.key) { <ng-container [ngTemplateOutlet]="card" [ngTemplateOutletContext]="{ $implicit: p }" /> }
                @empty {
                  <div class="card empty"><span class="ico">🔍</span>
                    <span>{{ query() ? 'Nothing matches "' + query() + '".' : 'No items here yet. Add some in Menu.' }}</span></div>
                }
              </div>
            }

            @case ('combos') {
              <h2 class="section-title">🔥 Chokadi Food Combos</h2>
              <div class="grid wide-cards">
                @for (p of comboProducts(); track p.key; let i = $index) {
                  <ng-container [ngTemplateOutlet]="card" [ngTemplateOutletContext]="{ $implicit: p, n: pad(i + 1) }" />
                } @empty { <div class="card empty"><span class="ico">🥡</span><span>No combos yet.</span></div> }
              </div>
            }

            @case ('offers') {
              <h2 class="section-title">🎁 Special Offers</h2>
              @if (banners().length) { <ng-container [ngTemplateOutlet]="offerList" /> }
              @else { <div class="card empty"><span class="ico">🏷️</span><span>No offers running right now.</span></div> }
            }
          }
        }
      </div>

      <aside class="cart card">
        <app-cart-panel (checkout)="checkingOut.set(true)" />
      </aside>
    </div>

    <ng-template #offerList>
      <div class="banners">
        @for (b of banners(); track b.id) {
          <button class="banner" [class.wide]="b.wide" (click)="openOffer(b)">
            <span class="b-art">
              @if (b.images.length) {
                @for (img of b.images; track $index) { <img [src]="img" alt="" loading="lazy" [style.--i]="$index" /> }
              } @else { <span class="b-icon" aria-hidden="true">{{ b.icon }}</span> }
            </span>
            <span class="b-copy">
              <span class="b-title">{{ b.icon }} {{ b.title }}</span>
              @if (b.lead) { <span class="b-lead">{{ b.lead }}</span> }
              <span class="b-big display">{{ b.big }}</span>
              @if (b.sub) { <span class="b-sub">{{ b.sub }}</span> }
            </span>
            <span class="b-badge" aria-hidden="true">{{ b.badge }}</span>
          </button>
        }
      </div>
    </ng-template>

    <!-- phone: persistent "View cart" button + bottom navigation -->
    @if (cart.count() && !sheet()) {
      <button class="view-cart primary" (click)="sheet.set(true)">
        <span class="n">{{ cart.count() }}</span> View cart <span aria-hidden="true">→</span>
        <span class="spacer"></span><b class="money">{{ money(cart.priced()?.grandTotal ?? cart.subtotal()) }}</b>
      </button>
    }
    <nav class="bottom-nav" aria-label="Counter sections">
      @for (v of views; track v.id) {
        <button [class.on]="view() === v.id" (click)="go(v.id)"><span class="ic" aria-hidden="true">{{ v.icon }}</span>{{ v.label }}</button>
      }
      <button [class.on]="sheet()" (click)="sheet.set(true)">
        <span class="ic" aria-hidden="true">🛒@if (cart.count()) { <span class="dot">{{ cart.count() }}</span> }</span>Cart
      </button>
    </nav>

    @if (sheet()) {
      <div class="backdrop" (click)="sheet.set(false)">
        <div class="modal sheet" (click)="$event.stopPropagation()">
          <app-cart-panel (checkout)="sheet.set(false); checkingOut.set(true)" />
          <button class="block" (click)="sheet.set(false)">Keep adding</button>
        </div>
      </div>
    }

    @if (picking(); as c) {
      <app-combo-picker [combo]="c" [items]="items()" (chosen)="addPicked(c, $event)" (cancelled)="picking.set(null)" />
    }
    @if (checkingOut()) {
      <app-checkout (closed)="checkingOut.set(false)" (finished)="done()" />
    }
  `,
  styles: [`
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 370px; gap: 20px; padding: 18px; max-width: 1480px; margin: 0 auto; align-items: start; }
    .main { min-width: 0; display: grid; gap: 22px; align-content: start; }
    .main > .section-title { margin-bottom: -6px; }

    /* section tabs (desktop) */
    .views { display: flex; gap: 6px; }
    .views button { min-height: 40px; padding: 8px 18px; border-radius: 999px; background: rgba(255, 248, 232, 0.08);
                    border: 1px solid rgba(245, 184, 61, 0.3); color: var(--on-bg); font-weight: 600; }
    .views button:hover:not(:disabled) { background: rgba(255, 248, 232, 0.16); }
    .views button.on { background: var(--brand); border-color: var(--brand); color: var(--brand-ink); }

    /* hero */
    .hero { position: relative; overflow: hidden; border-radius: var(--radius-lg); border: 1px solid rgba(245, 184, 61, 0.4);
            background: radial-gradient(80% 120% at 0% 0%, rgba(232, 117, 25, 0.22), transparent 60%),
                        linear-gradient(135deg, rgba(74, 40, 27, 0.92), rgba(36, 20, 15, 0.92)); box-shadow: var(--shadow); }
    .hero-body { display: flex; align-items: center; gap: 26px; padding: 14px 28px 26px; }
    .hero-logo { border-radius: 999px; box-shadow: 0 0 0 3px rgba(245, 184, 61, 0.75), 0 12px 34px rgba(0, 0, 0, 0.5); flex: none; }
    .hero-copy { display: grid; gap: 8px; color: var(--on-bg); min-width: 0; }
    .hero-copy h1 { font-size: clamp(1.8rem, 3.6vw, 2.8rem); font-weight: 400; color: var(--gold); line-height: 1.1; }
    .lead { font-size: 1.05rem; }
    .mini { color: var(--on-bg-muted); font-size: .85rem; letter-spacing: .04em; }
    .cta { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }

    /* grids of cream cards */
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(166px, 1fr)); gap: 16px; }
    .grid.wide-cards { grid-template-columns: repeat(auto-fill, minmax(166px, 1fr)); }
    .pcard {
      display: flex; flex-direction: column; align-items: stretch; padding: 0; overflow: hidden; text-align: left;
      white-space: normal; font-weight: 400; min-height: 0; border-radius: var(--radius);
      background: var(--surface); color: var(--ink); border: 1px solid var(--line-strong); box-shadow: var(--shadow);
      transition: transform .1s, box-shadow .12s, border-color .12s;
    }
    .pcard:hover:not(:disabled) { background: var(--surface); transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,.25), 0 14px 30px rgba(0,0,0,.35); }
    .pcard:active:not(:disabled) { transform: scale(.98); }
    .pcard.in-cart { border-color: var(--brand); box-shadow: 0 0 0 2px var(--brand), var(--shadow); }
    .pic { position: relative; aspect-ratio: 4 / 3; background: var(--surface-2); display: block; }
    .pic img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .count { position: absolute; top: 8px; right: 8px; min-width: 30px; height: 30px; padding: 0 9px; border-radius: 999px;
             background: var(--brand); color: var(--brand-ink); font-weight: 700; display: grid; place-items: center; box-shadow: var(--shadow); }
    .num-badge { position: absolute; top: 8px; left: 8px; width: 34px; height: 34px; border-radius: 999px; background: var(--gold); color: var(--ink);
                 font-weight: 700; display: grid; place-items: center; font-size: .9rem; box-shadow: var(--shadow); }
    .corner { position: absolute; left: 8px; bottom: 8px; }
    .pbody { display: grid; gap: 4px; padding: 11px 13px 13px; }
    .nm { font-weight: 600; font-size: .96rem; line-height: 1.25; }
    .ds { font-size: .78rem; color: var(--muted); line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .prow { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; }
    .plus { width: 30px; height: 30px; border-radius: 999px; background: var(--brand); color: var(--brand-ink); display: grid; place-items: center; font-weight: 700; font-size: 1.1rem; }
    .skeleton { min-height: 240px; background: linear-gradient(90deg, rgba(255,241,210,.25), rgba(255,241,210,.4), rgba(255,241,210,.25)); background-size: 200% 100%; animation: shimmer 1.2s infinite linear; border: 0; }
    @keyframes shimmer { to { background-position: -200% 0; } }

    /* menu toolbar */
    .toolbar { position: sticky; top: 62px; z-index: 5; display: grid; grid-template-columns: minmax(0, 1fr) 230px; gap: 12px; align-items: center;
               padding: 10px 0 12px; background: linear-gradient(180deg, #2a160e 70%, transparent); }
    .search { min-height: 40px; border-radius: 999px; padding-left: 16px; }
    @media (min-width: 901px) { .toolbar .chips { flex-wrap: wrap; overflow: visible; } }

    /* offer banners */
    .banners { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .banner {
      position: relative; overflow: hidden; display: grid; grid-template-columns: 150px 1fr; gap: 16px; align-items: center; text-align: left;
      white-space: normal; min-height: 170px; padding: 16px 18px; border-radius: var(--radius-lg);
      background: linear-gradient(135deg, #fff1d2, #f8e0a8); color: var(--ink); border: 2px solid var(--gold); box-shadow: var(--shadow);
      font-weight: 400; transition: transform .1s;
    }
    .banner:hover:not(:disabled) { background: linear-gradient(135deg, #fff1d2, #f8e0a8); transform: translateY(-2px); }
    .banner.wide { grid-column: 1 / -1; background: linear-gradient(135deg, #1f6347, #174d38 55%, #103827); color: var(--on-bg); min-height: 150px; }
    .banner.wide:hover:not(:disabled) { background: linear-gradient(135deg, #22704f, #1a5640 55%, #12412d); }
    .b-art { position: relative; height: 130px; display: grid; place-items: center; }
    .b-art img { position: absolute; width: 96px; height: 96px; border-radius: 999px; object-fit: cover; border: 3px solid #fff8e8; box-shadow: var(--shadow);
                 left: calc(var(--i) * 46px); top: calc(var(--i) * 26px + 4px); }
    .b-icon { font-size: 4.2rem; }
    .b-copy { display: grid; gap: 4px; }
    .b-title { font-weight: 700; letter-spacing: .03em; font-size: .95rem; text-transform: uppercase; color: var(--brand-text); }
    .wide .b-title { color: var(--gold); }
    .b-lead { font-weight: 600; font-size: .92rem; }
    .b-big { font-size: clamp(1.7rem, 3vw, 2.4rem); line-height: 1.05; color: var(--red); }
    .wide .b-big { color: var(--gold); }
    .b-sub { font-weight: 700; letter-spacing: .04em; font-size: .9rem; }
    .b-badge { position: absolute; bottom: 12px; right: 14px; background: var(--gold); color: var(--ink); font-weight: 700; font-size: .8rem;
               padding: 5px 12px; border-radius: 999px; transform: rotate(4deg); box-shadow: var(--shadow-sm); }

    /* cart */
    .cart { position: sticky; top: 78px; height: calc(100dvh - 96px); display: flex; flex-direction: column; padding: 16px; }
    .cart app-cart-panel { flex: 1; min-height: 0; }

    /* phone */
    .view-cart, .bottom-nav, .sheet { display: none; }
    @media (max-width: 900px) {
      .layout { grid-template-columns: 1fr; padding: 12px 12px 150px; }
      .cart, .views { display: none; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .grid.wide-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .hero-body { flex-direction: column; text-align: center; padding: 10px 18px 22px; gap: 14px; }
      .hero-logo { width: 104px; height: 104px; }
      .cta { justify-content: center; }
      .cta button { flex: 1 1 130px; }
      .toolbar { top: 92px; grid-template-columns: 1fr; gap: 8px; }
      .banners { grid-template-columns: 1fr; }
      .banner { grid-template-columns: 108px 1fr; min-height: 140px; }
      .b-art { height: 110px; } .b-art img { width: 74px; height: 74px; left: calc(var(--i) * 34px); top: calc(var(--i) * 22px + 4px); }
      .view-cart {
        display: flex; position: fixed; left: 12px; right: 12px; bottom: 76px; z-index: 30; min-height: 54px;
        border-radius: 16px; font-size: 1rem; box-shadow: var(--shadow-lg); padding: 0 18px; gap: 8px;
      }
      .view-cart .n { background: var(--ink); color: var(--gold); border-radius: 999px; min-width: 26px; height: 26px; display: grid; place-items: center; font-weight: 700; font-size: .85rem; }
      .bottom-nav {
        display: grid; grid-template-columns: repeat(5, 1fr); position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
        padding: 6px 6px calc(6px + env(safe-area-inset-bottom)); background: linear-gradient(180deg, #3a1f14, #24140f);
        border-top: 1px solid rgba(245, 184, 61, 0.4); box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.4);
      }
      .bottom-nav button { flex-direction: column; gap: 2px; min-height: 52px; padding: 4px 2px; border: 0; background: transparent; color: var(--on-bg-muted); font-size: .72rem; font-weight: 600; border-radius: 12px; }
      .bottom-nav button:hover:not(:disabled) { background: rgba(255, 248, 232, .08); }
      .bottom-nav button.on { color: var(--gold); background: rgba(245, 184, 61, .14); }
      .bottom-nav .ic { position: relative; font-size: 1.3rem; line-height: 1; }
      .bottom-nav .dot { position: absolute; top: -6px; right: -12px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: var(--brand); color: var(--brand-ink); font-size: .68rem; font-weight: 700; display: grid; place-items: center; }
      .sheet { display: grid; }
    }
  `],
})
export class CounterPage implements OnInit {
  private api = inject(ApiService);
  brand = inject(BrandService);
  cart = inject(CartService);
  money = formatRupees;

  views: { id: View; label: string; icon: string }[] = [
    { id: 'home', label: 'Home', icon: '🏠' },
    { id: 'menu', label: 'Menu', icon: '🍽️' },
    { id: 'combos', label: 'Combos', icon: '🔥' },
    { id: 'offers', label: 'Offers', icon: '🎁' },
  ];

  view = signal<View>('home');
  categories = signal<Category[]>([]);
  items = signal<Item[]>([]);
  combos = signal<Combo[]>([]);
  offers = signal<Offer[]>([]);
  tab = signal<number>(0);
  query = signal('');
  loading = signal(true);
  checkingOut = signal(false);
  sheet = signal(false);
  picking = signal<Combo | null>(null);

  private itemProducts = computed<Product[]>(() =>
    this.items().filter((i) => i.isActive).map((i) => ({
      key: `i${i.id}`, kind: 'item', id: i.id, cat: i.categoryId, name: i.name, description: i.description,
      price: i.price, imageUrl: i.imageUrl, low: i.trackStock && i.qtyOnHand <= i.lowStockAt, choice: null,
      fav: i.isFavourite,
    })),
  );
  comboProducts = computed<Product[]>(() =>
    this.combos().map((c) => ({
      key: `c${c.id}:`, kind: 'combo', id: c.id, cat: COMBOS, name: c.name, description: c.description,
      price: c.price, imageUrl: c.imageUrl, low: false, choice: c.choiceCategoryId ? c.choiceQty : null, fav: false,
    })),
  );
  favourites = computed(() => this.itemProducts().filter((p) => p.fav));

  menuProducts = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.itemProducts();
    return q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all.filter((p) => p.cat === this.tab());
  });

  banners = computed<Banner[]>(() => {
    const now = new Date();
    const live = this.offers().filter(
      (o) => o.isActive && (!o.startsAt || new Date(o.startsAt) <= now) && (!o.endsAt || new Date(o.endsAt) >= now),
    );
    // the big whole-bill card goes first, then the rest in creation order
    return live.map((o) => this.toBanner(o)).sort((a, b) => Number(b.wide) - Number(a.wide) || a.id - b.id);
  });

  ngOnInit() {
    let pending = 4;
    const settle = () => { if (--pending === 0) this.loading.set(false); };
    this.api.categories().subscribe({ next: (c) => { this.categories.set(c); if (c.length) this.tab.set(c[0].id); }, complete: settle, error: settle });
    this.api.combos().subscribe({ next: (c) => this.combos.set(c.filter((x) => x.isActive)), complete: settle, error: settle });
    this.api.offers().subscribe({ next: (o) => this.offers.set(o), complete: settle, error: settle });
    this.loadItems(settle);
  }

  private loadItems(done?: () => void) {
    this.api.items().subscribe({ next: (i) => this.items.set(i), complete: done, error: done });
  }

  pad(n: number) { return String(n).padStart(2, '0'); }

  go(v: View) {
    this.view.set(v);
    this.query.set('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  pickCategory(id: number) { this.tab.set(id); this.query.set(''); }

  add(p: Product) {
    if (p.kind === 'combo') {
      const c = this.combos().find((x) => x.id === p.id)!;
      if (c.choiceCategoryId) { this.picking.set(c); return; }
      this.cart.add({ comboId: c.id, name: c.name, price: c.price, imageUrl: c.imageUrl });
    } else {
      this.cart.add({ itemId: p.id, name: p.name, price: p.price, imageUrl: p.imageUrl });
    }
  }

  addPicked(c: Combo, ids: number[]) {
    const names = ids.map((id) => this.items().find((i) => i.id === id)?.name ?? '?');
    this.cart.add({ comboId: c.id, choiceItemIds: ids, name: `${c.name} (${names.join(' + ')})`, price: c.price, imageUrl: c.imageUrl });
    this.picking.set(null);
  }

  openOffer(b: Banner) {
    if (b.target) this.tab.set(b.target);
    this.go('menu');
  }

  done() {
    this.checkingOut.set(false);
    this.cart.clear();
    this.loadItems();
  }

  /** Turns an offer into a banner, written the way the stall signage reads. */
  private toBanner(o: Offer): Banner {
    const cap = o.maxDiscount ? `UP TO ${formatRupees(o.maxDiscount)}` : '';
    const amount =
      o.type === 'PERCENT_OFF' ? `${o.value}% OFF`
      : o.type === 'FLAT_OFF' ? `${formatRupees(o.value)} OFF`
      : `BUY ${o.buyQty} GET ${o.getQty} FREE`;
    // "GET 10% OFF" reads better on item/category offers; whole-bill and buy-x-get-y stand alone
    const headline = o.scope === 'BILL' || o.type === 'BUY_X_GET_Y' ? amount : `GET ${amount}`;
    const cat = o.scope === 'CATEGORY' ? this.categories().find((c) => c.id === o.targetId) : undefined;
    const item = o.scope === 'ITEM' ? this.items().find((i) => i.id === o.targetId) : undefined;
    const pics = (o.scope === 'CATEGORY'
      ? this.items().filter((i) => i.isActive && i.categoryId === o.targetId)
      : item ? [item] : []
    ).map((i) => i.imageUrl).filter((u): u is string => !!u).slice(0, 2);

    if (o.scope === 'BILL') {
      return {
        id: o.id, title: o.name, icon: '🛒', wide: true, images: [], target: null,
        badge: o.type !== 'PERCENT_OFF' ? 'SAVE' : o.loyaltyStep ? `${o.value}–${o.loyaltyMax ?? 100}% OFF` : `${o.value}% OFF`,
        lead: o.excludeCombos
          ? `PICK ANY ITEMS WORTH ${formatRupees(o.minBillAmount)}+ (NOT COMBOS)`
          : o.minBillAmount ? `MINIMUM ORDER ${formatRupees(o.minBillAmount)}` : '',
        big: headline,
        sub: [o.loyaltyStep ? `COME BACK FOR UP TO ${o.loyaltyMax ?? 100}% OFF` : '', o.maxDiscount ? `MAX ${formatRupees(o.maxDiscount)}` : '']
          .filter(Boolean).join(' · '),
      };
    }
    const what = cat?.name ?? item?.name ?? 'items';
    const lead = o.type === 'BUY_X_GET_Y' ? `On ${what}`
      : o.minQty > 1 ? `PICK ANY ${o.minQty} FROM ${what.toUpperCase()}` : `On ${what}`;
    return {
      id: o.id, title: o.name, icon: cat?.name.toLowerCase().includes('toast') ? '🍞' : '🥯', wide: false,
      images: pics, target: cat?.id ?? item?.categoryId ?? null,
      badge: o.type === 'PERCENT_OFF' ? `${o.value}% OFF` : 'OFFER', lead, big: headline, sub: cap,
    };
  }
}
