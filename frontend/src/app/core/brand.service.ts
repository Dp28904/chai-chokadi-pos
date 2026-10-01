import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { SILENT } from './http-context';

/** Stall name for headers and page titles. */
@Injectable({ providedIn: 'root' })
export class BrandService {
  private http = inject(HttpClient);
  readonly stallName = signal('Stall POS');

  constructor() { this.refresh(); }

  refresh() {
    this.http.get<{ stallName: string }>('/api/settings/public', { context: SILENT() })
      .subscribe({ next: (r) => this.stallName.set(r.stallName), error: () => {} });
  }
}
