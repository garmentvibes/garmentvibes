import { describe, expect, it } from "vitest";

import { decideSync } from "@/lib/sync/decide";
import { linesFromRows, type StoredCartRow } from "./lines";
import { mergePayload } from "./payload";
import { RETAIL_PRODUCTS } from "@/lib/mock/retail-products";
import type { CartLine } from "@/lib/stores/cart-store";

// A real catalogue product rather than a fixture: the whole job of
// linesFromRows is to resolve against the catalogue the storefront renders
// from, and a stub would test the stub.
const PRODUCT = RETAIL_PRODUCTS[0];

function row(overrides: Partial<StoredCartRow> = {}): StoredCartRow {
  return {
    size_label: "M",
    color: "Rose",
    qty: 2,
    retail_products: { slug: PRODUCT.slug },
    ...overrides,
  };
}

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    key: `${PRODUCT.id}:M:Rose`,
    productId: PRODUCT.id,
    slug: PRODUCT.slug,
    name: PRODUCT.name,
    image: PRODUCT.images[0],
    price: PRODUCT.price,
    currency: PRODUCT.currency,
    size: "M",
    color: "Rose",
    qty: 2,
    ...overrides,
  };
}

describe("decideSync", () => {
  it("merges a bag assembled before signing in", () => {
    expect(
      decideSync({ localCount: 3, syncedFor: undefined, customerKey: "asha@example.com" })
    ).toBe("merge");
  });

  it("adopts rather than merging when this device already reconciled", () => {
    // The case the marker exists for. Merging here would resurrect a line the
    // customer deleted on another device, because this copy still has it.
    expect(
      decideSync({
        localCount: 3,
        syncedFor: "asha@example.com",
        customerKey: "asha@example.com",
      })
    ).toBe("adopt");
  });

  it("never folds one customer's bag into another's on a shared browser", () => {
    expect(
      decideSync({
        localCount: 3,
        syncedFor: "asha@example.com",
        customerKey: "bhavna@example.com",
      })
    ).toBe("adopt");
  });

  it("has nothing to merge from an empty bag", () => {
    expect(
      decideSync({ localCount: 0, syncedFor: undefined, customerKey: "asha@example.com" })
    ).toBe("adopt");
  });
});

describe("linesFromRows", () => {
  it("rebuilds a line from the catalogue rather than from the row", () => {
    const [result] = linesFromRows([row()]);

    expect(result.productId).toBe(PRODUCT.id);
    expect(result.name).toBe(PRODUCT.name);
    expect(result.size).toBe("M");
    expect(result.qty).toBe(2);
  });

  it("prices from the catalogue, which is the point of storing no price", () => {
    // A cart in localStorage carries the price captured at add-to-bag time, so
    // a bag left for a month quotes last month's number and place_retail_order
    // refuses the order at the moment the customer presses Pay. Stored rows
    // carry no price at all, so this cannot happen to them.
    const [result] = linesFromRows([row()]);
    expect(result.price).toBe(PRODUCT.price);
  });

  it("carries the subcategory, so the invoice gets the right HSN code", () => {
    const [result] = linesFromRows([row()]);
    expect(result.subcategory).toBe(PRODUCT.subcategory);
  });

  it("builds the same key the local store builds", () => {
    // The key is what reconcile() and removeLine() address a line by. If these
    // two disagreed, a line adopted from the server could not be removed.
    const [result] = linesFromRows([row()]);
    expect(result.key).toBe(`${PRODUCT.id}:M:Rose`);
  });

  it("drops a row whose product is no longer in the catalogue", () => {
    expect(linesFromRows([row({ retail_products: { slug: "withdrawn-last-season" } })])).toEqual(
      []
    );
  });

  it("drops a row whose join came back empty", () => {
    expect(linesFromRows([row({ retail_products: null })])).toEqual([]);
  });

  it("keeps the good rows when one is unresolvable", () => {
    const rows = [row({ retail_products: { slug: "gone" } }), row({ size_label: "L" })];
    const result = linesFromRows(rows);

    expect(result).toHaveLength(1);
    expect(result[0].size).toBe("L");
  });
});

describe("mergePayload", () => {
  it("sends only what identifies a variant and how many", () => {
    expect(mergePayload([line()])).toEqual([
      { slug: PRODUCT.slug, size: "M", color: "Rose", qty: 2 },
    ]);
  });

  it("does not send the price", () => {
    // The server cart has nowhere to put a price and no reason to believe one.
    // Sending it would suggest otherwise to whoever reads this next.
    const [payload] = mergePayload([line({ price: 1 })]);
    expect(payload).not.toHaveProperty("price");
  });
});
