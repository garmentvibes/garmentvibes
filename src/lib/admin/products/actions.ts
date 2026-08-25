"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";
import { getStaffUser } from "@/lib/auth/dal";
import { placeholderImage } from "@/lib/mock/placeholder-image";
import {
  parseRetailProductForm,
  slugFromName,
  type RetailProductDraft,
  type RetailProductFormInput,
} from "./form";
import {
  parseWholesaleProductForm,
  type WholesaleProductDraft,
  type WholesaleProductFormInput,
} from "./wholesale-form";

// ---------------------------------------------------------------------------
// Retail products, managed against the database.
//
// This is what #31 and #32 were for. Until the storefront read
// `retail_products`, writing an admin price edit to it would have the product
// page display one number and checkout charge another — `place_retail_order`
// compares the submitted price against the row and rejects the mismatch, so it
// failed safe, but every price edit would have broken checkout for that
// product. Now both ends read the same row.
//
// The local store stays as the whole implementation where there is no Supabase
// project, which is every environment the QA suites run in.
// ---------------------------------------------------------------------------

export interface ProductWriteResult {
  error: string | null;
  /** The saved product's slug, so the caller can navigate to it. */
  slug?: string;
  /**
   * True when there was no database to write to. The caller falls back to its
   * local store, which is what every deployment does today — an error message
   * would tell an admin their edit was rejected when it was in fact saved.
   */
  notConfigured?: boolean;
}

const NOT_STAFF: ProductWriteResult = { error: "Only staff can manage products" };

async function staffClient() {
  if (!supabaseConfigured()) return { client: null, notConfigured: true as const };

  const staff = await getStaffUser();
  if (!staff) return { client: null, notConfigured: false as const };

  return { client: await createClient(), notConfigured: false as const };
}

/**
 * Republishes every page a product appears on.
 *
 * #32 made the catalogue reads static — built once and refreshed on an
 * interval — which is right for a catalogue that changes seasonally and wrong
 * for the minute after an admin presses Save. Without this, they change a
 * price and watch the old one for an hour, conclude it did not work, and
 * change it again.
 *
 * The listing and home pages are revalidated too, not just the product's own:
 * a price is shown on the card as well as the page, and a new product has to
 * appear in a listing before anyone can click through to it.
 */
function republish(slug: string, category: string) {
  revalidatePath(`/shop/product/${slug}`);
  revalidatePath(`/shop/${category}`);
  revalidatePath("/shop");
  // The sitemap is generated from the catalogue, so a new or withdrawn product
  // changes it. Cheap to regenerate and easy to forget.
  revalidatePath("/sitemap.xml");
}

/**
 * Creates or updates a product, and its size run.
 *
 * `slug` identifies an existing product; null creates one. The slug is never
 * changed by an edit — see the note in ./form.ts.
 */
export async function saveRetailProduct(
  slug: string | null,
  input: RetailProductFormInput
): Promise<ProductWriteResult> {
  const { client, notConfigured } = await staffClient();
  if (notConfigured) return { error: null, notConfigured: true };
  if (!client) return NOT_STAFF;

  // Validated again here, not just in the form: this is the copy an admin
  // cannot skip by posting to the action directly.
  const parsed = parseRetailProductForm(input);
  if (!parsed.ok) return { error: parsed.error };

  const draft = parsed.value;
  const targetSlug = slug ?? slugFromName(draft.name);

  if (!targetSlug) {
    return { error: "That name does not produce a usable web address" };
  }

  const columns = {
    slug: targetSlug,
    name: draft.name,
    brand: draft.brand,
    category: draft.category,
    subcategory: draft.subcategory,
    description: draft.description,
    price: draft.price,
    mrp: draft.mrp,
    colors: draft.colors,
    currency: "INR",
  };

  const { data: saved, error } = slug
    ? await client.from("retail_products").update(columns).eq("slug", slug).select("id").single()
    : await client
        .from("retail_products")
        .insert({
          ...columns,
          // A new product starts with a placeholder image and no ratings.
          // Deliberately not carried on an update: an edit must not wipe real
          // photography back to a placeholder, and must not reset a rating
          // customers earned it.
          images: [placeholderImage(draft.name.slice(0, 18), "#e11d48")],
          rating: 0,
          rating_count: 0,
          is_active: true,
        })
        .select("id")
        .single();

  if (error) {
    console.error("[admin/products] could not save the product", error.message);
    if (error.code === "23505") {
      return { error: `A product already exists at /shop/product/${targetSlug}` };
    }
    return { error: "Could not save that product" };
  }

  const sizeError = await saveSizes(client, saved.id, draft);
  if (sizeError) return { error: sizeError };

  republish(targetSlug, draft.category);

  return { error: null, slug: targetSlug };
}

type StaffClient = NonNullable<Awaited<ReturnType<typeof staffClient>>["client"]>;

