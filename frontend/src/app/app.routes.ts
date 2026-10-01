import { Routes } from '@angular/router';
import { adminOnly, guestOnly, home, loggedIn } from './core/guards';

export const routes: Routes = [
  { path: 'login', title: 'Sign in', canActivate: [guestOnly], loadComponent: () => import('./pages/login/login').then((m) => m.Login) },
  {
    path: '',
    canActivate: [loggedIn],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: 'counter', title: 'Counter', loadComponent: () => import('./pages/counter-page').then((m) => m.CounterPage) },
      { path: 'bills', title: 'Bills', loadComponent: () => import('./pages/counter/orders-page').then((m) => m.OrdersPage) },
      {
        path: 'admin',
        canActivate: [adminOnly],
        children: [
          { path: 'dashboard', title: 'Dashboard', loadComponent: () => import('./pages/admin/dashboard-page').then((m) => m.DashboardPage) },
          { path: 'menu', title: 'Menu', loadComponent: () => import('./pages/admin/menu-page').then((m) => m.MenuPage) },
          { path: 'offers', title: 'Offers', loadComponent: () => import('./pages/admin/offers-page').then((m) => m.OffersPage) },
          { path: 'stock', title: 'Stock', loadComponent: () => import('./pages/admin/stock-page').then((m) => m.StockPage) },
          { path: 'staff', title: 'Staff', loadComponent: () => import('./pages/admin/users-page').then((m) => m.UsersPage) },
          { path: 'settings', title: 'Settings', loadComponent: () => import('./pages/admin/settings-page').then((m) => m.SettingsPage) },
          { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
        ],
      },
      { path: 'counter/orders', redirectTo: 'bills' },
    ],
  },
  { path: '**', canActivate: [home], children: [] },
];
