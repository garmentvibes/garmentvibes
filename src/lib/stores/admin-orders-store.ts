import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SEED_RETAIL_ORDERS, SEED_WHOLESALE_QUOTES } from "@/lib/mock/admin-data";
import type { RetailOrderStatus, WholesaleQuoteStatus } from "@/types/admin";

// Layers admin status changes on top of the seed orders/quotes. Once Supabase
// is connected these become real table updates; the component API stays the
// same, so only this file changes.
interface AdminOrdersState {
  retailStatusOverrides: Record<string, RetailOrderStatus>;
  deliveredAtOverrides: Record<string, string>;
  quoteStatusOverrides: Record<string, WholesaleQuoteStatus>;
  setRetailStatus: (orderId: string, status: RetailOrderStatus) => void;
  setQuoteStatus: (quoteId: string, status: WholesaleQuoteStatus) => void;
}

export const useAdminOrdersStore = create<AdminOrdersState>()(
  persist(
    (set) => ({
      retailStatusOverrides: {},
      deliveredAtOverrides: {},
      quoteStatusOverrides: {},
      setRetailStatus: (orderId, status) =>
        set((s) => ({
          retailStatusOverrides: { ...s.retailStatusOverrides, [orderId]: status },
          // Stamp the delivery date on the transition, since the return
          // window is measured from it. Only the first one counts — moving
          // an order back and forth must not silently extend the window.
          deliveredAtOverrides:
            status === "delivered" && !s.deliveredAtOverrides[orderId]
              ? {
                  ...s.deliveredAtOverrides,
                  [orderId]: new Date().toISOString().slice(0, 10),
                }
              : s.deliveredAtOverrides,
        })),
      setQuoteStatus: (quoteId, status) =>
        set((s) => ({ quoteStatusOverrides: { ...s.quoteStatusOverrides, [quoteId]: status } })),
    }),
    { name: "garmentvibes-admin-orders", skipHydration: true }
  )
);

export function useRetailOrders() {
  const overrides = useAdminOrdersStore((s) => s.retailStatusOverrides);
  const deliveredAt = useAdminOrdersStore((s) => s.deliveredAtOverrides);
  return SEED_RETAIL_ORDERS.map((o) => ({
    ...o,
    status: overrides[o.id] ?? o.status,
    deliveredAt: o.deliveredAt ?? deliveredAt[o.id],
  }));
}

export function useRetailOrder(id: string) {
  return useRetailOrders().find((o) => o.id === id);
}

export function useWholesaleQuotes() {
  const overrides = useAdminOrdersStore((s) => s.quoteStatusOverrides);
  return SEED_WHOLESALE_QUOTES.map((q) => ({ ...q, status: overrides[q.id] ?? q.status }));
}

export function useWholesaleQuote(id: string) {
  return useWholesaleQuotes().find((q) => q.id === id);
}
