import { describe, expect, it } from "vitest";

import { getStock, getTotalStock } from "./stock-store";
import type { RetailProduct } from "@/types/catalog";

// ---------------------------------------------------------------------------
// Which of three sources answers "how many are left".
//
// This is the whole point of the store now. It used to be the only answer, and
// the storefront read sold-out from it — a number private to one browser —
// while `place_retail_order` decremented and enforced
// `retail_product_sizes.stock_qty`. A product page could offer a size the
// database would refuse, or hide one it would have sold.
//
// The precedence below is what fixes that, so it is what is worth pinning.
// ---------------------------------------------------------------------------

/** A product as the catalogue delivers it when there IS a database. */
function stored(): Pick<RetailProduct, "id" | "sizes"> {
  return {
    id: "floral-anarkali-kurta",
    sizes: [
      { label: "S", inStock: true, stock: 29 },
      { label: "M", inStock: true, stock: 3 },
      { label: "XL", inStock: false, stock: 0 },
    ],
  };
}

/** The same product as the module delivers it when there is NOT. */
function fromModule(): Pick<RetailProduct, "id" | "sizes"> {
  return {
    id: "floral-anarkali-kurta",
    sizes: [
      { label: "S", inStock: true },
      { label: "M", inStock: true },
      { label: "XL", inStock: false },
    ],
  };
}

describe("getStock", () => {
  it("uses the stored level when the catalogue came from the database", () => {
    expect(getStock({}, stored(), "S")).toBe(29);
    expect(getStock({}, stored(), "M")).toBe(3);
  });

  it("lets the stored level win over an override", () => {
    // The precedence that matters. An override left in a browser from before
    // the catalogue moved must not be able to contradict the shelf — letting it
    // win would resurrect exactly the bug this removed.
    const overrides = { "floral-anarkali-kurta:M": 99 };
    expect(getStock(overrides, stored(), "M")).toBe(3);
  });

  it("reports a stored zero as sold out rather than seeding a level", () => {
    // 0 is a real answer, and `?? seed` would discard it. A sold-out size that
    // reads as "12 in stock" is a page offering something checkout will refuse.
    expect(getStock({}, stored(), "XL")).toBe(0);
  });

  it("falls back to an override when there is no stored level", () => {
    // The deployment with no database: every QA suite here, and any contributor
    // who clones the repo. The store is the shelf there.
    const overrides = { "floral-anarkali-kurta:M": 7 };
    expect(getStock(overrides, fromModule(), "M")).toBe(7);
  });

  it("honours an override of zero on a module product", () => {
    // Same trap as the stored zero, one level down: an admin setting a size to
    // 0 on a database-less deployment means sold out, not "unset".
    const overrides = { "floral-anarkali-kurta:S": 0 };
    expect(getStock(overrides, fromModule(), "S")).toBe(0);
  });

  it("seeds a level for an untouched module variant", () => {
    // Deterministic, so the server and the client agree and a level does not
    // change on every render.
    const first = getStock({}, fromModule(), "S");
    expect(first).toBeGreaterThan(0);
    expect(getStock({}, fromModule(), "S")).toBe(first);
  });

  it("gives a module variant that is out of stock nothing to sell", () => {
    expect(getStock({}, fromModule(), "XL")).toBe(0);
  });

  it("returns nothing for a size the product does not have", () => {
    // Not seeded. A size that cannot be bought must not be given stock, which
    // would offer it.
    expect(getStock({}, stored(), "XXL")).toBe(0);
    expect(getStock({}, fromModule(), "XXL")).toBe(0);
    expect(getStock({ "floral-anarkali-kurta:XXL": 5 }, fromModule(), "XXL")).toBe(0);
  });
});

describe("getTotalStock", () => {
  it("adds up the stored levels", () => {
    expect(getTotalStock({}, stored())).toBe(32);
  });

  it("ignores overrides once the levels are stored", () => {
    // What the admin dashboard's low-stock list reads. Counting an override on
    // top of the shelf would report stock that is not there.
    expect(getTotalStock({ "floral-anarkali-kurta:S": 500 }, stored())).toBe(32);
  });
});
