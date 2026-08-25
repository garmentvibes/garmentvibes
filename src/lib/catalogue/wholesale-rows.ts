import type {
  WholesaleCategory,
  WholesaleProduct,
  WholesalePriceTier,
  WholesaleTag,
} from "@/types/catalog";

// ---------------------------------------------------------------------------
// Stored wholesale rows, as the portal's WholesaleProduct.
//
// The retail counterpart is ./rows.ts and this follows it deliberately: same
// null handling, same `id` decision, same drop-what-cannot-render rule. Where
// it differs is price.
//
// A retail product has one price. A wholesale product has a tier table — 50
// units at one rate, 200 at another — and every quote, the pricing calculator
// and the price-list export read it. Getting the tiers wrong is not a display
// bug; it is a quote sent at the wrong rate.
// ---------------------------------------------------------------------------

/** One row of `wholesale_products` with its tiers embedded. */
export interface WholesaleProductRow {
  sku: string;
  slug: string;
  name: string;
  category: string;
  subcategory: string;
  description: string | null;
  images: string[] | null;
  currency: string | null;
  moq: number;
  pack_size: number;
  size_run: string | null;
  fabric: string | null;
  colors: string[] | null;
  lead_time_days: number | null;
  tags: string[] | null;
  wholesale_price_tiers: Array<{
    min_qty: number;
    price_per_unit: number;
  }> | null;
}

const CATEGORIES: WholesaleCategory[] = ["women", "men", "kids", "unisex", "fabric"];
const TAGS: WholesaleTag[] = ["new", "bestseller", "closeout"];

/**
 * Turns a stored row into the product the portal renders.
 *
 * Returns null for a category the app cannot render, as the retail mapping
 * does — and additionally for a product with no price tiers at all. That is
 * not a cosmetic gap: `WholesaleProduct.priceTiers` is what every quote is
 * built from, and a product with an empty tier list prices at nothing.
 * Dropping it is how a buyer fails to see an unbuyable product rather than
 * being quoted zero for it.
 */
export function toWholesaleProduct(row: WholesaleProductRow): WholesaleProduct | null {
  if (!CATEGORIES.includes(row.category as WholesaleCategory)) return null;

  const priceTiers: WholesalePriceTier[] = [...(row.wholesale_price_tiers ?? [])]
    // Ascending by quantity, which the type documents and the UI relies on —
    // the product page prints "from ₹X" off the last tier and the calculator
    // walks the list looking for the first one the quantity clears.
    .sort((a, b) => a.min_qty - b.min_qty)
    .map((tier) => ({ minQty: tier.min_qty, pricePerUnit: tier.price_per_unit }));

  if (priceTiers.length === 0) return null;

  return {
    id: row.slug,
    sku: row.sku,
    slug: row.slug,
    name: row.name,
    category: row.category as WholesaleCategory,
    subcategory: row.subcategory,
    description: row.description ?? "",
    images: row.images ?? [],
    currency: row.currency === "USD" ? "USD" : "INR",
    moq: row.moq,
    packSize: row.pack_size,
    priceTiers,
    sizeRun: row.size_run ?? "",
    fabric: row.fabric ?? "",
    colors: row.colors ?? [],
    leadTimeDays: row.lead_time_days ?? 0,
    tags: (row.tags ?? []).filter((tag): tag is WholesaleTag => TAGS.includes(tag as WholesaleTag)),
  };
}

/** Every readable row as a product, dropping any the portal cannot render. */
export function toWholesaleProducts(rows: WholesaleProductRow[]): WholesaleProduct[] {
  return rows
    .map(toWholesaleProduct)
    .filter((p): p is WholesaleProduct => p !== null);
}
