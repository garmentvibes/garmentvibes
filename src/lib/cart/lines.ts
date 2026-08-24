import { getRetailProductBySlug } from "@/lib/mock/retail-products";
import type { CartLine } from "@/lib/stores/cart-store";

// ---------------------------------------------------------------------------
// Turning stored cart rows back into the lines the storefront renders.
//
// Split out from the server actions for the same reason src/lib/orders/
// payload.ts is split out of the order action: the actions are network calls
// wrapped in an auth check, and everything here that can actually be wrong is
// decided without a database.
//
// Server-side only — it imports the whole retail catalogue. The outbound half
// of the sync lives in ./payload.ts, which runs in the browser and therefore
// imports nothing.
// ---------------------------------------------------------------------------

/** One row of `cart_items`, with the product's slug joined in. */
export interface StoredCartRow {
  size_label: string;
  color: string;
  qty: number;
  retail_products: { slug: string } | null;
}

/**
 * Rebuilds cart lines from stored rows, dropping any whose product has gone.
 *
 * ## Where the price comes from, and why it is not the stored row
 *
 * `cart_items` stores no price at all — only which variant and how many — so
 * the price, name and image are looked up in the catalogue on every read.
 * That is the fix for the thing localStorage got wrong: a persisted cart
 * carries the price captured at add-to-bag time, so a bag left for a month
 * shows last month's number, and `place_retail_order` re-derives prices from
 * the catalogue and refuses the order at the moment the customer presses Pay.
 *
 * The lookup goes through `getRetailProductBySlug` rather than joining
 * `retail_products.price` in the query, because that module is what the
 * product page and the listing grid render from. Reading the price from the
 * database here would make the cart the one surface in the storefront quoting
 * a different number from the page the customer clicked Add on — a worse bug
 * than the one being fixed, and one that only appears when the two drift.
 * When the catalogue itself moves into the database this becomes a join and
 * the question goes away.
 *
 * A slug the catalogue no longer knows is dropped rather than rendered from
 * the row alone. There is no price or image to show for it and it cannot be
 * ordered, so a line for it would be a row the customer can neither buy nor
 * understand.
 */
export function linesFromRows(rows: StoredCartRow[]): CartLine[] {
  const lines: CartLine[] = [];

  for (const row of rows) {
    const slug = row.retail_products?.slug;
    if (!slug) continue;

    const product = getRetailProductBySlug(slug);
    if (!product) continue;

    lines.push({
      key: `${product.id}:${row.size_label}:${row.color}`,
      productId: product.id,
      slug: product.slug,
      name: product.name,
      image: product.images[0],
      price: product.price,
      currency: product.currency,
      subcategory: product.subcategory,
      size: row.size_label,
      color: row.color,
      qty: row.qty,
    });
  }

  return lines;
}
