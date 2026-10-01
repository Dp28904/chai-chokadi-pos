import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { DialogService } from '../../core/dialog.service';
import { Category, Combo, Item } from '../../core/models';
import { formatRupees, toPaise, toRupees } from '../../core/money';
import { ToastService } from '../../core/toast.service';

type Tab = 'items' | 'combos' | 'categories';

interface ItemForm {
  id?: number; categoryId: number | null; name: string; description: string; price: number | null;
  imageUrl: string | null; trackStock: boolean; lowStockAt: number; isActive: boolean; isFavourite: boolean;
}
interface ComboForm {
  id?: number; name: string; description: string; imageUrl: string | null; price: number | null; isActive: boolean;
  mode: 'fixed' | 'choice'; choiceCategoryId: number | null; choiceQty: number;
  lines: { itemId: number | null; qty: number }[];
}

const blankItem = (categoryId: number | null): ItemForm =>
  ({ categoryId, name: '', description: '', price: null, imageUrl: null, trackStock: false, lowStockAt: 10, isActive: true, isFavourite: false });
const blankCombo = (): ComboForm => ({
  name: '', description: '', imageUrl: null, price: null, isActive: true,
  mode: 'fixed', choiceCategoryId: null, choiceQty: 2, lines: [{ itemId: null, qty: 1 }],
});

