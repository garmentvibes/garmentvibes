import { describe, expect, it } from "vitest";
import { generateReferenceId } from "./utils";

// `retail_orders.reference` and `wholesale_quotes.reference` are both UNIQUE.
// A collision does not produce a duplicate — it rejects the row, and when that
// row is an order the customer has already paid for, the money moves and the
// order does not exist. So these are constraints on the generator, not
// cosmetics.

describe("generateReferenceId", () => {
  it("starts with the prefix it was given", () => {
    expect(generateReferenceId("GV")).toMatch(/^GV/);
    expect(generateReferenceId("GVQ")).toMatch(/^GVQ/);
  });

  it("uses no ambiguous characters", () => {
    // Read down a phone line to support, so B/8, I/1, O/0, S/5 and Z/2 are
    // out. Base-36 time supplies the rest of the alphabet, and the digits it
    // can emit (0-9) are unavoidable there — this checks the random tail,
    // which is the part chosen from a restricted alphabet.
    const tail = generateReferenceId("GV").slice(-8);
    expect(tail).toMatch(/^[ACDEFGHJKLMNPQRTUVWXY349]{8}$/);
  });

  it("does not repeat across a large batch", () => {
    // The old implementation was the last eight digits of Date.now(). Ten
    // thousand of those generated in a tight loop collide almost entirely,
    // because they all land in the same few milliseconds.
    //
    // This assertion is only as strong as the tail is long, and it has failed
    // in CI before: a six-character tail put a collision here at roughly 1 in
    // 40, because a batch this size spans about 32ms and so crowds ~312
    // references into each one. Eight characters is what makes it hold.
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(generateReferenceId("GV"));
    expect(seen.size).toBe(10_000);
  });

  it("draws the tail without modulo bias", () => {
    // 256 is not a multiple of 24, so a plain `byte % 24` favours the first
    // sixteen letters by about 10%. Not a collision risk on its own, but free
    // to remove, and this is what proves it was.
    //
    // Chi-squared rather than a max/min ratio, which was the first attempt and
    // was itself flaky: over 24 buckets the extremes are the noisiest thing to
    // measure, and at this sample size their spread lands right on top of the
    // 10% the test is trying to detect. Chi-squared uses every bucket, so the
    // two separate by an order of magnitude — expected ~23 (df) when uniform,
    // ~312 under the bias. The threshold has enormous margin on both sides.
    const counts = new Map<string, number>();
    for (let i = 0; i < 20_000; i++) {
      for (const ch of generateReferenceId("GV").slice(-8)) {
        counts.set(ch, (counts.get(ch) ?? 0) + 1);
      }
    }

    expect(counts.size).toBe(24);

    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const expectedPerLetter = total / 24;
    const chiSquared = [...counts.values()].reduce(
      (sum, observed) => sum + (observed - expectedPerLetter) ** 2 / expectedPerLetter,
      0
    );

    expect(chiSquared).toBeLessThan(60);
  });

  it("is short enough to read out and long enough to be unique", () => {
    const ref = generateReferenceId("GV");
    expect(ref.length).toBeGreaterThanOrEqual(12);
    expect(ref.length).toBeLessThanOrEqual(20);
  });
});
