// Whether this deployment is served over HTTPS — which decides whether the CSP
// may carry `upgrade-insecure-requests`.
//
// In its own module, with no imports, for the same reason as indexing.ts:
// `next.config.ts` needs it and cannot resolve the `@/` path aliases.
//
// The directive tells the browser to rewrite http:// requests to https://, and
// that includes the hop a fetch takes when it follows a redirect. On a
// deployment served over plain HTTP — `next start` on a laptop, the CI job,
// anything at http://localhost — the proxy's redirect of a signed-out admin RSC
// request (`Location: /admin/login`) was followed as
// https://localhost:3000/admin/login, where nothing speaks TLS, and the
// navigation died with ERR_SSL_PROTOCOL_ERROR. Measured by rewriting response
// headers in flight: after sign-out, 36 such requests in three rounds with the
// headers as shipped, 0 with only this directive removed, and 28 with HSTS
// removed instead — so HSTS was never the cause.
//
// Every Vercel environment is served over HTTPS, so VERCEL_ENV being set is
// the signal. NODE_ENV is not: `next start` reports "production" locally and in
// CI, which is exactly where the directive did the damage.
//
// The cost is that a self-hosted HTTPS deployment built outside Vercel ships
// without the directive. It is defence in depth there rather than the only
// control: every source this CSP allows is 'self' or an https origin, and HSTS
// still covers the scheme.
export function servedOverHttps(env: { vercelEnv?: string }): boolean {
  return Boolean(env.vercelEnv);
}
