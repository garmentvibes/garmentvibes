import type { PromoCode } from "@/types/promo";

// ---------------------------------------------------------------------------
// Referrals.
//
// The cheapest growth lever a new brand has: an existing customer vouches for
// you to someone who already trusts them, which no amount of ad spend buys.
//
// Shape: every retail customer has a stable code derived from their email.
// A new customer applies it and gets a discount on their first order; the
// referrer is issued a single-use reward code of their own once that order is
// placed. Both halves matter — a referral scheme that only rewards the new
// customer is a discount, and one that only rewards the referrer is a
// pyramid.
//
// The reward is a promo code rather than store credit deliberately. Credit is
// a stored-value balance, which is a liability on the books and needs an
// accounting treatment; a discount code is neither, and needs no CA sign-off
// before it can be used.
// ---------------------------------------------------------------------------

/** Discount the invited customer gets on their first order. */
export const REFERRAL_FRIEND_PERCENT = 15;

/** Discount the referrer is rewarded with, once their invite orders. */
export const REFERRAL_REWARD_PERCENT = 10;

/** Referral rewards are one-shot and belong to one person. */
export const REFERRAL_REWARD_MAX_USES = 1;

const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY349";

/**
 * A stable, shareable code for one customer.
 *
 * Derived from the email rather than stored, so it survives a cleared browser
 * and needs no allocation step. Ambiguous characters are left out of the
 * alphabet — B/8, I/1, O/0, S/5, Z/2 — because these get read aloud, written
 * on paper and typed by someone else.
 *
 * Not a secret: knowing someone's referral code only lets you credit them,
 * which is the point of sharing it.
 */
export function referralCodeFor(email: string): string {
  const normalised = email.trim().toLowerCase();

  let hash = 2166136261;
  for (let i = 0; i < normalised.length; i += 1) {
    hash ^= normalised.charCodeAt(i);
    // FNV-1a. Math.imul keeps the multiply in 32-bit range; a plain * would
    // lose precision past 2^53 and collapse distinct emails onto one code.
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += ALPHABET[hash % ALPHABET.length];
    hash = Math.floor(hash / ALPHABET.length) + i * 7919;
  }

  return `GV${suffix}`;
}

export type ReferralRejection = "unknown" | "self" | "already_referred" | "not_new";

export interface ReferralCheck {
  ok: boolean;
  /** The referrer's email, when ok. */
  referrerEmail?: string;
  reason?: ReferralRejection;
  error?: string;
}

const MESSAGES: Record<ReferralRejection, string> = {
  unknown: "We don't recognise that referral code",
  self: "You can't refer yourself",
  already_referred: "You've already used a referral code",
  not_new: "Referral codes are for a first order",
};

/**
 * Whether a customer may apply a referral code.
 *
 * `knownCustomerEmails` is how a code is resolved back to a person: the code
 * is a hash, so it cannot be reversed. Anyone whose code is not in that list
 * did not refer anybody.
 */
export function checkReferral(input: {
  code: string;
  customerEmail: string;
  knownCustomerEmails: string[];
  /** Referral codes this customer has already used. */
  alreadyUsed: string[];
  /** True when the customer has ordered before. */
  hasOrderedBefore: boolean;
}): ReferralCheck {
  const wanted = input.code.trim().toUpperCase();

  const referrer = input.knownCustomerEmails.find(
    (email) => referralCodeFor(email) === wanted
  );
  if (!referrer) return { ok: false, reason: "unknown", error: MESSAGES.unknown };

  // Checked against the resolved referrer rather than by comparing codes, so
  // a difference in casing or whitespace between the two cannot let someone
  // through.
  if (referrer.toLowerCase() === input.customerEmail.trim().toLowerCase()) {
    return { ok: false, reason: "self", error: MESSAGES.self };
  }

  if (input.alreadyUsed.length > 0) {
    return { ok: false, reason: "already_referred", error: MESSAGES.already_referred };
  }

  if (input.hasOrderedBefore) {
    return { ok: false, reason: "not_new", error: MESSAGES.not_new };
  }

  return { ok: true, referrerEmail: referrer };
}

/**
 * The reward code issued to a referrer once their invite orders.
 *
 * Suffixed with the invitee's code so a referrer who brings in several people
 * gets several distinct rewards rather than one that keeps being overwritten.
 */
export function rewardCodeFor(referrerEmail: string, friendEmail: string): PromoCode {
  return {
    code: `${referralCodeFor(referrerEmail)}R${referralCodeFor(friendEmail).slice(2, 5)}`,
    percent: REFERRAL_REWARD_PERCENT,
    active: true,
    maxRedemptions: REFERRAL_REWARD_MAX_USES,
    maxPerCustomer: REFERRAL_REWARD_MAX_USES,
    issuedTo: referrerEmail.trim().toLowerCase(),
  };
}
