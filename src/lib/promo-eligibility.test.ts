import { describe, expect, it } from "vitest";

import {
  customerRedemptions,
  evaluatePromo,
  recordRedemption,
  remainingRedemptions,
  totalRedemptions,
} from "./promo-eligibility";
import type { PromoCode, PromoRedemptions } from "@/types/promo";

const NOW = new Date("2026-08-23T00:00:00.000Z").getTime();

const code = (over: Partial<PromoCode> = {}): PromoCode => ({
  code: "SAVE10",
  percent: 10,
  active: true,
  ...over,
});

function evaluate(over: {
  input?: string;
  codes?: PromoCode[];
  redemptions?: PromoRedemptions;
  customerEmail?: string;
}) {
  return evaluatePromo({
    input: over.input ?? "SAVE10",
    codes: over.codes ?? [code()],
    redemptions: over.redemptions ?? {},
    customerEmail: over.customerEmail,
    now: NOW,
  });
}

describe("evaluatePromo", () => {
  it("accepts a live code", () => {
    expect(evaluate({})).toMatchObject({ ok: true, percent: 10 });
  });

  it("matches case-insensitively and ignores padding", () => {
    expect(evaluate({ input: "  save10 " }).ok).toBe(true);
  });

  // The old helper returned 0 for all of these, so checkout said "invalid or
  // expired" to someone whose code was simply used up.
  it("distinguishes why a code was refused", () => {
    expect(evaluate({ input: "NOPE" }).reason).toBe("unknown");
    expect(evaluate({ codes: [code({ active: false })] }).reason).toBe("inactive");
    expect(evaluate({ codes: [code({ expiresOn: "2026-08-01" })] }).reason).toBe("expired");
  });

  it("treats an empty input as unknown rather than throwing", () => {
    expect(evaluate({ input: "   " }).reason).toBe("unknown");
  });

  it("accepts a code expiring later today", () => {
    expect(evaluate({ codes: [code({ expiresOn: "2026-12-31" })] }).ok).toBe(true);
  });
});

describe("total redemption cap", () => {
  const capped = code({ maxRedemptions: 2 });

  it("allows redemptions up to the cap", () => {
    const redemptions: PromoRedemptions = { SAVE10: { "a@x.test": 1 } };
    expect(evaluate({ codes: [capped], redemptions, customerEmail: "b@x.test" }).ok).toBe(true);
  });

  it("refuses once the cap is reached, across different customers", () => {
    const redemptions: PromoRedemptions = { SAVE10: { "a@x.test": 1, "b@x.test": 1 } };
    const result = evaluate({ codes: [capped], redemptions, customerEmail: "c@x.test" });
    expect(result.reason).toBe("exhausted");
  });

  it("counts one customer's repeats towards the total", () => {
    const redemptions: PromoRedemptions = { SAVE10: { "a@x.test": 2 } };
    expect(evaluate({ codes: [capped], redemptions, customerEmail: "b@x.test" }).reason).toBe(
      "exhausted"
    );
  });

  it("leaves an uncapped code uncapped", () => {
    const redemptions: PromoRedemptions = { SAVE10: { "a@x.test": 5_000 } };
    expect(evaluate({ redemptions, customerEmail: "b@x.test" }).ok).toBe(true);
  });
});

