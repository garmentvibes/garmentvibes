import type { PaymentTerms, WholesaleApprovalStatus } from "@/lib/stores/session-store";

// ---------------------------------------------------------------------------
// Retail orders
// ---------------------------------------------------------------------------

export type RetailOrderStatus =
  | "pending"
  | "confirmed"
  | "packed"
  | "shipped"
  | "delivered"
  | "cancelled";

export const RETAIL_ORDER_STATUSES: RetailOrderStatus[] = [
  "pending",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
];

export interface RetailOrderItem {
  productId: string;
  name: string;
  size: string;
  color: string;
  qty: number;
  price: number; // minor units, at time of order
}

export interface RetailOrder {
  id: string;
  placedAt: string; // ISO date
  /**
   * Set when the order reaches "delivered". The return window runs from this
   * date, not from placedAt — a slow delivery must not eat into it.
   */
  deliveredAt?: string; // ISO date
  /** Set when the order ships. Courier id matches lib/couriers.ts. */
  shipment?: { courierId: string; awb: string; shippedAt: string };
  customerName: string;
  customerEmail: string;
  phone: string;
  shippingAddress: string;
  paymentMethod: "online" | "cod";
  status: RetailOrderStatus;
  items: RetailOrderItem[];
}

export function retailOrderTotal(order: RetailOrder) {
  return order.items.reduce((sum, i) => sum + i.qty * i.price, 0);
}

// ---------------------------------------------------------------------------
// Wholesale quotes / bulk orders
// ---------------------------------------------------------------------------

export type WholesaleQuoteStatus =
  | "requested"
  | "quoted"
  | "confirmed"
  | "in_production"
  | "shipped"
  | "fulfilled"
  | "rejected";

export const WHOLESALE_QUOTE_STATUSES: WholesaleQuoteStatus[] = [
  "requested",
  "quoted",
  "confirmed",
  "in_production",
  "shipped",
  "fulfilled",
  "rejected",
];

export const WHOLESALE_QUOTE_STATUS_LABELS: Record<WholesaleQuoteStatus, string> = {
  requested: "Requested",
  quoted: "Quoted",
  confirmed: "Confirmed",
  in_production: "In Production",
  shipped: "Shipped",
  fulfilled: "Fulfilled",
  rejected: "Rejected",
};

export interface WholesaleQuoteItem {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  pricePerUnit: number; // minor units
}

export interface WholesaleQuote {
  id: string;
  kind: "quote" | "order";
  requestedAt: string; // ISO date
  businessName: string;
  contactName: string;
  email: string;
  status: WholesaleQuoteStatus;
  items: WholesaleQuoteItem[];
  /** Set when the consignment ships. Courier id matches lib/couriers.ts. */
  shipment?: { courierId: string; awb: string; shippedAt: string };
  /**
   * Set when the buyer confirms receipt. Bulk claims (short shipment, transit
   * damage) run from this date, the same way retail returns run from delivery.
   */
  deliveredAt?: string; // ISO date
}

export function wholesaleQuoteTotal(quote: WholesaleQuote) {
  return quote.items.reduce((sum, i) => sum + i.qty * i.pricePerUnit, 0);
}

export function wholesaleQuoteUnits(quote: WholesaleQuote) {
  return quote.items.reduce((sum, i) => sum + i.qty, 0);
}

// ---------------------------------------------------------------------------
// Wholesale account registrations (the approval queue)
// ---------------------------------------------------------------------------

export interface WholesaleAccount {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone?: string;
  gstin?: string;
  registeredAt: string; // ISO date
  status: WholesaleApprovalStatus | "rejected";
  paymentTerms: PaymentTerms;
  creditTermsRequested: boolean;
}
