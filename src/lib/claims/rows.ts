import type {
  ClaimLine,
  ClaimReason,
  ClaimResolution,
  ClaimStatus,
  WholesaleClaim,
} from "@/types/claims";

// ---------------------------------------------------------------------------
// Stored claim rows, as the app's WholesaleClaim.
//
// Shared between the buyer raising a claim and staff settling it, like every
// other mapping here.
//
// ---------------------------------------------------------------------------
// Reasons need translating; resolution and status do not
// ---------------------------------------------------------------------------
//
// Exactly the split returns has, and worth restating because the failure mode
// is not obvious. `claim_resolution` and `claim_status` store the same strings
// the app uses — 'credit_note', 'settled' — so they pass straight through.
// `claim_reason` does not: the app's ClaimReason is the sentence a buyer picks
// ("Short shipment") and the enum holds a code (`short_shipment`).
//
// On the returns side, reading such a code back out under a cast type-checked
// and then silently broke restocking, because the value matched nothing. There
// is no equivalent set-membership check on claims today, so the damage here is
// smaller — a reason rendering as `short_shipment` in the admin queue — but it
// is the same mistake and it is avoided the same way.
const REASON_TO_CODE: Record<ClaimReason, string> = {
  "Short shipment": "short_shipment",
  "Damaged in transit": "damaged_in_transit",
  "Wrong item shipped": "wrong_item_shipped",
  "Quality below sample": "quality_below_sample",
};

const REASON_FROM_CODE = Object.fromEntries(
  Object.entries(REASON_TO_CODE).map(([label, code]) => [code, label])
) as Record<string, ClaimReason>;

/** The enum code for a reason the buyer picked. */
export function claimReasonToCode(reason: ClaimReason): string {
  return REASON_TO_CODE[reason];
}

/**
 * The reason a stored code means.
 *
 * An unknown code falls back to "Quality below sample" — the vaguest of the
 * four, so a reason the app cannot name reads as something a human will look
 * at rather than as a specific accusation about a consignment nobody checked.
 */
export function claimReasonFromCode(code: string): ClaimReason {
  return REASON_FROM_CODE[code] ?? "Quality below sample";
}

/** A claim with its lines and the reference of the order it is against. */
export const CLAIM_SELECT = `
  id, reference, status, reason, requested_resolution, comments, decision_note,
  business_name, contact_name, email, created_at, updated_at,
  wholesale_quotes ( reference ),
  wholesale_claim_lines ( sku, product_name, billed_qty, claimed_qty, price_per_unit )
`;

export interface ClaimRow {
  id: string;
  reference: string | null;
  status: string;
  reason: string;
  requested_resolution: string;
  comments: string | null;
  decision_note: string | null;
  business_name: string;
  contact_name: string;
  email: string;
  created_at: string;
  updated_at: string | null;
  wholesale_quotes: { reference: string | null } | null;
  wholesale_claim_lines: Array<{
    sku: string;
    product_name: string;
    billed_qty: number;
    claimed_qty: number;
    price_per_unit: number;
  }> | null;
}

export function toWholesaleClaim(row: ClaimRow): WholesaleClaim {
  const lines: ClaimLine[] = (row.wholesale_claim_lines ?? []).map((line) => ({
    sku: line.sku,
    name: line.product_name,
    billedQty: line.billed_qty,
    claimedQty: line.claimed_qty,
    pricePerUnit: line.price_per_unit,
  }));

  return {
    // The CLM… code the buyer quotes at us.
    id: row.reference ?? row.id,
    // The consignment's reference, not its uuid: what both sides call it.
    orderId: row.wholesale_quotes?.reference ?? "",
    businessName: row.business_name,
    contactName: row.contact_name,
    email: row.email,
    reason: claimReasonFromCode(row.reason),
    requestedResolution: row.requested_resolution as ClaimResolution,
    lines,
    comments: row.comments ?? undefined,
    status: row.status as ClaimStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    decisionNote: row.decision_note ?? undefined,
  };
}
