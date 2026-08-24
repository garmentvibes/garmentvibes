"use client";

import { useEffect, useState } from "react";
import { myOrders } from "@/lib/orders/reads";
import { useRetailOrders } from "@/lib/stores/admin-orders-store";
import type { RetailOrder } from "@/types/admin";

// ---------------------------------------------------------------------------
// The customer's orders, from the database when there is one.
//
// The fallback lives here rather than in each page so that "which source am I
// looking at?" is answered once. Three pages read orders — the list, the
// detail and the invoice — and three copies of this decision is three chances
// to show a stranger's demo orders to a real customer.
//
// `live` is not the same as "non-empty". A signed-in customer with no orders
// yet must see an empty state, not the seed; only a deployment with no
// database, or nobody signed in, falls back.
// ---------------------------------------------------------------------------

export interface MyOrders {
  orders: RetailOrder[];
  /** True once the server has answered. The pages show a skeleton until then. */
  loaded: boolean;
  /** True when these are the customer's real orders rather than the demo seed. */
  live: boolean;
}

/**
 * Whether this deployment has a database to read orders from.
 *
 * Read from the inlined public env rather than asked of the server, because
 * the answer is fixed at build time and asking costs a round trip and a
 * loading state on a page that is going to fall back regardless.
 *
 * That loading state was not free: it made the orders page render empty for
 * a moment before the seed arrived, which the e2e suite caught as a flake —
 * "order list renders" failed two runs in three. Knowing the answer
 * synchronously removes the flash rather than teaching the test to wait
 * through it.
 */
const CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export function useMyOrders(): MyOrders {
  // Read unconditionally: hooks cannot be called conditionally, and this is
  // also what the fallback returns.
  const seeded = useRetailOrders();

  const [state, setState] = useState<{ orders: RetailOrder[]; live: boolean } | null>(null);

  useEffect(() => {
    // Nothing to ask. The fallback below is already correct.
    if (!CONFIGURED) return;

    let cancelled = false;

    myOrders()
      .then((result) => {
        if (!cancelled) setState({ orders: result.orders, live: result.live });
      })
      .catch(() => {
        // A failed read is not "no database". Falling back to the seed on a
        // network blip would put fictional orders in front of a real customer,
        // which is worse than an empty list — so this settles as live-empty.
        if (!cancelled) setState({ orders: [], live: true });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // No database: the seed is the answer, and it is available on first render.
  if (!CONFIGURED) return { orders: seeded, loaded: true, live: false };

  if (!state) return { orders: [], loaded: false, live: false };
  if (!state.live) return { orders: seeded, loaded: true, live: false };
  return { orders: state.orders, loaded: true, live: true };
}

/**
 * One of the customer's orders by reference, or undefined.
 *
 * Derived from the same fetch as the list rather than its own round trip.
 * The order history a customer has is small enough that fetching all of it to
 * show one is cheaper than a second request, and it means the detail page
 * cannot disagree with the list about whether these are live orders.
 */
export function useMyOrder(reference: string): {
  order: RetailOrder | undefined;
  loaded: boolean;
  live: boolean;
} {
  const { orders, loaded, live } = useMyOrders();
  return { order: orders.find((o) => o.id === reference), loaded, live };
}
