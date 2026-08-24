"use client";

import { useCartReconciliation } from "@/lib/hooks/use-cart";

// ---------------------------------------------------------------------------
// Brings the stored cart and the local one into agreement, once per load.
//
// A component rather than a call inside StoreHydrator because the ordering
// matters: this reads the local bag, and the local bag does not exist until
// StoreHydrator has rehydrated it from localStorage. Rendered after it in the
// layout, this effect runs after it — React runs effects in mount order — so
// what it sends is the bag the customer actually has rather than an empty one.
//
// Sending an empty one would not corrupt anything, because merging nothing is
// a no-op and the stored bag would simply be adopted. It would just quietly
// lose the signed-out bag the whole feature exists to save.
// ---------------------------------------------------------------------------

export function CartSync() {
  useCartReconciliation();
  return null;
}
