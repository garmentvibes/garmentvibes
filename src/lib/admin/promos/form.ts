import type { PromoCode } from "@/types/promo";

// ---------------------------------------------------------------------------
// Validating a new promo code.
//
// Lifted out of the admin page's `create()` so that the same rules run in the
// browser, for immediate feedback, and again in the server action, where they
// are the ones that count. A form that validates only in the browser is a form
// whose rules are advice.
//
// The database has its own constraints — percent between 1 and 100, the code
// uppercase and 3 to 32 characters, the caps positive and ordered. These are
// tighter on purpose: 100% gives an order away, and a 32-character code is
// unusable on a flyer. A rejection here reads as a sentence; the same value
// reaching Postgres reads as a constraint name.
// ---------------------------------------------------------------------------

export interface PromoFormInput {
  code: string;
  percent: string;
  expiresOn: string;
  /** Blank means unlimited. */
  maxRedemptions: string;
  /** Blank means unlimited. */
  maxPerCustomer: string;
}

export type PromoFormResult =
  | { ok: true; value: NewPromoCode }
  | { ok: false; error: string };

/** A validated code, ready to write. */
export interface NewPromoCode {
  code: string;
  percent: number;
  expiresOn?: string;
  maxRedemptions?: number;
  maxPerCustomer?: number;
}

function fail(error: string): PromoFormResult {
  return { ok: false, error };
}

/**
 * Parses the create-a-code form, or explains what is wrong with it.
 *
 * `now` is passed rather than read so the expiry rule is testable and so the
 * server and the browser can disagree about the clock without one of them
 * rejecting a date the other accepted.
 */
export function parsePromoForm(input: PromoFormInput, now: number): PromoFormResult {
  const code = input.code.trim().toUpperCase();

  // Letters and digits only. A code with a space or a hyphen in it survives
  // being typed into this form and then fails when a customer types it back
  // with the punctuation somewhere else.
  if (!/^[A-Z0-9]{3,20}$/.test(code)) {
    return fail("Codes are 3-20 characters, letters and numbers only");
  }

  const percent = Number(input.percent);
  // A 0% code does nothing and a 100% code gives the order away — both are
  // almost certainly typos rather than intent.
  if (!Number.isInteger(percent) || percent < 1 || percent > 90) {
    return fail("Discount must be a whole number between 1% and 90%");
  }

  const expiresOn = input.expiresOn.trim();
  if (expiresOn) {
    const at = new Date(expiresOn).getTime();
    if (Number.isNaN(at)) return fail("Expiry date is not a date");
    if (at < now) return fail("Expiry date is in the past");
  }

  const total = parseCap(input.maxRedemptions);
  if (total === "invalid") {
    return fail("Total uses must be a whole number of at least 1, or blank for unlimited");
  }

  const perCustomer = parseCap(input.maxPerCustomer);
  if (perCustomer === "invalid") {
    return fail("Uses per customer must be at least 1, or blank for unlimited");
  }

  // "At most 5 each, at most 3 in total" is not wrong so much as meaningless —
  // the per-customer number can never bind. The database refuses it too
  // (promo_codes_caps_ordered); catching it here is what turns a constraint
  // name into a sentence, and it is how a transposed pair gets typed in.
  if (total !== undefined && perCustomer !== undefined && perCustomer > total) {
    return fail("Uses per customer cannot exceed the total");
  }

  return {
    ok: true,
    value: {
      code,
      percent,
      expiresOn: expiresOn || undefined,
      maxRedemptions: total,
      maxPerCustomer: perCustomer,
    },
  };
}

/** A cap field: blank is unlimited, a positive whole number is a cap. */
function parseCap(raw: string): number | undefined | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;

  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 1) return "invalid";
  return value;
}

/** The shape the admin list renders, whichever source it came from. */
export interface ManagedPromoCode extends PromoCode {
  /** How many times it has been redeemed, across everyone. */
  redemptions: number;
  /** How many distinct customers have used it. */
  customers: number;
}
