import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(amountInMinorUnits: number, currency: "INR" | "USD" = "INR") {
  const amount = amountInMinorUnits / 100;
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Ambiguous glyphs left out: B/8, I/1, O/0, S/5, Z/2. Order references get
// read down a phone line to support, and the same alphabet is used by
// src/lib/referrals.ts for the same reason.
const REFERENCE_ALPHABET = "ACDEFGHJKLMNPQRTUVWXY349";

/**
 * A customer-facing reference for an order or quote.
 *
 * `retail_orders.reference` and `wholesale_quotes.reference` are both UNIQUE,
 * so a collision is not a cosmetic duplicate — it rejects the row. When that
 * row is an order the customer has already paid for, the payment succeeds and
 * the order does not exist.
 *
 * This used to be the last eight digits of `Date.now()`, which collides two
 * ways: twice in the same millisecond, and — far more likely — every time the
 * counter wraps, because 10^8 milliseconds is only about 27.8 hours. Yesterday
 * lunchtime's reference comes round again today.
 *
 * Base-36 time keeps references short and roughly sortable; six random
 * characters from a 24-letter alphabet are what actually prevent collisions,
 * giving about 191 million possibilities per millisecond.
 */
export function generateReferenceId(prefix: string) {
  const stamp = Date.now().toString(36).toUpperCase();

  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (const byte of bytes) {
    suffix += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  }

  return `${prefix}${stamp}${suffix}`;
}
