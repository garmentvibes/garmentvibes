import { describe, expect, it } from "vitest";

import {
  parseRetailProductForm,
  slugFromName,
  type RetailProductFormInput,
} from "./form";

function form(overrides: Partial<RetailProductFormInput> = {}): RetailProductFormInput {
  return {
    name: "Linen Shirt",
    brand: "Vibe & Co.",
    category: "men",
    subcategory: "Shirts",
    description: "A breathable linen shirt.",
    price: "1299",
    mrp: "1999",
    colors: "White, Sand",
    sizes: "S, M, L, XL",
    ...overrides,
  };
}

describe("parseRetailProductForm", () => {
  it("converts rupees to paise", () => {
    const result = parseRetailProductForm(form());
    expect(result.ok && result.value.price).toBe(129900);
    expect(result.ok && result.value.mrp).toBe(199900);
  });

  it("survives a price that floating point cannot represent", () => {
    // 1299.99 * 100 is 129998.99999999999 in JavaScript. Truncated, the shop
    // charges a paise less than it meant to on every sale of this product.
    const result = parseRetailProductForm(form({ price: "1299.99", mrp: "" }));
    expect(result.ok && result.value.price).toBe(129999);
  });

  it("treats a blank MRP as no strike-through rather than as zero", () => {
    const result = parseRetailProductForm(form({ mrp: "" }));
    expect(result.ok && result.value.mrp).toBe(129900);
  });

  it("refuses an MRP below the selling price", () => {
    // Otherwise the product page renders a negative discount.
    const result = parseRetailProductForm(form({ price: "1999", mrp: "1299" }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/lower than/);
  });

  it("requires a price", () => {
    expect(parseRetailProductForm(form({ price: "" })).ok).toBe(false);
    expect(parseRetailProductForm(form({ price: "0" })).ok).toBe(false);
    expect(parseRetailProductForm(form({ price: "-100" })).ok).toBe(false);
  });

  it("requires a name, a brand and a category", () => {
    expect(parseRetailProductForm(form({ name: "  " })).ok).toBe(false);
    expect(parseRetailProductForm(form({ brand: "" })).ok).toBe(false);
    expect(parseRetailProductForm(form({ subcategory: "" })).ok).toBe(false);
  });

  it("keeps the sizes in the order they were typed", () => {
    // The array index becomes sort_order, so this is the display order of the
    // size picker — see 0019.
    const result = parseRetailProductForm(form({ sizes: "XL, L, M, S" }));
    expect(result.ok && result.value.sizes).toEqual(["XL", "L", "M", "S"]);
  });

  it("requires at least one size", () => {
    expect(parseRetailProductForm(form({ sizes: "" })).ok).toBe(false);
    expect(parseRetailProductForm(form({ sizes: " , , " })).ok).toBe(false);
  });

  it("refuses a size listed twice", () => {
    // They would collide on the (product_id, label) unique index, and before
    // that they would render as two rows of the picker showing the same size
    // with different stock behind them.
    const result = parseRetailProductForm(form({ sizes: "S, M, S" }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/twice/);
  });

  it("catches a duplicate that differs only in case", () => {
    expect(parseRetailProductForm(form({ sizes: "s, S" })).ok).toBe(false);
  });

  it("drops blanks and trims from the comma-separated lists", () => {
    const result = parseRetailProductForm(form({ colors: " White ,, Sand , " }));
    expect(result.ok && result.value.colors).toEqual(["White", "Sand"]);
  });

  it("produces no slug — the caller decides", () => {
    // On an edit the slug is not touched at all: it is the URL, the key nine
    // localStorage stores use, and what place_retail_order addresses a line
    // by. Renaming must not orphan a wishlist and 404 a page.
    const result = parseRetailProductForm(form());
    expect(result.ok && result.value).not.toHaveProperty("slug");
  });
});

describe("slugFromName", () => {
  it("makes a URL-safe slug", () => {
    expect(slugFromName("Floral Printed Anarkali Kurta")).toBe("floral-printed-anarkali-kurta");
  });

  it("collapses punctuation rather than encoding it", () => {
    expect(slugFromName("Vibe & Co. — Linen Shirt (New!)")).toBe("vibe-co-linen-shirt-new");
  });

  it("leaves no leading or trailing dash", () => {
    expect(slugFromName("  !!Shirt!!  ")).toBe("shirt");
  });

  it("returns empty for a name with nothing usable in it", () => {
    // The action checks for this and refuses rather than creating a product at
    // /shop/product/ with no slug at all.
    expect(slugFromName("!!!")).toBe("");
  });
});
