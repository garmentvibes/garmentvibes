import { NextResponse } from "next/server";
import { isRazorpayConfigured, razorpayKeySecret } from "@/lib/razorpay/config";
import { verifyPaymentSignature } from "@/lib/razorpay/signature";
import { fetchRazorpayPayment, RazorpayError } from "@/lib/razorpay/client";
import { callerKey, createRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// Verifies the handoff Razorpay Checkout gives the browser after payment.
//
// The browser is not a trustworthy reporter of its own payment: a forged
// POST here would otherwise mark an order paid. The HMAC is what makes the
// claim credible, and the payment is then re-fetched from Razorpay so the
// final word on status and amount comes from the gateway, not the client.

// More generous than order creation because a legitimate payment can retry
// this handoff a few times on a flaky connection, but still bounded: without a
// cap this endpoint is an oracle for guessing signatures, and each call costs
// us an outbound request to Razorpay.
const LIMIT = 20;
const limiter = createRateLimiter({ limit: LIMIT, windowMs: 60_000 });

export async function POST(request: Request) {
  const rate = limiter.check(callerKey(request.headers));
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many verification attempts. Try again shortly." },
      { status: 429, headers: rateLimitHeaders(LIMIT, rate) }
    );
  }

  if (!isRazorpayConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  } = (body ?? {}) as Record<string, string>;

  const secret = razorpayKeySecret();
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  if (!verifyPaymentSignature({ orderId, paymentId, signature }, secret)) {
    console.error("[razorpay] payment signature rejected", { orderId, paymentId });
    return NextResponse.json({ error: "invalid_signature", verified: false }, { status: 400 });
  }

  try {
    // Independent confirmation. A valid signature proves the message came
    // from Razorpay; this proves the payment actually captured.
    const payment = await fetchRazorpayPayment(paymentId);
    const paid = payment.status === "captured" || payment.status === "authorized";

    return NextResponse.json({
      verified: true,
      paid,
      status: payment.status,
      amount: payment.amount,
      orderId: payment.order_id,
    });
  } catch (error) {
    if (error instanceof RazorpayError) {
      console.error("[razorpay] could not confirm payment", error.message);
      return NextResponse.json({ error: "gateway_error", verified: true }, { status: error.status });
    }
    console.error("[razorpay] unexpected error verifying payment", error);
    return NextResponse.json({ error: "unexpected_error" }, { status: 500 });
  }
}
