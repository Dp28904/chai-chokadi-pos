import { Injectable, signal } from '@angular/core';

export interface Toast { id: number; kind: 'ok' | 'error' | 'info'; text: string }

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private next = 1;

  ok(text: string) { this.push('ok', text); }
  error(text: string) { this.push('error', text); }
  info(text: string) { this.push('info', text); }

  dismiss(id: number) { this.toasts.update((ts) => ts.filter((t) => t.id !== id)); }

  private push(kind: Toast['kind'], text: string) {
    // Collapse repeats (e.g. several requests failing because the network dropped).
    if (this.toasts().some((t) => t.text === text)) return;
    const id = this.next++;
    this.toasts.update((ts) => [...ts.slice(-3), { id, kind, text }]);
    setTimeout(() => this.dismiss(id), kind === 'error' ? 6000 : 3000);
  }
}
