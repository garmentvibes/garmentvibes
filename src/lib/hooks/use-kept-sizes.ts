"use client";

import { useRetailOrders } from "@/lib/stores/admin-orders-store";
import { useReturnsStore } from "@/lib/stores/returns-store";

/**
 * Sizes this customer bought and did NOT send back, most recent first.
 *
 * "Kept" is the operative word. A size that came back is evidence against
 * itself, so feeding every past purchase into a size recommendation would
 * cheerfully suggest the size that did not fit last time. Anything covered by
 * a return request is excluded unless that request was rejected — a rejected
 * return means the customer still has the garment.
 *
 * Reads the mock order history for now; once orders are in `retail_orders`
 * this becomes one query joining orders to returns, and nothing above it
 * changes.
 */
export function useKeptSizes(): string[] {
  const orders = useRetailOrders();
  const returns = useReturnsStore((s) => s.requests);

  // Keyed by order + product + size, because the same customer may buy the
  // same product twice in different sizes and only send one back.
  const returned = new Set<string>();
  for (const request of returns) {
    if (request.status === "rejected") continue;
    for (const item of request.items) {
      returned.add(`${request.orderId}:${item.productId}:${item.size}`);
    }
  }

  const kept: string[] = [];
  const seen = new Set<string>();

  // Newest first, so the most recent size wins when someone has changed size.
  const byRecency = [...orders].sort((a, b) => (a.placedAt < b.placedAt ? 1 : -1));

  for (const order of byRecency) {
    // A cancelled order was never worn, and an undelivered one has not been
    // tried on. Neither is evidence that the size fits.
    if (order.status !== "delivered") continue;

    for (const item of order.items) {
      if (returned.has(`${order.id}:${item.productId}:${item.size}`)) continue;
      if (seen.has(item.size)) continue;
      seen.add(item.size);
      kept.push(item.size);
    }
  }

  return kept;
}
