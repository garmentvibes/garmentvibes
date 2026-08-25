import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/utils";
import { enqueueNotification } from "./enqueue";

// ---------------------------------------------------------------------------
// The order confirmation.
//
// The first event to actually reach the outbox, and the one that decides the
// shape of the rest: read the order back out of the database, notify from
// what is stored, and key the message on the order so it cannot be queued
// twice.
//
// ---------------------------------------------------------------------------
// Why it reads the order instead of being handed it
// ---------------------------------------------------------------------------
//
// Both callers already know the total and the address — they just sent them.
// Passing them in would be one less query and one more way for the message to
// disagree with the record: `place_retail_order` re-derives every price from
// the catalogue and may accept a total the client did not compute. The number
// in the email has to be the number in the order, so it comes from the order.
//
// ---------------------------------------------------------------------------
// When it fires
// ---------------------------------------------------------------------------
//
// On confirmation, not on placement. A COD order is confirmed the moment it is
// placed — 0013 writes it that way — so it fires from the checkout action. An
// online order is `pending` until the gateway says otherwise, and a customer
// who dismisses the payment sheet has their order cancelled and its stock
// returned; telling them it was confirmed would be a lie sent by email.
//
// So the online path fires from `recordPayment`, which runs from both the
// browser's verify handoff and Razorpay's webhook. Both of those can happen
// for one payment, which is exactly what the dedupe key in 0022 is for.
// ---------------------------------------------------------------------------

/**
 * Tells a customer their order is confirmed.
 *
 * Never throws and reports nothing: the order is already placed and paid by
 * the time this runs, and neither of those may fail because an email did not
 * queue.
 */
export async function notifyOrderPlaced(orderId: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return;

    const { data: order, error } = await supabase
      .from("retail_orders")
      .select("reference, total, status, customer_name, customer_email, phone")
      .eq("id", orderId)
      .maybeSingle();

    if (error) {
      console.error("[notifications] could not read order to notify", {
        orderId,
        message: error.message,
      });
      return;
    }

    // A pending order has not been paid for, and a cancelled one is not news
    // anybody wants. Checked here rather than trusted from the caller, because
    // this is the assertion that stops "your order is confirmed" going out for
    // an order that is not.
    if (!order || order.status === "pending" || order.status === "cancelled") return;

    await enqueueNotification(
      "order_placed",
      {
        name: order.customer_name,
        orderId: order.reference,
        amount: formatPrice(order.total),
      },
      {
        name: order.customer_name,
        email: order.customer_email,
        phone: order.phone,
      },
      {
        // The reference, not the uuid: this is what staff cross-reference
        // against in the admin view and what the customer can read back.
        relatedTo: order.reference,
        // The uuid, because that is what cannot be reissued.
        dedupeScope: orderId,
      }
    );
  } catch (error) {
    console.error("[notifications] order confirmation threw", { orderId, error });
  }
}
