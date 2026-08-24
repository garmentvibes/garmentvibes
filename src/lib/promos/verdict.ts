import type { PromoEvaluation, PromoRejection } from "@/lib/promo-eligibility";

// ---------------------------------------------------------------------------
// Turning `evaluate_promo()`'s jsonb into the verdict the storefront renders.
//
// Split out of the server action because the action is a round trip wrapped in
// an auth check and there is nothing in that to test. This is where the two
// sides of the wire have to agree, which is where they can disagree.
// ---------------------------------------------------------------------------

const MESSAGES: Record<PromoRejection, string> = {
  unknown: "We don't recognise that code",
  inactive: "That code is no longer active",
  expired: "That code has expired",
  exhausted: "That code has been fully claimed",
  already_used: "You've already used that code",
  // Deliberately vague, as in promo-eligibility.ts: naming the owner of a
  // referral reward would leak one customer's email to another.
  not_yours: "That code was issued to a different account",
};

const REASONS = new Set<string>(Object.keys(MESSAGES));

/** The shape `evaluate_promo()` returns. Every field optional — it is jsonb. */
export interface PromoRpcResult {
  ok?: boolean;
  percent?: number;
  reason?: string;
}

/**
 * The verdict for one code, from the database's answer.
 *
 * The reason is checked against the known set rather than trusted straight
 * into the message lookup. 0017 and src/lib/promo-eligibility.ts are meant to
 * share one vocabulary exactly, and 44_promo_caps.sql asserts each reason the
 * function can return — but a value this build has never heard of would
 * otherwise reach the customer as the word "undefined" in a toast. Falling
 * back to `unknown` degrades to a vague message instead of a broken one.
 */
export function verdictFromRpc(data: PromoRpcResult | null): PromoEvaluation | null {
  if (!data) return null;

  if (data.ok) return { ok: true, percent: data.percent ?? 0 };

  const reason = REASONS.has(data.reason ?? "") ? (data.reason as PromoRejection) : "unknown";

  return { ok: false, percent: 0, reason, error: MESSAGES[reason] };
}
