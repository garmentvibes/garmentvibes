import { describe, expect, it } from "vitest";

import {
  parseWholesaleProductForm,
  type WholesaleProductFormInput,
} from "./wholesale-form";
import { wholesalePriceForQty } from "@/types/catalog";

function form(overrides: Partial<WholesaleProductFormInput> = {}): WholesaleProductFormInput {
  return {
    name: "Cotton Tee Bulk",
    sku: "GV-TEE-001",
    category: "unisex",
    subcategory: "T-Shirts & Polos",
    description: "Bulk cotton tees.",
    moq: "100",
    packSize: "10",
    fabric: "180 GSM cotton",
    sizeRun: "S-M-L-XL (2:4:4:2 per pack)",
    colors: "White, Black",
    leadTimeDays: "10",
    tiers: [
      { minQty: "100", pricePerUnit: "240" },
      { minQty: "500", pricePerUnit: "210" },
      { minQty: "1000", pricePerUnit: "185" },
    ],
    ...overrides,
  };
}

describe("parseWholesaleProductForm", () => {
  it("converts tier prices to paise and sorts ascending by quantity", () => {
    const result = parseWholesaleProductForm(
      form({
        tiers: [
          { minQty: "1000", pricePerUnit: "185" },
          { minQty: "100", pricePerUnit: "240" },
          { minQty: "500", pricePerUnit: "210" },
        ],
      })
    );

    expect(result.ok && result.value.priceTiers).toEqual([
      { minQty: 100, pricePerUnit: 24000 },
      { minQty: 500, pricePerUnit: 21000 },
      { minQty: 1000, pricePerUnit: 18500 },
    ]);
  });

  it("uppercases the SKU", () => {
    // The column is unique and buyers type SKUs off a price list; two rows
    // differing only in case would be two products as far as the index cares.
    const result = parseWholesaleProductForm(form({ sku: " gv-tee-001 " }));
    expect(result.ok && result.value.sku).toBe("GV-TEE-001");
  });

  it("refuses a tier table where price rises with quantity", () => {
    // wholesalePriceForQty picks the last tier the quantity clears, so an
    // increasing tier quotes a higher unit price for a bigger order — and
    // makes the volume discount the portal advertises a lie.
    const result = parseWholesaleProductForm(
      form({
        tiers: [
          { minQty: "100", pricePerUnit: "200" },
          { minQty: "500", pricePerUnit: "220" },
        ],
      })
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/lower \(or equal\)/);
  });

  it("allows an equal price across tiers", () => {
    const result = parseWholesaleProductForm(
      form({
        tiers: [
          { minQty: "100", pricePerUnit: "200" },
          { minQty: "500", pricePerUnit: "200" },
        ],
      })
    );
    expect(result.ok).toBe(true);
  });

  it("refuses two tiers starting at the same quantity", () => {
    // "The last tier whose minQty is met" becomes ambiguous, decided by sort
    // stability rather than by anyone's intent.
    const result = parseWholesaleProductForm(
      form({
        tiers: [
          { minQty: "100", pricePerUnit: "240" },
          { minQty: "100", pricePerUnit: "200" },
        ],
      })
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/both start at 100/);
  });

  it("refuses a tier table that leaves the MOQ unpriced", () => {
    // A buyer ordering exactly the minimum has to have a price.
    const result = parseWholesaleProductForm(
      form({ moq: "100", tiers: [{ minQty: "500", pricePerUnit: "200" }] })
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/at or below the MOQ/);
  });

  it("refuses an MOQ that is not a multiple of the pack size", () => {
    // Orders go in whole packs, so an MOQ of 105 in packs of 10 is an MOQ
    // nobody can order — buyers land on 100 or 110 and the portal refuses both.
    const result = parseWholesaleProductForm(form({ moq: "105", packSize: "10" }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/multiple of the pack size/);
  });

  it("requires at least one tier", () => {
    const result = parseWholesaleProductForm(form({ tiers: [{ minQty: "", pricePerUnit: "" }] }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/at least one price tier/);
  });

  it("ignores a blank tier row rather than failing on it", () => {
    // The form starts with an empty row and lets an admin add more, so blanks
    // are the normal state of the last one.
    const result = parseWholesaleProductForm(
      form({
        tiers: [
          { minQty: "100", pricePerUnit: "240" },
          { minQty: "", pricePerUnit: "" },
        ],
      })
    );

    expect(result.ok && result.value.priceTiers).toHaveLength(1);
  });

  it("defaults a blank lead time to a week", () => {
    expect(parseWholesaleProductForm(form({ leadTimeDays: "" })).ok).toBe(true);
    const result = parseWholesaleProductForm(form({ leadTimeDays: "" }));
    expect(result.ok && result.value.leadTimeDays).toBe(7);
  });

  it("requires name, SKU and subcategory", () => {
    expect(parseWholesaleProductForm(form({ name: " " })).ok).toBe(false);
    expect(parseWholesaleProductForm(form({ sku: "" })).ok).toBe(false);
    expect(parseWholesaleProductForm(form({ subcategory: "" })).ok).toBe(false);
  });

  it("produces tiers that price the way the portal expects", () => {
    // The check that ties this module to the one that consumes it: whatever
    // comes out has to quote sensibly through wholesalePriceForQty.
    const result = parseWholesaleProductForm(form());
    if (!result.ok) throw new Error(result.error);

    const product = {
      priceTiers: result.value.priceTiers,
    } as Parameters<typeof wholesalePriceForQty>[0];

    expect(wholesalePriceForQty(product, 100)).toBe(24000);
    expect(wholesalePriceForQty(product, 499)).toBe(24000);
    expect(wholesalePriceForQty(product, 500)).toBe(21000);
    expect(wholesalePriceForQty(product, 5000)).toBe(18500);
  });
});
