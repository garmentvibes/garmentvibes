"use client";

import { useCallback, useEffect } from "react";
import { useWishlistStore } from "@/lib/stores/wishlist-store";
import { syncWishlist, wishlistAdd, wishlistRemove } from "@/lib/wishlist/actions";

// ---------------------------------------------------------------------------
// The hearts, as the storefront should touch them.
//
// `useWishlistStore` is still what components render from, and still the whole
// wishlist for signed-out visitors and for deployments with no database. What
// changes is that toggling goes through here, so a signed-in customer's list
// is also written to `wishlists` and survives switching device.
//
// Local first, server second, as with the cart. A heart must fill the instant
// it is pressed — awaiting a round trip before it moves would make the button
// feel broken on a phone signal — so the store is updated synchronously and
// the server call reconciles afterwards.
// ---------------------------------------------------------------------------

/**
 * Whether this deployment has a database to sync with.
 *
 * Read from the inlined public env rather than asked of the server: the answer
 * is fixed at build time, and asking would cost a round trip on every heart in
 * a deployment that has nothing to sync with.
 */
const CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Reconciles the local wishlist with the stored one, once, after hydration.
 *
 * Mounted by `<WishlistSync />` in the root layout, beside `<CartSync />`. It
 * runs on every load rather than only on sign-in for the reason given there:
 * there is no sign-in event to hang it on, because the session is a cookie
 * that may have been established in another tab, restored from a previous
 * visit, or expired since.
 */
export function useWishlistReconciliation() {
  const adopt = useWishlistStore((s) => s.adopt);

  useEffect(() => {
    if (!CONFIGURED) return;

    let cancelled = false;

    // Read through getState() rather than subscribing. Subscribing to
    // `productIds` would re-run this effect on every heart, which is both
    // wasteful and wrong: a toggle already pushes itself, and re-reconciling
    // on top of an in-flight push is how the two ends start disagreeing.
    const { productIds, syncedFor } = useWishlistStore.getState();

    syncWishlist(productIds, syncedFor)
      .then((result) => {
        if (cancelled || !result.live || !result.syncKey) return;
        adopt(result.productIds, result.syncKey);
      })
      .catch(() => {
        // A failed reconciliation leaves the local list exactly as it was, and
        // unmarked, so the next load tries again. Clearing it because the
        // network dropped would lose hearts the customer is looking at.
      });

    return () => {
      cancelled = true;
    };
  }, [adopt]);
}

export interface Wishlist {
  productIds: string[];
  isSaved: (productId: string) => boolean;
  toggle: (productId: string) => void;
}

/**
 * Wishlist state and the one mutation, writing locally and then to the
 * database.
 *
 * Safe to call signed-out or on a deployment with no Supabase project: the
 * server actions answer `signedIn: false` and the local store is left as it
 * is, which is the behaviour that existed before any of this.
 */
export function useWishlist(): Wishlist {
  const productIds = useWishlistStore((s) => s.productIds);
  const storeToggle = useWishlistStore((s) => s.toggle);
  const forgetSync = useWishlistStore((s) => s.forgetSync);

  // Called when a write comes back saying there was no session behind it.
  //
  // The list on screen has now diverged from whatever is stored — the customer
  // is still hearting things and nothing is recording it — so this device's
  // claim to have already reconciled is no longer true. Dropping the marker
  // makes the next sign-in merge rather than adopt, which is what saves the
  // hearts pressed while a session was quietly expiring.
  //
  // Only for a genuine "not signed in". A failed call from a signed-in
  // customer keeps the marker: that list may be carrying something un-hearted
  // on another device, and merging would put it back.
  const diverged = useCallback(() => forgetSync(), [forgetSync]);

  const toggle = useCallback(
    (productId: string) => {
      // Read the direction BEFORE toggling. Afterwards the store already holds
      // the new state, and asking it then would push the opposite call.
      const wasSaved = useWishlistStore.getState().productIds.includes(productId);

      storeToggle(productId);
      if (!CONFIGURED) return;

      const write = wasSaved ? wishlistRemove : wishlistAdd;

      write(productId)
        .then((result) => {
          if (!result.signedIn) diverged();
          // `changed: false` is deliberately not treated as anything. It means
          // the database already agreed with where the heart has just landed,
          // which is a no-op rather than a disagreement worth correcting.
        })
        .catch(() => {});
    },
    [storeToggle, diverged]
  );

  const isSaved = useCallback(
    (productId: string) => productIds.includes(productId),
    [productIds]
  );

  return { productIds, isSaved, toggle };
}
