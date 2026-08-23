import type { SupportStatus, SupportTicket } from "@/types/support";

// ---------------------------------------------------------------------------
// Order-linked support threads.
//
// The contact page had a form that set a "we'll respond shortly" banner and
// did nothing else — no ticket, no queue, nobody to respond. A promise with no
// mechanism behind it is worse than no form, because the customer stops
// looking for another way to reach you.
//
// The rules here are mostly about status, and status is the thing every
// support system gets wrong in the same way: a thread marked resolved that the
// customer replies to is not resolved, it is open and now also stale. Every
// transition below exists to keep the queue honest about who owes whom a
// reply.
// ---------------------------------------------------------------------------

export const MIN_MESSAGE_LENGTH = 10;
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_SUBJECT_LENGTH = 120;

export interface SupportValidation {
  ok: boolean;
  error?: string;
}

export function validateSubject(subject: string): SupportValidation {
  const trimmed = subject.trim();
  if (trimmed.length < 3) return { ok: false, error: "Give it a short subject" };
  if (trimmed.length > MAX_SUBJECT_LENGTH) {
    return { ok: false, error: `Subjects are limited to ${MAX_SUBJECT_LENGTH} characters` };
  }
  return { ok: true };
}

export function validateMessage(body: string): SupportValidation {
  const trimmed = body.trim();
  if (trimmed.length < MIN_MESSAGE_LENGTH) {
    return { ok: false, error: "Tell us a bit more so we can help" };
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters — this is ${trimmed.length}`,
    };
  }
  return { ok: true };
}

/**
 * The status after a customer writes.
 *
 * Always `open`, including on a resolved thread. Someone replying to a closed
 * ticket has not accepted that it was closed, and silently leaving it resolved
 * means the reply lands in a queue nobody looks at.
 */
export function statusAfterCustomerReply(): SupportStatus {
  return "open";
}

/**
 * The status after staff write.
 *
 * `awaiting_customer` rather than `resolved`: whether an answer resolved
 * anything is the customer's call, not ours. Staff close a thread explicitly.
 */
export function statusAfterStaffReply(): SupportStatus {
  return "awaiting_customer";
}

/** Tickets belonging to one customer, newest activity first. */
export function ticketsFor(tickets: SupportTicket[], email: string): SupportTicket[] {
  const normalised = email.trim().toLowerCase();
  return tickets
    .filter((t) => t.customerEmail.toLowerCase() === normalised)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/** Tickets raised about one order. */
export function ticketsForOrder(tickets: SupportTicket[], orderId: string): SupportTicket[] {
  return tickets.filter((t) => t.orderId === orderId);
}

/**
 * The staff queue: anything the customer is waiting on, oldest first.
 *
 * `awaiting_customer` threads are excluded — the ball is not in our court —
 * and `resolved` ones are done. Sorting by `updatedAt` rather than `createdAt`
 * puts the longest-ignored message at the top, which is the one generating the
 * complaint.
 */
export function supportQueue(tickets: SupportTicket[]): SupportTicket[] {
  return tickets
    .filter((t) => t.status === "open")
    .sort((a, b) => (a.updatedAt > b.updatedAt ? 1 : -1));
}

/** Hours since the customer's last message went unanswered, or null. */
export function hoursWaiting(ticket: SupportTicket, now: number): number | null {
  if (ticket.status !== "open") return null;

  const lastCustomer = [...ticket.messages]
    .reverse()
    .find((message) => message.from === "customer");
  if (!lastCustomer) return null;

  const elapsed = now - new Date(lastCustomer.createdAt).getTime();
  // A message timestamped in the future is a clock problem, not a wait.
  return elapsed < 0 ? 0 : Math.floor(elapsed / (60 * 60 * 1000));
}

/**
 * Answer within one working day. Not a legal commitment — the Consumer
 * Protection (E-Commerce) Rules window applies to the Grievance Officer route
 * on the grievance page, which is a separate and slower escalation. This is
 * the internal target that keeps ordinary questions from becoming grievances.
 */
export const RESPONSE_TARGET_HOURS = 24;

export function isOverdue(ticket: SupportTicket, now: number): boolean {
  const waiting = hoursWaiting(ticket, now);
  return waiting !== null && waiting >= RESPONSE_TARGET_HOURS;
}
