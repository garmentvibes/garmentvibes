import { describe, it, expect } from "vitest";
import {
  APPAREL_GST,
  SELLER_STATE_CODE,
  computeGst,
  computeGstExclusive,
  gstRatePercent,
  hsnFor,
  resolveStateCode,
  splitTaxInclusive,
} from "@/lib/gst";

describe("splitTaxInclusive", () => {
  it("always sums back to the exact gross", () => {
    // The invariant that makes an invoice foot. Swept across a range that
    // includes plenty of amounts where the division doesn't come out even.
    for (let gross = 1; gross <= 5000; gross++) {
      for (const rate of [5, 12, 18]) {
        const { taxableValue, taxAmount } = splitTaxInclusive(gross, rate);
        expect(taxableValue + taxAmount).toBe(gross);
      }
    }
  });

  it("never produces a negative tax", () => {
    for (const gross of [0, 1, 2, 3, 99, 101]) {
      expect(splitTaxInclusive(gross, 18).taxAmount).toBeGreaterThanOrEqual(0);
    }
  });

  it("backs 5% out of ₹1,299 correctly", () => {
    // 129900 / 1.05 = 123714.28..., so taxable rounds to 123714.
    expect(splitTaxInclusive(129900, 5)).toEqual({
      taxableValue: 123714,
      taxAmount: 6186,
    });
  });

  it("treats a zero rate as all taxable value", () => {
    expect(splitTaxInclusive(50000, 0)).toEqual({ taxableValue: 50000, taxAmount: 0 });
  });
});

describe("gstRatePercent", () => {
  const { thresholdMinorUnits, lowerRatePercent, higherRatePercent } = APPAREL_GST;

  it("uses the lower rate at exactly the threshold", () => {
    // The boundary is inclusive; off-by-one here misprices every garment
    // sitting on the line.
    expect(gstRatePercent(thresholdMinorUnits)).toBe(lowerRatePercent);
  });

  it("switches to the higher rate one paisa above the threshold", () => {
    expect(gstRatePercent(thresholdMinorUnits + 1)).toBe(higherRatePercent);
  });

  it("uses the lower rate just below the threshold", () => {
    expect(gstRatePercent(thresholdMinorUnits - 1)).toBe(lowerRatePercent);
  });
});

describe("resolveStateCode", () => {
  it("reads a state out of a full address string", () => {
    expect(resolveStateCode("402, MG Road, Bengaluru, Karnataka - 560001")).toBe("29");
  });

  it("prefers the longest match so Andhra Pradesh is not shadowed", () => {
    // "andhra pradesh" contains no shorter state name, but "Pradesh" states
    // overlap enough that a naive first-match would be wrong.
    expect(resolveStateCode("Visakhapatnam, Andhra Pradesh 530001")).toBe("37");
    expect(resolveStateCode("Lucknow, Uttar Pradesh 226001")).toBe("09");
  });

  it("is case and ampersand insensitive", () => {
    expect(resolveStateCode("JAMMU & KASHMIR")).toBe("01");
  });

  it("returns null when no state is present", () => {
    expect(resolveStateCode("somewhere unrecognisable")).toBeNull();
  });
});

describe("hsnFor", () => {
  it("falls back to the catch-all apparel heading", () => {
    expect(hsnFor(undefined)).toBe("6211");
    expect(hsnFor("Something Unmapped")).toBe("6211");
  });
});

describe("computeGst (retail, tax-inclusive)", () => {
  const line = (price: number, qty = 1) => ({ name: "Item", qty, price });

  it("never changes the amount the customer pays", () => {
    const items = [line(129900), line(59900, 2), line(349900)];
    const gross = items.reduce((sum, i) => sum + i.qty * i.price, 0);
    expect(computeGst(items, "Karnataka").grandTotal).toBe(gross);
  });

  it("splits intra-state supply into CGST and SGST that sum to the tax", () => {
    const gst = computeGst([line(129900)], "Telangana");
    expect(gst.isInterState).toBe(false);
    expect(gst.igst).toBe(0);
    expect(gst.cgst + gst.sgst).toBe(gst.totalTax);
  });

  it("halves an odd tax without losing a paisa", () => {
    // Any amount whose tax is odd would silently drop a paisa if the split
    // were two independent roundings.
    const gst = computeGst([{ name: "Odd", qty: 1, price: 12345 }], "Telangana");
    expect(gst.cgst + gst.sgst).toBe(gst.totalTax);
    expect(Math.abs(gst.cgst - gst.sgst)).toBeLessThanOrEqual(1);
  });

  it("charges IGST when the delivery state differs from the seller's", () => {
    const gst = computeGst([line(129900)], "Maharashtra");
    expect(gst.isInterState).toBe(true);
    expect(gst.igst).toBe(gst.totalTax);
    expect(gst.cgst).toBe(0);
    expect(gst.sgst).toBe(0);
  });

  it("treats an unrecognised address as intra-state rather than inventing IGST", () => {
    const gst = computeGst([line(129900)], "not a real place");
    expect(gst.isInterState).toBe(false);
    expect(gst.placeOfSupplyCode).toBeNull();
  });

  it("derives the seller state from the GSTIN prefix", () => {
    expect(computeGst([line(1000)], "Telangana").isInterState).toBe(false);
    expect(SELLER_STATE_CODE).toHaveLength(2);
  });

  it("groups tax by slab when an order spans both rates", () => {
    const gst = computeGst(
      [line(APPAREL_GST.thresholdMinorUnits), line(APPAREL_GST.thresholdMinorUnits + 100000)],
      "Karnataka"
    );
    expect(gst.byRate).toHaveLength(2);
    expect(gst.byRate.map((r) => r.ratePercent)).toEqual([
      APPAREL_GST.lowerRatePercent,
      APPAREL_GST.higherRatePercent,
    ]);
    expect(gst.byRate.reduce((sum, r) => sum + r.taxAmount, 0)).toBe(gst.totalTax);
  });

  it("handles an empty order without dividing by zero", () => {
    const gst = computeGst([], "Karnataka");
    expect(gst.grandTotal).toBe(0);
    expect(gst.totalTax).toBe(0);
    expect(gst.byRate).toEqual([]);
  });
});

describe("computeGstExclusive (wholesale, tax added on top)", () => {
  it("adds tax rather than backing it out", () => {
    const inclusive = computeGst([{ name: "x", qty: 10, price: 20000 }], "Karnataka");
    const exclusive = computeGstExclusive([{ name: "x", qty: 10, price: 20000 }], "Karnataka");

    // Same line, opposite conventions: the exclusive total must be higher,
    // and its taxable value must be the raw line amount.
    expect(exclusive.taxableValue).toBe(200000);
    expect(exclusive.grandTotal).toBeGreaterThan(inclusive.grandTotal);
    expect(exclusive.grandTotal).toBe(exclusive.taxableValue + exclusive.totalTax);
  });

  it("splits CGST and SGST to the paisa on an intra-state supply", () => {
    const gst = computeGstExclusive([{ name: "x", qty: 3, price: 33333 }], "Telangana");
    expect(gst.cgst + gst.sgst).toBe(gst.totalTax);
  });
});
