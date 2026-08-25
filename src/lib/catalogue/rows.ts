import type { RetailCategory, RetailProduct, RetailTag } from "@/types/catalog";

// ---------------------------------------------------------------------------
// Stored catalogue rows, as the storefront's RetailProduct.
//
// Pure, and separate from the reads in ./retail.ts, because this is where the
// two shapes have to agree and the reads are a round trip with nothing in them
// to get wrong.
//
// The mapping is mostly renaming — `rating_count` to `ratingCount` — with
// three decisions in it that are not:
//
//   1. `id` is the slug, not the row's uuid. See the note on RetailProduct.id:
//      nine localStorage stores key on this field, and the uuid is different
//      in every environment because the seed never sets one.
//   2. Sizes come back ordered by `sort_order`, which 0019 added for exactly
//      this — Postgres returns rows in whatever order it finds them, and a
//      size picker that reorders itself between page loads is one customers
//      mis-tap.
//   3. Anything the row cannot supply is filled from the same defaults the
//      catalogue module uses, rather than left undefined to surface as an
//      empty gap three components away.
// ---------------------------------------------------------------------------

/** One row of `retail_products` with its sizes embedded. */
export interface RetailProductRow {
  slug: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  description: string | null;
  images: string[] | null;
  price: number;
  mrp: number;
  currency: string | null;
  colors: string[] | null;
  rating: number | string | null;
  rating_count: number | null;
  tags: string[] | null;
  retail_product_sizes: Array<{
    label: string;
    in_stock: boolean;
    sort_order: number;
  }> | null;
}

const CATEGORIES: RetailCategory[] = ["women", "men", "kids"];
const TAGS: RetailTag[] = ["new", "bestseller", "sale"];

/**
 * Turns a stored row into the product the storefront renders.
 *
 * Returns null for a row whose category is not one the app knows. That is a
 * schema-level impossibility — `retail_products.category` is an enum — but the
 * app's `RetailCategory` and the database's `retail_category` are two lists
 * that can drift, and a product landing in a category with no page, no
 * breadcrumb and no mega-menu entry is worse than one that does not appear.
 */
export function toRetailProduct(row: RetailProductRow): RetailProduct | null {
  if (!CATEGORIES.includes(row.category as RetailCategory)) return null;

  const sizes = [...(row.retail_product_sizes ?? [])]
    // Sorted here rather than relied on from the query. The order matters to
    // the customer, and a `.order()` clause on an embedded resource is easy to
    // drop in a refactor and impossible to notice — whereas this is right
    // whatever order the rows arrive in.
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((size) => ({ label: size.label, inStock: size.in_stock }));

  return {
    id: row.slug,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    category: row.category as RetailCategory,
    subcategory: row.subcategory,
    description: row.description ?? "",
    images: row.images ?? [],
    price: row.price,
    mrp: row.mrp,
    currency: row.currency === "USD" ? "USD" : "INR",
    sizes,
    colors: row.colors ?? [],
    // numeric(2,1) crosses the wire as a number from PostgREST and as a string
    // from some drivers. Coerced rather than trusted: a rating of "4.3" renders
    // as stars fine and then sorts as a string, putting 10 before 9.
    rating: Number(row.rating ?? 0),
    ratingCount: row.rating_count ?? 0,
    tags: (row.tags ?? []).filter((tag): tag is RetailTag => TAGS.includes(tag as RetailTag)),
  };
}

/** Every readable row as a product, dropping any the app cannot render. */
export function toRetailProducts(rows: RetailProductRow[]): RetailProduct[] {
  return rows.map(toRetailProduct).filter((p): p is RetailProduct => p !== null);
}
