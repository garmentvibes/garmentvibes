import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { planMessages, type Contact, type PlanOptions } from "./plan";
import type { TemplateVars } from "./templates";
import type { NotificationTemplateId } from "@/types/notifications";

// ---------------------------------------------------------------------------
// Putting messages in the outbox.
//
// The counterpart to ./dispatch.ts, and the half that was missing: 0009 built
// the table, 0020 made it drainable, and until now the only thing that ever
// enqueued anything was src/lib/stores/notification-store.ts — a zustand store
// in one admin's browser. A dispatcher pointed at an empty table sends
// nothing, correctly, for ever.
//
// ---------------------------------------------------------------------------
// Why service role
// ---------------------------------------------------------------------------
//
// 0009 gave `notifications` a staff-only policy and no customer-facing one at
// all, which is right: the outbox holds every message sent to every customer.
// So a customer placing an order cannot insert their own confirmation, and
// should not be able to — an insert they controlled would be an insert whose
// recipient they controlled, i.e. the shop's mail server addressed by whoever
// asks.
//
// The rows are therefore written with the service-role client, from the server
// only, from arguments the caller has read out of the database rather than
// accepted from a request body.
//
// ---------------------------------------------------------------------------
// Why nothing here throws
// ---------------------------------------------------------------------------
//
// Every caller is finishing something that already succeeded — an order is
// placed, a payment is recorded. Failing that operation because a notification
// could not be queued would turn a paid order into an error page, which is a
// far worse outcome than a customer who is not emailed. Failures are logged
// and the count comes back; nothing propagates.
// ---------------------------------------------------------------------------

/**
 * Queues one event's messages. Returns how many rows were written.
 *
 * Zero is not necessarily a failure: it is also what a deployment with no
 * Supabase returns, and what a customer with no reachable address returns.
 */
export async function enqueueNotification(
  template: NotificationTemplateId,
  vars: TemplateVars,
  contact: Contact,
  options: PlanOptions = {}
): Promise<number> {
  const messages = planMessages(template, vars, contact, options);
  if (messages.length === 0) return 0;

  const supabase = createAdminClient();
  if (!supabase) return 0;

  // `ignoreDuplicates` on the dedupe key rather than an upsert of the whole
  // row: a message already queued must not have its body rewritten by a
  // second attempt to queue it. What staff read in the outbox is what the
  // customer gets, and that only holds if the row is written once.
  const { data, error } = await supabase
    .from("notifications")
    .upsert(messages, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id");

  if (error) {
    console.error("[notifications] could not queue messages", {
      template,
      relatedTo: options.relatedTo,
      message: error.message,
    });
    return 0;
  }

  return data?.length ?? 0;
}