/**
 * Brings a product's size run in line with the submitted one.
 *
 * Three separate things, and the order matters:
 *
 *   1. Sizes no longer listed are deleted. Their stock goes with them, which
 *      is the point — a size that is not sold has no stock.
 *   2. The rest are upserted, which sets `sort_order` from the submitted
 *      order and leaves `stock_qty` alone. An admin reordering sizes must not
 *      zero the shelf.
 *   3. New sizes arrive at zero stock rather than at some default. A size
 *      that appears in the picker as available when nothing has been counted
 *      into it oversells on the first order.
 *
 * The upsert renumbers rows in one statement, so it passes through states
 * where two sizes briefly share a position. That is exactly what the
 * DEFERRABLE constraint in 0019 is for; made NOT DEFERRABLE, this breaks.
 */
async function saveSizes(
  client: StaffClient,
  productId: string,
  draft: RetailProductDraft
): Promise<string | null> {
  // Read the existing labels and work out which to drop, rather than sending
  // a `not.in.(…)` filter built by hand. That filter would mean pasting
  // admin-typed labels into a PostgREST query string and getting the quoting
  // right for every one of them; passing a computed list to `.in()` lets the
  // client encode it and keeps form input out of the query language.
  const { data: existing, error: readError } = await client
    .from("retail_product_sizes")
    .select("label")
    .eq("product_id", productId);

  if (readError) {
    console.error("[admin/products] could not read the current sizes", readError.message);
    return "Could not update the sizes";
  }

  const wanted = new Set(draft.sizes);
  const withdrawn = (existing ?? []).map((s) => s.label).filter((label) => !wanted.has(label));

  if (withdrawn.length > 0) {
    const { error: deleteError } = await client
      .from("retail_product_sizes")
      .delete()
      .eq("product_id", productId)
      .in("label", withdrawn);

    if (deleteError) {
      console.error("[admin/products] could not remove withdrawn sizes", deleteError.message);
      return "Could not update the sizes";
    }
  }

  const { error: upsertError } = await client.from("retail_product_sizes").upsert(
    draft.sizes.map((label, index) => ({
      product_id: productId,
      label,
      sort_order: index,
    })),
    // Without this, the upsert inserts duplicates rather than matching on the
    // natural key, and the unique index refuses the whole statement.
    { onConflict: "product_id,label", ignoreDuplicates: false }
  );

  if (upsertError) {
    console.error("[admin/products] could not save the sizes", upsertError.message);
    return "Could not update the sizes";
  }

  return null;
}

/**
 * Withdraws a product from sale.
 *
 * Not a delete. `retail_order_items.product_id` references `retail_products`
 * with no ON DELETE clause, so Postgres refuses to remove a product anything
 * has ever been ordered of — which is correct, and means a hard delete works
 * only for products nobody bought and takes their reviews, wishlists, cart
 * lines and questions with it when it does.
 *
 * `is_active = false` is what the storefront already respects: the RLS policy
 * on `retail_products` hides it, `getRetailCatalogue` filters on it, and
 * `active_product_id` refuses to add it to a cart while `cart_set_qty` still
 * lets anyone holding one take it out of theirs.
 */
export async function withdrawRetailProduct(slug: string): Promise<ProductWriteResult> {
  const { client, notConfigured } = await staffClient();
  if (notConfigured) return { error: null, notConfigured: true };
  if (!client) return NOT_STAFF;

  const { data, error } = await client
    .from("retail_products")
    .update({ is_active: false })
    .eq("slug", slug)
    .select("category")
    .maybeSingle();

  if (error) {
    console.error("[admin/products] could not withdraw the product", error.message);
    return { error: "Could not withdraw that product" };
  }

  if (!data) return { error: "No such product" };

  republish(slug, data.category);

  return { error: null, slug };
}

/** Sets the stock on one variant. */
export async function setRetailStock(
  slug: string,
  label: string,
  qty: number
): Promise<ProductWriteResult> {
  const { client, notConfigured } = await staffClient();
  if (notConfigured) return { error: null, notConfigured: true };
  if (!client) return NOT_STAFF;

  if (!Number.isInteger(qty) || qty < 0) {
    return { error: "Stock must be a whole number, and cannot be negative" };
  }

  const { data: product, error: lookupError } = await client
    .from("retail_products")
    .select("id, category")
    .eq("slug", slug)
    .maybeSingle();

  if (lookupError || !product) return { error: "No such product" };

  const { data, error } = await client
    .from("retail_product_sizes")
    .update({ stock_qty: qty })
    .eq("product_id", product.id)
    .eq("label", label)
    .select("label")
    .maybeSingle();

  if (error) {
    console.error("[admin/products] could not set stock", error.message);
    return { error: "Could not update stock" };
  }

  if (!data) return { error: `${slug} is not sold in size ${label}` };

  republish(slug, product.category);

  return { error: null, slug };
}

// ---------------------------------------------------------------------------
// Wholesale
// ---------------------------------------------------------------------------

/** Republishes the trade pages a product appears on. */
function republishWholesale(slug: string, category: string) {
  revalidatePath(`/wholesale/product/${slug}`);
  revalidatePath(`/wholesale/catalog/${category}`);
  revalidatePath("/wholesale/catalog");
  revalidatePath("/wholesale");
  // The quick-order grid and the pricing calculator both render every product,
  // so a new one has to reach them too — and the price-list export reads the
  // same catalogue the layout hands down.
  revalidatePath("/wholesale/quick-order");
  revalidatePath("/wholesale/pricing-calculator");
  revalidatePath("/sitemap.xml");
}

