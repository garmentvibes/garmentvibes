import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getRetailProductById } from "@/lib/mock/retail-products";
import type { RetailProduct } from "@/types/catalog";

// Per-variant stock levels, for a deployment that has no database.
//
// ---------------------------------------------------------------------------
// What this used to be, and what it is now
// ---------------------------------------------------------------------------
//
// It was the only answer to "how many are left". The mock catalogue carries a
// boolean `inStock` per size, which cannot express "only 3 left" or be
// decremented, so this layered integer stock on top, seeded deterministically
// from that boolean, and let admin adjust it. Its own note said: "When Supabase
// lands this becomes an inventory table and the same helpers read from it."
//
// Supabase has landed, and the halfway state was worse than either end. The
// storefront decided sold-out from these overrides — one browser's opinion,
// private to that browser — while `place_retail_order` decremented and enforced
// `retail_product_sizes.stock_qty`. So a product page could offer a size the
// database would refuse, or hide one it would have sold. Every browser had its
// own idea of the shelf.
//
// `getStock()` now prefers the catalogue's own number, which arrives from
// `stock_qty` whenever the catalogue came from the database. These overrides
// are what is left for the deployments that have no database — every QA suite
// in this repo and any contributor who clones it — exactly as
// lib/catalogue/retail.ts falls back to the module for the catalogue itself.
//
// The precedence is deliberate and not symmetric: a stored number always wins
// over an override. An admin editing stock on a configured deployment writes
// through `lib/admin/stock/actions.ts` to the row, so there is nothing for an
// override to usefully say — and if one lingered in a browser from before this
// change, letting it win would resurrect exactly the bug this removed.

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
  /**
   * Put units back on the shelf — a returned item that is still sellable, or
   * the original size when an exchange goes the other way. Same
   * `currentStock` contract as decrement.
   */
  increment: (productId: string, sizeLabel: string, qty: number, currentStock: number) => void;
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
      increment: (productId, sizeLabel, qty, currentStock) =>
        set((s) => {
          const key = variantKey(productId, sizeLabel);
          const base = s.overrides[key] ?? currentStock;
          return { overrides: { ...s.overrides, [key]: base + qty } };
        }),
      resetAll: () => set({ overrides: {} }),
    }),
    { name: "garmentvibes-stock", skipHydration: true }
  )
);

/**
 * Stock for one variant.
 *
 * Three sources, in this order:
 *
 *   1. The catalogue row, when the catalogue came from the database. This is
 *      `retail_product_sizes.stock_qty` — the number `place_retail_order`
 *      decrements and refuses orders against, so it is the only one that can
 *      make the page and the checkout agree.
 *   2. An admin override, for a deployment with no database.
 *   3. The deterministic seed, so an untouched variant still has a plausible
 *      level rather than zero.
 *
 * A size the product does not have returns 0 rather than a seeded level: it
 * cannot be bought, and inventing stock for it would offer it.
 */
export function getStock(
  overrides: Record<string, number>,
  product: Pick<RetailProduct, "id" | "sizes">,
  sizeLabel: string
) {
  const size = product.sizes.find((s) => s.label === sizeLabel);
  if (!size) return 0;

  // The stored number wins outright. See the precedence note at the top: a
  // stale override left in a browser from before the catalogue moved must not
  // be able to contradict the shelf.
  if (size.stock !== undefined) return size.stock;

  const key = variantKey(product.id, sizeLabel);
  if (overrides[key] !== undefined) return overrides[key];

  return seedStock(product.id, sizeLabel, size.inStock);
}

/** Total stock across every size of a product. */
export function getTotalStock(
  overrides: Record<string, number>,
  product: Pick<RetailProduct, "id" | "sizes">
) {
  return product.sizes.reduce((sum, s) => sum + getStock(overrides, product, s.label), 0);
}

/**
 * Stock for a variant identified by product *id*, read imperatively.
 *
 * Event handlers (approving a return, shipping an exchange) need the current
 * level without subscribing to the store, and only have the product id to go
 * on. Returns 0 for an unknown product rather than guessing a level.
 */
export function stockForProductId(productId: string, sizeLabel: string) {
  const product = getRetailProductById(productId);
  if (!product) return 0;
  return getStock(useStockStore.getState().overrides, product, sizeLabel);
}

export function useVariantStock(product: Pick<RetailProduct, "id" | "sizes">, sizeLabel: string) {
  const overrides = useStockStore((s) => s.overrides);
  return getStock(overrides, product, sizeLabel);
}
