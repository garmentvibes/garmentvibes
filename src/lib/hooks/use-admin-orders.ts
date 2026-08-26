"use client";

import { useCallback, useEffect, useState } from "react";
import { allRetailOrders } from "@/lib/admin/orders/reads";
import { useRetailOrders as useSeededRetailOrders } from "@/lib/stores/admin-orders-store";
import type { RetailOrder } from "@/types/admin";

// ---------------------------------------------------------------------------
// The orders staff have to fulfil, from the database when there is one.
//
// The mirror of use-my-orders.ts, and the same decision made once rather than
// in each page: the list and the detail both read orders, and two copies of
// "which source am I looking at" is two chances to show staff a fictional order
// they then try to ship.
//
// `live` is not "non-empty". A real shop with no orders yet must see an empty
// state; only a deployment with no database, or a caller who is not staff,
// falls back to the seed.
// ---------------------------------------------------------------------------

export interface AdminOrders {
  orders: RetailOrder[];
  /** True once the server has answered. Pages show a skeleton until then. */
  loaded: boolean;
  /** True when these are real orders rather than the demo seed. */
  live: boolean;
  /**
   * Re-reads the list.
   *
   * Needed because a status change is a server action and these pages are
   * client components: `revalidatePath` refreshes the routes but does not
   * reach into this hook's state, so without a re-read the panel would show
   * the old status until a navigation.
   */
  refresh: () => void;
}

/**
 * Whether this deployment has a database to read orders from.
 *
 * From the inlined public env rather than asked of the server: the answer is
 * fixed at build time, and asking costs a round trip and a loading flash on a
 * page that falls back regardless. That flash was a measured e2e flake once
 * already — see the note in use-my-orders.ts.
 */
const CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export function useAdminOrders(): AdminOrders {
  // Read unconditionally: hooks cannot be called conditionally, and this is
  // also what the fallback returns.
  const seeded = useSeededRetailOrders();

  const [state, setState] = useState<{ orders: RetailOrder[]; live: boolean } | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!CONFIGURED) return;

    let cancelled = false;

    allRetailOrders()
      .then((result) => {
        if (!cancelled) setState({ orders: result.orders, live: result.live });
      })
      .catch(() => {
        // A failed read is not "no database". Falling back to the seed on a
        // network blip would put invented orders in front of somebody about to
        // act on them, so this settles as live-empty instead.
        if (!cancelled) setState({ orders: [], live: true });
      });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  if (!CONFIGURED) return { orders: seeded, loaded: true, live: false, refresh };

  if (!state) return { orders: [], loaded: false, live: false, refresh };
  if (!state.live) return { orders: seeded, loaded: true, live: false, refresh };
  return { orders: state.orders, loaded: true, live: true, refresh };
}

/**
 * One order by its reference, or undefined.
 *
 * Derived from the same fetch as the list rather than its own round trip, so
 * the detail page cannot disagree with the list about whether these are live
 * orders — which is the disagreement that would have staff shipping a seeded
 * order from a page that looked real.
 */
export function useAdminOrder(reference: string): {
  order: RetailOrder | undefined;
  loaded: boolean;
  live: boolean;
  refresh: () => void;
} {
  const { orders, loaded, live, refresh } = useAdminOrders();
  return { order: orders.find((o) => o.id === reference), loaded, live, refresh };
}
