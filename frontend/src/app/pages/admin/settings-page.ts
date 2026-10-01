import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { BrandService } from '../../core/brand.service';
import { Settings } from '../../core/models';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-settings-page',
  imports: [FormsModule],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Settings</h1><p>Stall details, payment QR and your password.</p></div></div>

      <div class="layout">
        <form class="card form-grid" (ngSubmit)="save()">
          <h2>Stall</h2>
          <label class="field">Stall name <span class="hint">Shown in the header and on the login screen</span>
            <input name="sn" [(ngModel)]="s.stallName" maxlength="60" /></label>
          <label class="field">UPI ID <span class="hint">Shown under the QR, e.g. name&#64;okbank</span>
            <input name="upi" [(ngModel)]="s.upiId" maxlength="80" placeholder="name@bank" /></label>
          <div class="form-actions"><button class="primary" [disabled]="saving()">Save</button></div>
        </form>

        <section class="card qr-card">
          <h2>Payment QR</h2>
          <p class="muted small">Customers scan this when paying online. Use the QR from your UPI or bank app.</p>
          <div class="qr">
            @if (s.paymentQrUrl) { <img [src]="s.paymentQrUrl" alt="Payment QR" /> }
            @else { <span class="muted">No QR yet</span> }
          </div>
          <label class="btn upload">
            {{ s.paymentQrUrl ? 'Replace QR image' : 'Upload QR image' }}
            <input type="file" accept="image/png,image/jpeg,image/webp" (change)="pickQr($event)" class="sr-only" />
          </label>
        </section>

        <form class="card form-grid" (ngSubmit)="changePassword()">
          <h2>Your password</h2>
          <p class="muted small">Signed in as <b>{{ auth.user()?.username }}</b>.</p>
          <label class="field">Current password <input name="cp" type="password" [(ngModel)]="pw.current" autocomplete="current-password" required /></label>
          <label class="field">New password <span class="hint">at least 8 characters</span>
            <input name="np" type="password" [(ngModel)]="pw.next" autocomplete="new-password" minlength="8" required /></label>
          <label class="field">Repeat new password
            <input name="np2" type="password" [(ngModel)]="pw.repeat" autocomplete="new-password" required /></label>
          @if (pw.repeat && pw.next !== pw.repeat) { <p class="error small">Passwords don't match</p> }
          <div class="form-actions">
            <button class="primary" [disabled]="!pw.current || pw.next.length < 8 || pw.next !== pw.repeat">Change password</button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .layout { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; align-items: start; }
    .qr-card { display: grid; gap: 12px; justify-items: start; }
    .qr { width: 220px; aspect-ratio: 1; border-radius: var(--radius); border: 1px dashed var(--line-strong); background: #fff;
          display: grid; place-items: center; overflow: hidden; }
    .qr img { width: 100%; height: 100%; object-fit: contain; }
    .upload { position: relative; }
  `],
})
export class SettingsPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private brand = inject(BrandService);
  auth = inject(AuthService);
  s: Settings = { stallName: '', upiId: '', paymentQrUrl: '' };
  saving = signal(false);
  pw = { current: '', next: '', repeat: '' };

  ngOnInit() { this.api.settings().subscribe((r) => (this.s = r)); }

  pickQr(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { this.toast.error('Image is larger than 2 MB'); return; }
    this.api.upload(file).subscribe((r) => {
      this.api.saveSettings({ paymentQrUrl: r.url }).subscribe((s) => { this.s = s; this.toast.ok('Payment QR updated'); });
    });
  }

  save() {
    this.saving.set(true);
    this.api.saveSettings({ stallName: this.s.stallName, upiId: this.s.upiId }).subscribe({
      next: (r) => { this.s = r; this.saving.set(false); this.brand.refresh(); this.toast.ok('Settings saved'); },
      error: () => this.saving.set(false),
    });
  }

  changePassword() {
    this.auth.changePassword(this.pw.current, this.pw.next).subscribe(() => {
      this.pw = { current: '', next: '', repeat: '' };
      this.toast.ok('Password changed');
    });
  }
}
