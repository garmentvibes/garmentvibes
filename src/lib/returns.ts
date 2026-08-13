// Return eligibility policy.
//
// The window here must stay in step with the customer-facing copy on
// /shop/refund-policy and the retail FAQ, both of which promise 7 days from
// delivery. Changing one without the others would put the site in conflict
// with its own published policy.

import type { RetailOrder } from "@/types/admin";
import type { ReturnRequest } from "@/types/returns";

export const RETURN_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type IneligibleReason =
  | "not_delivered"
  | "no_delivery_date"
  | "window_expired"
  | "already_requested";

export interface Eligibility {
  eligible: boolean;
  reason?: IneligibleReason;
  /** Days left in the window; 0 once expired. */
  daysLeft: number;
  /** ISO date the window closes, for display. */
  closesOn?: string;
}

/**
 * `now` is passed in rather than read from the clock so this stays a pure
 * function — callers in React supply a timestamp captured in an effect,
 * which keeps Date.now() out of render.
 */
export function returnEligibility(
  order: Pick<RetailOrder, "status" | "deliveredAt">,
  existingReturns: ReturnRequest[],
  now: number
): Eligibility {
  if (existingReturns.some((r) => r.status !== "rejected")) {
    // A rejected request may be re-raised; an in-flight one may not.
    return { eligible: false, reason: "already_requested", daysLeft: 0 };
  }

  if (order.status !== "delivered") {
    return { eligible: false, reason: "not_delivered", daysLeft: 0 };
  }

  if (!order.deliveredAt) {
    return { eligible: false, reason: "no_delivery_date", daysLeft: 0 };
  }

  const deadline = new Date(order.deliveredAt).getTime() + RETURN_WINDOW_DAYS * DAY_MS;
  const daysLeft = Math.ceil((deadline - now) / DAY_MS);
  const closesOn = new Date(deadline).toISOString().slice(0, 10);

  if (daysLeft <= 0) {
    return { eligible: false, reason: "window_expired", daysLeft: 0, closesOn };
  }

  return { eligible: true, daysLeft, closesOn };
}

export const INELIGIBLE_MESSAGES: Record<IneligibleReason, string> = {
  not_delivered:
    "Returns can be raised once the order has been delivered. You can cancel it before it ships instead.",
  no_delivery_date: "We don't have a delivery date on this order yet. Contact support and we'll sort it out.",
  window_expired: `The ${RETURN_WINDOW_DAYS}-day return window for this order has closed.`,
  already_requested: "A return has already been raised for this order.",
};
