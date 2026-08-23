import { describe, expect, it } from "vitest";

import {
  REFERRAL_REWARD_PERCENT,
  checkReferral,
  referralCodeFor,
  rewardCodeFor,
} from "./referrals";
import { evaluatePromo } from "./promo-eligibility";

describe("referralCodeFor", () => {
  it("is stable for the same person", () => {
    expect(referralCodeFor("asha@example.com")).toBe(referralCodeFor("asha@example.com"));
  });

  it("ignores casing and padding, so a code survives however it was typed", () => {
    expect(referralCodeFor("  ASHA@Example.COM ")).toBe(referralCodeFor("asha@example.com"));
  });

  it("differs between people", () => {
    expect(referralCodeFor("a@example.com")).not.toBe(referralCodeFor("b@example.com"));
  });

  // These get read aloud, written on paper and typed by someone else, so B/8,
  // I/1, O/0, S/5 and Z/2 are kept out of the alphabet.
  it("avoids characters that are misread", () => {
    for (const email of ["a@x.test", "b@x.test", "someone.long@example.co.in", "z@y.test"]) {
      expect(referralCodeFor(email)).toMatch(/^GV[ACDEFGHJKLMNPQRTUVWXY349]{6}$/);
    }
  });

  it("does not collide across a realistic number of customers", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 5_000; i += 1) codes.add(referralCodeFor(`customer${i}@example.com`));
    expect(codes.size).toBe(5_000);
  });
});

describe("checkReferral", () => {
  const known = ["referrer@example.com", "friend@example.com"];
  const REFERRER_CODE = referralCodeFor("referrer@example.com");

  const check = (over: Partial<Parameters<typeof checkReferral>[0]> = {}) =>
    checkReferral({
      code: REFERRER_CODE,
      customerEmail: "friend@example.com",
      knownCustomerEmails: known,
      alreadyUsed: [],
      hasOrderedBefore: false,
      ...over,
    });

  it("accepts a new customer using someone else's code", () => {
    expect(check()).toMatchObject({ ok: true, referrerEmail: "referrer@example.com" });
  });

  it("accepts it however it was typed", () => {
    expect(check({ code: `  ${REFERRER_CODE.toLowerCase()} ` }).ok).toBe(true);
  });

  it("refuses a code belonging to nobody", () => {
    expect(check({ code: "GVZZZZZZ" }).reason).toBe("unknown");
  });

  // The obvious abuse: sign up, refer yourself, take both halves.
  it("refuses self-referral", () => {
    expect(check({ customerEmail: "referrer@example.com" }).reason).toBe("self");
  });

  it("refuses self-referral regardless of casing", () => {
    expect(check({ customerEmail: "REFERRER@Example.com" }).reason).toBe("self");
  });

  it("allows only one referral per customer, ever", () => {
    expect(check({ alreadyUsed: ["GVSOMETH"] }).reason).toBe("already_referred");
  });

  it("is for a first order only", () => {
    expect(check({ hasOrderedBefore: true }).reason).toBe("not_new");
  });
});

describe("rewardCodeFor", () => {
  const reward = rewardCodeFor("referrer@example.com", "friend@example.com");

  it("is single-use and belongs to the referrer", () => {
    expect(reward).toMatchObject({
      percent: REFERRAL_REWARD_PERCENT,
      active: true,
      maxRedemptions: 1,
      maxPerCustomer: 1,
      issuedTo: "referrer@example.com",
    });
  });

  // A referrer who brings in three people should end up with three rewards,
  // not one that keeps being overwritten.
  it("is distinct per invited friend", () => {
    const second = rewardCodeFor("referrer@example.com", "another@example.com");
    expect(second.code).not.toBe(reward.code);
  });

  it("starts with the referrer's own code, so it is recognisable to them", () => {
    expect(reward.code.startsWith(referralCodeFor("referrer@example.com"))).toBe(true);
  });

  // The two modules have to agree: a reward issued here must satisfy the
  // eligibility rules over there.
  it("is redeemable by the referrer and nobody else", () => {
    const now = Date.now();
    const asOwner = evaluatePromo({
      input: reward.code,
      codes: [reward],
      redemptions: {},
      customerEmail: "referrer@example.com",
      now,
    });
    expect(asOwner.ok).toBe(true);

    const asStranger = evaluatePromo({
      input: reward.code,
      codes: [reward],
      redemptions: {},
      customerEmail: "someone@else.test",
      now,
    });
    expect(asStranger.ok).toBe(false);
  });

  it("cannot be used twice by its owner", () => {
    const second = evaluatePromo({
      input: reward.code,
      codes: [reward],
      redemptions: { [reward.code.toUpperCase()]: { "referrer@example.com": 1 } },
      customerEmail: "referrer@example.com",
      now: Date.now(),
    });
    expect(second.ok).toBe(false);
  });
});
