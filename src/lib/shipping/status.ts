import type { RetailOrderStatus } from "@/types/admin";

// ---------------------------------------------------------------------------
// Courier status → order status.
//
// Every carrier and aggregator reports progress with its own vocabulary, and
// there are a lot of words for "it is moving": IN TRANSIT, SHIPPED, PICKED UP,
// OUT FOR DELIVERY, RTO INITIATED, UNDELIVERED. The order pipeline has five
// states. Something has to do the translation, and doing it at each call site
// is how two screens end up disagreeing about whether a parcel arrived.
//
// This is pure string work with no network in it, which is the point: it is
// the part of a courier integration that can be verified without an account,
// and it is also the part most likely to be wrong in ways nobody notices —
// a status silently falling through to "no change" looks identical to a parcel
// that has not moved.
// ---------------------------------------------------------------------------

/**
 * What a courier update means for the order.
 *
 * `rto` is deliberately not an order status: a return to origin is a failed
 * delivery that needs a human decision (re-attempt, refund, restock), not an
 * automatic transition. Surfacing it as its own outcome is what stops it being
 * quietly filed as "cancelled".
 */
export type ShipmentOutcome =
  | { kind: "status"; status: RetailOrderStatus }
  | { kind: "rto"; reason: string }
  | { kind: "attention"; reason: string }
  | { kind: "unknown"; raw: string };

// Matched against the normalised (upper-cased, punctuation-stripped) status.
// Order matters: the first match wins, so the more specific phrases come
// first. "OUT FOR DELIVERY" must be tested before "DELIVERY", and "NOT
// DELIVERED" before "DELIVERED", or a failed attempt reads as a success.
const RULES: Array<{ match: RegExp; outcome: (raw: string) => ShipmentOutcome }> = [
  // Failures first — every one of these contains a word that would otherwise
  // match a success rule below.
  {
    match: /\bRTO\b|RETURN TO ORIGIN|RETURNED TO (ORIGIN|SHIPPER)/,
    outcome: () => ({ kind: "rto", reason: "Parcel is being returned to us" }),
  },
  {
    match: /NOT DELIVERED|UNDELIVERED|DELIVERY FAILED|FAILED DELIVERY|NDR/,
    outcome: () => ({ kind: "attention", reason: "Delivery attempt failed" }),
  },
  {
    match: /LOST|DAMAGED|DESTROYED|MISROUTE/,
    outcome: (raw) => ({ kind: "attention", reason: `Courier reported: ${raw}` }),
  },
  {
    match: /CANCELL?ED/,
    outcome: () => ({ kind: "status", status: "cancelled" }),
  },

  // Successes.
  {
    match: /\bDELIVERED\b|DELIVERY (COMPLETE|SUCCESSFUL)/,
    outcome: () => ({ kind: "status", status: "delivered" }),
  },
  {
    match: /OUT FOR DELIVERY|IN TRANSIT|SHIPPED|DISPATCHED|PICKED UP|PICKUP COMPLETE|IN ?TRANSIT/,
    outcome: () => ({ kind: "status", status: "shipped" }),
  },
  {
    match: /PICKUP (SCHEDULED|GENERATED|PENDING)|MANIFEST|AWB ASSIGNED|READY TO SHIP|PACKED/,
    outcome: () => ({ kind: "status", status: "packed" }),
  },
  {
    match: /ORDER (PLACED|CREATED)|NEW|CONFIRMED/,
    outcome: () => ({ kind: "status", status: "confirmed" }),
  },
];

/** Upper-cases and collapses punctuation so the patterns match one shape. */
export function normaliseStatus(raw: string): string {
  return raw.trim().toUpperCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ");
}

/**
 * Translates one courier status string.
 *
 * An unrecognised status returns `unknown` rather than guessing. A courier
 * adding a word we have never seen must show up as something a human looks at,
 * not as silence — silence is indistinguishable from a parcel that has not
 * moved, which is exactly the case where nobody investigates.
 */
export function interpretCourierStatus(raw: string): ShipmentOutcome {
  const normalised = normaliseStatus(raw);
  if (!normalised) return { kind: "unknown", raw };

  for (const rule of RULES) {
    if (rule.match.test(normalised)) return rule.outcome(normalised);
  }

  return { kind: "unknown", raw };
}

/**
 * Whether a courier status should move the order, and to what.
 *
 * Convenience over `interpretCourierStatus` for the common case; returns null
 * for anything that needs a person.
 */
export function statusFromCourier(raw: string): RetailOrderStatus | null {
  const outcome = interpretCourierStatus(raw);
  return outcome.kind === "status" ? outcome.status : null;
}
