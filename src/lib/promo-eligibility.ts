import type { PromoCode, PromoRedemptions } from "@/types/promo";

// ---------------------------------------------------------------------------
// Whether a customer may use a promo code, and if not, why.
//
// `promoPercentFromStore` returned a percent, with 0 meaning "no". That
// conflated four different situations — no such code, deactivated, expired,
// and now used up — and checkout said "Invalid or expired promo code" to all
// of them. Someone who has already used their one-per-customer code deserves
// to be told that, not to be left wondering whether they typed it wrong.
//
// The caps themselves close the gap recorded in supabase/README.md: a
// percentage code with no redemption limit can be posted publicly and used
// without end, and a total cap does nothing if one person can consume all of
// it.
//
// Pure, so the same rules can run in the browser today and in a server action
// once orders live in the database. Note that browser-side enforcement is
// advisory: the honest guard is a unique constraint on (code, user) plus a
// counter checked in the same transaction as the order. That is a note for
// the migration, not an excuse to skip the rules here — the UI still has to
// tell the truth.
// ---------------------------------------------------------------------------

export type PromoRejection =
  | "unknown"
  | "inactive"
  | "expired"
  | "exhausted"
  | "already_used"
  | "not_yours";

export interface PromoEvaluation {
  ok: boolean;
  /** Discount percent when ok; zero otherwise. */
  percent: number;
  reason?: PromoRejection;
  /** Customer-facing explanation. Absent when ok. */
  error?: string;
}

const MESSAGES: Record<PromoRejection, string> = {
  unknown: "We don't recognise that code",
  inactive: "That code is no longer active",
  expired: "That code has expired",
  exhausted: "That code has been fully claimed",
  already_used: "You've already used that code",
  // Deliberately vague. Naming the owner of a referral reward would leak one
  // customer's email to another.
  not_yours: "That code was issued to a different account",
};

function reject(reason: PromoRejection): PromoEvaluation {
  return { ok: false, percent: 0, reason, error: MESSAGES[reason] };
}

/** Total redemptions recorded for a code, across everyone. */
export function totalRedemptions(redemptions: PromoRedemptions, code: string): number {
  const perCustomer = redemptions[code.toUpperCase()];
  if (!perCustomer) return 0;
  return Object.values(perCustomer).reduce((sum, n) => sum + n, 0);
}

/** Redemptions recorded for one customer on one code. */
export function customerRedemptions(
  redemptions: PromoRedemptions,
  code: string,
  email: string
): number {
  return redemptions[code.toUpperCase()]?.[email.toLowerCase()] ?? 0;
}

export function evaluatePromo(input: {
  input: string;
  codes: PromoCode[];
  redemptions: PromoRedemptions;
  /** Absent for a signed-out visitor; per-customer caps cannot apply. */
  customerEmail?: string;
  now: number;
}): PromoEvaluation {
  const wanted = input.input.trim().toUpperCase();
  if (!wanted) return reject("unknown");

  const code = input.codes.find((c) => c.code.toUpperCase() === wanted);
  if (!code) return reject("unknown");
  if (!code.active) return reject("inactive");

  if (code.expiresOn && new Date(code.expiresOn).getTime() < input.now) {
    return reject("expired");
  }

  // A referral reward belongs to one person. Checked before the caps so the
  // message is about ownership rather than about a limit they never had.
  if (code.issuedTo) {
    const email = input.customerEmail?.toLowerCase();
    if (!email || email !== code.issuedTo.toLowerCase()) return reject("not_yours");
  }

  if (
    code.maxRedemptions !== undefined &&
    totalRedemptions(input.redemptions, wanted) >= code.maxRedemptions
  ) {
    return reject("exhausted");
  }

  if (code.maxPerCustomer !== undefined) {
    // No account means no way to attribute a redemption, so a per-customer cap
    // cannot be enforced. Refusing is the safe direction: the alternative is
    // an unlimited code for anyone who signs out.
    if (!input.customerEmail) return reject("already_used");
    if (
      customerRedemptions(input.redemptions, wanted, input.customerEmail) >= code.maxPerCustomer
    ) {
      return reject("already_used");
    }
  }

  return { ok: true, percent: code.percent };
}

/** Records one redemption, returning the updated map. */
export function recordRedemption(
  redemptions: PromoRedemptions,
  code: string,
  email: string
): PromoRedemptions {
  const key = code.toUpperCase();
  const customer = email.toLowerCase();
  const forCode = redemptions[key] ?? {};

  return {
    ...redemptions,
    [key]: { ...forCode, [customer]: (forCode[customer] ?? 0) + 1 },
  };
}

/** How many uses are left on a code, or null when it is uncapped. */
export function remainingRedemptions(
  code: PromoCode,
  redemptions: PromoRedemptions
): number | null {
  if (code.maxRedemptions === undefined) return null;
  return Math.max(0, code.maxRedemptions - totalRedemptions(redemptions, code.code));
}
