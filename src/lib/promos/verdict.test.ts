import { describe, expect, it } from "vitest";

import { verdictFromRpc } from "./verdict";

describe("verdictFromRpc", () => {
  it("passes an accepted code through with its percent", () => {
    expect(verdictFromRpc({ ok: true, percent: 15 })).toEqual({ ok: true, percent: 15 });
  });

  it("gives every rejection the customer-facing message for it", () => {
    // The four distinct rejections are the reason promo-eligibility.ts exists:
    // promoPercentFromStore returned 0 for all of them and checkout said
    // "Invalid or expired promo code" to everything. A server that collapsed
    // them again would undo that, so each one is named here.
    const cases = {
      unknown: "We don't recognise that code",
      inactive: "That code is no longer active",
      expired: "That code has expired",
      exhausted: "That code has been fully claimed",
      already_used: "You've already used that code",
      not_yours: "That code was issued to a different account",
    };

    for (const [reason, message] of Object.entries(cases)) {
      expect(verdictFromRpc({ ok: false, reason })).toEqual({
        ok: false,
        percent: 0,
        reason,
        error: message,
      });
    }
  });

  it("does not name the owner of a referral reward", () => {
    // Vague on purpose: the code belongs to somebody, and saying who would
    // hand one customer another's email address.
    const verdict = verdictFromRpc({ ok: false, reason: "not_yours" });
    expect(verdict?.error).not.toMatch(/@/);
  });

  it("degrades a reason it has never heard of to a vague message", () => {
    // Rather than rendering the word "undefined" into a toast, which is what a
    // straight Record lookup on an unknown key produces.
    expect(verdictFromRpc({ ok: false, reason: "quota_exceeded" })).toEqual({
      ok: false,
      percent: 0,
      reason: "unknown",
      error: "We don't recognise that code",
    });
  });

  it("treats a missing reason the same way", () => {
    expect(verdictFromRpc({ ok: false })?.reason).toBe("unknown");
  });

  it("reports no answer at all as null, not as a rejection", () => {
    // The distinction the whole fallback rests on. "We could not check" must
    // not become "you may not use this", or a deployment with no database
    // would refuse every code.
    expect(verdictFromRpc(null)).toBeNull();
  });

  it("never reports a discount on a rejection", () => {
    expect(verdictFromRpc({ ok: false, percent: 25, reason: "exhausted" })?.percent).toBe(0);
  });
});
