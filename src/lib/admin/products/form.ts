import type { RetailCategory } from "@/types/catalog";

// ---------------------------------------------------------------------------
// Validating a retail product from the admin form.
//
// Lifted out of RetailProductForm's onSubmit so the same rules run in the
// browser, for immediate feedback, and again in the server action, where they
// are the ones that bind. A form that validates only in the browser is a form
// whose rules are advice.
// ---------------------------------------------------------------------------

export interface RetailProductFormInput {
  name: string;
  brand: string;
  category: RetailCategory;
  subcategory: string;
  description: string;
  /** Rupees as typed, not paise. */
  price: string;
  /** Rupees as typed. Blank means "same as the selling price". */
  mrp: string;
  /** Comma-separated. */
  colors: string;
  /** Comma-separated, in the order they should be shown. */
  sizes: string;
}

/** A validated product, in the units the database stores. */
export interface RetailProductDraft {
  name: string;
  brand: string;
  category: RetailCategory;
  subcategory: string;
  description: string;
  /** Paise. */
  price: number;
  /** Paise. */
  mrp: number;
  colors: string[];
  /** In display order — the array index becomes `sort_order`. */
  sizes: string[];
}

export type RetailProductFormResult =
  | { ok: true; value: RetailProductDraft }
  | { ok: false; error: string };

function fail(error: string): RetailProductFormResult {
  return { ok: false, error };
}

/** Rupees as typed to paise, or null if it is not a price. */
function toMinorUnits(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const rupees = Number(trimmed);
  if (!Number.isFinite(rupees) || rupees < 0) return null;

  // Rounded rather than truncated, and rounded at all because 1299.99 in
  // rupees is 129999 paise exactly but arrives from JavaScript as
  // 129998.99999999999.
  return Math.round(rupees * 100);
}

/**
 * Parses the product form, or explains what is wrong with it.
 *
 * The slug is deliberately not produced here. On a new product the action
 * derives it from the name; on an edit it is not touched at all, because the
 * slug is the product's identity — it is the URL, the key nine localStorage
 * stores use, and what `place_retail_order` addresses a line by. Renaming a
 * product must not silently orphan its wishlist entries and 404 its page.
 */
export function parseRetailProductForm(
  input: RetailProductFormInput
): RetailProductFormResult {
  const name = input.name.trim();
  const brand = input.brand.trim();
  const subcategory = input.subcategory.trim();

  if (!name || !brand || !subcategory) {
    return fail("Name, brand and category are required");
  }

  const price = toMinorUnits(input.price);
  if (price === null || price < 1) {
    return fail("Enter a selling price");
  }

  // Blank MRP means there is no strike-through to show, which is the same as
  // an MRP equal to the price.
  const mrp = input.mrp.trim() === "" ? price : toMinorUnits(input.mrp);
  if (mrp === null) return fail("MRP is not a price");
  if (mrp < price) return fail("MRP can't be lower than the selling price");

  const colors = splitList(input.colors);

  const sizes = splitList(input.sizes);
  if (sizes.length === 0) {
    return fail("A product needs at least one size");
  }

  // Duplicates would collide on the (product_id, label) unique index and, more
  // to the point, mean two rows of the size picker showing the same size with
  // different stock behind them.
  const seen = new Set<string>();
  for (const size of sizes) {
    const key = size.toUpperCase();
    if (seen.has(key)) return fail(`Size "${size}" is listed twice`);
    seen.add(key);
  }

  return {
    ok: true,
    value: {
      name,
      brand,
      category: input.category,
      subcategory,
      description: input.description.trim(),
      price,
      mrp,
      colors,
      sizes,
    },
  };
}

/** Comma-separated text as a list, without blanks or surrounding space. */
function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * A URL-safe slug from a product name.
 *
 * Only used when creating: an existing product's slug is immutable, for the
 * reasons in parseRetailProductForm's note.
 */
export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
