import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessage, type OutgoingMessage } from "./providers";
import {
  anyTransportConfigured,
  transportConfigFromEnv,
  type TransportConfig,
} from "./transport";

// ---------------------------------------------------------------------------
// One pass over the outbox.
//
// Claim a batch, send each, settle each. The three functions it leans on live
// in 0020 and carry the parts that have to be right:
//
//   * `claim_notifications` takes rows with `for update skip locked`, so two
//     passes running at once take disjoint work rather than both sending the
//     same message;
//   * it counts the attempt at claim time, so a pass that dies mid-send still
//     burns one — otherwise an unreported failure retries for ever;
//   * `mark_notification_failed` decides the backoff and when to give up, so
//     every caller backs off identically.
//
// This file does the part that cannot be done in SQL: the HTTP call. It holds
// no policy of its own beyond "settle whatever the provider said".
//
// ---------------------------------------------------------------------------
// Why service role
// ---------------------------------------------------------------------------
//
// A dispatch pass runs on a schedule with no user behind it, so there is no
// session whose permissions would mean anything. The three functions are
// granted to `service_role` only — not even staff can claim a message by hand,
// because claiming one takes it off the queue and a mistake there is a
// customer who never hears from us.
// ---------------------------------------------------------------------------

export interface DispatchSummary {
  /** How many messages were claimed and attempted. */
  attempted: number;
  sent: number;
  failed: number;
  /**
   * Why nothing ran, when nothing ran. Distinct from `attempted: 0` with no
   * reason, which means the queue was simply empty.
   */
  skipped?: "not-configured" | "no-service-role";
}

interface ClaimedRow {
  id: string;
  channel: string;
  recipient: string;
  recipient_name: string;
  subject: string | null;
  body: string;
}

/**
 * Sends up to `limit` queued messages.
 *
 * Returns a summary rather than throwing: this is called from a route that a
 * scheduler polls, and a 500 tells the scheduler to retry the whole batch —
 * which, for messages already claimed and possibly already sent, is the one
 * thing that must not happen.
 */
export async function dispatchNotifications(
  limit = 20,
  config: TransportConfig = transportConfigFromEnv()
): Promise<DispatchSummary> {
  // With no transport a pass can only claim messages, fail them, and burn
  // their attempts. Not running leaves them queued and visible in the admin
  // panel, which is the honest state for a deployment that cannot send.
  if (!anyTransportConfigured(config)) {
    return { attempted: 0, sent: 0, failed: 0, skipped: "not-configured" };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { attempted: 0, sent: 0, failed: 0, skipped: "no-service-role" };
  }

  const { data, error } = await supabase.rpc("claim_notifications", { p_limit: limit });

  if (error) {
    console.error("[notifications] could not claim messages", error.message);
    return { attempted: 0, sent: 0, failed: 0 };
  }

  const claimed = (data ?? []) as unknown as ClaimedRow[];
  let sent = 0;
  let failed = 0;

  for (const row of claimed) {
    const message: OutgoingMessage = {
      channel: row.channel as OutgoingMessage["channel"],
      recipient: row.recipient,
      recipientName: row.recipient_name,
      subject: row.subject ?? "",
      body: row.body,
    };

    const result = await sendMessage(message, config);

    if (result.ok) {
      await supabase.rpc("mark_notification_sent", { p_id: row.id });
      sent += 1;
      continue;
    }

    failed += 1;

    if (result.retryable) {
      await supabase.rpc("mark_notification_failed", { p_id: row.id, p_reason: result.reason });
      continue;
    }

    // A permanent failure — a malformed address, a rejected number — should
    // not wait out four more backoffs before an admin can see it. Burning the
    // remaining attempts moves it to `failed` on this pass instead.
    await supabase.rpc("mark_notification_failed", {
      p_id: row.id,
      p_reason: `${result.reason} (not retryable)`,
    });
    await exhaust(supabase, row.id, result.reason);
  }

  return { attempted: claimed.length, sent, failed };
}

/**
 * Moves a permanently-failed message to `failed` without waiting for its
 * remaining attempts to be spent on retries that cannot work.
 *
 * Done by calling `mark_notification_failed` until the row gives up, rather
 * than by writing `status = 'failed'` here. The function owns the decision of
 * when a message is finished, and a second place that also decides it is a
 * second place to get it wrong — and the one that would drift, since this one
 * is not the one with the tests.
 */
async function exhaust(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  id: string,
  reason: string
): Promise<void> {
  // Bounded by the attempt ceiling the constraint in 0020 enforces, so this
  // cannot spin even if the row stops changing.
  for (let i = 0; i < 5; i += 1) {
    const { data } = await supabase
      .from("notifications")
      .select("status")
      .eq("id", id)
      .maybeSingle();

    if (!data || data.status !== "queued") return;

    await supabase.rpc("mark_notification_failed", {
      p_id: id,
      p_reason: `${reason} (not retryable)`,
    });
  }
}
