import { describe, expect, it } from "vitest";

import { claimReasonFromCode, claimReasonToCode, toWholesaleClaim, type ClaimRow } from "./rows";
import { CLAIM_REASONS, claimValue, claimedUnits } from "@/types/claims";

// ---------------------------------------------------------------------------
// The claim mapping.
//
// Same reason/code split as returns, tested the same way — on the returns side
// getting it wrong under a cast silently disabled restocking, and the lesson
// generalises even though the blast radius here is smaller.
// ---------------------------------------------------------------------------

function row(overrides: Partial<ClaimRow> = {}): ClaimRow {
  return {
    id: "d4e6f8a0-0000-0000-0000-000000000001",
    reference: "CLMQ3X7ZP",
    status: "submitted",
    reason: "short_shipment",
    requested_resolution: "credit_note",
    comments: "Carton 3 arrived open.",
    decision_note: null,
    business_name: "Sunrise Traders",
    contact_name: "Meera Iyer",
    email: "meera@sunrisetraders.example",
    created_at: "2026-08-24T08:30:00.000Z",
    updated_at: null,
    wholesale_quotes: { reference: "GV-Q-2210" },
    wholesale_claim_lines: [
      {
        sku: "GV-WS-TEE-001",
        product_name: "Cotton Round Neck Tee (Bulk)",
        billed_qty: 240,
        claimed_qty: 40,
        price_per_unit: 21900,
      },
    ],
    ...overrides,
  };
}

describe("toWholesaleClaim", () => {
  it("identifies the claim by its CLM reference", () => {
    expect(toWholesaleClaim(row()).id).toBe("CLMQ3X7ZP");
  });

  it("shows the consignment by its reference", () => {
    expect(toWholesaleClaim(row()).orderId).toBe("GV-Q-2210");
  });

  it("translates the stored reason code into the sentence the app knows", () => {
    expect(toWholesaleClaim(row()).reason).toBe("Short shipment");
  });

  it("passes resolution and status straight through", () => {
    // Unlike reason, these use the same strings on both sides — asserted so a
    // future translation added by analogy would be caught as unnecessary.
    const claim = toWholesaleClaim(row());
    expect(claim.requestedResolution).toBe("credit_note");
    expect(claim.status).toBe("submitted");
  });

  it("adds the claim up from its lines", () => {
    // 40 units at ₹219 each. This is the figure a credit note is raised for.
    expect(claimValue(toWholesaleClaim(row()))).toBe(876000);
    expect(claimedUnits(toWholesaleClaim(row()))).toBe(40);
  });

  it("keeps billed and claimed quantities distinct", () => {
    // The constraint in 0007 is claimed_qty <= billed_qty, and conflating the
    // two would make a claim worth the whole invoice.
    const line = toWholesaleClaim(row()).lines[0];
    expect(line.billedQty).toBe(240);
    expect(line.claimedQty).toBe(40);
  });

  it("survives a claim with no lines", () => {
    expect(toWholesaleClaim(row({ wholesale_claim_lines: null })).lines).toEqual([]);
    expect(claimValue(toWholesaleClaim(row({ wholesale_claim_lines: null })))).toBe(0);
  });

  it("carries the decision note once staff have written one", () => {
    expect(toWholesaleClaim(row()).decisionNote).toBeUndefined();
    expect(
      toWholesaleClaim(row({ decision_note: "Carrier confirmed 40 short." })).decisionNote
    ).toBe("Carrier confirmed 40 short.");
  });
});

describe("claim reason translation", () => {
  it("round-trips every reason the app offers", () => {
    for (const reason of CLAIM_REASONS) {
      expect(claimReasonFromCode(claimReasonToCode(reason))).toBe(reason);
    }
  });

  it("gives every reason a distinct code", () => {
    const codes = CLAIM_REASONS.map(claimReasonToCode);
    expect(new Set(codes).size).toBe(CLAIM_REASONS.length);
  });

  it("returns a reason the app can render for an unknown code", () => {
    // If the enum grows and the app is not rebuilt, the queue must still show
    // a sentence rather than a raw code.
    expect(CLAIM_REASONS).toContain(claimReasonFromCode("some_future_reason"));
  });
});
