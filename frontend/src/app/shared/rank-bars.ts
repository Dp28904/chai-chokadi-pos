import { Component, computed, input } from '@angular/core';

export interface RankRow { name: string; value: number; text: string; detail?: string }

/** Horizontal ranked bars, single hue, sorted by the caller. */
@Component({
  selector: 'app-rank-bars',
  template: `
    @for (r of rows(); track r.name) {
      <div class="row" [title]="r.name + ': ' + r.text + (r.detail ? ' · ' + r.detail : '')">
        <span class="nm">{{ r.name }}</span>
        <span class="track"><span class="fill" [style.width.%]="pct(r.value)"></span></span>
        <b class="val">{{ r.text }}</b>
      </div>
    } @empty { <p class="muted">No sales in this period.</p> }
  `,
  styles: [`
    .row { display: grid; grid-template-columns: minmax(80px, 30%) 1fr auto; gap: 10px; align-items: center; padding: 4px 0; }
    .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .track { height: 14px; }
    .fill { display: block; height: 100%; background: var(--series-1); border-radius: 0 4px 4px 0; min-width: 2px; transition: width .2s; }
    .row:hover .fill { filter: brightness(1.15); }
    .val { min-width: 64px; text-align: right; }
  `],
})
export class RankBars {
  rows = input.required<RankRow[]>();
  private max = computed(() => Math.max(1, ...this.rows().map((r) => r.value)));
  pct(v: number) { return (v / this.max()) * 100; }
}
