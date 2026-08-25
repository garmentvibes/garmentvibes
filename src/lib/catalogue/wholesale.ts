import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";
import { WHOLESALE_PRODUCTS } from "@/lib/mock/wholesale-products";
import { toWholesaleProducts, type WholesaleProductRow } from "./wholesale-rows";
import type { WholesaleProduct } from "@/types/catalog";

// ---------------------------------------------------------------------------
// The wholesale catalogue, from the database when there is one.
//
// The retail counterpart is ./retail.ts and the reasoning is the same: reads
// at build time and at revalidation rather than per request, the mock module
// as the fallback so every QA environment here behaves as it always has, and
// `id` set to the slug so nothing downstream has to change.
//
// One difference worth stating. The retail migration closed a hazard — the
// database priced orders while the module priced the page, so an admin edit
// would have made them disagree. Wholesale has no such split today, because
// nothing prices a wholesale order server-side yet: quotes are assembled in
// the browser. So this is groundwork rather than a fix, and the thing it
// unblocks is the same one it did for retail — an admin being able to change
// a tier and have buyers see it.
// ---------------------------------------------------------------------------

const SELECT = `
  sku, slug, name, category, subcategory, description, images, currency,
  moq, pack_size, size_run, fabric, colors, lead_time_days, tags,
  wholesale_price_tiers ( min_qty, price_per_unit )
`;

/**
 * The whole wholesale catalogue.
 *
 * Falls back to the module rather than to an empty catalogue on any failure,
 * including a read that succeeds and returns nothing — an empty catalogue at
 * build time is a portal with no products, which deploys perfectly happily and
 * shows a trade buyer an empty shop.
 */
export const getWholesaleCatalogue = cache(async (): Promise<WholesaleProduct[]> => {
  if (!supabaseConfigured()) return WHOLESALE_PRODUCTS;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("wholesale_products")
      .select(SELECT)
      .eq("is_active", true);

    if (error) {
      console.error("[catalogue] could not read the wholesale catalogue", error.message);
      return WHOLESALE_PRODUCTS;
    }

    const products = toWholesaleProducts((data ?? []) as unknown as WholesaleProductRow[]);

    if (products.length === 0) {
      console.error("[catalogue] the database returned no wholesale products — using the module");
      return WHOLESALE_PRODUCTS;
    }

    return products;
  } catch (error) {
    console.error("[catalogue] the wholesale catalogue read threw", error);
    return WHOLESALE_PRODUCTS;
  }
});

/** One product by slug, or undefined. */
export async function getWholesaleProduct(slug: string): Promise<WholesaleProduct | undefined> {
  const catalogue = await getWholesaleCatalogue();
  return catalogue.find((p) => p.slug === slug);
}

/**
 * Products in a category.
 *
 * Filtered in memory for the same reason as the retail version: 25 products,
 * already fetched and memoised for this render, so a second round trip would
 * cost more than the filter saves.
 */
export async function getWholesaleProductsByCategory(
  category: string
): Promise<WholesaleProduct[]> {
  const catalogue = await getWholesaleCatalogue();
  return catalogue.filter((p) => p.category === category);
}

/**
 * Other products a buyer might want, given one they are looking at.
 *
 * Mirrors `getRelatedWholesaleProducts` in the module so the two sources
 * recommend the same things — same subcategory first, then the rest of the
 * category, never the product itself.
 */
export async function getRelatedWholesaleProducts(
  product: WholesaleProduct,
  limit = 4
): Promise<WholesaleProduct[]> {
  const catalogue = await getWholesaleCatalogue();
  const others = catalogue.filter((p) => p.slug !== product.slug);

  const sameSubcategory = others.filter(
    (p) => p.category === product.category && p.subcategory === product.subcategory
  );
  const sameCategory = others.filter(
    (p) => p.category === product.category && p.subcategory !== product.subcategory
  );

  return [...sameSubcategory, ...sameCategory].slice(0, limit);
}
