export type ReturnStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "picked_up"
  | "refunded";

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  requested: "Requested",
  approved: "Approved",
  rejected: "Rejected",
  picked_up: "Picked up",
  refunded: "Refunded",
};

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

export interface ReturnItem {
  productId: string;
  name: string;
  size: string;
  color: string;
  qty: number;
  price: number; // minor units, as charged
}

export interface ReturnRequest {
  id: string;
  orderId: string;
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
