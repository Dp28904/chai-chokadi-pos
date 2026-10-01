import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { SILENT_ERRORS, errorMessage } from './http-context';
import { ToastService } from './toast.service';

/** Adds the bearer token, and reports every API error in one place. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const toast = inject(ToastService);
  const token = auth.token;
  const authed = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(authed).pipe(
    catchError((err: HttpErrorResponse) => {
      const isLogin = req.url.endsWith('/auth/login');
      if (err.status === 401 && !isLogin) {
        if (auth.user()) toast.info('Session ended. Please sign in again.');
        auth.logout();
      } else if (!req.context.get(SILENT_ERRORS)) {
        toast.error(errorMessage(err));
      }
      return throwError(() => err);
    }),
  );
};
