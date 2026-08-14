import { describe, it, expect } from "vitest";
import { shouldAllowIndexing } from "@/lib/seo";

// Getting this wrong in the permissive direction is expensive and slow to
// undo: once Google has indexed a preview deployment, the half-built pages
// linger in results and compete with the real site for the same content.
describe("shouldAllowIndexing", () => {
  it("indexes a Vercel production deployment", () => {
    expect(shouldAllowIndexing({ vercelEnv: "production" })).toBe(true);
  });

  it("never indexes a Vercel preview, even with a site URL configured", () => {
    // The dangerous case: NEXT_PUBLIC_SITE_URL set for all environments
    // must not turn previews into indexable copies of the shop.
    expect(
      shouldAllowIndexing({ vercelEnv: "preview", siteUrl: "https://garmentvibes.com" })
    ).toBe(false);
  });

  it("never indexes a Vercel development deployment", () => {
    expect(shouldAllowIndexing({ vercelEnv: "development" })).toBe(false);
  });

  it("does not index off-Vercel builds with no site URL", () => {
    // Local `next start`, or a self-host that was never configured.
    expect(shouldAllowIndexing({})).toBe(false);
    expect(shouldAllowIndexing({ siteUrl: "" })).toBe(false);
  });

  it("indexes a self-hosted build only once a site URL is set deliberately", () => {
    expect(shouldAllowIndexing({ siteUrl: "https://garmentvibes.com" })).toBe(true);
  });

  it("treats an unrecognised Vercel environment as not indexable", () => {
    // Fail closed: a new environment name should default to private.
    expect(shouldAllowIndexing({ vercelEnv: "staging" })).toBe(false);
  });
});
