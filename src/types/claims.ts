// Wholesale claims.
//
// The B2B counterpart to a retail return, but a different problem: a bulk
// buyer isn't sending a garment back because it didn't suit them, they're
// reporting that the consignment didn't match the invoice. So a claim is
// per-line and quantity-based — "I was billed for 300 and received 288" —
// and resolves as a credit note, a replacement shipment, or a rejection.

export type ClaimReason =
  | "Short shipment"
  | "Damaged in transit"
  | "Wrong item shipped"
  | "Quality below sample";

export const CLAIM_REASONS: ClaimReason[] = [
  "Short shipment",
  "Damaged in transit",
  "Wrong item shipped",
  "Quality below sample",
];

export type ClaimResolution = "credit_note" | "replacement";

export const CLAIM_RESOLUTION_LABELS: Record<ClaimResolution, string> = {
  credit_note: "Credit note",
  replacement: "Replacement shipment",
};

export type ClaimStatus =
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "settled";

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  settled: "Settled",
};

export interface ClaimLine {
  sku: string;
  name: string;
  /** Units billed on the invoice. */
  billedQty: number;
  /** Units the buyer says are missing, damaged or wrong. */
  claimedQty: number;
  pricePerUnit: number; // minor units, as invoiced
}

export interface WholesaleClaim {
  id: string;
  orderId: string;
  businessName: string;
  contactName: string;
  email: string;
  reason: ClaimReason;
  requestedResolution: ClaimResolution;
  lines: ClaimLine[];
  comments?: string;
  status: ClaimStatus;
  createdAt: string; // ISO
  updatedAt?: string;
  decisionNote?: string;
}

export function claimValue(claim: WholesaleClaim) {
  return claim.lines.reduce((sum, l) => sum + l.claimedQty * l.pricePerUnit, 0);
}

export function claimedUnits(claim: WholesaleClaim) {
  return claim.lines.reduce((sum, l) => sum + l.claimedQty, 0);
}
