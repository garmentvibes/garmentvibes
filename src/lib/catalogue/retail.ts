import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";
import { RETAIL_PRODUCTS } from "@/lib/mock/retail-products";
import { toRetailProducts, type RetailProductRow } from "./rows";
import type { RetailProduct } from "@/types/catalog";

// ---------------------------------------------------------------------------
// The retail catalogue, from the database when there is one.
//
// Until now nothing in TypeScript read `retail_products` at all. The storefront
// rendered entirely from src/lib/mock/retail-products.ts; the table was read
// only by SQL — `place_retail_order` prices from it, `active_product_id`
// resolves slugs against it. So the database decided what an order *cost* while
// the module decided what a customer *saw*, and the only thing keeping those in
// agreement was `npm run seed:check` asserting the seed still matches the
// module.
//
// That is why admin product editing could not be built: writing a price change
// to `retail_products` would have the storefront display one number and
// checkout charge another. `place_retail_order` compares the submitted price
// against the row and rejects a mismatch, so it fails safe — but every admin
// price edit would break checkout for that product.
//
// ---------------------------------------------------------------------------
// Static, not dynamic
// ---------------------------------------------------------------------------
//
// These reads happen at build time and at revalidation, not per request. A
// clothing catalogue changes seasonally; spending ~60 prerendered pages to
// re-read it on every visit would buy nothing, and next.config.ts has already
// weighed prerendering against a stricter CSP once and kept the prerendering.
//
// The pages that call this therefore set `revalidate`, and admin writes call
// `revalidatePath` so an edit appears immediately rather than at the next
// interval. Without that second half, ISR alone would mean an admin changes a
// price and watches the old one for an hour.
//
// ---------------------------------------------------------------------------
// The fallback is not a nicety
// ---------------------------------------------------------------------------
//
// Every QA suite in this repo runs with no Supabase project, and so does any
// contributor who clones it. The module stays as the catalogue for those, and
// the two are kept identical by the seed generator, so "which source am I
// looking at" changes nothing about what is rendered.
// ---------------------------------------------------------------------------

/**
 * Only active products, with their sizes.
 *
 * `is_active` is filtered here as well as by the RLS policy on
 * `retail_products`, which already hides withdrawn products from an anonymous
 * read. Both, because these reads run at build time where the client may hold
 * the service role in some deployments, and a withdrawn product silently
 * reappearing in the catalogue because a key changed is not a failure anyone
 * would look for.
 */
const SELECT = `
  slug, name, brand, category, subcategory, description, images,
  price, mrp, currency, colors, rating, rating_count, tags,
  retail_product_sizes ( label, in_stock, sort_order )
`;

/**
 * The whole retail catalogue.
 *
 * `cache()` scopes memoisation to one render pass, so a page that needs the
 * catalogue for its content and again for its metadata pays for one read.
 *
 * Falls back to the module — rather than to an empty catalogue — on a failed
 * read. An empty catalogue at build time is a deployment with no products,
 * which is a worse outcome than a stale one and much harder to notice.
 */
export const getRetailCatalogue = cache(async (): Promise<RetailProduct[]> => {
  if (!supabaseConfigured()) return RETAIL_PRODUCTS;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("retail_products")
      .select(SELECT)
      .eq("is_active", true);

    if (error) {
      console.error("[catalogue] could not read the retail catalogue", error.message);
      return RETAIL_PRODUCTS;
    }

    const products = toRetailProducts((data ?? []) as unknown as RetailProductRow[]);

    // A database that answers with nothing is a database that has not been
    // seeded, not a shop with no stock. Building a storefront with no products
    // in it would succeed, deploy, and show an empty shop.
    if (products.length === 0) {
      console.error("[catalogue] the database returned no products — falling back to the module");
      return RETAIL_PRODUCTS;
    }

    return products;
  } catch (error) {
    console.error("[catalogue] the catalogue read threw", error);
    return RETAIL_PRODUCTS;
  }
});

/** One product by slug, or undefined. */
export async function getRetailProduct(slug: string): Promise<RetailProduct | undefined> {
  const catalogue = await getRetailCatalogue();
  return catalogue.find((p) => p.slug === slug);
}

/**
 * Products in a category.
 *
 * Filtered in memory rather than in the query, deliberately: the whole
 * catalogue is 33 products and is already fetched and memoised for this render,
 * so a second round trip would cost more than the filter saves. That reasoning
 * stops holding somewhere in the low thousands, at which point this becomes a
 * query with a `.eq("category", …)` on it.
 */
export async function getRetailProductsByCategory(
  category: string
): Promise<RetailProduct[]> {
  const catalogue = await getRetailCatalogue();
  return catalogue.filter((p) => p.category === category);
}

/**
 * Other products a customer might want, given one they are looking at.
 *
 * Same subcategory first, then the rest of the category, never the product
 * itself. Mirrors `getRelatedRetailProducts` in the module so the two sources
 * recommend the same things.
 */
export async function getRelatedRetailProducts(
  product: RetailProduct,
  limit = 4
): Promise<RetailProduct[]> {
  const catalogue = await getRetailCatalogue();
  const others = catalogue.filter((p) => p.slug !== product.slug);

  const sameSubcategory = others.filter(
    (p) => p.category === product.category && p.subcategory === product.subcategory
  );
  const sameCategory = others.filter(
    (p) => p.category === product.category && p.subcategory !== product.subcategory
  );

  return [...sameSubcategory, ...sameCategory].slice(0, limit);
}
