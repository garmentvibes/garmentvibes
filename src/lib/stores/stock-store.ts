import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { RetailProduct } from "@/types/catalog";

// Per-variant stock levels.
//
// The mock catalog only carries a boolean `inStock` per size, which can't
// express "only 3 left" or be decremented by an order. This layers real
// integer stock on top, seeded deterministically from that boolean so the
// catalog doesn't need rewriting, and lets admin adjust levels. When Supabase
// lands this becomes an inventory table and the same helpers read from it.

const DEFAULT_STOCK = 12;
export const LOW_STOCK_THRESHOLD = 5;

function variantKey(productId: string, sizeLabel: string) {
  return `${productId}:${sizeLabel}`;
}

// Deterministic seed so server and client agree and levels look varied
// without being random per render.
function seedStock(productId: string, sizeLabel: string, inStock: boolean) {
  if (!inStock) return 0;
  const hash = variantKey(productId, sizeLabel)
    .split("")
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return (hash % 3 === 0 ? hash % LOW_STOCK_THRESHOLD : DEFAULT_STOCK + (hash % 20)) || 1;
}

interface StockState {
  overrides: Record<string, number>;
  setStock: (productId: string, sizeLabel: string, qty: number) => void;
  /**
   * Reduce stock for a variant. `currentStock` must be the resolved level
   * (from getStock) — a variant that has never been overridden has no entry
   * to decrement from, so the caller supplies the seeded value.
   */
  decrement: (productId: string, sizeLabel: string, qty: number, currentStock: number) => void;
  resetAll: () => void;
}

export const useStockStore = create<StockState>()(
  persist(
    (set) => ({
      overrides: {},
      setStock: (productId, sizeLabel, qty) =>
        set((s) => ({
          overrides: { ...s.overrides, [variantKey(productId, sizeLabel)]: Math.max(0, qty) },
        })),
      decrement: (productId, sizeLabel, qty, currentStock) =>
        set((s) => {
          const key = variantKey(productId, sizeLabel);
          const base = s.overrides[key] ?? currentStock;
          return { overrides: { ...s.overrides, [key]: Math.max(0, base - qty) } };
        }),
      resetAll: () => set({ overrides: {} }),
    }),
    { name: "garmentvibes-stock", skipHydration: true }
  )
);

/** Stock for one variant, honouring any admin override. */
export function getStock(
  overrides: Record<string, number>,
  product: Pick<RetailProduct, "id" | "sizes">,
  sizeLabel: string
) {
  const key = variantKey(product.id, sizeLabel);
  if (overrides[key] !== undefined) return overrides[key];
  const size = product.sizes.find((s) => s.label === sizeLabel);
  return seedStock(product.id, sizeLabel, size?.inStock ?? false);
}

/** Total stock across every size of a product. */
export function getTotalStock(
  overrides: Record<string, number>,
  product: Pick<RetailProduct, "id" | "sizes">
) {
  return product.sizes.reduce((sum, s) => sum + getStock(overrides, product, s.label), 0);
}

export function useVariantStock(product: Pick<RetailProduct, "id" | "sizes">, sizeLabel: string) {
  const overrides = useStockStore((s) => s.overrides);
  return getStock(overrides, product, sizeLabel);
}
