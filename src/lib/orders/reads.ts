"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";
import { getCustomer } from "@/lib/auth/customer";
import type { RetailOrder, RetailOrderItem, RetailOrderStatus } from "@/types/admin";

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

/** The columns a customer-facing order needs, in one round trip. */
const ORDER_SELECT = `
  id, reference, status, created_at, delivered_at, shipped_at,
  courier_id, awb, customer_name, customer_email, phone,
  shipping_address, payment_method,
  retail_order_items ( product_id, product_name, size, color, qty, price )
`;

interface OrderRow {
  id: string;
  reference: string | null;
  status: string;
  created_at: string;
  delivered_at: string | null;
  shipped_at: string | null;
  courier_id: string | null;
  awb: string | null;
  customer_name: string | null;
  customer_email: string | null;
  phone: string | null;
  shipping_address: Record<string, unknown> | null;
  payment_method: string;
  retail_order_items: Array<{
    product_id: string;
    product_name: string | null;
    size: string;
    color: string;
    qty: number;
    price: number;
  }>;
}

/**
 * Flattens the stored address JSON into the single line the UI prints.
 *
 * The order carries a snapshot rather than a join, so this is whatever the
 * address looked like when the order was placed — which is the address the
 * parcel went to, and the one that belongs on the invoice, even if the
 * customer has since edited their address book.
 */
function formatAddress(address: Record<string, unknown> | null): string {
  if (!address) return "";
  const parts = [
    address.addressLine1 ?? address.line1,
    address.city,
    address.state,
    address.pincode,
  ];
  return parts.filter(Boolean).join(", ");
}

function toRetailOrder(row: OrderRow): RetailOrder {
  const items: RetailOrderItem[] = row.retail_order_items.map((item) => ({
    productId: item.product_id,
    // Snapshotted at order time. Falling back to the id rather than to a
    // product lookup: the point of storing the name was that a renamed or
    // withdrawn product must not change what an order says it was for.
    name: item.product_name ?? item.product_id,
    size: item.size,
    color: item.color,
    qty: item.qty,
    price: item.price,
  }));

  return {
    // The reference is what the customer was shown and what Razorpay holds.
    // The uuid is ours; putting it in a URL would mean support and the
    // customer quoting different numbers at each other.
    id: row.reference ?? row.id,
    placedAt: row.created_at.slice(0, 10),
    deliveredAt: row.delivered_at ?? undefined,
    shipment:
      row.courier_id && row.awb && row.shipped_at
        ? { courierId: row.courier_id, awb: row.awb, shippedAt: row.shipped_at }
        : undefined,
    customerName: row.customer_name ?? "",
    customerEmail: row.customer_email ?? "",
    phone: row.phone ?? "",
    shippingAddress: formatAddress(row.shipping_address),
    // The stored enum grew past the two the UI type knows about in 0012 —
    // upi, card, netbanking, wallet and emi are all online as far as anything
    // customer-facing is concerned, and the specific method is a
    // reconciliation detail rather than something to print on an order card.
    paymentMethod: row.payment_method === "cod" ? "cod" : "online",
    status: row.status as RetailOrderStatus,
    items,
  };
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
