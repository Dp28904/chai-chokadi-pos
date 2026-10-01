import { Injectable, signal } from '@angular/core';

export interface ConfirmRequest {
  title: string;
  message: string;
  okLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

/** Styled replacement for window.confirm, rendered once in the app root. */
@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly pending = signal<ConfirmRequest | null>(null);

  confirm(opts: { title: string; message: string; okLabel?: string; danger?: boolean }): Promise<boolean> {
    return new Promise((resolve) => {
      this.pending.set({ okLabel: 'Confirm', danger: false, ...opts, resolve });
    });
  }

  answer(ok: boolean) {
    this.pending()?.resolve(ok);
    this.pending.set(null);
  }
}
