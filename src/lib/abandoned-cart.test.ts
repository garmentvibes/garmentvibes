import { describe, expect, it } from "vitest";

import {
  CART_EXPIRY,
  RECOVERY_PROMPT_AFTER,
  REMINDER_SCHEDULE,
  type CartActivity,
  describeAge,
  dueReminder,
  recoveryPrompt,
} from "./abandoned-cart";

const HOUR = 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

function cart(overrides: Partial<CartActivity> = {}): CartActivity {
  return {
    lineCount: 2,
    updatedAt: NOW - REMINDER_SCHEDULE[0],
    remindersSent: 0,
    ...overrides,
  };
}

describe("dueReminder", () => {
  it("owes the first reminder once the cart is old enough", () => {
    expect(dueReminder(cart(), NOW)).toBe(0);
  });

  it("owes nothing a minute before it is due", () => {
    expect(dueReminder(cart({ updatedAt: NOW - REMINDER_SCHEDULE[0] + 60_000 }), NOW)).toBeNull();
  });

  it("walks the sequence", () => {
    const second = cart({
      updatedAt: NOW - REMINDER_SCHEDULE[1],
      remindersSent: 1,
      lastReminderAt: NOW - REMINDER_SCHEDULE[1] + REMINDER_SCHEDULE[0],
    });
    expect(dueReminder(second, NOW)).toBe(1);
  });

  it("stops after the last reminder in the schedule", () => {
    const exhausted = cart({
      updatedAt: NOW - CART_EXPIRY + HOUR,
      remindersSent: REMINDER_SCHEDULE.length,
      lastReminderAt: NOW - 100 * HOUR,
    });
    expect(dueReminder(exhausted, NOW)).toBeNull();
  });

  // The rule that stops a five-day-old cart firing all three reminders the
  // moment the job first runs over it.
  it("does not fire two reminders back to back", () => {
    const stale = cart({
      updatedAt: NOW - 5 * 24 * HOUR, // every step of the schedule is long past
      remindersSent: 1,
      lastReminderAt: NOW - 60_000, // one was just sent
    });
    expect(dueReminder(stale, NOW)).toBeNull();
  });

  it("allows the next one once the gap has elapsed", () => {
    const gap = REMINDER_SCHEDULE[1] - REMINDER_SCHEDULE[0];
    const stale = cart({
      updatedAt: NOW - 5 * 24 * HOUR,
      remindersSent: 1,
      lastReminderAt: NOW - gap,
    });
    expect(dueReminder(stale, NOW)).toBe(1);
  });

  it("never messages about an empty cart", () => {
    expect(dueReminder(cart({ lineCount: 0 }), NOW)).toBeNull();
  });

  it("never messages a cart that has been ordered", () => {
    expect(dueReminder(cart({ ordered: true }), NOW)).toBeNull();
  });

  // Shipping this must not message every existing customer at once, and a
  // cart persisted before updatedAt existed has no age to judge.
  it("says nothing about a cart with no recorded activity", () => {
    expect(dueReminder(cart({ updatedAt: undefined }), NOW)).toBeNull();
  });

  it("gives up on a cart past its expiry", () => {
    expect(dueReminder(cart({ updatedAt: NOW - CART_EXPIRY }), NOW)).toBeNull();
  });

  it("still acts one hour inside the expiry", () => {
    expect(dueReminder(cart({ updatedAt: NOW - CART_EXPIRY + HOUR }), NOW)).toBe(0);
  });

  // A device with a skewed clock would otherwise produce a negative age,
  // which compares as "less than every threshold" and quietly does nothing —
  // or, with a different comparison, fires everything.
  it("refuses to act on a cart timestamped in the future", () => {
    expect(dueReminder(cart({ updatedAt: NOW + HOUR }), NOW)).toBeNull();
  });
});

describe("recoveryPrompt", () => {
  it("shows for a cart left a couple of hours ago", () => {
    expect(recoveryPrompt(cart({ updatedAt: NOW - 2 * HOUR }), NOW)).toBe(true);
  });

  // Otherwise adding an item and clicking through to the next page tells the
  // customer they abandoned the thing they are actively doing.
  it("does not show while the customer is still shopping", () => {
    expect(recoveryPrompt(cart({ updatedAt: NOW - 5 * 60_000 }), NOW)).toBe(false);
  });

  it("shows exactly at the threshold", () => {
    expect(recoveryPrompt(cart({ updatedAt: NOW - RECOVERY_PROMPT_AFTER }), NOW)).toBe(true);
  });

  it("does not show for an empty or ordered cart", () => {
    expect(recoveryPrompt(cart({ updatedAt: NOW - 2 * HOUR, lineCount: 0 }), NOW)).toBe(false);
    expect(recoveryPrompt(cart({ updatedAt: NOW - 2 * HOUR, ordered: true }), NOW)).toBe(false);
  });

  it("does not show for a cart past its expiry", () => {
    expect(recoveryPrompt(cart({ updatedAt: NOW - CART_EXPIRY }), NOW)).toBe(false);
  });

  // Independent of the message sequence in both directions.
  it("shows even after every reminder has been sent", () => {
    const done = cart({
      updatedAt: NOW - 2 * HOUR,
      remindersSent: REMINDER_SCHEDULE.length,
    });
    expect(recoveryPrompt(done, NOW)).toBe(true);
  });
});

describe("describeAge", () => {
  it("reads naturally at each scale", () => {
    expect(describeAge(10 * 60_000)).toBe("a few minutes");
    expect(describeAge(HOUR)).toBe("an hour");
    expect(describeAge(5 * HOUR)).toBe("5 hours");
    expect(describeAge(26 * HOUR)).toBe("a day");
    expect(describeAge(3 * 24 * HOUR)).toBe("3 days");
  });
});
