import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { DialogService } from '../../core/dialog.service';
import { AppUser } from '../../core/models';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-users-page',
  imports: [FormsModule],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Staff</h1><p>Counter logins can bill and see today's bills. Only admins see sales and settings.</p></div>
        <button class="primary" (click)="adding.set(true)">+ Add staff</button>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th class="r">Actions</th></tr></thead>
            <tbody>
              @for (u of users(); track u.id) {
                <tr [class.dim]="!u.isActive">
                  <td><b>{{ u.name }}</b> @if (u.id === me) { <span class="muted small">(you)</span> }</td>
                  <td class="muted">{{ u.username }}</td>
                  <td><span class="badge" [class.brand]="u.role === 'ADMIN'">{{ u.role === 'ADMIN' ? 'Admin' : 'Counter' }}</span></td>
                  <td><span class="badge" [class.ok]="u.isActive">{{ u.isActive ? 'Active' : 'Disabled' }}</span></td>
                  <td class="r">
                    <span class="row end">
                      @if (u.id !== me) {
                        <button class="sm" (click)="resetFor.set(u); newPassword = ''">Reset password</button>
                        <button class="sm" [class.danger]="u.isActive" (click)="toggle(u)">{{ u.isActive ? 'Disable' : 'Enable' }}</button>
                      } @else { <span class="muted small">Change yours in Settings</span> }
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>

    @if (adding()) {
      <div class="backdrop" (click)="adding.set(false)">
        <form class="modal form-grid" (click)="$event.stopPropagation()" (ngSubmit)="add()">
          <div class="modal-head"><h2>Add counter staff</h2>
            <button type="button" class="ghost icon" (click)="adding.set(false)" aria-label="Close">✕</button></div>
          <label class="field">Name <input name="n" [(ngModel)]="f.name" required maxlength="60" /></label>
          <label class="field">Username <span class="hint">letters, numbers, . _ -</span>
            <input name="u" [(ngModel)]="f.username" required autocapitalize="none" spellcheck="false" /></label>
          <label class="field">Password <span class="hint">at least 6 characters</span>
            <input name="p" type="text" [(ngModel)]="f.password" required minlength="6" autocomplete="new-password" /></label>
          <div class="form-actions">
            <button type="button" (click)="adding.set(false)">Cancel</button>
            <button class="primary" [disabled]="!f.name || !f.username || f.password.length < 6">Create login</button>
          </div>
        </form>
      </div>
    }

    @if (resetFor(); as u) {
      <div class="backdrop" (click)="resetFor.set(null)">
        <form class="modal form-grid" (click)="$event.stopPropagation()" (ngSubmit)="reset(u)">
          <h2>New password for {{ u.name }}</h2>
          <label class="field">Password <span class="hint">at least 6 characters</span>
            <input name="np" type="text" [(ngModel)]="newPassword" minlength="6" autocomplete="new-password" required /></label>
          <div class="form-actions">
            <button type="button" (click)="resetFor.set(null)">Cancel</button>
            <button class="primary" [disabled]="newPassword.length < 6">Set password</button>
          </div>
        </form>
      </div>
    }
  `,
  styles: [`.end { justify-content: flex-end; flex-wrap: nowrap; }`],
})
export class UsersPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);
  me = inject(AuthService).user()?.id;
  users = signal<AppUser[]>([]);
  adding = signal(false);
  resetFor = signal<AppUser | null>(null);
  newPassword = '';
  f = { name: '', username: '', password: '' };

  ngOnInit() { this.load(); }
  load() { this.api.users().subscribe((u) => this.users.set(u)); }

  add() {
    this.api.createUser({ ...this.f, username: this.f.username.trim() }).subscribe((u) => {
      this.toast.ok(`Login created for ${u.name} (${u.username})`);
      this.f = { name: '', username: '', password: '' };
      this.adding.set(false);
      this.load();
    });
  }

  reset(u: AppUser) {
    this.api.updateUser(u.id, { password: this.newPassword }).subscribe(() => {
      this.toast.ok(`Password changed for ${u.name}`);
      this.resetFor.set(null);
    });
  }

  async toggle(u: AppUser) {
    if (u.isActive) {
      const ok = await this.dialog.confirm({
        title: `Disable ${u.name}?`, message: 'They are signed out on every device and cannot log in until enabled again.',
        okLabel: 'Disable', danger: true,
      });
      if (!ok) return;
    }
    this.api.updateUser(u.id, { isActive: !u.isActive }).subscribe(() => {
      this.toast.ok(u.isActive ? `${u.name} disabled` : `${u.name} enabled`);
      this.load();
    });
  }
}
