import { NextResponse } from "next/server";
import { razorpayWebhookSecret } from "@/lib/razorpay/config";
import { verifyWebhookSignature } from "@/lib/razorpay/signature";
import { notifyOrderPlaced } from "@/lib/notifications/orders";
import { recordPayment } from "@/lib/supabase/admin";

// Razorpay webhook receiver.
//
// This is the authoritative record of what happened to a payment. The
// browser callback can be lost — the customer closes the tab, the network
// drops — but the webhook still arrives, which is why fulfilment should key
// off this endpoint rather than off the client's verify call.
//
// Two rules this endpoint has to follow:
//
//   1. Verify against the RAW body. Razorpay signs the exact bytes sent, so
//      the body is read as text and only parsed after the HMAC matches.
//      request.json() would discard the original formatting and never match.
//   2. Always answer 2xx once the signature is valid, even if our own
//      handling fails. A non-2xx makes Razorpay retry with backoff, and a
//      bug in our fulfilment logic would turn into a retry storm.
//
// Deliberately NOT rate limited, unlike the order and verify routes.
//
// Every call here arrives from Razorpay's own infrastructure, so per-caller
// limiting would bucket all of them under a handful of addresses and start
// refusing real payment notifications during exactly the traffic spike that
// makes them matter. A dropped webhook is a paid order that never ships.
// The HMAC below is the gate — an unsigned flood is rejected before anything
// expensive happens, and volume defence at that point belongs to the
// platform, not to this handler.

/** Events worth acting on; anything else is acknowledged and ignored. */
const HANDLED_EVENTS = new Set([
  "payment.captured",
  "payment.failed",
  "order.paid",
  "refund.processed",
]);

/** The subset that means money arrived and an order should be confirmed. */
const PAID_EVENTS = new Set(["payment.captured", "order.paid"]);

interface PaymentPayload {
  payment?: {
    entity?: { id: string; amount: number; notes?: Record<string, string> };
  };
}

export async function POST(request: Request) {
  const secret = razorpayWebhookSecret();
  if (!secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    // Unsigned or wrongly signed: this did not come from Razorpay.
    console.error("[razorpay] webhook signature rejected");
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  let event: { event?: string; payload?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    if (event.event && PAID_EVENTS.has(event.event)) {
      // The receipt travels in the payment's notes, copied there from the
      // order we created. It is what `retail_orders.reference` holds.
      const payment = (event.payload as PaymentPayload | undefined)?.payment?.entity;
      const receipt = payment?.notes?.receipt;

      if (payment && receipt) {
        // Safe to call for every retry and for both events: Razorpay sends
        // payment.captured and order.paid for one payment, and the browser's
        // verify handoff may already have recorded it. The database turns a
        // repeat into a no-op.
        const orderId = await recordPayment({
          reference: receipt,
          paymentId: payment.id,
          amount: payment.amount,
        });

        // An online order is only confirmed once the money is recorded, so
        // this is where its confirmation is queued. Both this and the verify
        // handoff can reach here for one payment; the dedupe key in 0022 is
        // what stops the customer being told twice.
        if (orderId) await notifyOrderPlaced(orderId);
      } else {
        // A paid event we cannot attribute is money we have taken against an
        // order we cannot find. Nothing to retry — it needs a person.
        console.error(`[razorpay] ${event.event} carried no receipt to match an order`);
      }
    } else if (event.event && HANDLED_EVENTS.has(event.event)) {
      // payment.failed and refund.processed are acknowledged but not acted
      // on. A failed payment leaves the order pending, which the checkout
      // already releases; a refund is a decision someone makes in the admin
      // panel, not something a gateway notification should apply on its own.
      console.warn(`[razorpay] ${event.event} acknowledged, no action taken`);
    }
  } catch (error) {
    // Swallowed deliberately, per rule 2 above.
    console.error("[razorpay] webhook handling failed", error);
  }

  return NextResponse.json({ received: true });
}
