// ---------------------------------------------------------------------------
// Abandoned-cart recovery.
//
// Two things live here, and it matters which is which:
//
//   1. `recoveryPrompt()` — should we show a returning customer their
//      forgotten bag? This works today, entirely in the browser, because the
//      customer is right there.
//
//   2. `dueReminder()` — is a reminder message owed, and which one? This is
//      the decision layer for the email/SMS sequence. It is complete and
//      tested, but NOTHING CALLS IT ON A SCHEDULE YET, because there is
//      nowhere for a schedule to run: the cart is localStorage, so it does
//      not exist when the tab is closed, which is precisely when a reminder
//      would need to go out.
//
//      Wiring it up needs the cart in `cart_items` (see the store→table map
//      in supabase/README.md) and a job that walks stale rows. The rules are
//      written here rather than deferred so that job is a query and a loop,
//      not a place where "how often do we nag someone" gets invented twice.
//
// Nagging is the failure mode worth designing against. Every rule below
// exists to stop a customer being messaged when they should not be.
// ---------------------------------------------------------------------------

const HOUR = 60 * 60 * 1000;

/**
 * When each reminder in the sequence becomes due, measured from the last time
 * the cart changed.
 *
 * Three, then stop. The first catches a genuine interruption — a phone call,
 * a train stop. The second catches the next day. The third is the last word.
 * A fourth reads as pestering and, on SMS in India, invites the complaint
 * that costs a DLT sender its registration.
 */
export const REMINDER_SCHEDULE = [4 * HOUR, 24 * HOUR, 72 * HOUR] as const;

/**
 * After this, the cart is not abandoned — it is forgotten, and so are its
 * prices. Messaging someone about a bag they filled a fortnight ago means
 * quoting figures that may have moved and reminding them of a decision they
 * already made.
 */
export const CART_EXPIRY = 14 * 24 * HOUR;

/**
 * How stale a cart must be before a returning customer is shown a recovery
 * prompt. Short, because this fires while they are on the site — but not
 * zero, or someone who adds an item and walks to the next page gets told
 * they abandoned it.
 */
export const RECOVERY_PROMPT_AFTER = 1 * HOUR;

export interface CartActivity {
  /** Number of lines currently in the cart. */
  lineCount: number;
  /**
   * When the cart last changed, in epoch ms.
   *
   * Undefined for carts persisted before this was tracked. Treated as "not
   * yet stale" rather than "infinitely stale", because guessing old means
   * messaging every existing customer at once the moment this ships.
   */
  updatedAt?: number;
  /** How many reminders have already gone out for this cart. */
  remindersSent: number;
  /** When the last reminder was sent, epoch ms. */
  lastReminderAt?: number;
  /**
   * True once the cart has been converted. A cart is cleared on checkout, so
   * in practice this is belt and braces against a race where the clear has
   * not propagated before a reminder is evaluated.
   */
  ordered?: boolean;
}

/**
 * Which reminder (0-indexed into REMINDER_SCHEDULE) is owed right now, or
 * null if none is.
 *
 * Returns the index rather than a boolean so the caller can pick the right
 * copy for a first nudge versus a last one, and so "we sent number 2" is
 * recordable.
 */
export function dueReminder(activity: CartActivity, now: number): number | null {
  if (activity.ordered) return null;
  if (activity.lineCount === 0) return null;
  if (activity.updatedAt === undefined) return null;
  if (activity.remindersSent >= REMINDER_SCHEDULE.length) return null;

  const age = now - activity.updatedAt;
  if (age < 0) return null; // clock skew — never message on a future timestamp
  if (age >= CART_EXPIRY) return null;

  const next = activity.remindersSent;
  if (age < REMINDER_SCHEDULE[next]) return null;

  // Two reminders in quick succession read as a bug to the person receiving
  // them. This bites when a cart has been sitting long enough that several
  // steps of the schedule are already past: without it, a five-day-old cart
  // would fire all three at once.
  if (next > 0 && activity.lastReminderAt !== undefined) {
    const sinceLast = now - activity.lastReminderAt;
    const gap = REMINDER_SCHEDULE[next] - REMINDER_SCHEDULE[next - 1];
    if (sinceLast < gap) return null;
  }

  return next;
}

/**
 * Whether to show a returning customer a "still in your bag" prompt.
 *
 * Deliberately independent of the reminder sequence: someone who was never
 * messaged still deserves the prompt, and someone who received all three
 * still deserves it if they come back.
 */
export function recoveryPrompt(activity: CartActivity, now: number): boolean {
  if (activity.ordered) return false;
  if (activity.lineCount === 0) return false;
  if (activity.updatedAt === undefined) return false;

  const age = now - activity.updatedAt;
  if (age < 0) return false;
  return age >= RECOVERY_PROMPT_AFTER && age < CART_EXPIRY;
}

/** Human phrasing for how long a bag has been waiting. */
export function describeAge(ageMs: number): string {
  const hours = Math.floor(ageMs / HOUR);
  if (hours < 1) return "a few minutes";
  if (hours < 24) return hours === 1 ? "an hour" : `${hours} hours`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "a day" : `${days} days`;
}
