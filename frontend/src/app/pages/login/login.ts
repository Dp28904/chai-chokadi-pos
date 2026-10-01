import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { BrandService } from '../../core/brand.service';
import { errorMessage } from '../../core/http-context';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <main class="wrap">
      <section class="hero" aria-hidden="true">
        <div class="pattern"></div>
        <div class="copy">
          <img class="logo" src="logo.webp" alt="" width="220" height="220" />
          <h1 class="display">{{ brand.stallName() }}</h1>
          <p class="tag">GARBA NI RAAT, CHAI NI VAAT</p>
          <p class="sub">Fresh Bites • Chai • Garba • Good Vibes</p>
        </div>
      </section>
      <section class="panel">
        <form class="form" (ngSubmit)="submit()" autocomplete="on">
          <div class="head">
            <img class="mobile-logo" src="logo.webp" alt="" width="84" height="84" />
            <h2>Welcome back</h2>
            <p class="muted">Sign in to start billing.</p>
          </div>
          <label class="field">Username
            <input name="u" [(ngModel)]="username" autocomplete="username" autocapitalize="none" spellcheck="false" required />
          </label>
          <label class="field">Password
            <span class="pw">
              <input name="p" [type]="show() ? 'text' : 'password'" [(ngModel)]="password" autocomplete="current-password" required />
              <button type="button" class="ghost sm" (click)="show.set(!show())">{{ show() ? 'Hide' : 'Show' }}</button>
            </span>
          </label>
          @if (error()) { <p class="alert" role="alert">{{ error() }}</p> }
          <button class="primary lg block" [disabled]="busy() || !username || !password">
            {{ busy() ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>
      </section>
    </main>
  `,
  styles: [`
    .wrap { min-height: 100dvh; display: grid; grid-template-columns: 1.1fr 1fr; }
    .hero {
      position: relative; overflow: hidden; color: var(--on-bg);
      display: grid; place-items: center; padding: 48px;
      border-right: 1px solid rgba(245, 184, 61, 0.3);
      background: radial-gradient(90% 70% at 30% 20%, rgba(232, 117, 25, 0.22), transparent 70%), rgba(0, 0, 0, 0.18);
    }
    .copy { position: relative; text-align: center; display: grid; gap: 10px; justify-items: center; }
    .logo { border-radius: 999px; box-shadow: 0 0 0 3px rgba(245, 184, 61, 0.75), 0 18px 50px rgba(0, 0, 0, 0.55); margin-bottom: 10px; }
    .copy h1 { font-size: clamp(2.4rem, 4.5vw, 3.6rem); color: var(--gold); font-weight: 400; }
    .tag { letter-spacing: .18em; font-size: .85rem; font-weight: 600; color: var(--on-bg); }
    .sub { color: var(--on-bg-muted); font-size: .9rem; }
    .panel { display: grid; place-items: center; padding: 32px 20px; }
    .form {
      width: 100%; max-width: 380px; display: grid; gap: 16px;
      background: var(--surface); color: var(--ink); border: 1px solid var(--line-strong);
      border-radius: var(--radius-lg); padding: 28px 26px; box-shadow: var(--shadow-lg);
    }
    .head { display: grid; gap: 6px; margin-bottom: 4px; justify-items: start; }
    .mobile-logo { display: none; border-radius: 999px; box-shadow: 0 0 0 2px var(--gold); margin-bottom: 6px; }
    .pw { position: relative; display: block; }
    .pw input { padding-right: 64px; }
    .pw button { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); }
    .alert { background: var(--danger-soft); color: var(--danger); padding: 10px 12px; border-radius: var(--radius-sm); font-size: .9rem; font-weight: 600; }
    @media (max-width: 820px) {
      .wrap { grid-template-columns: 1fr; }
      .hero { display: none; }
      .mobile-logo { display: block; }
    }
  `],
})
export class Login {
  private auth = inject(AuthService);
  private router = inject(Router);
  brand = inject(BrandService);
  username = '';
  password = '';
  show = signal(false);
  error = signal('');
  busy = signal(false);

  submit() {
    this.busy.set(true);
    this.error.set('');
    this.auth.login(this.username.trim(), this.password).subscribe({
      next: () => this.router.navigateByUrl(this.auth.homeUrl()),
      error: (e) => {
        this.busy.set(false);
        this.error.set(e.status === 401 ? (e.error?.message ?? 'Invalid username or password') : errorMessage(e));
      },
    });
  }
}
