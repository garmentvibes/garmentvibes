import { describe, expect, it } from "vitest";

import { parsePromoForm, type PromoFormInput } from "./form";
import { sortForAdmin, toManagedCodes, type PromoCodeRow } from "./rows";

const NOW = Date.parse("2026-08-24T00:00:00Z");

function form(overrides: Partial<PromoFormInput> = {}): PromoFormInput {
  return {
    code: "FESTIVE20",
    percent: "20",
    expiresOn: "",
    maxRedemptions: "100",
    maxPerCustomer: "1",
    ...overrides,
  };
}

function row(overrides: Partial<PromoCodeRow> = {}): PromoCodeRow {
  return {
    code: "FESTIVE20",
    percent: 20,
    active: true,
    built_in: false,
    starts_on: null,
    expires_on: null,
    max_redemptions: 100,
    max_per_customer: 1,
    issued_to: null,
    ...overrides,
  };
}

describe("parsePromoForm", () => {
  it("accepts a well-formed code", () => {
    const result = parsePromoForm(form(), NOW);
    expect(result).toEqual({
      ok: true,
      value: {
        code: "FESTIVE20",
        percent: 20,
        expiresOn: undefined,
        maxRedemptions: 100,
        maxPerCustomer: 1,
      },
    });
  });

  it("uppercases and trims what was typed", () => {
    const result = parsePromoForm(form({ code: "  festive20 " }), NOW);
    expect(result.ok && result.value.code).toBe("FESTIVE20");
  });

  it("refuses punctuation, which survives this form and fails when retyped", () => {
    expect(parsePromoForm(form({ code: "FESTIVE-20" }), NOW).ok).toBe(false);
    expect(parsePromoForm(form({ code: "FESTIVE 20" }), NOW).ok).toBe(false);
  });

  it("refuses a code too short to be one", () => {
    expect(parsePromoForm(form({ code: "GV" }), NOW).ok).toBe(false);
  });

  it("refuses a discount that gives the order away", () => {
    // 0 does nothing and 100 is free — both are typos rather than intent.
    expect(parsePromoForm(form({ percent: "0" }), NOW).ok).toBe(false);
    expect(parsePromoForm(form({ percent: "100" }), NOW).ok).toBe(false);
  });

  it("refuses a fractional discount", () => {
    // The column is an integer, so 12.5 would silently become something else.
    expect(parsePromoForm(form({ percent: "12.5" }), NOW).ok).toBe(false);
  });

  it("refuses an expiry already in the past", () => {
    const result = parsePromoForm(form({ expiresOn: "2026-08-23" }), NOW);
    expect(result.ok).toBe(false);
  });

  it("accepts an expiry in the future and keeps it as a plain date", () => {
    // Not passed through a Date: the column is a date, and a round trip
    // through one moves it across a timezone boundary and shows the wrong day
    // to half the world.
    const result = parsePromoForm(form({ expiresOn: "2026-12-31" }), NOW);
    expect(result.ok && result.value.expiresOn).toBe("2026-12-31");
  });

  it("treats blank caps as unlimited rather than as zero", () => {
    const result = parsePromoForm(form({ maxRedemptions: "", maxPerCustomer: "" }), NOW);
    expect(result.ok && result.value.maxRedemptions).toBeUndefined();
    expect(result.ok && result.value.maxPerCustomer).toBeUndefined();
  });

  it("refuses a cap of zero, which is not the same as unlimited", () => {
    expect(parsePromoForm(form({ maxRedemptions: "0" }), NOW).ok).toBe(false);
  });

  it("refuses a per-customer cap larger than the total", () => {
    // Meaningless rather than wrong — the per-customer number can never bind —
    // and it is how a transposed pair gets typed in.
    const result = parsePromoForm(form({ maxRedemptions: "3", maxPerCustomer: "5" }), NOW);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/cannot exceed/);
  });

  it("allows a per-customer cap equal to the total", () => {
    expect(parsePromoForm(form({ maxRedemptions: "5", maxPerCustomer: "5" }), NOW).ok).toBe(true);
  });

  it("allows a per-customer cap with no total", () => {
    expect(parsePromoForm(form({ maxRedemptions: "", maxPerCustomer: "2" }), NOW).ok).toBe(true);
  });
});

describe("toManagedCodes", () => {
  it("renames the stored columns to what the panel renders", () => {
    const [code] = toManagedCodes(
      [row({ expires_on: "2026-12-31", built_in: true })],
      [{ code: "FESTIVE20", redemptions: 7, customers: 5 }]
    );

    expect(code.expiresOn).toBe("2026-12-31");
    expect(code.maxRedemptions).toBe(100);
    expect(code.maxPerCustomer).toBe(1);
    expect(code.builtIn).toBe(true);
    expect(code.redemptions).toBe(7);
    expect(code.customers).toBe(5);
  });

  it("turns nulls into undefined rather than passing them through", () => {
    // A null reaching a form field renders as the string "null", and a null
    // maxRedemptions would read as a cap of nothing rather than as unlimited.
    const [code] = toManagedCodes(
      [row({ expires_on: null, max_redemptions: null, max_per_customer: null })],
      []
    );

    expect(code.expiresOn).toBeUndefined();
    expect(code.maxRedemptions).toBeUndefined();
    expect(code.maxPerCustomer).toBeUndefined();
  });

  it("shows zero for a code with no usage row", () => {
    // The view left-joins so this should not happen, but the two reads are
    // separate round trips — a code created between them would otherwise
    // render "undefined of 100 used".
    const [code] = toManagedCodes([row()], []);
    expect(code.redemptions).toBe(0);
    expect(code.customers).toBe(0);
  });
});

describe("sortForAdmin", () => {
  it("puts live codes above switched-off ones", () => {
    const codes = toManagedCodes(
      [
        row({ code: "AAAOFF", active: false }),
        row({ code: "ZZZON", active: true }),
      ],
      []
    );

    expect(sortForAdmin(codes).map((c) => c.code)).toEqual(["ZZZON", "AAAOFF"]);
  });

  it("orders alphabetically within each group", () => {
    const codes = toManagedCodes(
      [row({ code: "BETA" }), row({ code: "ALPHA" })],
      []
    );

    expect(sortForAdmin(codes).map((c) => c.code)).toEqual(["ALPHA", "BETA"]);
  });

  it("does not mutate what it was given", () => {
    const codes = toManagedCodes([row({ code: "BETA" }), row({ code: "ALPHA" })], []);
    sortForAdmin(codes);
    expect(codes.map((c) => c.code)).toEqual(["BETA", "ALPHA"]);
  });
});
