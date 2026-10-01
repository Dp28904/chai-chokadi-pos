import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { SILENT } from './http-context';
import { AnalyticsSummary, AppUser, Category, Combo, Item, Offer, Order, PricedCart, RecommendationResult, Settings, StockMove, StockRow } from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  categories() { return this.http.get<Category[]>('/api/categories'); }
  createCategory(b: Partial<Category>) { return this.http.post<Category>('/api/categories', b); }
  updateCategory(id: number, b: Partial<Category>) { return this.http.put<Category>(`/api/categories/${id}`, b); }
  deleteCategory(id: number) { return this.http.delete<{ deleted: boolean }>(`/api/categories/${id}`); }

  items() { return this.http.get<Item[]>('/api/items'); }
  createItem(b: Partial<Item>) { return this.http.post<Item>('/api/items', b); }
  updateItem(id: number, b: Partial<Item>) { return this.http.put<Item>(`/api/items/${id}`, b); }

  combos() { return this.http.get<Combo[]>('/api/combos'); }
  createCombo(b: Partial<Combo>) { return this.http.post<Combo>('/api/combos', b); }
  updateCombo(id: number, b: Partial<Combo>) { return this.http.put<Combo>(`/api/combos/${id}`, b); }

  /** The server shrinks photos to WebP; 'qr' keeps the image lossless so it always scans. */
  upload(file: File, kind: 'photo' | 'qr' = 'photo') {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{ id: number; url: string }>('/api/uploads', fd, { params: { kind } });
  }

  settings() { return this.http.get<Settings>('/api/settings'); }
  saveSettings(b: Partial<Settings>) { return this.http.put<Settings>('/api/settings', b); }

  /** customerPhone (checkout): repeat customers see their own-combo level. */
  preview(lines: CartPayload, silent = false, customerPhone?: string) {
    return this.http.post<PricedCart>('/api/orders/preview', { lines, customerPhone }, silent ? { context: SILENT() } : {});
  }
  createOrder(b: { customerName: string; phone: string; clientRef: string; lines: { itemId?: number; comboId?: number; choiceItemIds?: number[]; qty: number }[] }) {
    return this.http.post<Order>('/api/orders', b);
  }
  payOrder(id: number, method: 'CASH' | 'ONLINE') { return this.http.patch<Order>(`/api/orders/${id}/pay`, { method }); }
  cancelOrder(id: number) { return this.http.patch<Order>(`/api/orders/${id}/cancel`, {}); }
  setServed(id: number, served: boolean) { return this.http.patch<Order>(`/api/orders/${id}/served`, { served }); }
  /** silent: background refreshes shouldn't toast every time the network blips. */
  orders(date?: string, silent = false) {
    return this.http.get<Order[]>('/api/orders', { params: date ? { date } : {}, ...(silent ? { context: SILENT() } : {}) });
  }
  customerByPhone(phone: string) {
    return this.http.get<{ name: string } | null>(`/api/customers/by-phone/${phone}`, { context: SILENT() });
  }

  users() { return this.http.get<AppUser[]>('/api/users'); }
  createUser(b: { name: string; username: string; password: string }) { return this.http.post<AppUser>('/api/users', b); }
  updateUser(id: number, b: { name?: string; password?: string; isActive?: boolean }) {
    return this.http.patch<AppUser>(`/api/users/${id}`, b);
  }

  offers() { return this.http.get<Offer[]>('/api/offers'); }
  createOffer(b: Partial<Offer>) { return this.http.post<Offer>('/api/offers', b); }
  updateOffer(id: number, b: Partial<Offer>) { return this.http.put<Offer>(`/api/offers/${id}`, b); }

  stock() { return this.http.get<StockRow[]>('/api/stock'); }
  restock(itemId: number, qty: number) { return this.http.post('/api/stock/restock', { itemId, qty }); }
  wastage(itemId: number, qty: number) { return this.http.post('/api/stock/wastage', { itemId, qty }); }
  countStock(itemId: number, qtyOnHand: number) { return this.http.post('/api/stock/count', { itemId, qtyOnHand }); }
  stockMoves() { return this.http.get<StockMove[]>('/api/stock/movements'); }
  recommendations(peak: number) { return this.http.get<RecommendationResult>('/api/stock/recommendations', { params: { peak } }); }

  analytics(from?: string, to?: string) {
    return this.http.get<AnalyticsSummary>('/api/analytics/summary', { params: range(from, to) });
  }
  exportCsv(from?: string, to?: string) {
    return this.http.get('/api/analytics/export.csv', { params: range(from, to), responseType: 'blob' });
  }
}

export type CartPayload = { itemId?: number; comboId?: number; choiceItemIds?: number[]; qty: number }[];

const range = (from?: string, to?: string) => {
  const p: Record<string, string> = {};
  if (from) p['from'] = from;
  if (to) p['to'] = to;
  return p;
};
