import { Component, ElementRef, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { compactRupees, formatRupees } from '../core/money';

export interface ChartSeries { name: string; color: string }
export interface ChartColumn { label: string; values: number[] }

const H = 260, L = 52, R = 8, T = 10, B = 28;

/** Thin-mark column chart (1 series, or stacked for 2+). Values are paise. */
@Component({
  selector: 'app-column-chart',
  template: `
    @if (series().length > 1) {
      <div class="legend">
        @for (s of series(); track s.name) {
          <span><i [style.background]="s.color"></i>{{ s.name }}</span>
        }
      </div>
    }
    <div class="wrap">
      <svg [attr.viewBox]="'0 0 ' + w() + ' ' + H" [attr.width]="w()" [attr.height]="H" role="img" [attr.aria-label]="ariaLabel()">
        @for (t of ticks(); track t.value) {
          <line [attr.x1]="L" [attr.x2]="w() - R" [attr.y1]="t.y" [attr.y2]="t.y" class="grid" />
          <text [attr.x]="L - 8" [attr.y]="t.y + 4" class="axis" text-anchor="end">{{ t.label }}</text>
        }
        @for (c of bars(); track c.i) {
          <g [class.dim]="hover() !== null && hover() !== c.i">
            @for (seg of c.segs; track seg.k) {
              <path [attr.d]="seg.d" [attr.fill]="seg.color" class="bar" />
            }
          </g>
          @if (c.showLabel) {
            <text [attr.x]="c.cx" [attr.y]="H - 8" class="axis" text-anchor="middle">{{ c.label }}</text>
          }
          <!-- hit target is the full column band, larger than the mark -->
          <rect class="hit" tabindex="0" [attr.x]="c.bx" [attr.y]="T" [attr.width]="band()" [attr.height]="H - T - B"
                [attr.aria-label]="c.aria"
                (pointerenter)="hover.set(c.i)" (pointermove)="hover.set(c.i)" (pointerleave)="hover.set(null)"
                (focus)="hover.set(c.i)" (blur)="hover.set(null)" />
        }
      </svg>
      @if (tip(); as t) {
        <div class="tip" [style.left.%]="t.left" [style.top.%]="t.top" [style.transform]="t.transform">
          <div class="th">{{ t.label }}</div>
          @for (r of t.rows; track r.name) {
            <div class="tr"><i [style.background]="r.color"></i><b>{{ r.value }}</b><span>{{ r.name }}</span></div>
          }
          @if (t.rows.length > 1) { <div class="tr tot"><b>{{ t.total }}</b><span>Total</span></div> }
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .wrap { position: relative; }
    svg { display: block; max-width: 100%; }
    .grid { stroke: var(--grid); stroke-width: 1; }
    .axis { fill: var(--axis-text); font-size: 11px; }
    .bar { stroke: var(--surface); stroke-width: 2; transition: opacity .1s; }
    .dim .bar { opacity: .45; }
    .hit { fill: transparent; outline: none; cursor: default; }
    .hit:focus-visible { stroke: var(--ink); stroke-width: 1; }
    .legend { display: flex; gap: 16px; margin-bottom: 6px; font-size: .85rem; color: var(--axis-text); }
    .legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
    .tip { position: absolute; pointer-events: none; background: var(--surface); color: var(--ink); border: 1px solid var(--line);
           border-radius: 8px; padding: 8px 10px; box-shadow: 0 4px 16px rgba(0,0,0,.18); font-size: .85rem; white-space: nowrap; z-index: 2; }
    .th { color: var(--axis-text); margin-bottom: 4px; }
    .tr { display: flex; align-items: center; gap: 8px; }
    .tr i { width: 10px; height: 3px; border-radius: 2px; }
    .tr b { font-size: 1rem; }
    .tr span { color: var(--axis-text); }
    .tot { border-top: 1px solid var(--line); margin-top: 4px; padding-top: 4px; }
  `],
})
export class ColumnChart {
  columns = input.required<ChartColumn[]>();
  series = input.required<ChartSeries[]>();
  unit = input('Sales');

  H = H; L = L; R = R; T = T; B = B;
  hover = signal<number | null>(null);
  /** Drawn at the real pixel width so axis text stays readable on phones. */
  w = signal(640);

  constructor() {
    const el = inject(ElementRef).nativeElement as HTMLElement;
    afterNextRender(() => {
      const fit = () => this.w.set(Math.max(280, Math.floor(el.clientWidth)));
      fit();
      new ResizeObserver(fit).observe(el);
    });
  }

  band = computed(() => (this.w() - L - R) / Math.max(1, this.columns().length));

  private max = computed(() =>
    Math.max(1, ...this.columns().map((c) => c.values.reduce((a, b) => a + b, 0))));

  /** Round step (1, 2, 2.5, 5 x 10^n) giving at most 4 gridline intervals. */
  private step = computed(() => {
    const m = this.max();
    const pow = 10 ** Math.floor(Math.log10(m));
    return [1, 2, 2.5, 5, 10].map((f) => f * pow).find((s) => m / s <= 4) ?? pow * 10;
  });
  private niceMax = computed(() => Math.ceil(this.max() / this.step()) * this.step());

  private y = (v: number) => T + (H - T - B) * (1 - v / this.niceMax());

  ticks = computed(() => {
    const n = Math.round(this.niceMax() / this.step());
    return Array.from({ length: n + 1 }, (_, i) => {
      const value = i * this.step();
      return { value, y: this.y(value), label: compactRupees(value) };
    });
  });

  bars = computed(() => {
    const cols = this.columns();
    const band = this.band();
    const barW = Math.min(band * 0.62, 44);
    const step = Math.max(1, Math.ceil(54 / band)); // keep x labels from colliding
    return cols.map((c, i) => {
      const bx = L + i * band;
      const cx = bx + band / 2;
      let acc = 0;
      const segs = c.values.map((v, k) => {
        const y1 = this.y(acc + v), y0 = this.y(acc);
        acc += v;
        const isTop = c.values.slice(k + 1).every((x) => x === 0);
        return v > 0
          ? { k, color: this.series()[k].color, d: rectPath(cx - barW / 2, y1, barW, y0 - y1, isTop ? 4 : 0) }
          : { k, color: 'none', d: '' };
      });
      const aria = `${c.label}: ` + c.values.map((v, k) => `${this.series()[k].name} ${formatRupees(v)}`).join(', ');
      return { i, bx, cx, segs, label: c.label, showLabel: i % step === 0, aria };
    });
  });

  tip = computed(() => {
    const i = this.hover();
    if (i === null) return null;
    const c = this.columns()[i];
    const total = c.values.reduce((a, b) => a + b, 0);
    const cx = L + i * this.band() + this.band() / 2;
    const left = Math.min(88, Math.max(12, (cx / this.w()) * 100));
    const top = (this.y(total) / H) * 100;
    return {
      label: c.label, total: formatRupees(total), left, top,
      transform: 'translate(-50%, calc(-100% - 8px))',
      rows: c.values.map((v, k) => ({ name: this.series()[k].name, color: this.series()[k].color, value: formatRupees(v) }))
        .filter((r, k) => c.values[k] > 0 || this.series().length === 1),
    };
  });

  ariaLabel = computed(() => `${this.unit()} chart with ${this.columns().length} columns`);
}

/** Rect with only the top corners rounded, anchored at the baseline. */
function rectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
