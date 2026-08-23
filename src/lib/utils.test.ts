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
    const tail = generateReferenceId("GV").slice(-6);
    expect(tail).toMatch(/^[ACDEFGHJKLMNPQRTUVWXY349]{6}$/);
  });

  it("does not repeat across a large batch", () => {
    // The old implementation was the last eight digits of Date.now(). Ten
    // thousand of those generated in a tight loop collide almost entirely,
    // because they all land in the same few milliseconds.
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(generateReferenceId("GV"));
    expect(seen.size).toBe(10_000);
  });

  it("is short enough to read out and long enough to be unique", () => {
    const ref = generateReferenceId("GV");
    expect(ref.length).toBeGreaterThanOrEqual(12);
    expect(ref.length).toBeLessThanOrEqual(20);
  });
});
