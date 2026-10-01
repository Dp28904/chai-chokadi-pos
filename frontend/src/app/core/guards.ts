import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const loggedIn: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.user() ? true : inject(Router).parseUrl('/login');
};

export const adminOnly: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (!auth.user()) return inject(Router).parseUrl('/login');
  return auth.isAdmin() ? true : inject(Router).parseUrl('/counter');
};

export const guestOnly: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.user() ? inject(Router).parseUrl(auth.homeUrl()) : true;
};

export const home: CanActivateFn = () => {
  const auth = inject(AuthService);
  return inject(Router).parseUrl(auth.user() ? auth.homeUrl() : '/login');
};
