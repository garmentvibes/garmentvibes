"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";
import { getStaffUser } from "@/lib/auth/dal";
import { courierById } from "@/lib/couriers";
import { notifyOrderStatus } from "@/lib/notifications/orders";
import { RETAIL_ORDER_STATUSES, type RetailOrderStatus } from "@/types/admin";
import type { Database } from "@/types/database";

// ---------------------------------------------------------------------------
// Moving an order through fulfilment.
//
// These were `setRetailStatus` and `setShipment` on a zustand store, layering
// overrides on top of six fictional orders. The store's own note said what it
// was waiting for: "Once Supabase is connected these become real table updates;
// the component API stays the same, so only this file changes."
//
// ---------------------------------------------------------------------------
// Plain updates, not a function
// ---------------------------------------------------------------------------
//
// Unlike stock and orders, nothing here is computed from a current value and
// nothing races: a status is set to what staff chose, and two people setting it
// at once means the second one wins, which is what "two people pressed
// different buttons" should mean. The staff policy from 0004 is already
// `for all using (is_staff())`, so no new grant or function is needed either.
//
// ---------------------------------------------------------------------------
// The notification is the point
// ---------------------------------------------------------------------------
//
// 0020 built a dispatcher and #35 built the enqueue path, and until now
// `order_placed` was the only thing that ever reached the queue. Every message
// a customer actually waits for — shipped, delivered, cancelled — was written
// into a zustand outbox in one admin's browser, which no sender could drain.
//
// These transitions are where those messages come from, so they are queued
// here, from the status the database now holds rather than from what the caller
// asked for. An order whose update was refused must not send "your order has
// shipped".
// ---------------------------------------------------------------------------

export interface OrderWriteResult {
  error: string | null;
  /**
   * True when there was no database to write to. The caller falls back to its
   * local store, which is what every QA suite here runs against — an error
   * message would tell an admin their change was rejected when it was saved.
   */
  notConfigured?: boolean;
}

const NOT_STAFF: OrderWriteResult = { error: "Only staff can manage orders" };

async function staffClient() {
  if (!supabaseConfigured()) return { client: null, notConfigured: true as const };

  const staff = await getStaffUser();
  if (!staff) return { client: null, notConfigured: false as const };

  return { client: await createClient(), notConfigured: false as const };
}

/** Republishes the pages an order appears on. */
function republish(reference: string) {
  revalidatePath(`/admin/orders/${reference}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  // The customer's own pages read the same row, and "shipped" reaching them
  // late is exactly the complaint tracking exists to prevent.
  revalidatePath(`/shop/orders/${reference}`);
  revalidatePath("/shop/orders");
}

/** Today, as the `date` columns store it. */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Sets an order's status, and tells the customer when the new status is one
 * they are waiting on.
 *
 * `shipped` and `delivered` stamp their dates here rather than leaving them to
 * the caller. `delivered_at` in particular is not cosmetic: the return window
 * runs from it, so a wrong or missing date either shortens a customer's rights
 * or extends them indefinitely.
 */
export async function setRetailOrderStatus(
  reference: string,
  status: RetailOrderStatus
): Promise<OrderWriteResult> {
  const { client, notConfigured } = await staffClient();
  if (notConfigured) return { error: null, notConfigured: true };
  if (!client) return NOT_STAFF;

  // Validated against the list rather than trusted: this is a server action, so
  // the argument is whatever was posted, and `status` goes straight into an
  // enum column that would otherwise raise a Postgres error at an admin.
  if (!RETAIL_ORDER_STATUSES.includes(status)) {
    return { error: `${status} is not an order status` };
  }

  // Typed as the table's own Update row rather than a loose Record, so a key
  // that is not a column on retail_orders — or a value of the wrong type — is
  // a compile error instead of a Postgres one seen by an admin.
  const patch: Database["public"]["Tables"]["retail_orders"]["Update"] = { status };
  if (status === "shipped") patch.shipped_at = today();
  if (status === "delivered") patch.delivered_at = today();
  if (status === "cancelled") patch.cancelled_at = today();

  const { data, error } = await client
    .from("retail_orders")
    .update(patch)
    .eq("reference", reference)
    .select("id, customer_name, customer_email, phone, reference, status, courier_id, awb")
    .maybeSingle();

  if (error) {
    console.error("[admin/orders] could not set status", { reference, status, message: error.message });
    return { error: "Could not update that order" };
  }

  if (!data) return { error: "No such order" };

  // Queued from the row that came back, not from `status` — if the update had
  // been refused there would be no row, and this cannot then announce a
  // transition that did not happen.
  await notifyOrderStatus(data.id);

  republish(reference);

  return { error: null };
}

/**
 * Attaches a courier and tracking number, and moves the order to shipped.
 *
 * One action rather than two, because they are one event: an order with an AWB
 * and a status of `packed` is a parcel the courier has and the customer has not
 * been told about, and an order marked shipped with no AWB is a tracking link
 * that goes nowhere. Doing both in one update means neither half can be
 * forgotten.
 */
export async function setRetailShipment(
  reference: string,
  courierId: string,
  awb: string
): Promise<OrderWriteResult> {
  const { client, notConfigured } = await staffClient();
  if (notConfigured) return { error: null, notConfigured: true };
  if (!client) return NOT_STAFF;

  const trimmed = awb.trim();
  if (!trimmed) return { error: "Enter the tracking number" };

  // A courier the app cannot render is a tracking link the customer cannot
  // follow — lib/couriers.ts owns the list and the URL template.
  if (!courierById(courierId)) return { error: "Choose a courier" };

  const { data, error } = await client
    .from("retail_orders")
    .update({
      courier_id: courierId,
      awb: trimmed,
      status: "shipped",
      shipped_at: today(),
    })
    .eq("reference", reference)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[admin/orders] could not save the shipment", {
      reference,
      message: error.message,
    });
    return { error: "Could not save that shipment" };
  }

  if (!data) return { error: "No such order" };

  await notifyOrderStatus(data.id);

  republish(reference);

  return { error: null };
}
