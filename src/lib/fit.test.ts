import { describe, expect, it } from "vitest";

import {
  MIN_FIT_VOTES,
  recommendSize,
  sizeChartFor,
  sizeSystem,
  summariseFit,
  type FitVote,
} from "./fit";
import { RETAIL_PRODUCTS } from "@/lib/mock/retail-products";

const votes = (small: number, tru: number, large: number): FitVote[] => [
  ...Array<FitVote>(small).fill("small"),
  ...Array<FitVote>(tru).fill("true"),
  ...Array<FitVote>(large).fill("large"),
];

describe("sizeSystem", () => {
  it("recognises each system the catalogue uses", () => {
    expect(sizeSystem(["S", "M", "L", "XL"])).toBe("alpha");
    expect(sizeSystem(["28", "30", "32", "34"])).toBe("waist");
    expect(sizeSystem(["2-3Y", "4-5Y"])).toBe("kids");
    expect(sizeSystem(["Free Size"])).toBe("free");
  });

  it("tolerates spacing and case in kids' labels", () => {
    expect(sizeSystem(["2 - 3 y"])).toBe("kids");
  });

  // Kids' labels contain digits, so a naive digit test would call them waist
  // sizes and show a jeans chart on a toddler's frock.
  it("does not mistake a kids' size for a waist size", () => {
    expect(sizeSystem(["2-3Y", "4-5Y", "6-7Y", "8-9Y"])).toBe("kids");
  });
});

describe("sizeChartFor", () => {
  // The defect this fixes: one S/M/L/XL chart was shown on every product, so
  // someone buying 32" jeans got a chart with no 32 in it.
  it("gives every product a chart that contains its own sizes", () => {
    for (const product of RETAIL_PRODUCTS) {
      const labels = product.sizes.map((s) => s.label);
      const chart = sizeChartFor(labels);

      if (chart.rows.length === 0) continue; // free size has no table

      const charted = new Set(chart.rows.map((r) => r.size));
      for (const label of labels) {
        expect(charted.has(label), `${product.slug}: no chart row for size ${label}`).toBe(true);
      }
    }
  });

  it("gives each system its own measurement columns", () => {
    expect(sizeChartFor(["S"]).headings).toContain("Chest");
    expect(sizeChartFor(["32"]).headings).toContain("Inseam");
    expect(sizeChartFor(["4-5Y"]).headings).toContain("Height");
  });

  it("has no table for free size, and says why", () => {
    const chart = sizeChartFor(["Free Size"]);
    expect(chart.rows).toHaveLength(0);
    expect(chart.note).toMatch(/free size/i);
  });

  it("every row has one value per heading", () => {
    for (const labels of [["S"], ["32"], ["4-5Y"]]) {
      const chart = sizeChartFor(labels);
      for (const row of chart.rows) {
        expect(row.values, `${labels[0]} / ${row.size}`).toHaveLength(chart.headings.length);
      }
    }
  });
});

describe("summariseFit", () => {
  // "100% say runs small" off one vote reads as confident and is not.
  it("says nothing below the minimum sample", () => {
    const summary = summariseFit(votes(MIN_FIT_VOTES - 1, 0, 0));
    expect(summary.verdict).toBeNull();
    expect(summary.advice).toBeNull();
    expect(summary.total).toBe(MIN_FIT_VOTES - 1);
  });

  it("speaks up exactly at the minimum", () => {
    expect(summariseFit(votes(MIN_FIT_VOTES, 0, 0)).verdict).toBe("small");
  });

  it("reports the majority verdict and its share", () => {
    const summary = summariseFit(votes(6, 3, 1));
    expect(summary.verdict).toBe("small");
    expect(summary.percent).toBe(60);
    expect(summary.counts).toEqual({ small: 6, true: 3, large: 1 });
  });

  it("gives advice in the direction that helps", () => {
    expect(summariseFit(votes(8, 1, 1)).advice).toMatch(/sizing up/);
    expect(summariseFit(votes(1, 1, 8)).advice).toMatch(/sizing down/);
    expect(summariseFit(votes(1, 8, 1)).advice).toMatch(/usual/);
  });

  it("counts everything even when it will not draw a conclusion", () => {
    const summary = summariseFit(votes(1, 1, 1));
    expect(summary.counts).toEqual({ small: 1, true: 1, large: 1 });
  });
});

describe("recommendSize", () => {
  const alpha = ["S", "M", "L", "XL"];
  const neutral = summariseFit(votes(1, 8, 1));

  it("suggests the size the customer kept last time", () => {
    const result = recommendSize({ available: alpha, keptSizes: ["M"], fit: neutral });
    expect(result).toMatchObject({ size: "M" });
    expect(result?.reason).toMatch(/kept it/);
  });

  it("has nothing to say without a history", () => {
    expect(recommendSize({ available: alpha, keptSizes: [], fit: neutral })).toBeNull();
  });

  it("has nothing to say about a free-size product", () => {
    expect(
      recommendSize({ available: ["Free Size"], keptSizes: ["M"], fit: neutral })
    ).toBeNull();
  });

  // A history of buying 32" jeans says nothing about which kurta size to
  // suggest, and mixing them would recommend a size that does not exist.
  it("ignores history from a different size system", () => {
    expect(recommendSize({ available: alpha, keptSizes: ["32"], fit: neutral })).toBeNull();
  });

  it("sizes up when the crowd says it runs small", () => {
    const result = recommendSize({
      available: alpha,
      keptSizes: ["M"],
      fit: summariseFit(votes(9, 1, 0)),
    });
    expect(result?.size).toBe("L");
    expect(result?.reason).toMatch(/runs small/);
  });

  it("sizes down when the crowd says it runs large", () => {
    const result = recommendSize({
      available: alpha,
      keptSizes: ["M"],
      fit: summariseFit(votes(0, 1, 9)),
    });
    expect(result?.size).toBe("S");
  });

  // Inventing a size we do not stock is worse than repeating their usual.
  it("falls back to the usual size when the adjusted one is off the end", () => {
    const result = recommendSize({
      available: alpha,
      keptSizes: ["XL"],
      fit: summariseFit(votes(9, 1, 0)),
    });
    expect(result?.size).toBe("XL");
  });

  it("falls back when the adjusted size is not stocked on this product", () => {
    const result = recommendSize({
      available: ["S", "M"], // no L
      keptSizes: ["M"],
      fit: summariseFit(votes(9, 1, 0)),
    });
    expect(result?.size).toBe("M");
  });

  it("does not adjust when there is no verdict yet", () => {
    const result = recommendSize({
      available: alpha,
      keptSizes: ["M"],
      fit: summariseFit(votes(1, 1, 0)),
    });
    expect(result?.size).toBe("M");
  });
});
