import type { NotificationChannel } from "@/types/notifications";

// ---------------------------------------------------------------------------
// Which provider carries which channel.
//
// Pure and separated from the adapters that actually make HTTP calls, because
// this is the part that can be tested here and those are not. The rules below
// decide what a deployment can send at all; getting them wrong means messages
// queue up looking healthy while nothing goes out, or — worse — a phone number
// handed to an email API.
//
// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------
//
// None of these are `NEXT_PUBLIC_`, and none may become so. A Resend key sends
// mail as GarmentVibes; an MSG91 key sends SMS billed to GarmentVibes. Both
// are account credentials rather than publishable identifiers — there is no
// client-safe half, the way there is for the Razorpay key id. Inlining one
// into the bundle hands anybody who views source the ability to send mail from
// the shop's own domain.
// ---------------------------------------------------------------------------

/** The transports a deployment can be configured with. */
export type TransportId = "resend" | "msg91";

export interface TransportConfig {
  /** Resend, for email. */
  resendApiKey?: string;
  /** The From address Resend sends as. Required alongside the key. */
  resendFrom?: string;
  /** MSG91, for SMS and WhatsApp. */
  msg91AuthKey?: string;
  /** The registered sender id MSG91 sends SMS as. Required alongside the key. */
  msg91SenderId?: string;
}

/**
 * Reads the transport configuration from the environment.
 *
 * Read through a function rather than at module load so a test can supply its
 * own, and so a missing variable is a runtime "not configured" rather than a
 * value baked in at build time — these are server secrets and are not inlined.
 */
export function transportConfigFromEnv(env: NodeJS.ProcessEnv = process.env): TransportConfig {
  return {
    resendApiKey: env.RESEND_API_KEY || undefined,
    resendFrom: env.RESEND_FROM || undefined,
    msg91AuthKey: env.MSG91_AUTH_KEY || undefined,
    msg91SenderId: env.MSG91_SENDER_ID || undefined,
  };
}

/**
 * The transport that carries a channel, or null if none is configured.
 *
 * A key on its own is not enough. Resend rejects a send with no From address
 * and MSG91 rejects one with no sender id, so a deployment with half the
 * configuration would claim it could send and then fail every message —
 * burning all five attempts on something no retry was ever going to fix.
 * Half-configured reads as unconfigured.
 */
export function transportFor(
  channel: NotificationChannel,
  config: TransportConfig
): TransportId | null {
  if (channel === "email") {
    return config.resendApiKey && config.resendFrom ? "resend" : null;
  }

  // SMS and WhatsApp both go through MSG91. They are separate channels to the
  // customer and separate rows in the outbox, but one account carries both.
  return config.msg91AuthKey && config.msg91SenderId ? "msg91" : null;
}

/**
 * Whether this deployment can send anything at all.
 *
 * Used to decide whether to run a dispatch pass. With no transport there is
 * nothing a pass can do except claim messages, fail them, and burn their
 * attempts — so it does not run, and the outbox keeps them queued and visible
 * in the admin panel rather than quietly marking them failed.
 */
export function anyTransportConfigured(config: TransportConfig): boolean {
  return (
    transportFor("email", config) !== null ||
    transportFor("sms", config) !== null
  );
}

/**
 * The channels a deployment can currently carry.
 *
 * The admin panel shows this so "nothing is being delivered" is something
 * staff can see rather than deduce from a queue that never shrinks.
 */
export function configuredChannels(config: TransportConfig): NotificationChannel[] {
  const channels: NotificationChannel[] = [];
  if (transportFor("email", config)) channels.push("email");
  if (transportFor("sms", config)) channels.push("sms", "whatsapp");
  return channels;
}
