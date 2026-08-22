import { describe, expect, it } from "vitest";
import { callerKey, createRateLimiter, rateLimitHeaders } from "./rate-limit";

// The clock is injected, so every window boundary here is exact rather than
// approximated by sleeping.
const T0 = 1_700_000_000_000;

describe("createRateLimiter", () => {
  it("permits requests up to the limit", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(limiter.check("a", T0).allowed).toBe(true);
    expect(limiter.check("a", T0 + 1).allowed).toBe(true);
    expect(limiter.check("a", T0 + 2).allowed).toBe(true);
  });

  it("refuses the request after the limit", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    limiter.check("a", T0);
    limiter.check("a", T0 + 1);
    expect(limiter.check("a", T0 + 2).allowed).toBe(false);
  });

  it("counts each caller separately", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("a", T0).allowed).toBe(true);
    expect(limiter.check("b", T0).allowed).toBe(true);
    expect(limiter.check("a", T0).allowed).toBe(false);
  });

  it("reports the remaining allowance", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(limiter.check("a", T0).remaining).toBe(2);
    expect(limiter.check("a", T0).remaining).toBe(1);
    expect(limiter.check("a", T0).remaining).toBe(0);
  });

  it("frees the allowance once the window passes", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("a", T0).allowed).toBe(true);
    expect(limiter.check("a", T0 + 59_999).allowed).toBe(false);
    expect(limiter.check("a", T0 + 60_001).allowed).toBe(true);
  });

  // The reason for a sliding window rather than a fixed one: with fixed
  // windows a caller spends its whole allowance at the end of one window and
  // again at the start of the next, landing double the limit back to back.
  it("does not allow a double burst across a window boundary", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    for (let i = 0; i < 3; i++) limiter.check("a", T0 + 59_000 + i);
    // A fixed window resetting at T0+60_000 would permit three more here.
    expect(limiter.check("a", T0 + 60_100).allowed).toBe(false);
  });

  it("frees allowance gradually as individual requests age out", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 10_000 });
    limiter.check("a", T0);
    limiter.check("a", T0 + 5_000);
    expect(limiter.check("a", T0 + 6_000).allowed).toBe(false);

    // The first request has now aged out; the second has not.
    expect(limiter.check("a", T0 + 10_500).allowed).toBe(true);
    expect(limiter.check("a", T0 + 10_600).allowed).toBe(false);
  });

  it("reports when the caller may retry", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.check("a", T0);
    const blocked = limiter.check("a", T0 + 20_000);
    expect(blocked.retryAfterSeconds).toBe(40);
  });

  it("never reports a retry of zero seconds while blocked", () => {
    // A caller told to retry after 0 seconds retries immediately and is
    // refused again, which is a hot loop rather than back-off.
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.check("a", T0);
    const blocked = limiter.check("a", T0 + 59_999);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("bounds how many callers it tracks", () => {
    // Otherwise forged caller keys let an attacker grow the map without limit.
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, maxKeys: 10 });
    for (let i = 0; i < 500; i++) limiter.check(`caller-${i}`, T0 + i);
    expect(limiter.size()).toBeLessThanOrEqual(10);
  });

  it("evicts the least recently seen caller, not an active one", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, maxKeys: 2 });
    limiter.check("old", T0);
    limiter.check("active", T0 + 1);
    limiter.check("active", T0 + 2); // "active" is now the most recent
    limiter.check("new", T0 + 3); // evicts "old"

    // "active" kept its history, so it is still at its limit.
    expect(limiter.check("active", T0 + 4).allowed).toBe(false);
  });

  it("rejects a nonsensical configuration rather than limiting nothing", () => {
    expect(() => createRateLimiter({ limit: 0, windowMs: 1000 })).toThrow();
    expect(() => createRateLimiter({ limit: 5, windowMs: 0 })).toThrow();
  });
});

describe("callerKey", () => {
  it("prefers the platform header a client cannot forge", () => {
    const headers = new Headers({
      "x-vercel-forwarded-for": "203.0.113.5",
      "x-forwarded-for": "198.51.100.1",
      "x-real-ip": "192.0.2.1",
    });
    expect(callerKey(headers)).toBe("203.0.113.5");
  });

  it("takes the original client from a forwarded chain, not a proxy hop", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178" });
    expect(callerKey(headers)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip", () => {
    expect(callerKey(new Headers({ "x-real-ip": "192.0.2.1" }))).toBe("192.0.2.1");
  });

  it("puts unidentifiable callers in one shared bucket", () => {
    // Sharing a bucket is the strict direction: giving each unattributable
    // request its own key would hand every one of them a full allowance.
    expect(callerKey(new Headers())).toBe("unidentified");
  });

  it("trims whitespace so one address cannot occupy two buckets", () => {
    expect(callerKey(new Headers({ "x-forwarded-for": "  203.0.113.5  , 70.41.3.18" }))).toBe(
      "203.0.113.5"
    );
  });
});

describe("rateLimitHeaders", () => {
  it("describes the remaining allowance on a permitted request", () => {
    const headers = rateLimitHeaders(10, { allowed: true, remaining: 7, retryAfterSeconds: 0 });
    expect(headers["X-RateLimit-Limit"]).toBe("10");
    expect(headers["X-RateLimit-Remaining"]).toBe("7");
    expect(headers["Retry-After"]).toBeUndefined();
  });

  it("sends Retry-After only when the caller is blocked", () => {
    const headers = rateLimitHeaders(10, { allowed: false, remaining: 0, retryAfterSeconds: 42 });
    expect(headers["Retry-After"]).toBe("42");
  });
});
