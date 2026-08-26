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
 * Base-36 time keeps references short and roughly sortable; the random tail is
 * what actually prevents collisions.
 *
 * ---------------------------------------------------------------------------
 * Why eight characters and not six
 * ---------------------------------------------------------------------------
 *
 * Six was not enough, and the test caught it — as a flake, which is how a
 * probabilistic shortfall shows up. `24^6` is 191 million, which sounds
 * comfortable until you notice the divisor is per millisecond: the batch test
 * generates ten thousand references in a tight loop, so a few hundred share
 * each millisecond, and the birthday bound over that crowding is what decides
 * whether any two land on the same value.
 *
 * How often that bites depends on how fast the loop runs, which is why it read
 * as a flake: it survived CI for weeks and then failed once. Reverted to six
 * on a machine that runs the loop tighter, the same test fails every time —
 * the margin was never there, it just needed the right machine to show it.
 *
 * Eight characters gives `24^8`, 110 billion, and the same batch produces no
 * collision in any run. The ceiling is the length assertion rather than taste:
 * a reference has to stay under 20 characters to be read down a phone line,
 * and `GVQ` + 8 base-36 digits + 8 is 19.
 *
 * ---------------------------------------------------------------------------
 * Why the bytes are rejected rather than taken modulo
 * ---------------------------------------------------------------------------
 *
 * `byte % 24` is biased: 256 is not a multiple of 24, so the first sixteen
 * letters come up eleven times per 256 and the last eight only ten — about 10%
 * more often. That is small, and it is still free to remove: draw again on any
 * byte at or above the largest multiple of 24 that fits in a byte, and what is
 * left is exactly uniform.
 */
export function generateReferenceId(prefix: string) {
  const stamp = Date.now().toString(36).toUpperCase();
  return `${prefix}${stamp}${randomTail(8)}`;
}

/** The largest multiple of the alphabet that fits in a byte: 240 = 24 × 10. */
const UNBIASED_CEILING = 256 - (256 % REFERENCE_ALPHABET.length);

/** `length` characters drawn uniformly from the reference alphabet. */
function randomTail(length: number) {
  // Over-sampled so the loop almost always finishes on the first pass: about
  // 6% of bytes are rejected, so twice the bytes needed is ample.
  const bytes = new Uint8Array(length * 2);
  let tail = "";

  while (tail.length < length) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= UNBIASED_CEILING) continue;
      tail += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
      if (tail.length === length) break;
    }
  }

  return tail;
}