describe("per-customer cap", () => {
  const oncePerPerson = code({ maxPerCustomer: 1 });

  it("allows a customer their first use", () => {
    expect(evaluate({ codes: [oncePerPerson], customerEmail: "a@x.test" }).ok).toBe(true);
  });

  it("refuses their second", () => {
    const redemptions: PromoRedemptions = { SAVE10: { "a@x.test": 1 } };
    const result = evaluate({ codes: [oncePerPerson], redemptions, customerEmail: "a@x.test" });
    expect(result.reason).toBe("already_used");
  });

  it("does not hold one customer's use against another", () => {
    const redemptions: PromoRedemptions = { SAVE10: { "a@x.test": 1 } };
    expect(evaluate({ codes: [oncePerPerson], redemptions, customerEmail: "b@x.test" }).ok).toBe(
      true
    );
  });

  it("matches the customer case-insensitively", () => {
    const redemptions: PromoRedemptions = { SAVE10: { "a@x.test": 1 } };
    expect(evaluate({ codes: [oncePerPerson], redemptions, customerEmail: "A@X.test" }).ok).toBe(
      false
    );
  });

  // Signing out would otherwise turn a one-per-customer code into an
  // unlimited one, since there is nobody to attribute the redemption to.
  it("refuses a signed-out visitor rather than letting the cap lapse", () => {
    expect(evaluate({ codes: [oncePerPerson] }).ok).toBe(false);
  });

  it("still allows a signed-out visitor an uncapped code", () => {
    expect(evaluate({}).ok).toBe(true);
  });
});

describe("codes issued to one person", () => {
  const reward = code({ code: "GVABCR123", issuedTo: "owner@x.test" });

  it("lets the owner redeem it", () => {
    expect(evaluate({ input: "GVABCR123", codes: [reward], customerEmail: "OWNER@x.test" }).ok).toBe(
      true
    );
  });

  it("refuses anyone else, however they learned the code", () => {
    const result = evaluate({
      input: "GVABCR123",
      codes: [reward],
      customerEmail: "thief@x.test",
    });
    expect(result.reason).toBe("not_yours");
  });

  it("refuses a signed-out visitor", () => {
    expect(evaluate({ input: "GVABCR123", codes: [reward] }).reason).toBe("not_yours");
  });

  // Naming the owner would leak one customer's email to another.
  it("does not name the owner in the message", () => {
    const result = evaluate({
      input: "GVABCR123",
      codes: [reward],
      customerEmail: "thief@x.test",
    });
    expect(result.error).not.toContain("owner@x.test");
  });
});

describe("recording redemptions", () => {
  it("counts per customer and in total", () => {
    let redemptions: PromoRedemptions = {};
    redemptions = recordRedemption(redemptions, "SAVE10", "a@x.test");
    redemptions = recordRedemption(redemptions, "SAVE10", "a@x.test");
    redemptions = recordRedemption(redemptions, "SAVE10", "b@x.test");

    expect(customerRedemptions(redemptions, "SAVE10", "a@x.test")).toBe(2);
    expect(customerRedemptions(redemptions, "SAVE10", "b@x.test")).toBe(1);
    expect(totalRedemptions(redemptions, "SAVE10")).toBe(3);
  });

  it("normalises code and email so casing cannot split a count", () => {
    let redemptions: PromoRedemptions = {};
    redemptions = recordRedemption(redemptions, "save10", "A@X.test");
    redemptions = recordRedemption(redemptions, "SAVE10", "a@x.test");
    expect(totalRedemptions(redemptions, "SAVE10")).toBe(2);
  });

  it("does not mutate what it was given", () => {
    const before: PromoRedemptions = { SAVE10: { "a@x.test": 1 } };
    recordRedemption(before, "SAVE10", "a@x.test");
    expect(before.SAVE10["a@x.test"]).toBe(1);
  });

  it("reports zero for a code nobody has used", () => {
    expect(totalRedemptions({}, "SAVE10")).toBe(0);
    expect(customerRedemptions({}, "SAVE10", "a@x.test")).toBe(0);
  });
});

describe("remainingRedemptions", () => {
  it("is null for an uncapped code", () => {
    expect(remainingRedemptions(code(), {})).toBeNull();
  });

  it("counts down and never goes negative", () => {
    const capped = code({ maxRedemptions: 2 });
    expect(remainingRedemptions(capped, {})).toBe(2);
    expect(remainingRedemptions(capped, { SAVE10: { "a@x.test": 1 } })).toBe(1);
    expect(remainingRedemptions(capped, { SAVE10: { "a@x.test": 9 } })).toBe(0);
  });
});
