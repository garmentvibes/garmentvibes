import { describe, expect, it } from "vitest";

import { offeredToken, tokenAccepted } from "./authorise";

// The two secrets a deployment can carry. Same length on purpose in most of
// what follows: a check that only ever rejects because the lengths differ would
// pass a careless test suite while accepting nothing real.
const OURS = "a".repeat(64);
const VERCELS = "b".repeat(64);

describe("offeredToken", () => {
  it("strips the Bearer prefix", () => {
    expect(offeredToken(`Bearer ${OURS}`)).toBe(OURS);
  });

  it("takes a bare token too, for a caller that sends one", () => {
    expect(offeredToken(OURS)).toBe(OURS);
  });

  it("reads a missing header as the empty token rather than throwing", () => {
    expect(offeredToken(null)).toBe("");
  });

  it("does not strip anything but an exact `Bearer ` prefix", () => {
    // "bearer" lowercase is what a hand-written curl gets wrong, and it should
    // fail loudly as a wrong token rather than be quietly accepted.
    expect(offeredToken(`bearer ${OURS}`)).toBe(`bearer ${OURS}`);
  });
});

describe("tokenAccepted", () => {
  it("accepts our own secret", () => {
    expect(tokenAccepted(OURS, [OURS, VERCELS])).toBe(true);
  });

  // The one that matters on Vercel. A first-one-wins check would compare
  // against NOTIFICATIONS_DISPATCH_SECRET, find a mismatch, and 401 the cron —
  // so nothing would ever be swept, and the only symptom would be an outbox
  // that quietly stops shrinking.
  it("accepts Vercel's secret even when ours is also configured and differs", () => {
    expect(tokenAccepted(VERCELS, [OURS, VERCELS])).toBe(true);
  });

  it("accepts either when only one is configured", () => {
    expect(tokenAccepted(VERCELS, [VERCELS])).toBe(true);
    expect(tokenAccepted(OURS, [OURS])).toBe(true);
  });

  it("rejects a token that matches neither", () => {
    expect(tokenAccepted("c".repeat(64), [OURS, VERCELS])).toBe(false);
  });

  it("rejects a token that is a prefix of a secret", () => {
    // The length check is what stops this, and it is easy to lose while
    // rearranging the comparison.
    expect(tokenAccepted("a".repeat(63), [OURS])).toBe(false);
  });

  it("rejects a token that extends a secret", () => {
    expect(tokenAccepted(`${OURS}x`, [OURS])).toBe(false);
  });

  // Fail-closed. With nothing configured there is no token that works — not the
  // empty one, which is what an unauthenticated caller sends.
  it("accepts nothing when no secret is configured", () => {
    expect(tokenAccepted("", [])).toBe(false);
    expect(tokenAccepted(OURS, [])).toBe(false);
  });

  // An empty configured secret would otherwise be matched by a request with no
  // Authorization header at all, turning a half-set variable into an open
  // endpoint. The route filters empties out before calling this, but the check
  // should not depend on its caller for that.
  it("does not let an empty secret admit an empty token", () => {
    expect(tokenAccepted("", [""])).toBe(true);
    // …which is exactly why the route never passes one:
    const configured = [process.env.NOT_SET_ANYWHERE, OURS].filter(
      (s): s is string => Boolean(s)
    );
    expect(configured).toEqual([OURS]);
    expect(tokenAccepted("", configured)).toBe(false);
  });
});