@Component({
  selector: 'app-menu-page',
  imports: [FormsModule],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Menu</h1>
          <p>{{ items().length }} items · {{ combos().length }} combos · {{ categories().length }} categories</p>
        </div>
        <div class="row">
          @switch (tab()) {
            @case ('items') { <button class="primary" (click)="newItem()" [disabled]="!categories().length">+ Add item</button> }
            @case ('combos') { <button class="primary" (click)="comboForm.set(blankCombo())" [disabled]="!items().length">+ Add combo</button> }
          }
        </div>
      </div>

      <div class="row tabs">
        <div class="seg" role="tablist">
          <button role="tab" [class.on]="tab() === 'items'" (click)="tab.set('items')">Items</button>
          <button role="tab" [class.on]="tab() === 'combos'" (click)="tab.set('combos')">Combos</button>
          <button role="tab" [class.on]="tab() === 'categories'" (click)="tab.set('categories')">Categories</button>
        </div>
        @if (tab() === 'items') {
          <div class="chips">
            <button class="chip" [class.on]="catFilter() === null" (click)="catFilter.set(null)">All</button>
            @for (c of categories(); track c.id) {
              <button class="chip" [class.on]="catFilter() === c.id" (click)="catFilter.set(c.id)">{{ c.name }}</button>
            }
          </div>
        }
      </div>

      @switch (tab()) {
        @case ('items') {
          @if (!categories().length) {
            <div class="card empty"><span class="ico">📂</span><span>Create a category first, then add items to it.</span>
              <button (click)="tab.set('categories')">Go to categories</button></div>
          } @else {
            <div class="grid">
              @for (i of shownItems(); track i.id) {
                <article class="prod" [class.off]="!i.isActive">
                  <div class="pic">
                    @if (i.imageUrl) { <img [src]="i.imageUrl" alt="" loading="lazy" decoding="async" /> } @else { <span class="noimg">No photo</span> }
                    <div class="flags">
                      @if (!i.isActive) { <span class="badge">Hidden</span> }
                      @if (i.isFavourite) { <span class="badge gold">⭐ Favourite</span> }
                      @if (i.trackStock) { <span class="badge" [class.warn]="i.qtyOnHand <= i.lowStockAt">Stock {{ i.qtyOnHand }}</span> }
                    </div>
                  </div>
                  <div class="body">
                    <span class="muted small">{{ categoryName(i.categoryId) }}</span>
                    <h3>{{ i.name }}</h3>
                    @if (i.description) { <p class="ds">{{ i.description }}</p> }
                    <div class="foot">
                      <span class="price-pill">{{ money(i.price) }}</span>
                      <span class="row">
                        <button class="sm ghost" (click)="toggleItem(i)">{{ i.isActive ? 'Hide' : 'Show' }}</button>
                        <button class="sm" (click)="editItem(i)">Edit</button>
                      </span>
                    </div>
                  </div>
                </article>
              } @empty { <div class="card empty full"><span class="ico">🍽️</span><span>No items in this category yet.</span></div> }
            </div>
          }
        }
        @case ('combos') {
          <div class="grid">
            @for (c of combos(); track c.id) {
              <article class="prod" [class.off]="!c.isActive">
                <div class="pic">
                  @if (c.imageUrl) { <img [src]="c.imageUrl" alt="" loading="lazy" decoding="async" /> } @else { <span class="noimg">No photo</span> }
                  <div class="flags">
                    @if (!c.isActive) { <span class="badge">Hidden</span> }
                    @if (c.choiceCategoryId) { <span class="badge brand">Customer picks</span> }
                  </div>
                </div>
                <div class="body">
                  <h3>{{ c.name }}</h3>
                  <p class="ds">{{ comboSummary(c) }}</p>
                  <div class="foot">
                    <span>
                      <span class="price-pill">{{ money(c.price) }}</span>
                      @if (comboWorth(c); as w) { <span class="muted small strike money">{{ money(w) }}</span> }
                    </span>
                    <span class="row">
                      <button class="sm ghost" (click)="toggleCombo(c)">{{ c.isActive ? 'Hide' : 'Show' }}</button>
                      <button class="sm" (click)="editCombo(c)">Edit</button>
                    </span>
                  </div>
                </div>
              </article>
            } @empty { <div class="card empty full"><span class="ico">🥡</span><span>No combos yet.</span></div> }
          </div>
        }
        @case ('categories') {
          <div class="card cats">
            <form class="row add" (ngSubmit)="addCategory()">
              <input name="cat" [(ngModel)]="newCategory" placeholder="New category name, e.g. Snacks" maxlength="40" />
              <button class="primary" [disabled]="!newCategory.trim()">Add</button>
            </form>
            @for (c of categories(); track c.id; let first = $first; let last = $last) {
              <div class="cat">
                <span class="order">
                  <button class="icon ghost sm" (click)="move(c, -1)" [disabled]="first" aria-label="Move up">↑</button>
                  <button class="icon ghost sm" (click)="move(c, 1)" [disabled]="last" aria-label="Move down">↓</button>
                </span>
                @if (renaming() === c.id) {
                  <input class="grow" [(ngModel)]="renameTo" (keydown.enter)="rename(c)" (keydown.escape)="renaming.set(null)" maxlength="40" />
                  <button class="sm primary" (click)="rename(c)">Save</button>
                } @else {
                  <span class="grow"><b>{{ c.name }}</b> <span class="muted small">· {{ countIn(c.id) }} items</span></span>
                  <button class="sm ghost" (click)="renaming.set(c.id); renameTo = c.name">Rename</button>
                  <button class="sm danger" (click)="removeCategory(c)">Delete</button>
                }
              </div>
            } @empty { <p class="empty">No categories yet.</p> }
          </div>
        }
      }
    </div>

    @if (itemForm(); as f) {
      <div class="backdrop" (click)="itemForm.set(null)">
        <form class="modal wide form-grid" (click)="$event.stopPropagation()" (ngSubmit)="saveItem(f)">
          <div class="modal-head"><h2>{{ f.id ? 'Edit item' : 'New item' }}</h2>
            <button type="button" class="ghost icon" (click)="itemForm.set(null)" aria-label="Close">✕</button></div>
          <div class="photo-row">
            <div class="photo">@if (f.imageUrl) { <img [src]="f.imageUrl" alt="" /> } @else { <span class="noimg">No photo</span> }</div>
            <label class="field">Photo <span class="hint">PNG, JPEG or WebP, up to 8 MB (resized automatically)</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" (change)="upload($event, f)" />
            </label>
          </div>
          <div class="two">
            <label class="field">Name <input name="n" [(ngModel)]="f.name" required maxlength="60" /></label>
            <label class="field">Category
              <select name="c" [(ngModel)]="f.categoryId" required>
                @for (c of categories(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
              </select>
            </label>
          </div>
          <label class="field">Description <span class="hint">Shown under the name on the counter</span>
            <input name="d" [(ngModel)]="f.description" maxlength="160" />
          </label>
          <div class="two">
            <label class="field">Price (₹) <input name="p" type="number" min="0" step="0.5" [(ngModel)]="f.price" required /></label>
            <label class="field">Visible on counter
              <select name="a" [(ngModel)]="f.isActive"><option [ngValue]="true">Yes</option><option [ngValue]="false">Hidden</option></select>
            </label>
          </div>
          <label class="check"><input type="checkbox" name="fv" [(ngModel)]="f.isFavourite" /> ⭐ Show in "Chokadi Favourites" on the counter home</label>
          <label class="check"><input type="checkbox" name="t" [(ngModel)]="f.trackStock" /> Track stock for this item</label>
          @if (f.trackStock) {
            <label class="field">Warn when stock falls to <input name="l" type="number" min="0" [(ngModel)]="f.lowStockAt" /></label>
          }
          <div class="form-actions">
            <button type="button" (click)="itemForm.set(null)">Cancel</button>
            <button class="primary" [disabled]="saving() || !f.name.trim() || f.price === null || !f.categoryId">{{ f.id ? 'Save changes' : 'Add item' }}</button>
          </div>
        </form>
      </div>
    }

    @if (comboForm(); as f) {
      <div class="backdrop" (click)="comboForm.set(null)">
        <form class="modal wide form-grid" (click)="$event.stopPropagation()" (ngSubmit)="saveCombo(f)">
          <div class="modal-head"><h2>{{ f.id ? 'Edit combo' : 'New combo' }}</h2>
            <button type="button" class="ghost icon" (click)="comboForm.set(null)" aria-label="Close">✕</button></div>
          <div class="photo-row">
            <div class="photo">@if (f.imageUrl) { <img [src]="f.imageUrl" alt="" /> } @else { <span class="noimg">No photo</span> }</div>
            <label class="field">Photo <input type="file" accept="image/png,image/jpeg,image/webp" (change)="upload($event, f)" /></label>
          </div>
          <div class="two">
            <label class="field">Name <input name="n" [(ngModel)]="f.name" required maxlength="60" /></label>
            <label class="field">Combo price (₹) <input name="p" type="number" min="0" step="0.5" [(ngModel)]="f.price" required /></label>
          </div>
          <label class="field">Description <input name="d" [(ngModel)]="f.description" maxlength="160" /></label>
          <div class="seg">
            <button type="button" [class.on]="f.mode === 'fixed'" (click)="f.mode = 'fixed'">Fixed items</button>
            <button type="button" [class.on]="f.mode === 'choice'" (click)="f.mode = 'choice'">Customer picks</button>
          </div>
          @if (f.mode === 'choice') {
            <div class="two">
              <label class="field">How many <input name="q" type="number" min="1" max="10" [(ngModel)]="f.choiceQty" /></label>
              <label class="field">From category
                <select name="cc" [(ngModel)]="f.choiceCategoryId" required>
                  <option [ngValue]="null" disabled>Choose…</option>
                  @for (c of categories(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
                </select>
              </label>
            </div>
          } @else {
            <div class="lines">
              @for (l of f.lines; track $index) {
                <div class="line">
                  <select [name]="'i' + $index" [(ngModel)]="l.itemId" required>
                    <option [ngValue]="null" disabled>Choose item…</option>
                    @for (i of activeItems(); track i.id) { <option [ngValue]="i.id">{{ i.name }} · {{ money(i.price) }}</option> }
                  </select>
                  <input [name]="'q' + $index" type="number" min="1" [(ngModel)]="l.qty" aria-label="Quantity" />
                  <button type="button" class="icon ghost" (click)="f.lines.splice($index, 1)" [disabled]="f.lines.length === 1" aria-label="Remove">✕</button>
                </div>
              }
              <button type="button" class="sm" (click)="f.lines.push({ itemId: null, qty: 1 })">+ Add another item</button>
              @if (formWorth(f); as w) {
                <p class="muted small">Separately: <b class="money">{{ money(w) }}</b>
                  @if (f.price !== null && w > toPaise(f.price)) { · customer saves <b class="money">{{ money(w - toPaise(f.price)) }}</b> }</p>
              }
            </div>
          }
          <div class="form-actions">
            <button type="button" (click)="comboForm.set(null)">Cancel</button>
            <button class="primary" [disabled]="saving() || !f.name.trim() || f.price === null">{{ f.id ? 'Save changes' : 'Add combo' }}</button>
          </div>
        </form>
      </div>
    }
  `,
  styles: [`
    .tabs { margin-bottom: 16px; gap: 14px; }
    .tabs .chips { flex: 1; min-width: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 16px; }
    @media (max-width: 560px) {
      .grid { grid-template-columns: 1fr 1fr; gap: 10px; }
      .body { padding: 10px; } .ds { display: none; }
      .prod .foot { flex-direction: column; align-items: stretch; } .prod .foot .row { justify-content: space-between; }
    }
    .full { grid-column: 1 / -1; }
    .prod { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; }
    .prod.off .pic, .prod.off .body h3 { opacity: .5; }
    .pic { position: relative; aspect-ratio: 16 / 10; background: var(--surface-2); display: grid; place-items: center; }
    .pic img { width: 100%; height: 100%; object-fit: cover; }
    .noimg { color: var(--muted); font-size: .85rem; }
    .flags { position: absolute; top: 8px; left: 8px; display: flex; gap: 6px; }
    .body { padding: 12px 14px 14px; display: grid; gap: 4px; flex: 1; align-content: start; }
    .ds { font-size: .85rem; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; gap: 8px; }
    .strike { text-decoration: line-through; margin-left: 6px; }
    .cats { display: grid; gap: 4px; max-width: 640px; }
    .add { margin-bottom: 10px; flex-wrap: nowrap; }
    .cat { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-top: 1px solid var(--line); }
    .order { display: flex; }
    .grow { flex: 1; min-width: 0; }
    .photo-row { display: grid; grid-template-columns: 120px 1fr; gap: 14px; align-items: center; }
    .photo { width: 120px; aspect-ratio: 4 / 3; border-radius: var(--radius-sm); background: var(--surface-2); overflow: hidden; display: grid; place-items: center; }
    .photo img { width: 100%; height: 100%; object-fit: cover; }
    .lines { display: grid; gap: 8px; }
    .line { display: grid; grid-template-columns: 1fr 80px 40px; gap: 8px; }
  `],
})
export class MenuPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);
  money = formatRupees;
  toPaise = toPaise;
  blankCombo = blankCombo;

  tab = signal<Tab>('items');
  categories = signal<Category[]>([]);
  items = signal<Item[]>([]);
  combos = signal<Combo[]>([]);
  catFilter = signal<number | null>(null);
  itemForm = signal<ItemForm | null>(null);
  comboForm = signal<ComboForm | null>(null);
  saving = signal(false);
  renaming = signal<number | null>(null);
  renameTo = '';
  newCategory = '';

  shownItems = computed(() => {
    const c = this.catFilter();
    return c === null ? this.items() : this.items().filter((i) => i.categoryId === c);
  });
  activeItems = computed(() => this.items().filter((i) => i.isActive));

  ngOnInit() { this.reload(); }

  reload() {
    this.api.categories().subscribe((r) => this.categories.set(r));
    this.api.items().subscribe((r) => this.items.set(r));
    this.api.combos().subscribe((r) => this.combos.set(r));
  }

  categoryName(id: number) { return this.categories().find((c) => c.id === id)?.name ?? '—'; }
  countIn(id: number) { return this.items().filter((i) => i.categoryId === id).length; }
  private itemName(id: number) { return this.items().find((i) => i.id === id)?.name ?? '?'; }

  comboSummary(c: Combo) {
    if (c.choiceCategoryId) return `Any ${c.choiceQty} from ${this.categoryName(c.choiceCategoryId)}`;
    return c.items.map((l) => `${l.qty > 1 ? l.qty + '× ' : ''}${this.itemName(l.itemId)}`).join(' + ');
  }
  /** What the fixed items would cost separately (shown struck through). */
  comboWorth(c: Combo) {
    if (c.choiceCategoryId) return 0;
    const w = c.items.reduce((s, l) => s + (this.items().find((i) => i.id === l.itemId)?.price ?? 0) * l.qty, 0);
    return w > c.price ? w : 0;
  }
  formWorth(f: ComboForm) {
    return f.lines.reduce((s, l) => s + (this.items().find((i) => i.id === l.itemId)?.price ?? 0) * l.qty, 0);
  }

  // ---- categories ----
  addCategory() {
    const name = this.newCategory.trim();
    this.api.createCategory({ name, sortOrder: this.categories().length }).subscribe(() => {
      this.newCategory = '';
      this.toast.ok(`Added "${name}"`);
      this.reload();
    });
  }
  rename(c: Category) {
    const name = this.renameTo.trim();
    if (!name) return;
    this.api.updateCategory(c.id, { name, sortOrder: c.sortOrder }).subscribe(() => { this.renaming.set(null); this.reload(); });
  }
  move(c: Category, dir: -1 | 1) {
    const list = [...this.categories()];
    const i = list.findIndex((x) => x.id === c.id);
    [list[i], list[i + dir]] = [list[i + dir], list[i]];
    this.categories.set(list);
    list.forEach((x, idx) => this.api.updateCategory(x.id, { name: x.name, sortOrder: idx }).subscribe());
  }
  async removeCategory(c: Category) {
    const ok = await this.dialog.confirm({ title: `Delete "${c.name}"?`, message: 'Only empty categories can be deleted.', okLabel: 'Delete', danger: true });
    if (ok) this.api.deleteCategory(c.id).subscribe(() => { this.toast.ok('Category deleted'); this.reload(); });
  }

  // ---- uploads ----
  upload(ev: Event, f: { imageUrl: string | null }) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { this.toast.error('Photo is larger than 8 MB'); input.value = ''; return; }
    this.api.upload(file).subscribe((r) => (f.imageUrl = r.url));
  }

  // ---- items ----
  newItem() { this.itemForm.set(blankItem(this.catFilter() ?? this.categories()[0]?.id ?? null)); }
  editItem(i: Item) { this.itemForm.set(this.toForm(i)); }
  private itemBody(f: ItemForm) {
    return {
      categoryId: f.categoryId!, name: f.name.trim(), description: f.description.trim() || undefined,
      price: toPaise(f.price ?? 0), imageUrl: f.imageUrl ?? undefined,
      trackStock: f.trackStock, lowStockAt: f.lowStockAt ?? 0, isActive: f.isActive, isFavourite: f.isFavourite,
    };
  }
  saveItem(f: ItemForm) {
    this.saving.set(true);
    const req = f.id ? this.api.updateItem(f.id, this.itemBody(f)) : this.api.createItem(this.itemBody(f));
    req.subscribe({
      next: () => { this.saving.set(false); this.itemForm.set(null); this.toast.ok(f.id ? 'Item updated' : 'Item added'); this.reload(); },
      error: () => this.saving.set(false),
    });
  }
  toggleItem(i: Item) {
    const f: ItemForm = { ...this.toForm(i), isActive: !i.isActive };
    this.api.updateItem(i.id, this.itemBody(f)).subscribe(() => this.reload());
  }
  private toForm(i: Item): ItemForm {
    return {
      id: i.id, categoryId: i.categoryId, name: i.name, description: i.description ?? '', price: toRupees(i.price),
      imageUrl: i.imageUrl, trackStock: i.trackStock, lowStockAt: i.lowStockAt, isActive: i.isActive, isFavourite: i.isFavourite,
    };
  }

  // ---- combos ----
  private comboBody(f: ComboForm) {
    const choice = f.mode === 'choice';
    return {
      name: f.name.trim(), description: f.description.trim() || undefined, imageUrl: f.imageUrl ?? undefined,
      price: toPaise(f.price ?? 0), isActive: f.isActive,
      choiceCategoryId: choice ? f.choiceCategoryId : null,
      choiceQty: choice ? f.choiceQty : null,
      items: choice ? [] : f.lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId!, qty: l.qty })),
    } as Partial<Combo>;
  }
  editCombo(c: Combo) {
    this.comboForm.set({
      id: c.id, name: c.name, description: c.description ?? '', imageUrl: c.imageUrl, price: toRupees(c.price), isActive: c.isActive,
      mode: c.choiceCategoryId ? 'choice' : 'fixed', choiceCategoryId: c.choiceCategoryId, choiceQty: c.choiceQty ?? 2,
      lines: c.items.length ? c.items.map((l) => ({ ...l })) : [{ itemId: null, qty: 1 }],
    });
  }
  saveCombo(f: ComboForm) {
    this.saving.set(true);
    const req = f.id ? this.api.updateCombo(f.id, this.comboBody(f)) : this.api.createCombo(this.comboBody(f));
    req.subscribe({
      next: () => { this.saving.set(false); this.comboForm.set(null); this.toast.ok(f.id ? 'Combo updated' : 'Combo added'); this.reload(); },
      error: () => this.saving.set(false),
    });
  }
  toggleCombo(c: Combo) {
    this.editCombo(c);
    const f = { ...this.comboForm()!, isActive: !c.isActive };
    this.comboForm.set(null);
    this.api.updateCombo(c.id, this.comboBody(f)).subscribe(() => this.reload());
  }
}
