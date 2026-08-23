import { describe, expect, it } from "vitest";
import { buildOrderPayload, OrderPayloadError, type BuildOrderInput } from "./payload";
import type { CartLine } from "@/lib/stores/cart-store";
import { PAYMENT_POLICY } from "@/lib/payment-methods";

// The figures this produces are checked again by place_retail_order() and the
// call is refused if the two disagree, so the tests that matter most are the
// ones that would cause that refusal — a subtotal that is not the sum of its
// lines, tax that does not reconcile, a total that does not foot. Those are
// exactly the assertions supabase/tests/40_order_placement.sql makes from the
// other side; these run without a database so a mistake is caught at `npm
// test` rather than at checkout.

function line(over: Partial<CartLine> = {}): CartLine {
  return {
    key: "k1",
    productId: "r1",
    slug: "test-kurta",
    name: "Test Kurta",
    image: "/placeholders/kurta.svg",
    price: 199900,
    currency: "INR",
    size: "S",
    color: "Rose",
    qty: 1,
    ...over,
  };
}

const TELANGANA = {
  fullName: "Asha",
  phone: "9999999999",
  addressLine1: "1 Test Lane",
  city: "Hyderabad",
  state: "Telangana",
  pincode: "500001",
};

const KARNATAKA = { ...TELANGANA, city: "Bengaluru", state: "Karnataka", pincode: "560001" };

function build(over: Partial<BuildOrderInput> = {}) {
  return buildOrderPayload({
    lines: [line()],
    address: TELANGANA,
    customerEmail: "asha@example.com",
    paymentMethod: "upi",
    reference: "GVTEST1",
    ...over,
  });
}

