import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyPaymentSignature, verifyWebhookSignature } from "@/lib/razorpay/signature";

// This module is the entire security boundary of the payment integration:
// both the browser callback and the webhook are ordinary HTTP requests that
// anyone can send, and the HMAC is the only thing separating a real Razorpay
// message from a forged one. These tests exist to make a regression here
// loud rather than silent.
//
// What they DON'T cover: the constant-time property. Swapping
// timingSafeEqual for `a === b` passes every test below, because the two
// agree on every accept/reject decision and differ only in how long they
// take to reach it. That difference is the whole point of using
// timingSafeEqual — a plain comparison leaks the signature byte by byte —
// so treat any change to the comparison itself as unreviewed by this file.

const SECRET = "test_secret_key";
const sign = (payload: string, secret = SECRET) =>
  createHmac("sha256", secret).update(payload).digest("hex");

describe("verifyPaymentSignature", () => {
  const orderId = "order_ABC123";
  const paymentId = "pay_XYZ789";
  const valid = sign(`${orderId}|${paymentId}`);

  it("accepts a correctly signed payment", () => {
    expect(verifyPaymentSignature({ orderId, paymentId, signature: valid }, SECRET)).toBe(true);
  });

  it("rejects a signature made with a different secret", () => {
    const foreign = sign(`${orderId}|${paymentId}`, "someone_elses_secret");
    expect(verifyPaymentSignature({ orderId, paymentId, signature: foreign }, SECRET)).toBe(false);
  });

  it("rejects a signature bound to a different order", () => {
    // Replaying a genuine signature against another order must not work.
    expect(
      verifyPaymentSignature({ orderId: "order_OTHER", paymentId, signature: valid }, SECRET)
    ).toBe(false);
  });

  it("rejects a signature bound to a different payment", () => {
    expect(
      verifyPaymentSignature({ orderId, paymentId: "pay_OTHER", signature: valid }, SECRET)
    ).toBe(false);
  });

  it("rejects missing fields rather than throwing", () => {
    expect(verifyPaymentSignature({ orderId: "", paymentId, signature: valid }, SECRET)).toBe(false);
    expect(verifyPaymentSignature({ orderId, paymentId: "", signature: valid }, SECRET)).toBe(false);
    expect(verifyPaymentSignature({ orderId, paymentId, signature: "" }, SECRET)).toBe(false);
  });

  it("rejects malformed hex without throwing", () => {
    // Buffer.from(..., "hex") silently truncates on invalid input, and
    // timingSafeEqual throws on a length mismatch — neither may surface as
    // a 500, and neither may accidentally pass.
    for (const bogus of ["zz", "nothexatall", "abc", "0".repeat(63)]) {
      expect(() =>
        verifyPaymentSignature({ orderId, paymentId, signature: bogus }, SECRET)
      ).not.toThrow();
      expect(verifyPaymentSignature({ orderId, paymentId, signature: bogus }, SECRET)).toBe(false);
    }
  });

  it("rejects a signature of the right length but wrong content", () => {
    expect(
      verifyPaymentSignature({ orderId, paymentId, signature: "0".repeat(64) }, SECRET)
    ).toBe(false);
  });
});

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify({ event: "payment.captured", payload: { amount: 129900 } });

  it("accepts a correctly signed body", () => {
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a missing signature header", () => {
    expect(verifyWebhookSignature(body, null, SECRET)).toBe(false);
  });

  it("rejects a tampered body carrying a previously valid signature", () => {
    // The reason verification must run against the RAW bytes: an attacker
    // replaying a real signature over an edited amount has to fail.
    const tampered = body.replace("129900", "1");
    expect(verifyWebhookSignature(tampered, sign(body), SECRET)).toBe(false);
  });

  it("rejects a body that is only re-serialised, not changed", () => {
    // Same data, different key order — proves the binding is to bytes, not
    // to the parsed object.
    const reordered = JSON.stringify({ payload: { amount: 129900 }, event: "payment.captured" });
    expect(verifyWebhookSignature(reordered, sign(body), SECRET)).toBe(false);
  });

  it("rejects a signature from another secret", () => {
    expect(verifyWebhookSignature(body, sign(body, "other"), SECRET)).toBe(false);
  });

  it("handles an empty body without throwing", () => {
    expect(verifyWebhookSignature("", sign(""), SECRET)).toBe(true);
    expect(verifyWebhookSignature("", "deadbeef", SECRET)).toBe(false);
  });
});
