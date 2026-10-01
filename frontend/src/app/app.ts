import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DialogService } from './core/dialog.service';
import { ToastService } from './core/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    <router-outlet />

    <div class="toasts" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class]="'toast ' + t.kind" role="status">
          <span class="dot" aria-hidden="true">{{ t.kind === 'ok' ? '✓' : t.kind === 'error' ? '!' : 'i' }}</span>
          <span class="txt">{{ t.text }}</span>
          <button class="ghost icon sm" (click)="toast.dismiss(t.id)" aria-label="Dismiss">×</button>
        </div>
      }
    </div>

    @if (dialog.pending(); as d) {
      <div class="backdrop" (click)="dialog.answer(false)">
        <div class="modal" role="alertdialog" aria-modal="true" [attr.aria-label]="d.title" (click)="$event.stopPropagation()">
          <h2>{{ d.title }}</h2>
          <p class="muted">{{ d.message }}</p>
          <div class="form-actions">
            <button (click)="dialog.answer(false)">Cancel</button>
            <button [class]="d.danger ? 'danger' : 'primary'" (click)="dialog.answer(true)">{{ d.okLabel }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .toasts { position: fixed; z-index: 100; left: 50%; bottom: 20px; transform: translateX(-50%);
              display: grid; gap: 8px; width: min(440px, calc(100vw - 24px)); pointer-events: none; }
    .toast { pointer-events: auto; display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 12px;
             background: var(--on-bg); color: var(--ink); border: 1px solid var(--gold); border-radius: var(--radius); box-shadow: var(--shadow-lg);
             font-size: .92rem; animation: pop .15s ease-out; }
    .toast .txt { flex: 1; }
    .toast button { color: inherit; opacity: .7; }
    .dot { width: 22px; height: 22px; border-radius: 999px; display: grid; place-items: center; font-size: .75rem; font-weight: 700; flex: none; }
    .ok .dot { background: var(--ok); color: #fff; }
    .error .dot { background: var(--danger); color: #fff; }
    .info .dot { background: var(--brand); color: var(--brand-ink); }
  `],
})
export class App {
  toast = inject(ToastService);
  dialog = inject(DialogService);
}
