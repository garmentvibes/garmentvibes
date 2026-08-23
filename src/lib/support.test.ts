import { describe, expect, it } from "vitest";

import {
  MAX_MESSAGE_LENGTH,
  MAX_SUBJECT_LENGTH,
  MIN_MESSAGE_LENGTH,
  RESPONSE_TARGET_HOURS,
  hoursWaiting,
  isOverdue,
  statusAfterCustomerReply,
  statusAfterStaffReply,
  supportQueue,
  ticketsFor,
  ticketsForOrder,
  validateMessage,
  validateSubject,
} from "./support";
import type { SupportMessage, SupportTicket } from "@/types/support";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-08-23T12:00:00.000Z").getTime();

const msg = (over: Partial<SupportMessage> = {}): SupportMessage => ({
  id: "m1",
  from: "customer",
  body: "My parcel has not arrived.",
  createdAt: new Date(NOW - 2 * HOUR).toISOString(),
  ...over,
});

const ticket = (over: Partial<SupportTicket> = {}): SupportTicket => ({
  id: "t1",
  reference: "SUP1001",
  customerName: "Asha",
  customerEmail: "asha@example.com",
  subject: "Where is my order?",
  category: "delivery",
  status: "open",
  messages: [msg()],
  createdAt: new Date(NOW - 2 * HOUR).toISOString(),
  updatedAt: new Date(NOW - 2 * HOUR).toISOString(),
  ...over,
});

describe("validateSubject", () => {
  it("accepts a normal subject", () => {
    expect(validateSubject("Wrong size delivered").ok).toBe(true);
  });

  it("rejects one too short to scan in a queue", () => {
    expect(validateSubject("hi").ok).toBe(false);
  });

  it("rejects one past the limit and measures after trimming", () => {
    expect(validateSubject("a".repeat(MAX_SUBJECT_LENGTH)).ok).toBe(true);
    expect(validateSubject("a".repeat(MAX_SUBJECT_LENGTH + 1)).ok).toBe(false);
    expect(validateSubject(`  ${"a".repeat(MAX_SUBJECT_LENGTH)}  `).ok).toBe(true);
  });
});

describe("validateMessage", () => {
  it("rejects something too short to act on", () => {
    expect(validateMessage("help").ok).toBe(false);
    expect(validateMessage("a".repeat(MIN_MESSAGE_LENGTH)).ok).toBe(true);
  });

  it("says how long an over-long message was", () => {
    const result = validateMessage("a".repeat(MAX_MESSAGE_LENGTH + 1));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(String(MAX_MESSAGE_LENGTH + 1));
  });
});

describe("status transitions", () => {
  // The mistake every support system makes: a resolved thread the customer
  // replies to is not resolved, and leaving it so drops the reply into a
  // queue nobody looks at.
  it("reopens on a customer reply, whatever the thread was", () => {
    expect(statusAfterCustomerReply()).toBe("open");
  });

  // Whether an answer resolved anything is the customer's call.
  it("waits on the customer after staff reply, rather than self-resolving", () => {
    expect(statusAfterStaffReply()).toBe("awaiting_customer");
  });
});

describe("ticketsFor", () => {
  const mine = ticket({ id: "mine" });
  const theirs = ticket({ id: "theirs", customerEmail: "someone@else.test" });

  it("returns only this customer's threads", () => {
    expect(ticketsFor([mine, theirs], "asha@example.com").map((t) => t.id)).toEqual(["mine"]);
  });

  it("matches case-insensitively, so a differently-typed login still sees them", () => {
    expect(ticketsFor([mine], "ASHA@Example.com")).toHaveLength(1);
  });

  it("puts the most recently active first", () => {
    const older = ticket({ id: "older", updatedAt: new Date(NOW - 50 * HOUR).toISOString() });
    const newer = ticket({ id: "newer", updatedAt: new Date(NOW - HOUR).toISOString() });
    expect(ticketsFor([older, newer], "asha@example.com").map((t) => t.id)).toEqual([
      "newer",
      "older",
    ]);
  });
});

describe("ticketsForOrder", () => {
  it("finds threads attached to an order", () => {
    const linked = ticket({ id: "linked", orderId: "GV123" });
    const general = ticket({ id: "general" });
    expect(ticketsForOrder([linked, general], "GV123").map((t) => t.id)).toEqual(["linked"]);
  });

  it("does not match a ticket with no order on it", () => {
    expect(ticketsForOrder([ticket()], "GV123")).toHaveLength(0);
  });
});

describe("supportQueue", () => {
  it("holds only threads waiting on us", () => {
    const open = ticket({ id: "open", status: "open" });
    const waiting = ticket({ id: "waiting", status: "awaiting_customer" });
    const done = ticket({ id: "done", status: "resolved" });
    expect(supportQueue([open, waiting, done]).map((t) => t.id)).toEqual(["open"]);
  });

  // The longest-ignored message is the one about to become a complaint.
  it("puts the longest-waiting first", () => {
    const recent = ticket({ id: "recent", updatedAt: new Date(NOW - HOUR).toISOString() });
    const stale = ticket({ id: "stale", updatedAt: new Date(NOW - 40 * HOUR).toISOString() });
    expect(supportQueue([recent, stale]).map((t) => t.id)).toEqual(["stale", "recent"]);
  });
});

describe("hoursWaiting", () => {
  it("counts from the customer's last message", () => {
    const t = ticket({
      messages: [
        msg({ id: "a", createdAt: new Date(NOW - 30 * HOUR).toISOString() }),
        msg({ id: "b", from: "staff", createdAt: new Date(NOW - 20 * HOUR).toISOString() }),
        msg({ id: "c", createdAt: new Date(NOW - 5 * HOUR).toISOString() }),
      ],
    });
    expect(hoursWaiting(t, NOW)).toBe(5);
  });

  it("is null when the ball is not in our court", () => {
    expect(hoursWaiting(ticket({ status: "awaiting_customer" }), NOW)).toBeNull();
    expect(hoursWaiting(ticket({ status: "resolved" }), NOW)).toBeNull();
  });

  it("is null when the customer has not written", () => {
    expect(hoursWaiting(ticket({ messages: [msg({ from: "staff" })] }), NOW)).toBeNull();
  });

  // A device with a skewed clock would otherwise report a negative wait,
  // which sorts to the top of the queue and looks like the oldest ticket.
  it("does not report a negative wait for a future timestamp", () => {
    const t = ticket({ messages: [msg({ createdAt: new Date(NOW + 5 * HOUR).toISOString() })] });
    expect(hoursWaiting(t, NOW)).toBe(0);
  });
});

describe("isOverdue", () => {
  it("is false inside the response target", () => {
    expect(isOverdue(ticket(), NOW)).toBe(false);
  });

  it("becomes true exactly at the target", () => {
    const t = ticket({
      messages: [msg({ createdAt: new Date(NOW - RESPONSE_TARGET_HOURS * HOUR).toISOString() })],
    });
    expect(isOverdue(t, NOW)).toBe(true);
  });

  it("is false for a thread waiting on the customer, however old", () => {
    const t = ticket({
      status: "awaiting_customer",
      messages: [msg({ createdAt: new Date(NOW - 200 * HOUR).toISOString() })],
    });
    expect(isOverdue(t, NOW)).toBe(false);
  });
});
