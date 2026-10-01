import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { SILENT } from './http-context';
import { SessionUser } from './models';

const KEY = 'stall.session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private session = signal<{ token: string; user: SessionUser } | null>(this.load());
  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAdmin = computed(() => this.session()?.user.role === 'ADMIN');
  get token() { return this.session()?.token ?? null; }

  /** Login errors are shown on the form, not as toasts. */
  login(username: string, password: string) {
    return this.http
      .post<{ token: string; user: SessionUser }>('/api/auth/login', { username, password }, { context: SILENT() })
      .pipe(tap((s) => { this.session.set(s); this.save(s); }));
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.http.post('/api/auth/change-password', { currentPassword, newPassword });
  }

  homeUrl() { return this.isAdmin() ? '/admin/dashboard' : '/counter'; }

  logout() {
    if (!this.session()) return;
    this.session.set(null);
    try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
    this.router.navigateByUrl('/login');
  }

  private load() {
    try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
  }
  private save(s: unknown) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
  }
}
