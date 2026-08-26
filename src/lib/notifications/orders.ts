import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { trackingUrlFor } from "@/lib/couriers";
import { formatPrice } from "@/lib/utils";
import { enqueueNotification } from "./enqueue";
import type { NotificationTemplateId } from "@/types/notifications";

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

// ---------------------------------------------------------------------------
// The rest of the order's life
// ---------------------------------------------------------------------------
//
// Which statuses a customer is told about, and with which template. Not every
// transition is news: `packed` is a warehouse state, and telling somebody their
// order has been packed invites the reply "so when does it ship". `pending` and
// `confirmed` are covered by the confirmation the order already sent.
//
// A status missing from this map queues nothing, which is the intended
// behaviour rather than an oversight — hence a map rather than a switch with a
// default that has to be remembered.
const STATUS_TEMPLATES: Partial<Record<string, NotificationTemplateId>> = {
  shipped: "order_shipped",
  delivered: "order_delivered",
  cancelled: "order_cancelled",
};

/**
 * Tells a customer about a change to their order, if the new status is one
 * worth telling them about.
 *
 * Reads the order back rather than taking the status as an argument, for the
 * same reason `notifyOrderPlaced` does: the message has to describe what the
 * database holds, not what a caller intended. An update that was refused leaves
 * the old status, and this then says nothing rather than announcing a shipment
 * that did not happen.
 *
 * Keyed on the status as well as the order, so a status set twice — a
 * double-clicked button, two staff on the same order — queues one message. But
 * an order that legitimately moves shipped → delivered gets both, because those
 * are different keys.
 */
export async function notifyOrderStatus(orderId: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return;

    const { data: order, error } = await supabase
      .from("retail_orders")
      .select(
        "reference, total, status, customer_name, customer_email, phone, courier_id, awb"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (error) {
      console.error("[notifications] could not read order to notify", {
        orderId,
        message: error.message,
      });
      return;
    }

    if (!order) return;

    const template = STATUS_TEMPLATES[order.status];
    if (!template) return;

    await enqueueNotification(
      template,
      {
        name: order.customer_name,
        orderId: order.reference,
        amount: formatPrice(order.total),
        // Only set when there is something to track. The templates fall back to
        // "My Orders in your account", which is a real place the customer can
        // go — a tracking link built from a missing AWB is not.
        trackingUrl: trackingUrlFor(order.courier_id, order.awb) || undefined,
      },
      {
        name: order.customer_name,
        email: order.customer_email,
        phone: order.phone,
      },
      {
        relatedTo: order.reference,
        dedupeScope: `${orderId}:${order.status}`,
      }
    );
  } catch (error) {
    console.error("[notifications] order status notification threw", { orderId, error });
  }
}
