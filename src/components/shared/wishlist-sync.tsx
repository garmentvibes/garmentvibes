"use client";

import { useWishlistReconciliation } from "@/lib/hooks/use-wishlist";

// ---------------------------------------------------------------------------
// Brings the stored wishlist and the local one into agreement, once per load.
//
// A component rather than a call inside StoreHydrator, for the ordering reason
// set out in cart-sync.tsx: this reads the local list, and the local list does
// not exist until StoreHydrator has rehydrated it from localStorage. Rendered
// after it in the layout, this effect runs after it — React runs effects in
// mount order — so what it sends is the wishlist the customer actually has
// rather than an empty one.
//
// Sending an empty one would not corrupt anything, because merging nothing is
// a no-op and the stored list would simply be adopted. It would just quietly
// lose the signed-out hearts the whole feature exists to save.
// ---------------------------------------------------------------------------

export function WishlistSync() {
  useWishlistReconciliation();
  return null;
}
