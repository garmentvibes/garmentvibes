import "server-only";

import type { NotificationChannel } from "@/types/notifications";
import { transportFor, type TransportConfig } from "./transport";

// ---------------------------------------------------------------------------
// The adapters that actually call a provider.
//
// ---------------------------------------------------------------------------
// What is and is not verified
// ---------------------------------------------------------------------------
//
// Nothing in this file has ever run. There are no Resend or MSG91 credentials
// on any deployment yet, and the sandbox this was written in cannot reach
// either API, so the HTTP shapes below come from their documentation rather
// than from a response anybody has seen.
//
// That is why the surface is kept this thin. Everything that can be decided
// without a network — which provider carries a channel, whether a deployment
// is configured at all, how many attempts a message gets, when it is retried,
// whether two passes can claim the same row — lives in ./transport.ts and in
// 0020, where it is tested. What is left here is one fetch per provider and
// the translation of its answer into sent-or-failed.
//
// The first real send will find something. The point of the split is that when
// it does, the fix is inside one of these two functions rather than anywhere
// that decides whether a customer gets told twice.
// ---------------------------------------------------------------------------

export interface OutgoingMessage {
  channel: NotificationChannel;
  /** Email address or E.164 phone number. */
  recipient: string;
  recipientName: string;
  subject: string;
  body: string;
}

export type SendResult =
  | { ok: true }
  /** `retryable: false` gives up immediately rather than burning four more attempts. */
  | { ok: false; reason: string; retryable: boolean };

/**
 * Sends one message, or explains why it could not be sent.
 *
 * Never throws. A dispatch pass handles many messages and one provider
 * throwing must not abandon the rest of the batch — every failure comes back
 * as a value so the pass can settle that row and carry on.
 */
export async function sendMessage(
  message: OutgoingMessage,
  config: TransportConfig
): Promise<SendResult> {
  const transport = transportFor(message.channel, config);

  if (!transport) {
    // Not retryable: no amount of waiting configures a provider, and a
    // dispatch pass should not have run at all in this state.
    return {
      ok: false,
      reason: `No transport configured for ${message.channel}`,
      retryable: false,
    };
  }

  try {
    return transport === "resend"
      ? await sendViaResend(message, config)
      : await sendViaMsg91(message, config);
  } catch (error) {
    // A thrown fetch is a network problem, which is the definition of worth
    // retrying.
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "send threw",
      retryable: true,
    };
  }
}

/**
 * 4xx is the caller's fault and 5xx is the provider's.
 *
 * A 422 for a malformed address will be a 422 every time, so retrying it costs
 * four more calls and delays the failure showing up in the admin panel by half
 * an hour. 429 is the exception: it is a 4xx that explicitly means "later".
 */
function retryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function sendViaResend(
  message: OutgoingMessage,
  config: TransportConfig
): Promise<SendResult> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.resendFrom,
      to: [message.recipient],
      subject: message.subject,
      text: message.body,
    }),
  });

  if (response.ok) return { ok: true };

  // Read the body for the reason, but do not let a non-JSON error page turn a
  // failed send into a thrown parse error.
  const detail = await response.text().catch(() => "");

  return {
    ok: false,
    reason: `Resend ${response.status}: ${detail.slice(0, 200)}`,
    retryable: retryableStatus(response.status),
  };
}

async function sendViaMsg91(
  message: OutgoingMessage,
  config: TransportConfig
): Promise<SendResult> {
  const response = await fetch("https://control.msg91.com/api/v5/flow/", {
    method: "POST",
    headers: {
      authkey: config.msg91AuthKey ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: config.msg91SenderId,
      // MSG91 wants numbers without the leading +.
      mobiles: message.recipient.replace(/^\+/, ""),
      message: message.body,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      ok: false,
      reason: `MSG91 ${response.status}: ${detail.slice(0, 200)}`,
      retryable: retryableStatus(response.status),
    };
  }

  // MSG91 answers 200 with a body that says whether it worked, which is not
  // the same thing as the request having succeeded. Treating 200 as sent would
  // mark a rejected number delivered.
  const payload = (await response.json().catch(() => null)) as { type?: string } | null;

  if (payload?.type === "error") {
    return { ok: false, reason: "MSG91 rejected the message", retryable: false };
  }

  return { ok: true };
}
