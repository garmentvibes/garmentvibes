import { describe, it, expect } from "vitest";
import { PROMO_CODES, PricingError, priceOrder, promoPercent } from "@/lib/pricing";
import { RETAIL_PRODUCTS } from "@/lib/mock/retail-products";

// priceOrder is what stops someone buying a ₹3,499 saree for ₹1 by editing
// one request, so its rejections matter as much as its arithmetic.

const first = RETAIL_PRODUCTS[0];
const second = RETAIL_PRODUCTS[1];

describe("promoPercent", () => {
  it("is case and whitespace insensitive", () => {
    expect(promoPercent(" garment10 ")).toBe(PROMO_CODES.GARMENT10);
  });

  it("treats no code at all as no discount", () => {
    expect(promoPercent("")).toBe(0);
    expect(promoPercent(undefined)).toBe(0);
    expect(promoPercent(null)).toBe(0);
  });

  // Not zero. Zero is a price; null is "this process has no opinion". The
  // difference is what stopped the overcharge below.
  it("returns null for a code it cannot price, not zero", () => {
    expect(promoPercent("NOPE")).toBeNull();
  });
});

describe("priceOrder", () => {
  it("prices from the catalog, ignoring anything the caller claims", () => {
    const priced = priceOrder([{ productId: first.id, qty: 2 }]);
    expect(priced.subtotal).toBe(first.price * 2);
    expect(priced.total).toBe(first.price * 2);
    expect(priced.lines[0].price).toBe(first.price);
  });

  it("applies a promo as a rounded percentage of the subtotal", () => {
    const priced = priceOrder([{ productId: first.id, qty: 1 }], "GARMENT10");
    const expected = Math.round((first.price * PROMO_CODES.GARMENT10) / 100);
    expect(priced.discount).toBe(expected);
    expect(priced.total).toBe(priced.subtotal - expected);
  });

  it("never lets a discount exceed the subtotal", () => {
    const priced = priceOrder([{ productId: first.id, qty: 1 }], "GARMENT10");
    expect(priced.total).toBeGreaterThan(0);
    expect(priced.discount).toBeLessThan(priced.subtotal);
  });

  it("sums multiple lines", () => {
    const priced = priceOrder([
      { productId: first.id, qty: 1 },
      { productId: second.id, qty: 3 },
    ]);
    expect(priced.subtotal).toBe(first.price + second.price * 3);
    expect(priced.lines).toHaveLength(2);
  });

  it("charges twice for the same product listed twice", () => {
    // A duplicated line is a legitimate cart shape (two sizes of one item),
    // so it must accumulate rather than collapse.
    const priced = priceOrder([
      { productId: first.id, qty: 1 },
      { productId: first.id, qty: 1 },
    ]);
    expect(priced.subtotal).toBe(first.price * 2);
  });

  it("rejects an unknown product", () => {
    expect(() => priceOrder([{ productId: "does-not-exist", qty: 1 }])).toThrow(PricingError);
  });

  it("rejects an empty or non-array order", () => {
    expect(() => priceOrder([])).toThrow(PricingError);
    expect(() => priceOrder(undefined as never)).toThrow(PricingError);
  });

  it("rejects quantities that are not sane positive integers", () => {
    for (const qty of [0, -1, 1.5, 11, NaN, Infinity]) {
      expect(() => priceOrder([{ productId: first.id, qty }])).toThrow(PricingError);
    }
  });

  it("rejects a quantity smuggled in as a string", () => {
    // JSON from an untrusted client can carry anything; "2" must not pass
    // for 2 and then multiply into a wrong total.
    expect(() => priceOrder([{ productId: first.id, qty: "2" as never }])).toThrow(PricingError);
  });

  // ---------------------------------------------------------------------
  // Codes this module cannot price
  //
  // The checkout page applies codes from two sources that are not in
  // PROMO_CODES: ones created in the admin panel, and referral codes. Both
  // were quoted to the customer with a discount and then handed to this
  // function, which returned 0% and priced the Razorpay order at full list.
  // The customer saw ₹1,039.20 and was charged ₹1,299.
  //
  // Full price for a discounted quote is the one outcome worse than an error,
  // so a code that cannot be priced now stops the payment.
  // ---------------------------------------------------------------------

  it("refuses a code it cannot price rather than charging full price", () => {
    expect(() => priceOrder([{ productId: first.id, qty: 1 }], "WELCOME20"))
      .toThrow(PricingError);
  });

  it("refuses a referral code, which is never in the built-in list", () => {
    expect(() => priceOrder([{ productId: first.id, qty: 1 }], "GVAC3DEF"))
      .toThrow(PricingError);
  });

  it("names the code in the refusal, so the customer knows what to remove", () => {
    expect(() => priceOrder([{ productId: first.id, qty: 1 }], "WELCOME20"))
      .toThrow(/WELCOME20/);
  });

  it("still prices a built-in code", () => {
    const priced = priceOrder([{ productId: first.id, qty: 1 }], "GARMENT10");
    expect(priced.discount).toBe(Math.round((first.price * PROMO_CODES.GARMENT10) / 100));
    expect(priced.total).toBe(first.price - priced.discount);
  });

  it("prices an order with no code at all", () => {
    const priced = priceOrder([{ productId: first.id, qty: 1 }]);
    expect(priced.discount).toBe(0);
    expect(priced.total).toBe(first.price);
  });
});