/**
 * Creates or updates a wholesale product and its price tiers.
 *
 * As on the retail side, `slug` identifies an existing product and null
 * creates one, and an edit never changes the slug.
 */
export async function saveWholesaleProduct(
  slug: string | null,
  input: WholesaleProductFormInput
): Promise<ProductWriteResult> {
  const { client, notConfigured } = await staffClient();
  if (notConfigured) return { error: null, notConfigured: true };
  if (!client) return NOT_STAFF;

  const parsed = parseWholesaleProductForm(input);
  if (!parsed.ok) return { error: parsed.error };

  const draft = parsed.value;
  const targetSlug = slug ?? slugFromName(draft.name);

  if (!targetSlug) {
    return { error: "That name does not produce a usable web address" };
  }

  const columns = {
    slug: targetSlug,
    sku: draft.sku,
    name: draft.name,
    category: draft.category,
    subcategory: draft.subcategory,
    description: draft.description,
    moq: draft.moq,
    pack_size: draft.packSize,
    size_run: draft.sizeRun,
    fabric: draft.fabric,
    colors: draft.colors,
    lead_time_days: draft.leadTimeDays,
    currency: "INR",
  };

  const { data: saved, error } = slug
    ? await client.from("wholesale_products").update(columns).eq("slug", slug).select("id").single()
    : await client
        .from("wholesale_products")
        .insert({
          ...columns,
          images: [placeholderImage(draft.name.slice(0, 18), "#1d4ed8")],
          is_active: true,
        })
        .select("id")
        .single();

  if (error) {
    console.error("[admin/products] could not save the wholesale product", error.message);
    if (error.code === "23505") {
      // Both slug and sku are unique, and an admin retyping either deserves to
      // be told which one they have already used.
      return { error: `That slug or SKU is already taken (${targetSlug} / ${draft.sku})` };
    }
    return { error: "Could not save that product" };
  }

  const tierError = await saveTiers(client, saved.id, draft);
  if (tierError) return { error: tierError };

  republishWholesale(targetSlug, draft.category);

  return { error: null, slug: targetSlug };
}

/**
 * Brings a product's price tiers in line with the submitted ones.
 *
 * Tiers removed from the form are deleted, the rest are upserted on
 * (product_id, min_qty). Unlike the retail size run there is nothing to
 * preserve across the write — a tier is only a quantity and a price, both of
 * them submitted — so this needs no read-back, only the delete.
 */
async function saveTiers(
  client: StaffClient,
  productId: string,
  draft: WholesaleProductDraft
): Promise<string | null> {
  const wanted = draft.priceTiers.map((t) => t.minQty);

  const { data: existing, error: readError } = await client
    .from("wholesale_price_tiers")
    .select("min_qty")
    .eq("product_id", productId);

  if (readError) {
    console.error("[admin/products] could not read the current tiers", readError.message);
    return "Could not update the price tiers";
  }

  const withdrawn = (existing ?? []).map((t) => t.min_qty).filter((q) => !wanted.includes(q));

  if (withdrawn.length > 0) {
    const { error: deleteError } = await client
      .from("wholesale_price_tiers")
      .delete()
      .eq("product_id", productId)
      .in("min_qty", withdrawn);

    if (deleteError) {
      console.error("[admin/products] could not remove old tiers", deleteError.message);
      return "Could not update the price tiers";
    }
  }

  const { error: upsertError } = await client.from("wholesale_price_tiers").upsert(
    draft.priceTiers.map((tier) => ({
      product_id: productId,
      min_qty: tier.minQty,
      price_per_unit: tier.pricePerUnit,
    })),
    { onConflict: "product_id,min_qty", ignoreDuplicates: false }
  );

  if (upsertError) {
    console.error("[admin/products] could not save the tiers", upsertError.message);
    return "Could not update the price tiers";
  }

  return null;
}

/**
 * Withdraws a wholesale product from sale.
 *
 * Same argument as the retail version: `wholesale_quote_items` references
 * `wholesale_products`, so a product anything has been quoted for cannot be
 * deleted, and where a delete would succeed it takes its price tiers with it.
 */
export async function withdrawWholesaleProduct(slug: string): Promise<ProductWriteResult> {
  const { client, notConfigured } = await staffClient();
  if (notConfigured) return { error: null, notConfigured: true };
  if (!client) return NOT_STAFF;

  const { data, error } = await client
    .from("wholesale_products")
    .update({ is_active: false })
    .eq("slug", slug)
    .select("category")
    .maybeSingle();

  if (error) {
    console.error("[admin/products] could not withdraw the wholesale product", error.message);
    return { error: "Could not withdraw that product" };
  }

  if (!data) return { error: "No such product" };

  republishWholesale(slug, data.category);

  return { error: null, slug };
}
