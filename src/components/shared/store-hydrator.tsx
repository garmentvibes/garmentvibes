"use client";

import { useEffect } from "react";
import { useCartStore } from "@/lib/stores/cart-store";
import { useWishlistStore } from "@/lib/stores/wishlist-store";
import { useRecentlyViewedStore } from "@/lib/stores/recently-viewed-store";
import { useAddressStore } from "@/lib/stores/address-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { useWholesaleOrderStore } from "@/lib/stores/wholesale-order-store";
import { useShipToStore } from "@/lib/stores/ship-to-store";
import { useTeamStore } from "@/lib/stores/team-store";

// All persisted stores use `skipHydration: true` so the first client render
// matches the server-rendered HTML (both show default/empty state) — then we
// rehydrate from localStorage here, once, after mount. Without this, zustand
// reads localStorage synchronously on store creation and the very first
// client paint diverges from the SSR output, causing React hydration
// mismatches (see e.g. the wishlist heart icon, cart/order badge counts).
export function StoreHydrator() {
  useEffect(() => {
    useCartStore.persist.rehydrate();
    useWishlistStore.persist.rehydrate();
    useRecentlyViewedStore.persist.rehydrate();
    useAddressStore.persist.rehydrate();
    useSessionStore.persist.rehydrate();
    useWholesaleOrderStore.persist.rehydrate();
    useShipToStore.persist.rehydrate();
    useTeamStore.persist.rehydrate();
  }, []);

  return null;
}