describe("buildOrderPayload", () => {
  it("prices a single line at the catalogue price", () => {
    const p = build();
    expect(p.p_subtotal).toBe(199900);
    expect(p.p_total).toBe(199900);
    expect(p.p_items).toHaveLength(1);
    expect(p.p_items[0].price).toBe(199900);
  });

  it("addresses lines by slug, because the app's product ids are not the database's", () => {
    const p = build();
    expect(p.p_items[0].slug).toBe("test-kurta");
    expect(JSON.stringify(p.p_items[0])).not.toContain("r1");
  });

  it("makes the subtotal the sum of its lines", () => {
    const p = build({
      lines: [line({ qty: 2 }), line({ key: "k2", slug: "test-tee", price: 79900, qty: 3 })],
    });
    expect(p.p_subtotal).toBe(2 * 199900 + 3 * 79900);
  });

  // Each of these is a refusal condition on the database side. If one fails
  // here, checkout breaks at the moment of payment.
  it("gives every line a tax split that adds back up to what is charged for it", () => {
    const p = build({
      lines: [line({ qty: 2 }), line({ key: "k2", slug: "test-tee", price: 79900, qty: 3 })],
    });
    for (const item of p.p_items) {
      expect(item.taxable_value + item.tax_amount).toBe(item.qty * item.price);
    }
  });

  it("makes the header tax equal the sum of the line taxes", () => {
    const p = build({ lines: [line({ qty: 2 }), line({ key: "k2", price: 79900, qty: 3 })] });
    const lineTax = p.p_items.reduce((sum, i) => sum + i.tax_amount, 0);
    expect(p.p_tax_cgst + p.p_tax_sgst + p.p_tax_igst).toBe(lineTax);
  });

  it("makes the total foot against its own subtotal, discount and fee", () => {
    const p = build({
      paymentMethod: "cod",
      promo: { code: "SAVE10", percent: 10 },
    });
    expect(p.p_total).toBe(p.p_subtotal - p.p_discount + p.p_cod_fee);
  });

  it("keeps CGST and SGST within a paise of each other on an odd tax", () => {
    // ₹1,999 at 5% inclusive carries 9519 paise of tax — an odd number, so
    // the halves cannot be equal. The database allows one paise of gap and no
    // more; anything wider is refused.
    const p = build();
    expect(p.p_tax_cgst + p.p_tax_sgst).toBe(9519);
    expect(Math.abs(p.p_tax_cgst - p.p_tax_sgst)).toBeLessThanOrEqual(1);
  });

  it("charges IGST across a state border and nothing else", () => {
    const p = build({ address: KARNATAKA });
    expect(p.p_tax_igst).toBeGreaterThan(0);
    expect(p.p_tax_cgst).toBe(0);
    expect(p.p_tax_sgst).toBe(0);
    expect(p.p_place_of_supply).toBe("29");
  });

  it("charges CGST and SGST within the seller's own state and no IGST", () => {
    const p = build();
    expect(p.p_tax_igst).toBe(0);
    expect(p.p_tax_cgst).toBeGreaterThan(0);
  });

  it("leaves the place of supply null rather than guessing at an unknown state", () => {
    // A wrong state code on a GST invoice is worse than an absent one.
    const p = build({ address: { ...TELANGANA, state: "Nowhere" } });
    expect(p.p_place_of_supply).toBeNull();
  });

  describe("promo codes", () => {
    it("names the code it applied", () => {
      const p = build({ promo: { code: "SAVE10", percent: 10 } });
      expect(p.p_promo_code).toBe("SAVE10");
    });

    // The database computes the expected discount with round() and refuses
    // the order if ours differs by even a paise. Prices that are round
    // hundreds cannot tell round() from floor() — every percentage of them is
    // a whole number — so this uses one that can: 10% of ₹1,999.99 is 199.999,
    // where rounding up and truncating differ. Getting this wrong would refuse
    // the order at the moment the customer presses Pay.
    it("rounds a fractional discount the way the database rounds it", () => {
      const p = build({
        lines: [line({ price: 199999 })],
        promo: { code: "SAVE10", percent: 10 },
      });
      expect(p.p_subtotal).toBe(199999);
      expect(p.p_discount).toBe(20000);
      expect(p.p_total).toBe(179999);
    });

    it("applies no discount and names no code when there is no promo", () => {
      const p = build();
      expect(p.p_discount).toBe(0);
      expect(p.p_promo_code).toBeNull();
    });

    it("refuses a discount larger than the order", () => {
      expect(() => build({ promo: { code: "TOOMUCH", percent: 150 } }))
        .toThrow(OrderPayloadError);
    });
  });

  describe("cash on delivery", () => {
    it("adds no fee to an online order", () => {
      expect(build({ paymentMethod: "upi" }).p_cod_fee).toBe(0);
    });

    it("waives the fee on a large enough COD order", () => {
      const p = build({
        lines: [line({ price: PAYMENT_POLICY.codFeeWaivedAbove + 100 })],
        paymentMethod: "cod",
      });
      expect(p.p_cod_fee).toBe(0);
    });

    it("charges the fee on a small COD order", () => {
      const p = build({
        lines: [line({ price: PAYMENT_POLICY.codFeeWaivedAbove - 100 })],
        paymentMethod: "cod",
      });
      expect(p.p_cod_fee).toBe(PAYMENT_POLICY.codFee);
    });

    // The fee follows what is actually owed. Charging it on the pre-discount
    // figure would waive it on an order the customer is not paying that much
    // for, and we would carry the cash-handling cost on the difference.
    it("decides the waiver on the discounted amount, not the list total", () => {
      const justOverThreshold = PAYMENT_POLICY.codFeeWaivedAbove + 1000;
      const p = build({
        lines: [line({ price: justOverThreshold })],
        paymentMethod: "cod",
        promo: { code: "SAVE10", percent: 10 },
      });
      expect(p.p_subtotal).toBeGreaterThan(PAYMENT_POLICY.codFeeWaivedAbove);
      expect(p.p_subtotal - p.p_discount).toBeLessThan(PAYMENT_POLICY.codFeeWaivedAbove);
      expect(p.p_cod_fee).toBe(PAYMENT_POLICY.codFee);
    });
  });

  describe("refusals", () => {
    it("refuses an empty basket rather than creating a zero-value order", () => {
      expect(() => build({ lines: [] })).toThrow(OrderPayloadError);
    });

    it("refuses a fractional quantity", () => {
      expect(() => build({ lines: [line({ qty: 1.5 })] })).toThrow(OrderPayloadError);
    });

    it("refuses a zero or negative quantity", () => {
      expect(() => build({ lines: [line({ qty: 0 })] })).toThrow(OrderPayloadError);
      expect(() => build({ lines: [line({ qty: -1 })] })).toThrow(OrderPayloadError);
    });

    it("refuses a free line rather than shipping it for nothing", () => {
      expect(() => build({ lines: [line({ price: 0 })] })).toThrow(OrderPayloadError);
    });
  });

  describe("HSN codes", () => {
    // The subcategory rides on the cart line for exactly this. Without it the
    // lookup falls back to 6211, "other garments", and every T-shirt is
    // invoiced under the catch-all heading rather than 6109 — a wrong HSN on
    // a tax invoice, which src/lib/gst.ts notes is worse than a missing one.
    it("takes the HSN from the line's subcategory", () => {
      const p = build({ lines: [line({ subcategory: "T-Shirts" })] });
      expect(p.p_items[0].hsn_code).toBe("6109");
    });

    it("uses a different heading for a different subcategory", () => {
      const p = build({ lines: [line({ subcategory: "Jeans" })] });
      expect(p.p_items[0].hsn_code).toBe("6203");
    });

    it("falls back to the catch-all only when the line carries no subcategory", () => {
      const p = build({ lines: [line({ subcategory: undefined })] });
      expect(p.p_items[0].hsn_code).toBe("6211");
    });
  });

  it("carries the seller's GSTIN, which the invoice is issued under", () => {
    expect(build().p_seller_gstin).toBe("36EBQPS5960G1ZX");
  });

  it("passes the payment method through as itself rather than as 'online'", () => {
    expect(build({ paymentMethod: "netbanking" }).p_payment_method).toBe("netbanking");
  });
});
