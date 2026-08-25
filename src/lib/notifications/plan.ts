import { normalisePhone, PHONE_PATTERN } from "@/lib/validation/address";
import { NOTIFICATION_TEMPLATES, renderTemplate, type TemplateVars } from "./templates";
import type { NotificationChannel, NotificationTemplateId } from "@/types/notifications";

// ---------------------------------------------------------------------------
// Turning "this happened" into the rows that go in the outbox.
//
// Pure, and separate from ./enqueue.ts, for the usual reason: the decisions
// worth getting right are here, and the part that needs a database is not.
// What is decided here is which channels a template actually reaches for a
// given customer, what each message says, and which of them may never be
// queued twice.
//
// ---------------------------------------------------------------------------
// Channels are filtered by what we can address, not by what is configured
// ---------------------------------------------------------------------------
//
// A deployment with no MSG91 credentials still queues the SMS copy. The queue
// is the record of what a customer should have received, and 0009 says so —
// staff can read exactly what would have gone out. Dropping the row would
// turn "nothing is configured" into "nothing was ever owed", which is the
// state that gets discovered six months later.
//
// What does drop a channel is having no address for it. A customer with no
// phone number cannot be sent an SMS by any provider, so queueing one would
// only produce a row that fails five times and lands in the admin panel
// looking like a provider fault.
// ---------------------------------------------------------------------------

export interface Contact {
  /** How the message addresses them. */
  name: string;
  email?: string | null;
  /** As stored — any of the forms PHONE_PATTERN accepts. */
  phone?: string | null;
}

/**
 * One row, in the shape `notifications` takes.
 *
 * snake_case because it is inserted verbatim. A camelCase interface here
 * would mean a mapping step whose only job is to be got wrong once.
 */
export interface PlannedMessage {
  template: NotificationTemplateId;
  channel: NotificationChannel;
  recipient: string;
  recipient_name: string;
  subject: string;
  body: string;
  related_to: string | null;
  dedupe_key: string | null;
}

export interface PlanOptions {
  /** Order/quote/account reference, for cross-linking from the admin view. */
  relatedTo?: string;
  /**
   * Names the event that must only be notified once, e.g. an order id. Left
   * unset, the message may repeat — which is right for reminders and replies
   * and wrong for a confirmation. See 0022.
   */
  dedupeScope?: string;
}

/**
 * An Indian mobile as MSG91 needs it, or null if it is not one.
 *
 * The stored number is whatever the customer typed — `PHONE_PATTERN` accepts
 * `+91`, `91`, a leading `0` or nothing at all in front of the ten digits. A
 * provider accepts one form, so the conversion has to happen somewhere, and
 * doing it here means a number that cannot be converted never becomes a row.
 */
export function toE164(value: string | null | undefined): string | null {
  if (!value) return null;

  const compact = value.replace(/[\s-]/g, "");
  if (!PHONE_PATTERN.test(compact)) return null;

  // normalisePhone() keeps the last ten digits, which is what the country code
  // goes in front of. India-only, like every other phone field on the site:
  // the checkout will not accept a foreign number in the first place.
  return `+91${normalisePhone(compact)}`;
}

/**
 * A usable email address, or null.
 *
 * Deliberately shallow. Every address that reaches here has already been
 * through zod at the checkout or come back from Supabase auth, so this is not
 * validation — it is a guard against the empty string and the stray space,
 * which is how a bad address actually arrives.
 */
function usableEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !trimmed.includes("@") || /\s/.test(trimmed)) return null;
  return trimmed;
}

/**
 * The rows to queue for one event.
 *
 * Empty when there is no way to reach the customer on any channel the
 * template uses — a caller that gets nothing back has not failed, it has
 * learned there was nobody to tell.
 */
export function planMessages(
  template: NotificationTemplateId,
  vars: TemplateVars,
  contact: Contact,
  options: PlanOptions = {}
): PlannedMessage[] {
  const email = usableEmail(contact.email);
  const phone = toE164(contact.phone);

  const messages: PlannedMessage[] = [];

  for (const channel of NOTIFICATION_TEMPLATES[template].channels) {
    const recipient = channel === "email" ? email : phone;
    if (!recipient) continue;

    const { subject, body } = renderTemplate(template, channel, vars);

    messages.push({
      template,
      channel,
      recipient,
      recipient_name: contact.name,
      subject,
      body,
      related_to: options.relatedTo ?? null,
      // Scoped per channel: the email and the SMS are two things that each
      // happen once, not one thing that happens twice.
      dedupe_key: options.dedupeScope ? `${template}:${channel}:${options.dedupeScope}` : null,
    });
  }

  return messages;
}
