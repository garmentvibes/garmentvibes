import { describe, expect, it } from "vitest";

import { toRetailProduct, toRetailProducts, type RetailProductRow } from "./rows";
import { RETAIL_PRODUCTS } from "@/lib/mock/retail-products";

function row(overrides: Partial<RetailProductRow> = {}): RetailProductRow {
  return {
    slug: "floral-anarkali-kurta",
    name: "Floral Printed Anarkali Kurta",
    brand: "Vibe & Co.",
    category: "women",
    subcategory: "Kurtas",
    description: "A flowy floral anarkali kurta.",
    images: ["/placeholders/a.svg"],
    price: 129900,
    mrp: 219900,
    currency: "INR",
    colors: ["Rose", "Mustard"],
    rating: 4.3,
    rating_count: 1284,
    tags: ["bestseller", "sale"],
    retail_product_sizes: [
      { label: "S", in_stock: true, sort_order: 0 },
      { label: "M", in_stock: true, sort_order: 1 },
      { label: "L", in_stock: true, sort_order: 2 },
      { label: "XL", in_stock: false, sort_order: 3 },
    ],
    ...overrides,
  };
}

describe("toRetailProduct", () => {
  it("uses the slug as the id, not the row's uuid", () => {
    // Nine localStorage stores key on this field, and the uuid is different in
    // every environment because the seed never sets one — so a wishlist keyed
    // on one would orphan the next time a database was created.
    const product = toRetailProduct(row());
    expect(product?.id).toBe("floral-anarkali-kurta");
    expect(product?.id).toBe(product?.slug);
  });

  it("orders sizes by sort_order, whatever order the rows arrive in", () => {
    // The whole reason 0019 exists. Postgres returns rows in whatever order it
    // finds them, and a size picker that reorders itself between page loads is
    // one customers mis-tap.
    const product = toRetailProduct(
      row({
        retail_product_sizes: [
          { label: "XL", in_stock: false, sort_order: 3 },
          { label: "S", in_stock: true, sort_order: 0 },
          { label: "L", in_stock: true, sort_order: 2 },
          { label: "M", in_stock: true, sort_order: 1 },
        ],
      })
    );

    expect(product?.sizes.map((s) => s.label)).toEqual(["S", "M", "L", "XL"]);
  });

  it("carries each size's availability", () => {
    const product = toRetailProduct(row());
    expect(product?.sizes.find((s) => s.label === "XL")?.inStock).toBe(false);
    expect(product?.sizes.find((s) => s.label === "S")?.inStock).toBe(true);
  });

  it("coerces a rating that arrived as a string", () => {
    // numeric(2,1) crosses the wire as a number from PostgREST and as a string
    // from some drivers. Left as a string it renders fine and then sorts
    // lexically, putting 10 before 9.
    const product = toRetailProduct(row({ rating: "4.3" }));
    expect(product?.rating).toBe(4.3);
    expect(typeof product?.rating).toBe("number");
  });

  it("drops a tag the app has no badge for", () => {
    // retail_products.tags is a Postgres enum array and the two lists are free
    // to drift. An unknown value would otherwise render as an unstyled badge.
    const product = toRetailProduct(row({ tags: ["bestseller", "clearance", "sale"] }));
    expect(product?.tags).toEqual(["bestseller", "sale"]);
  });

  it("returns null for a category the app cannot render", () => {
    // A product in a category with no page, no breadcrumb and no mega-menu
    // entry is worse than one that does not appear.
    expect(toRetailProduct(row({ category: "homeware" }))).toBeNull();
  });

  it("fills nullable columns with the same defaults the module uses", () => {
    const product = toRetailProduct(
      row({
        description: null,
        images: null,
        colors: null,
        rating: null,
        rating_count: null,
        tags: null,
        retail_product_sizes: null,
      })
    );

    expect(product?.description).toBe("");
    expect(product?.images).toEqual([]);
    expect(product?.colors).toEqual([]);
    expect(product?.rating).toBe(0);
    expect(product?.ratingCount).toBe(0);
    expect(product?.tags).toEqual([]);
    expect(product?.sizes).toEqual([]);
  });

  it("defaults an unrecognised currency to rupees rather than passing it through", () => {
    expect(toRetailProduct(row({ currency: "GBP" }))?.currency).toBe("INR");
    expect(toRetailProduct(row({ currency: "USD" }))?.currency).toBe("USD");
  });

  it("produces the same product the module does, field for field", () => {
    // The two sources have to agree: `seed:check` asserts the seed matches the
    // module, and this asserts the mapping back out matches it too. Without
    // both, a column could be renamed and only surface as a blank on a page.
    const fromModule = RETAIL_PRODUCTS.find((p) => p.slug === "floral-anarkali-kurta");
    const fromRow = toRetailProduct(
      row({
        description: fromModule!.description,
        images: fromModule!.images,
        colors: fromModule!.colors,
        retail_product_sizes: fromModule!.sizes.map((s, i) => ({
          label: s.label,
          in_stock: s.inStock,
          sort_order: i,
        })),
      })
    );

    expect(fromRow).toEqual(fromModule);
  });
});

describe("toRetailProducts", () => {
  it("keeps the rows it can render and drops the ones it cannot", () => {
    const products = toRetailProducts([
      row({ slug: "good-one" }),
      row({ slug: "bad-one", category: "homeware" }),
    ]);

    expect(products.map((p) => p.slug)).toEqual(["good-one"]);
  });
});
