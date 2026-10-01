// Money is always paise (integer) on the wire; use money.ts to convert.
export interface Category { id: number; name: string; sortOrder: number }
export interface Item {
  id: number; categoryId: number; name: string; description: string | null; price: number;
  imageUrl: string | null; isActive: boolean; isFavourite: boolean; trackStock: boolean;
  qtyOnHand: number; lowStockAt: number;
}
export interface ComboItem { itemId: number; qty: number }
export interface Combo {
  id: number; name: string; description: string | null; imageUrl: string | null; price: number; isActive: boolean;
  items: ComboItem[]; choiceCategoryId: number | null; choiceQty: number | null;
}
export interface Settings { stallName: string; upiId: string; paymentQrUrl: string }
export interface SessionUser { id: number; name: string; username: string; role: 'ADMIN' | 'COUNTER' }

export interface CartLine {
  key: string; itemId?: number; comboId?: number; choiceItemIds?: number[];
  name: string; price: number; qty: number; imageUrl?: string | null;
}
export interface PricedCart {
  lines: { nameSnapshot: string; unitPrice: number; qty: number; lineTotal: number }[];
  offers: { offerId: number; name: string; discountAmount: number }[];
  subtotal: number; discountTotal: number; grandTotal: number;
}
export interface Order {
  id: number; billNo: number; subtotal: number; discountTotal: number; grandTotal: number;
  status: 'PENDING' | 'PAID' | 'CANCELLED'; paymentMethod: 'CASH' | 'ONLINE' | null;
  createdAt: string; customer: { name: string; phone: string };
  servedAt: string | null; servedBy: { name: string } | null;
  lines: { nameSnapshot: string; qty: number; unitPrice: number; lineTotal: number }[];
  offers: { discountAmount: number }[];
}
export interface AppUser { id: number; name: string; username: string; role: 'ADMIN' | 'COUNTER'; isActive: boolean }

export type OfferType = 'PERCENT_OFF' | 'FLAT_OFF' | 'BUY_X_GET_Y';
export type OfferScope = 'ITEM' | 'CATEGORY' | 'BILL';
export interface Offer {
  id: number; name: string; type: OfferType; scope: OfferScope; targetId: number | null;
  value: number; minBillAmount: number; minQty: number; maxDiscount: number | null; buyQty: number | null; getQty: number | null;
  startsAt: string | null; endsAt: string | null; isActive: boolean;
}

export interface StockRow { id: number; name: string; qtyOnHand: number; lowStockAt: number; low: boolean }
export interface StockMove { id: number; change: number; reason: string; createdAt: string; item: { name: string } }
export interface Recommendation {
  id: number; name: string; tracked: boolean; onHand: number;
  avgDaily: number; needed: number; toPrepare: number; slow: boolean;
}
export interface RecommendationResult { peak: number; basedOnDays: string[]; items: Recommendation[] }

export interface AnalyticsSummary {
  kpis: { total: number; bills: number; avgBill: number; cash: number; online: number; discountGiven: number };
  daily: { date: string; total: number; cash: number; online: number; bills: number }[];
  hourly: { hour: number; total: number; bills: number }[];
  products: { name: string; qty: number; revenue: number }[];
  categories: { name: string; revenue: number }[];
  offers: { name: string; bills: number; discount: number }[];
  customers: { total: number; cameOnce: number; cameBack: number; top: { name: string; phone: string; bills: number; spent: number }[] };
  pending: number;
  cancelled: number;
}
