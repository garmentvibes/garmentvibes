"use client";

import { useCallback, useEffect } from "react";
import { useCartStore, type CartLine } from "@/lib/stores/cart-store";
import { cartAdd, cartClear, cartSetQty, syncCart } from "@/lib/cart/actions";
import { mergePayload } from "@/lib/cart/payload";

// ---------------------------------------------------------------------------
// The bag, as the storefront should touch it.
//
// `useCartStore` is still the thing components render from, and still the
// whole bag for signed-out visitors and for deployments with no database.
// What changes is that mutations go through here, so that a signed-in
// customer's bag is also written to `cart_items` and survives switching
// device.
//
// Local first, server second, on purpose. Adding to a bag must feel
// immediate — awaiting a round trip before the badge moves would make the
// storefront feel broken on a phone signal — so the store is updated
// synchronously and the server call reconciles afterwards. The database is
// still the authority on what the bag holds; it is just allowed to arrive a
// moment late.
// ---------------------------------------------------------------------------

/**
 * Whether this deployment has a database to sync with.
 *
 * Read from the inlined public env rather than asked of the server, for the
 * same reason as `use-my-orders.ts`: the answer is fixed at build time, and
 * asking costs a round trip on every cart interaction in a deployment that
 * has nothing to sync with.
 */
const CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Reconciles the local bag with the stored one, once, after hydration.
 *
 * Mounted by `<CartSync />` in the root layout. It runs on every load rather
 * than only on sign-in because there is no sign-in event to hang it on: the
 * session is a cookie that may have been established in another tab, restored
 * from a previous visit, or expired since. "Every load" is the only trigger
 * that catches all of those, which is why the merge underneath it had to be
 * idempotent.
 */
export function useCartReconciliation() {
  const adopt = useCartStore((s) => s.adopt);

  useEffect(() => {
    if (!CONFIGURED) return;

    let cancelled = false;

    // Read through getState() rather than subscribing. Subscribing to `lines`
    // would re-run this effect on every add-to-bag, which is both wasteful and
    // wrong: a mutation already pushes itself, and re-reconciling on top of an
    // in-flight push is how the two ends start disagreeing.
    const { lines, syncedFor } = useCartStore.getState();

    // Only the variant and quantity of each line travel — see ./payload.ts.
    syncCart(mergePayload(lines), syncedFor)
      .then((result) => {
        if (cancelled || !result.live || !result.syncKey) return;
        adopt(result.lines, result.syncKey);
      })
      .catch(() => {
        // A failed reconciliation leaves the local bag exactly as it was, and
        // unmarked, so the next load tries again. Clearing it because the
        // network dropped would lose a bag the customer is looking at.
      });

    return () => {
      cancelled = true;
    };
  }, [adopt]);
}

export interface Cart {
  lines: CartLine[];
  addLine: (line: Omit<CartLine, "key">) => void;
  setQty: (key: string, qty: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;
}

/**
 * Cart mutations that write locally and then to the database.
 *
 * Every one of these is safe to call signed-out or on a deployment with no
 * Supabase project: the server actions answer null in that case and the local
 * store is simply left as it is, which is the pre-existing behaviour.
 */
export function useCart(): Cart {
  const lines = useCartStore((s) => s.lines);
  const storeAdd = useCartStore((s) => s.addLine);
  const storeSetQty = useCartStore((s) => s.setQty);
  const storeRemove = useCartStore((s) => s.removeLine);
  const storeClear = useCartStore((s) => s.clear);
  const reconcile = useCartStore((s) => s.reconcile);
  const forgetSync = useCartStore((s) => s.forgetSync);

  // Called when a write comes back saying there was no session behind it.
  //
  // The bag on screen has now diverged from whatever is stored — the customer
  // is still adding to it and nothing is recording that — so this device's
  // claim to have already reconciled is no longer true. Dropping the marker
  // makes the next sign-in merge rather than adopt, which is what saves the
  // additions made while a session was quietly expiring.
  //
  // Only for a genuine "not signed in". A failed call from a signed-in
  // customer keeps the marker: that bag may be carrying a line deleted on
  // another device, and merging would put it back.
  const diverged = useCallback(() => forgetSync(), [forgetSync]);

  const addLine = useCallback(
    (line: Omit<CartLine, "key">) => {
      storeAdd(line);
      if (!CONFIGURED) return;

      const key = `${line.productId}:${line.size}:${line.color}`;
      cartAdd(line.slug, line.size, line.color, line.qty)
        // The server's answer is not always the one asked for — `cart_add`
        // clamps at 99 — so it is written back rather than assumed.
        .then((result) => {
          if (!result.signedIn) return diverged();
          if (result.qty !== null) reconcile(key, result.qty);
        })
        .catch(() => {});
    },
    [storeAdd, reconcile, diverged]
  );

  const removeLine = useCallback(
    (key: string) => {
      // Read the line BEFORE removing it. Afterwards there is nothing left to
      // take a slug, size and colour from, and the server call would have
      // nothing to address.
      const line = useCartStore.getState().lines.find((l) => l.key === key);

      storeRemove(key);
      if (!CONFIGURED || !line) return;

      cartSetQty(line.slug, line.size, line.color, 0)
        .then((result) => {
          if (!result.signedIn) diverged();
        })
        .catch(() => {});
    },
    [storeRemove, diverged]
  );

  const setQty = useCallback(
    (key: string, qty: number) => {
      // The store floors at 1, so a stepper pressed down to zero would
      // silently do nothing there while removing the line on the server.
      // Deciding here that zero means removal keeps the two ends agreeing,
      // rather than leaving each caller to notice.
      if (qty < 1) {
        removeLine(key);
        return;
      }

      storeSetQty(key, qty);
      if (!CONFIGURED) return;

      const line = useCartStore.getState().lines.find((l) => l.key === key);
      if (!line) return;

      cartSetQty(line.slug, line.size, line.color, qty)
        .then((result) => {
          if (!result.signedIn) return diverged();
          if (result.qty !== null) reconcile(key, result.qty);
        })
        .catch(() => {});
    },
    [storeSetQty, reconcile, removeLine, diverged]
  );

  const clear = useCallback(() => {
    storeClear();
    if (!CONFIGURED) return;
    cartClear()
      .then((result) => {
        if (!result.signedIn) diverged();
      })
      .catch(() => {});
  }, [storeClear, diverged]);

  return { lines, addLine, setQty, removeLine, clear };
}
