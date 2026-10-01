import { Component, computed, input, output, signal } from '@angular/core';
import { Combo, Item } from '../../core/models';
import { formatRupees } from '../../core/money';

/** Pick the items for an "any N from the menu" combo. */
@Component({
  selector: 'app-combo-picker',
  template: `
    <div class="backdrop" (click)="cancelled.emit()">
      <div class="modal" role="dialog" aria-modal="true" [attr.aria-label]="combo().name" (click)="$event.stopPropagation()">
        <div class="modal-head">
          <div>
            <h2>{{ combo().name }}</h2>
            <p class="muted">Choose {{ need() }} · <span class="money">{{ money(combo().price) }}</span></p>
          </div>
          <span class="badge" [class.ok]="picked() === need()">{{ picked() }} / {{ need() }}</span>
        </div>
        <div class="list">
          @for (i of options(); track i.id) {
            <div class="opt" [class.sel]="count(i.id) > 0">
              @if (i.imageUrl) { <img class="thumb" [src]="i.imageUrl" alt="" /> } @else { <span class="thumb"></span> }
              <span class="nm">{{ i.name }}</span>
              <span class="qty-step">
                <button (click)="change(i.id, -1)" [disabled]="!count(i.id)" [attr.aria-label]="'Remove ' + i.name">−</button>
                <b>{{ count(i.id) }}</b>
                <button (click)="change(i.id, 1)" [disabled]="picked() >= need()" [attr.aria-label]="'Add ' + i.name">+</button>
              </span>
            </div>
          }
        </div>
        <div class="form-actions">
          <button (click)="cancelled.emit()">Cancel</button>
          <button class="primary" [disabled]="picked() !== need()" (click)="chosen.emit(picks())">Add to order</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .list { display: grid; gap: 8px; }
    .opt { display: grid; grid-template-columns: 44px 1fr auto; gap: 12px; align-items: center; padding: 8px; border-radius: var(--radius); border: 1px solid var(--line); }
    .opt.sel { border-color: var(--brand); background: var(--brand-soft); }
    .nm { font-weight: 600; }
  `],
})
export class ComboPicker {
  combo = input.required<Combo>();
  items = input.required<Item[]>();
  chosen = output<number[]>();
  cancelled = output<void>();
  money = formatRupees;

  picks = signal<number[]>([]);
  need = computed(() => this.combo().choiceQty ?? 0);
  options = computed(() => this.items().filter((i) => i.isActive && i.categoryId === this.combo().choiceCategoryId));
  picked = computed(() => this.picks().length);

  count(id: number) { return this.picks().filter((x) => x === id).length; }
  change(id: number, delta: number) {
    this.picks.update((ps) => {
      if (delta > 0) return ps.length < this.need() ? [...ps, id] : ps;
      const at = ps.lastIndexOf(id);
      return at < 0 ? ps : [...ps.slice(0, at), ...ps.slice(at + 1)];
    });
  }
}
