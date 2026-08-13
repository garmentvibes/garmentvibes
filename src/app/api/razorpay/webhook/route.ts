import { NextResponse } from "next/server";
import { razorpayWebhookSecret } from "@/lib/razorpay/config";
import { verifyWebhookSignature } from "@/lib/razorpay/signature";

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

/** Events worth acting on; anything else is acknowledged and ignored. */
const HANDLED_EVENTS = new Set([
  "payment.captured",
  "payment.failed",
  "order.paid",
  "refund.processed",
]);

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
    if (event.event && HANDLED_EVENTS.has(event.event)) {
      // Fulfilment lands here once orders live in Supabase: look the order up
      // by the receipt echoed in notes, then move its status. Doing it now
      // would mean writing to a client-side store from the server, which is
      // not something a webhook can reach.
      console.warn(`[razorpay] received ${event.event} — no order store to update yet`);
    }
  } catch (error) {
    // Swallowed deliberately, per rule 2 above.
    console.error("[razorpay] webhook handling failed", error);
  }

  return NextResponse.json({ received: true });
}
