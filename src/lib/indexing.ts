// Whether this deployment should be findable in search.
//
// In its own module, with no imports, for one reason: `next.config.ts` needs
// it too, and cannot import from `@/lib/seo` — that pulls in the catalogue
// types and business info through path aliases the config file does not
// resolve.
//
// The duplication that would otherwise sit here is not cosmetic. `robots.txt`
// and the `X-Robots-Tag` header are two answers to the same question, and two
// copies of the rule is how a deployment ends up serving `Disallow: /` while
// its headers say it is indexable, or the reverse. One function, two callers.

export function shouldAllowIndexing(env: {
  vercelEnv?: string;
  siteUrl?: string;
}) {
  // Explicitly deployed as production on Vercel: index it.
  if (env.vercelEnv === "production") return true;
  // Any other Vercel environment is a preview: never index.
  if (env.vercelEnv) return false;
  // Off Vercel entirely (local, or self-hosted): index only when a real
  // site URL has been configured deliberately.
  return Boolean(env.siteUrl);
}
