// Razorpay configuration.
//
// No account exists yet, so every entry point degrades cleanly when the keys
// are absent: the storefront falls back to the existing simulated checkout
// rather than showing a broken payment button. Setting the three env vars is
// the only step needed to switch the real flow on.
//
// Key discipline:
//   - RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are server-only. They
//     must never gain a NEXT_PUBLIC_ prefix, which would ship them to every
//     browser and hand over the ability to forge payments.
//   - Only the key id is public; Razorpay's checkout script needs it.

export const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

/** Public key id, safe to render into the page. */
export function razorpayKeyId() {
  return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "";
}

/** Server-only. Returns null when unset so callers must handle it. */
export function razorpayKeySecret() {
  return process.env.RAZORPAY_KEY_SECRET || null;
}

/** Server-only. Used to authenticate incoming webhooks. */
export function razorpayWebhookSecret() {
  return process.env.RAZORPAY_WEBHOOK_SECRET || null;
}

/**
 * True only when both halves of the API credential are present. Checked on
 * the server before creating an order, and mirrored to the client through a
 * prop rather than by reading the secret in the browser.
 */
export function isRazorpayConfigured() {
  return Boolean(razorpayKeyId() && razorpayKeySecret());
}
