export type ReturnStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "picked_up"
  | "refunded"
  /** Exchange only: the replacement has gone out. */
  | "exchange_shipped";

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  requested: "Requested",
  approved: "Approved",
  rejected: "Rejected",
  picked_up: "Picked up",
  refunded: "Refunded",
  exchange_shipped: "Exchange shipped",
};

/**
 * A refund sends money back; an exchange sends a different size out. They
 * share the whole pipeline up to pickup and only diverge at the last step,
 * so they're one record with a discriminator rather than two systems.
 */
export type ResolutionType = "refund" | "exchange";

/**
 * Reasons a customer can pick. Kept as a fixed list rather than free text so
 * the admin queue can be filtered by reason — "wrong size" trending on one
 * product means the size chart is wrong, which is worth seeing.
 */
export const RETURN_REASONS = [
  "Size or fit issue",
  "Item damaged or defective",
  "Wrong item delivered",
  "Not as described or pictured",
  "Quality not as expected",
  "Changed my mind",
] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number];

/**
 * Reasons where the unit comes back sellable.
 *
 * A garment returned because it didn't fit goes back on the shelf; one
 * returned as damaged or poor quality does not. Restocking the latter would
 * quietly re-sell a faulty item to the next customer, so the exclusion is
 * deliberate rather than an oversight.
 */
const RESTOCKABLE_REASONS = new Set<ReturnReason>([
  "Size or fit issue",
  "Not as described or pictured",
  "Changed my mind",
  "Wrong item delivered",
]);

export function isRestockable(reason: ReturnReason) {
  return RESTOCKABLE_REASONS.has(reason);
}

export interface ReturnItem {
  productId: string;
  name: string;
  size: string;
  color: string;
  qty: number;
  price: number; // minor units, as charged
  /** Exchange only: the size going out in place of `size`. */
  exchangeForSize?: string;
}

export interface ReturnRequest {
  id: string;
  orderId: string;
  resolution: ResolutionType;
  customerName: string;
  customerEmail: string;
  phone: string;
  items: ReturnItem[];
  reason: ReturnReason;
  comments?: string;
  status: ReturnStatus;
  createdAt: string; // ISO
  updatedAt?: string; // ISO
  /** Staff note recorded on approve/reject, shown to the customer. */
  decisionNote?: string;
}

export function returnRefundTotal(request: ReturnRequest) {
  return request.items.reduce((sum, i) => sum + i.qty * i.price, 0);
}
