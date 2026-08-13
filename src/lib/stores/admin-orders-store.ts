import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SEED_RETAIL_ORDERS, SEED_WHOLESALE_QUOTES } from "@/lib/mock/admin-data";
import type { RetailOrderStatus, WholesaleQuoteStatus } from "@/types/admin";

// Layers admin status changes on top of the seed orders/quotes. Once Supabase
// is connected these become real table updates; the component API stays the
// same, so only this file changes.
interface AdminOrdersState {
  retailStatusOverrides: Record<string, RetailOrderStatus>;
  quoteStatusOverrides: Record<string, WholesaleQuoteStatus>;
  setRetailStatus: (orderId: string, status: RetailOrderStatus) => void;
  setQuoteStatus: (quoteId: string, status: WholesaleQuoteStatus) => void;
}

export const useAdminOrdersStore = create<AdminOrdersState>()(
  persist(
    (set) => ({
      retailStatusOverrides: {},
      quoteStatusOverrides: {},
      setRetailStatus: (orderId, status) =>
        set((s) => ({ retailStatusOverrides: { ...s.retailStatusOverrides, [orderId]: status } })),
      setQuoteStatus: (quoteId, status) =>
        set((s) => ({ quoteStatusOverrides: { ...s.quoteStatusOverrides, [quoteId]: status } })),
    }),
    { name: "garmentvibes-admin-orders", skipHydration: true }
  )
);

export function useRetailOrders() {
  const overrides = useAdminOrdersStore((s) => s.retailStatusOverrides);
  return SEED_RETAIL_ORDERS.map((o) => ({ ...o, status: overrides[o.id] ?? o.status }));
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
