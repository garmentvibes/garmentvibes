"use client";

import { useRetailOrders } from "@/lib/stores/admin-orders-store";

/**
 * Product ids this customer has actually received.
 *
 * This is what "verified purchase" has to mean. Reviews were submitted with
 * `verified: false` hardcoded and a comment saying purchase verification had
 * to wait for the database — but the order history is already readable, so the
 * check was available all along.
 *
 * Delivered only. A placed-but-undelivered order is not evidence that anyone
 * has seen the garment, and a review written before it arrives is exactly the
 * kind a verified badge should not vouch for.
 *
 * Becomes `exists (select 1 from retail_order_items ...)` once orders are in
 * the database — `reviews.order_id` already exists in the schema and is what
 * `verified` is meant to key on.
 */
export function usePurchasedProductIds(): Set<string> {
  const orders = useRetailOrders();

  const purchased = new Set<string>();
  for (const order of orders) {
    if (order.status !== "delivered") continue;
    for (const item of order.items) purchased.add(item.productId);
  }
  return purchased;
}
