import { createHmac, timingSafeEqual } from "node:crypto";

// Razorpay signature verification.
//
// This is the whole security boundary of the integration. Both a payment
// confirmation and a webhook arrive as ordinary HTTP requests that anyone
// can send; the HMAC is the only thing distinguishing a real Razorpay
// callback from a forged one. An order must never be marked paid on the
// strength of a request body alone.

/**
 * Constant-time comparison of two hex digests.
 *
 * A plain `===` on secrets leaks information through how long the comparison
 * takes, which can be enough to recover a signature byte by byte. Lengths
 * are checked first because timingSafeEqual throws on a length mismatch.
 */
function safeEqualHex(a: string, b: string) {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function hmacHex(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Verifies the signature Razorpay Checkout hands back to the browser after a
 * successful payment. The signed payload is `order_id|payment_id`.
 */
export function verifyPaymentSignature(
  params: { orderId: string; paymentId: string; signature: string },
  keySecret: string
) {
  if (!params.orderId || !params.paymentId || !params.signature) return false;
  const expected = hmacHex(`${params.orderId}|${params.paymentId}`, keySecret);
  return safeEqualHex(expected, params.signature);
}

/**
 * Verifies a webhook. Unlike the payment signature, this is an HMAC over the
 * *raw* request body — so the caller must pass the exact bytes received.
 * Parsing to JSON and re-serialising changes key order and whitespace and
 * will not match.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  webhookSecret: string
) {
  if (!signature) return false;
  return safeEqualHex(hmacHex(rawBody, webhookSecret), signature);
}
