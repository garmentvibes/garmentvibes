import { afterEach, describe, it, expect, vi } from "vitest";
import { servedOverHttps } from "@/lib/https-deployment";

describe("servedOverHttps", () => {
  it("is true on every Vercel environment", () => {
    expect(servedOverHttps({ vercelEnv: "production" })).toBe(true);
    expect(servedOverHttps({ vercelEnv: "preview" })).toBe(true);
    expect(servedOverHttps({ vercelEnv: "development" })).toBe(true);
  });

  // The case the directive broke: `next start` over plain http, locally and in
  // CI, where NODE_ENV is "production" and VERCEL_ENV is absent.
  it("is false off Vercel", () => {
    expect(servedOverHttps({})).toBe(false);
    expect(servedOverHttps({ vercelEnv: "" })).toBe(false);
  });
});

// The predicate is only worth having if next.config.ts actually consults it, so
// these load the real config — the same module Next evaluates at build time —
// rather than trusting that the wiring is there.
async function cspFor(vercelEnv: string) {
  vi.resetModules();
  vi.stubEnv("VERCEL_ENV", vercelEnv);
  const config = (await import("../../next.config")).default;
  const rules = await config.headers!();
  const everyRoute = rules.find((r) => r.source === "/:path*");
  const csp = everyRoute?.headers.find((h) => h.key === "Content-Security-Policy")?.value;
  if (!csp) throw new Error("next.config.ts served no Content-Security-Policy on /:path*");
  return csp;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the CSP next.config.ts serves", () => {
  it("carries upgrade-insecure-requests on a Vercel deployment", async () => {
    expect(await cspFor("production")).toContain("upgrade-insecure-requests");
    expect(await cspFor("preview")).toContain("upgrade-insecure-requests");
  });

  it("omits it off Vercel, where it upgraded http redirects to a port with no TLS", async () => {
    expect(await cspFor("")).not.toContain("upgrade-insecure-requests");
  });

  // Guards the other direction: a change that drops the directive by dropping
  // the whole policy would pass the test above.
  it("keeps every other directive either way", async () => {
    for (const env of ["production", ""]) {
      const csp = await cspFor(env);
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("form-action 'self'");
    }
  });
});
