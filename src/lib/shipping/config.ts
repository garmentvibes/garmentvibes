// Shipping-aggregator configuration.
//
// Same discipline as src/lib/razorpay/config.ts: no account exists yet, so
// every entry point degrades to the manual flow rather than showing a broken
// button. Setting the two env vars is the only step needed to switch booking
// on.
//
// These are server-only and must never gain a NEXT_PUBLIC_ prefix — the
// Shiprocket password is a full account credential, not a publishable key.
// There is no client-safe half of this to expose, which is why the booking
// call goes through a Server Action rather than from the browser.

export const SHIPROCKET_API_BASE = "https://apiv2.shiprocket.in/v1/external";

export function shiprocketEmail() {
  return process.env.SHIPROCKET_EMAIL || null;
}

export function shiprocketPassword() {
  return process.env.SHIPROCKET_PASSWORD || null;
}

/** Pickup location nickname as configured in the Shiprocket dashboard. */
export function shiprocketPickupLocation() {
  return process.env.SHIPROCKET_PICKUP_LOCATION || "Primary";
}

/** True only when both halves of the credential are present. */
export function isShiprocketConfigured() {
  return Boolean(shiprocketEmail() && shiprocketPassword());
}
