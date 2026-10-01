import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { BrandService } from '../core/brand.service';

interface NavLink { path: string; label: string }

const COUNTER_LINKS: NavLink[] = [
  { path: '/counter', label: 'Counter' },
  { path: '/bills', label: 'Bills' },
];
const ADMIN_LINKS: NavLink[] = [
  { path: '/admin/dashboard', label: 'Dashboard' },
  ...COUNTER_LINKS,
  { path: '/admin/menu', label: 'Menu' },
  { path: '/admin/offers', label: 'Offers' },
  { path: '/admin/stock', label: 'Stock' },
  { path: '/admin/staff', label: 'Staff' },
  { path: '/admin/settings', label: 'Settings' },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="bar">
      <a class="brand" [routerLink]="auth.homeUrl()">
        <img class="logo" src="logo.webp" alt="" width="42" height="42" />
        <span class="name display">{{ brand.stallName() }}</span>
      </a>
      <nav aria-label="Main">
        @for (l of links(); track l.path) {
          <a [routerLink]="l.path" routerLinkActive="on">{{ l.label }}</a>
        }
      </nav>
      <div class="me">
        <span class="who">
          <b>{{ auth.user()?.name }}</b>
          <span class="role">{{ auth.isAdmin() ? 'Admin' : 'Counter' }}</span>
        </span>
        <button class="sm" (click)="auth.logout()">Log out</button>
      </div>
    </header>
    <router-outlet />
  `,
  styles: [`
    :host { display: block; min-height: 100dvh; }
    .bar {
      position: sticky; top: 0; z-index: 20;
      display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px 20px;
      padding: 8px 18px; min-height: 62px;
      background: linear-gradient(180deg, rgba(62, 33, 21, 0.97), rgba(40, 21, 13, 0.97));
      backdrop-filter: blur(8px);
      border-bottom: 1px solid rgba(245, 184, 61, 0.35);
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
      color: var(--on-bg);
    }
    .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--on-bg); }
    .logo { border-radius: 999px; box-shadow: 0 0 0 2px rgba(245, 184, 61, 0.7); }
    .name { font-size: 1.45rem; line-height: 1; color: var(--gold); }
    nav { display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; }
    nav::-webkit-scrollbar { display: none; }
    nav a {
      flex: none; padding: 7px 13px; border-radius: 999px; font-weight: 600; font-size: .9rem;
      color: var(--on-bg-muted); text-decoration: none; transition: background .12s, color .12s;
    }
    nav a:hover { background: rgba(255, 248, 232, 0.1); color: var(--on-bg); }
    nav a.on { background: var(--brand); color: var(--brand-ink); }
    .me { display: flex; align-items: center; gap: 10px; }
    .who { display: grid; text-align: right; line-height: 1.15; font-size: .85rem; color: var(--on-bg); }
    .role { color: var(--on-bg-muted); font-size: .75rem; }
    @media (max-width: 860px) {
      .bar { grid-template-columns: 1fr auto; padding: 8px 12px 6px; }
      nav { grid-column: 1 / -1; grid-row: 2; margin: 0 -12px; padding: 0 12px 2px; }
      .who { display: none; }
    }
  `],
})
export class Shell {
  auth = inject(AuthService);
  brand = inject(BrandService);
  links = computed(() => (this.auth.isAdmin() ? ADMIN_LINKS : COUNTER_LINKS));
}
