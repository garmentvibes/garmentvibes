// Claim eligibility.
//
// The window matches what the shipment notification promises the buyer
// ("raise short shipments or transit damage within 7 days of delivery"), so
// changing one means changing the other.

import type { WholesaleQuote } from "@/types/admin";
import type { WholesaleClaim } from "@/types/claims";

export const CLAIM_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ClaimIneligibleReason =
  | "not_delivered"
  | "no_delivery_date"
  | "window_expired"
  | "already_claimed";

export interface ClaimEligibility {
  eligible: boolean;
  reason?: ClaimIneligibleReason;
  daysLeft: number;
  closesOn?: string;
}

/** `now` is passed in so this stays pure — same contract as returnEligibility. */
export function claimEligibility(
  order: Pick<WholesaleQuote, "status" | "deliveredAt">,
  existingClaims: WholesaleClaim[],
  now: number
): ClaimEligibility {
  if (existingClaims.some((c) => c.status !== "rejected")) {
    return { eligible: false, reason: "already_claimed", daysLeft: 0 };
  }
  if (order.status !== "fulfilled") {
    return { eligible: false, reason: "not_delivered", daysLeft: 0 };
  }
  if (!order.deliveredAt) {
    return { eligible: false, reason: "no_delivery_date", daysLeft: 0 };
  }

  const deadline = new Date(order.deliveredAt).getTime() + CLAIM_WINDOW_DAYS * DAY_MS;
  const daysLeft = Math.ceil((deadline - now) / DAY_MS);
  const closesOn = new Date(deadline).toISOString().slice(0, 10);

  if (daysLeft <= 0) {
    return { eligible: false, reason: "window_expired", daysLeft: 0, closesOn };
  }
  return { eligible: true, daysLeft, closesOn };
}

export const CLAIM_INELIGIBLE_MESSAGES: Record<ClaimIneligibleReason, string> = {
  not_delivered:
    "Claims can be raised once the consignment has been received and the order marked fulfilled.",
  no_delivery_date:
    "We don't have a delivery date recorded for this order. Contact your account manager and we'll sort it out.",
  window_expired: `The ${CLAIM_WINDOW_DAYS}-day claims window for this consignment has closed.`,
  already_claimed: "A claim has already been raised against this order.",
};
