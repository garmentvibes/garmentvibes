import { describe, expect, it } from "vitest";

import { toRetailProduct, toRetailProducts, type RetailProductRow } from "./rows";
import type { RetailProduct } from "@/types/catalog";
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
      { label: "S", in_stock: true, stock_qty: 29, sort_order: 0 },
      { label: "M", in_stock: true, stock_qty: 23, sort_order: 1 },
      { label: "L", in_stock: true, stock_qty: 1, sort_order: 2 },
      { label: "XL", in_stock: false, stock_qty: 0, sort_order: 3 },
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
          { label: "XL", in_stock: false, stock_qty: 0, sort_order: 3 },
          { label: "S", in_stock: true, stock_qty: 4, sort_order: 0 },
          { label: "L", in_stock: true, stock_qty: 2, sort_order: 2 },
          { label: "M", in_stock: true, stock_qty: 7, sort_order: 1 },
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

  it("carries each size's stock level, not just whether it has any", () => {
    // The boolean is a generated column — 0005 made it `stock_qty > 0` — but it
    // cannot say "only 1 left". Without the number the storefront had to get it
    // from a zustand store in the customer's own browser, while
    // place_retail_order enforced the column. Carrying it is what makes the
    // page and the order engine agree.
    const product = toRetailProduct(row());
    expect(product?.sizes.find((s) => s.label === "S")?.stock).toBe(29);
    expect(product?.sizes.find((s) => s.label === "L")?.stock).toBe(1);
  });

  it("carries a zero level rather than dropping it", () => {
    // 0 and undefined mean different things to getStock(): one is "the shelf is
    // empty", the other is "there is no database to ask". Losing the zero would
    // send it to the deterministic seed and invent stock for a sold-out size.
    const product = toRetailProduct(row());
    const xl = product?.sizes.find((s) => s.label === "XL");
    expect(xl?.stock).toBe(0);
    expect(xl?.stock).not.toBeUndefined();
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
          stock_qty: s.inStock ? 5 : 0,
          sort_order: i,
        })),
      })
    );

    // Compared with `stock` stripped, because it is the one field the two
    // sources are MEANT to differ on: the row carries a real level and the
    // module has none to carry. Every other field still has to match, which is
    // what this test is for — asserting equality on the whole object would make
    // it fail for the one legitimate reason and stop guarding the rest.
    //
    // That `stock` is present at all is covered above; that its absence sends
    // getStock() to the seed is covered in stock-store.test.ts.
    const withoutStock = (p: RetailProduct) => ({
      ...p,
      sizes: p.sizes.map(({ label, inStock }) => ({ label, inStock })),
    });

    expect(withoutStock(fromRow!)).toEqual(withoutStock(fromModule!));
    expect(fromRow!.sizes.every((s) => s.stock !== undefined)).toBe(true);
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
