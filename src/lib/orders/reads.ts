"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";
import { getCustomer } from "@/lib/auth/customer";
import { ORDER_SELECT, toRetailOrder, type OrderRow } from "./rows";
import type { RetailOrder } from "@/types/admin";

// ---------------------------------------------------------------------------
// Reading a customer's own orders back.
//
// The write side has been real since #22; this was still the demo seed.
// `useRetailOrders()` returned SEED_RETAIL_ORDERS with admin status overrides
// layered on and nothing ever added a placed order to it, so a customer could
// check out, have the order land in `retail_orders`, and then open My Orders
// to find somebody else's fictional purchases and none of their own.
//
// There is no ownership check in this file, deliberately. RLS scopes
// `retail_orders` to `auth.uid()` and `retail_order_items` to orders the
// caller owns, so the query cannot be steered into reading another customer's
// history — and an `.eq("user_id", ...)` here would look like the protection
// while actually being decoration on top of it. The protection is the policy.
// ---------------------------------------------------------------------------

/** What the caller gets back, and where it came from. */
export interface OrderRead {
  orders: RetailOrder[];
  /**
   * False when there is no Supabase project or nobody is signed in, in which
   * case `orders` is empty and the caller falls back to the seed. Distinct
   * from an empty `orders` with `live: true`, which means a real customer who
   * genuinely has not ordered yet — and those two must render differently.
   */
  live: boolean;
}

/**
 * Every order belonging to the signed-in customer, newest first.
 *
 * Returns `live: false` and no orders when there is nothing to read from —
 * no Supabase project, or nobody signed in — so the caller can keep showing
 * the demo seed rather than an empty page that looks like data loss.
 */
export async function myOrders(): Promise<OrderRead> {
  if (!supabaseConfigured()) return { orders: [], live: false };

  const customer = await getCustomer();
  if (!customer) return { orders: [], live: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("retail_orders")
    .select(ORDER_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[orders] could not read the customer's orders", error.message);
    // Not `live: false`. The customer IS signed in and this deployment does
    // have a database — falling back to the seed here would show them a
    // stranger's orders because a query failed. An empty list with an error
    // logged is the honest answer.
    return { orders: [], live: true };
  }

  return { orders: (data as unknown as OrderRow[]).map(toRetailOrder), live: true };
}

/**
 * One order by its reference, or null.
 *
 * Filtered on `reference` rather than the uuid because that is what the
 * customer sees and what the URL carries. RLS still scopes the read, so a
 * reference belonging to somebody else returns nothing rather than their
 * order.
 */
export async function myOrder(reference: string): Promise<OrderRead & { order: RetailOrder | null }> {
  if (!supabaseConfigured()) return { orders: [], live: false, order: null };

  const customer = await getCustomer();
  if (!customer) return { orders: [], live: false, order: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("retail_orders")
    .select(ORDER_SELECT)
    .eq("reference", reference)
    .maybeSingle();

  if (error) {
    console.error("[orders] could not read the order", { reference, message: error.message });
    return { orders: [], live: true, order: null };
  }

  return {
    orders: [],
    live: true,
    order: data ? toRetailOrder(data as unknown as OrderRow) : null,
  };
}

/**
 * Cancels one of the caller's own unpaid orders and puts its stock back.
 *
 * Takes the reference rather than the uuid because that is what the customer's
 * URL carries — and keeping uuids server-side means a browser never has one to
 * pass to anything. The lookup is RLS-scoped, so a reference belonging to
 * somebody else finds nothing rather than cancelling their order.
 *
 * Returns false when there was nothing to cancel: no database, not signed in,
 * not their order, or an order that has already been paid for or shipped.
 * `release_retail_order()` makes that last judgement, not this — it holds the
 * row lock, so it is the only place the decision can be made without a race.
 */
export async function cancelMyOrder(reference: string): Promise<boolean> {
  if (!supabaseConfigured()) return false;

  const customer = await getCustomer();
  if (!customer) return false;

  const supabase = await createClient();

  const { data: order } = await supabase
    .from("retail_orders")
    .select("id")
    .eq("reference", reference)
    .maybeSingle();

  if (!order) return false;

  const { data, error } = await supabase.rpc("release_retail_order", {
    p_order_id: order.id,
  });

  if (error) {
    console.error("[orders] could not cancel", { reference, message: error.message });
    return false;
  }

  return data === true;
}
