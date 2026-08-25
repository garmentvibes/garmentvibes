import { describe, expect, it } from "vitest";

import {
  toWholesaleProduct,
  toWholesaleProducts,
  type WholesaleProductRow,
} from "./wholesale-rows";
import { WHOLESALE_PRODUCTS } from "@/lib/mock/wholesale-products";

const SOURCE = WHOLESALE_PRODUCTS[0];

function row(overrides: Partial<WholesaleProductRow> = {}): WholesaleProductRow {
  return {
    sku: SOURCE.sku,
    slug: SOURCE.slug,
    name: SOURCE.name,
    category: SOURCE.category,
    subcategory: SOURCE.subcategory,
    description: SOURCE.description,
    images: SOURCE.images,
    currency: "INR",
    moq: SOURCE.moq,
    pack_size: SOURCE.packSize,
    size_run: SOURCE.sizeRun,
    fabric: SOURCE.fabric,
    colors: SOURCE.colors,
    lead_time_days: SOURCE.leadTimeDays,
    tags: SOURCE.tags ?? [],
    wholesale_price_tiers: SOURCE.priceTiers.map((t) => ({
      min_qty: t.minQty,
      price_per_unit: t.pricePerUnit,
    })),
    ...overrides,
  };
}

describe("toWholesaleProduct", () => {
  it("uses the slug as the id, not the row's uuid", () => {
    const product = toWholesaleProduct(row());
    expect(product?.id).toBe(SOURCE.slug);
    expect(product?.id).toBe(product?.slug);
  });

  it("sorts price tiers ascending by quantity", () => {
    // The type documents them as ascending and the UI relies on it: the
    // product page prints "from ₹X" off the last tier, and the calculator
    // walks the list for the first tier the quantity clears. Rows arrive in
    // whatever order Postgres finds them.
    const product = toWholesaleProduct(
      row({
        wholesale_price_tiers: [
          { min_qty: 500, price_per_unit: 18000 },
          { min_qty: 50, price_per_unit: 24000 },
          { min_qty: 200, price_per_unit: 21000 },
        ],
      })
    );

    expect(product?.priceTiers.map((t) => t.minQty)).toEqual([50, 200, 500]);
    expect(product?.priceTiers.map((t) => t.pricePerUnit)).toEqual([24000, 21000, 18000]);
  });

  it("drops a product with no price tiers rather than pricing it at nothing", () => {
    // priceTiers is what every quote is built from. An empty list is not a
    // cosmetic gap — it is a buyer being quoted zero.
    expect(toWholesaleProduct(row({ wholesale_price_tiers: [] }))).toBeNull();
    expect(toWholesaleProduct(row({ wholesale_price_tiers: null }))).toBeNull();
  });

  it("returns null for a category the portal cannot render", () => {
    expect(toWholesaleProduct(row({ category: "furniture" }))).toBeNull();
  });

  it("drops a tag the portal has no badge for", () => {
    const product = toWholesaleProduct(row({ tags: ["bestseller", "liquidation"] }));
    expect(product?.tags).toEqual(["bestseller"]);
  });

  it("fills nullable columns with the module's defaults", () => {
    const product = toWholesaleProduct(
      row({
        description: null,
        images: null,
        colors: null,
        size_run: null,
        fabric: null,
        lead_time_days: null,
        tags: null,
      })
    );

    expect(product?.description).toBe("");
    expect(product?.images).toEqual([]);
    expect(product?.colors).toEqual([]);
    expect(product?.sizeRun).toBe("");
    expect(product?.fabric).toBe("");
    expect(product?.leadTimeDays).toBe(0);
    expect(product?.tags).toEqual([]);
  });

  it("carries the MOQ and pack size, which decide what a buyer may order", () => {
    const product = toWholesaleProduct(row({ moq: 120, pack_size: 12 }));
    expect(product?.moq).toBe(120);
    expect(product?.packSize).toBe(12);
  });

  it("produces the same product the module does, field for field", () => {
    // `seed:check` proves the seed matches the module; this proves the mapping
    // back out matches it too. Without both, a renamed column surfaces only as
    // a blank on a page — or, here, as a missing price tier.
    expect(toWholesaleProduct(row())).toEqual(SOURCE);
  });
});

describe("toWholesaleProducts", () => {
  it("keeps what it can render and drops what it cannot", () => {
    const products = toWholesaleProducts([
      row({ slug: "keeps-this" }),
      row({ slug: "no-tiers", wholesale_price_tiers: [] }),
      row({ slug: "bad-category", category: "furniture" }),
    ]);

    expect(products.map((p) => p.slug)).toEqual(["keeps-this"]);
  });
});
