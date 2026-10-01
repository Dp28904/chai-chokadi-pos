import { HttpContext, HttpContextToken } from '@angular/common/http';

/** Set on requests whose errors the caller handles itself (no toast). */
export const SILENT_ERRORS = new HttpContextToken<boolean>(() => false);
export const SILENT = () => new HttpContext().set(SILENT_ERRORS, true);

export function errorMessage(e: unknown): string {
  const err = e as { status?: number; error?: { message?: string | string[] } };
  if (err?.status === 0) return 'Cannot reach the server. Check the internet connection.';
  const m = err?.error?.message;
  if (Array.isArray(m)) return m.join('. ');
  if (typeof m === 'string' && m) return m;
  if (err?.status === 429) return 'Too many attempts. Please wait a minute.';
  if (err?.status && err.status >= 500) return 'Server error. Please try again.';
  return 'Something went wrong';
}
