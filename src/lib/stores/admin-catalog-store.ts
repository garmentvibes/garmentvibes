import { create } from "zustand";
import { persist } from "zustand/middleware";
import { RETAIL_PRODUCTS } from "@/lib/mock/retail-products";
import { WHOLESALE_PRODUCTS } from "@/lib/mock/wholesale-products";
import type { RetailProduct, WholesaleProduct } from "@/types/catalog";

// Admin catalog edits, layered on top of the static mock catalogs.
//
// IMPORTANT: this store is client-side (localStorage), so edits made here are
// visible in the admin panel on this device only — the storefront renders its
// catalog on the server from the static mock data and won't reflect them.
// That's expected for the pre-database phase: once Supabase is connected,
// these reads/writes become real queries and edits become global. The admin UI
// says as much so nobody mistakes a local edit for a published change.

export type RetailDraft = Omit<RetailProduct, "id">;
export type WholesaleDraft = Omit<WholesaleProduct, "id">;

interface AdminCatalogState {
  retailOverrides: Record<string, Partial<RetailProduct>>;
  wholesaleOverrides: Record<string, Partial<WholesaleProduct>>;
  retailAdded: RetailProduct[];
  wholesaleAdded: WholesaleProduct[];
  retailDeleted: string[];
  wholesaleDeleted: string[];

  updateRetail: (id: string, updates: Partial<RetailProduct>) => void;
  updateWholesale: (id: string, updates: Partial<WholesaleProduct>) => void;
  addRetail: (draft: RetailDraft) => string;
  addWholesale: (draft: WholesaleDraft) => string;
  deleteRetail: (id: string) => void;
  deleteWholesale: (id: string) => void;
  resetAll: () => void;
}

export const useAdminCatalogStore = create<AdminCatalogState>()(
  persist(
    (set) => ({
      retailOverrides: {},
      wholesaleOverrides: {},
      retailAdded: [],
      wholesaleAdded: [],
      retailDeleted: [],
      wholesaleDeleted: [],

      updateRetail: (id, updates) =>
        set((s) => ({
          retailOverrides: { ...s.retailOverrides, [id]: { ...s.retailOverrides[id], ...updates } },
          retailAdded: s.retailAdded.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        })),
      updateWholesale: (id, updates) =>
        set((s) => ({
          wholesaleOverrides: {
            ...s.wholesaleOverrides,
            [id]: { ...s.wholesaleOverrides[id], ...updates },
          },
          wholesaleAdded: s.wholesaleAdded.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        })),

      addRetail: (draft) => {
        const id = `r-custom-${crypto.randomUUID().slice(0, 8)}`;
        set((s) => ({ retailAdded: [...s.retailAdded, { ...draft, id }] }));
        return id;
      },
      addWholesale: (draft) => {
        const id = `w-custom-${crypto.randomUUID().slice(0, 8)}`;
        set((s) => ({ wholesaleAdded: [...s.wholesaleAdded, { ...draft, id }] }));
        return id;
      },

      deleteRetail: (id) =>
        set((s) => ({
          retailDeleted: [...s.retailDeleted, id],
          retailAdded: s.retailAdded.filter((p) => p.id !== id),
        })),
      deleteWholesale: (id) =>
        set((s) => ({
          wholesaleDeleted: [...s.wholesaleDeleted, id],
          wholesaleAdded: s.wholesaleAdded.filter((p) => p.id !== id),
        })),

      resetAll: () =>
        set({
          retailOverrides: {},
          wholesaleOverrides: {},
          retailAdded: [],
          wholesaleAdded: [],
          retailDeleted: [],
          wholesaleDeleted: [],
        }),
    }),
    { name: "garmentvibes-admin-catalog", skipHydration: true }
  )
);

export function useAdminRetailProducts(): RetailProduct[] {
  const { retailOverrides, retailAdded, retailDeleted } = useAdminCatalogStore();
  return [
    ...RETAIL_PRODUCTS.map((p) => ({ ...p, ...retailOverrides[p.id] })),
    ...retailAdded,
  ].filter((p) => !retailDeleted.includes(p.id));
}

export function useAdminWholesaleProducts(): WholesaleProduct[] {
  const { wholesaleOverrides, wholesaleAdded, wholesaleDeleted } = useAdminCatalogStore();
  return [
    ...WHOLESALE_PRODUCTS.map((p) => ({ ...p, ...wholesaleOverrides[p.id] })),
    ...wholesaleAdded,
  ].filter((p) => !wholesaleDeleted.includes(p.id));
}

export function useAdminRetailProduct(id: string) {
  return useAdminRetailProducts().find((p) => p.id === id);
}

export function useAdminWholesaleProduct(id: string) {
  return useAdminWholesaleProducts().find((p) => p.id === id);
}
