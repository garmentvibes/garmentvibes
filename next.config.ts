import type { NextConfig } from "next";
import { shouldAllowIndexing } from "./src/lib/indexing";

// ---------------------------------------------------------------------------
// Content Security Policy
//
// A DELIBERATE TRADE-OFF, worth understanding before changing it.
//
// The strict, nonce-based CSP that Next.js documents requires a fresh nonce
// per request, which means every page must be dynamically rendered. This site
// is a catalogue: ~60 product pages and every content page are statically
// prerendered today, and giving that up costs real TTFB and hosting spend for
// a shop that has no user-generated content and no third-party script
// surface beyond the payment provider.
//
// So script-src keeps 'unsafe-inline', which is required for Next's inline
// hydration payload on prerendered pages. That is a genuine weakening: this
// CSP does NOT stop an injected inline <script>. What it does stop is loading
// script from an unapproved ORIGIN, framing the site, form hijacking to a
// third-party endpoint, plugin content, and base-tag rewriting — a large
// slice of real-world attacks, and strictly better than no policy.
//
// The upgrade path, when user-generated content arrives (reviews rendered as
// HTML, seller-supplied copy, anything of that kind): move to nonces in
// proxy.ts per the Next.js CSP guide and accept dynamic rendering. Until
// then this is the honest balance.
//
// 'unsafe-inline' is also in style-src because Tailwind and the inline styles
// in global-error.tsx (which cannot use the stylesheet, since it replaces the
// root layout) both need it.
// ---------------------------------------------------------------------------
const CSP_DIRECTIVES = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com"],
  "style-src": ["'self'", "'unsafe-inline'"],
  // data: covers the placeholder product SVGs; the Supabase host is ready for
  // real photography landing in Storage.
  "img-src": ["'self'", "data:", "blob:", "https://*.supabase.co"],
  "font-src": ["'self'", "data:"],
  // Razorpay posts payment results and telemetry from the checkout frame.
  "connect-src": ["'self'", "https://api.razorpay.com", "https://lumberjack.razorpay.com"],
  // Razorpay Checkout renders inside an iframe it injects.
  "frame-src": ["https://api.razorpay.com", "https://checkout.razorpay.com"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
  "upgrade-insecure-requests": [],
};

const contentSecurityPolicy = Object.entries(CSP_DIRECTIVES)
  .map(([directive, values]) => (values.length ? `${directive} ${values.join(" ")}` : directive))
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Only has effect over HTTPS, so it is inert on localhost and active on
  // Vercel. Two years with subdomains, which is the usual preload baseline.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Redundant with frame-ancestors above for modern browsers, kept for old ones.
  { key: "X-Frame-Options", value: "DENY" },
  // Send the origin cross-site, the full path same-origin: enough for our own
  // analytics without leaking a customer's order id to a courier's site.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here needs these, and denying them shrinks the attack surface if
  // a script ever does get injected.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

// ---------------------------------------------------------------------------
// Keeping a not-yet-launched shop out of the index
//
// robots.txt already returns a blanket Disallow for anything that is not a
// production deployment (see src/app/robots.ts and shouldAllowIndexing). That
// is not enough on its own for two reasons:
//
//   1. robots.txt is a request, not an instruction. Well-behaved crawlers
//      honour it; not every crawler is well-behaved, and a URL that is linked
//      from somewhere else can still be indexed by reference even when
//      crawling is disallowed.
//   2. Vercel adds its own noindex header to *.vercel.app preview URLs — but
//      not to a custom domain pointed at one. Attaching garmentvibes.com to a
//      non-production deployment therefore loses that protection at exactly
//      the moment the site becomes findable.
//
// `X-Robots-Tag: noindex` is the stronger form: it tells a crawler not to
// index the page it just fetched, and unlike a <meta> tag it covers non-HTML
// responses too. Applied on the same predicate as robots.txt, so the two can
// never disagree about whether this deployment is public.
//
// Evaluated at build time, which is when VERCEL_ENV is available and when
// Next resolves the headers() config. A deployment therefore carries the
// decision it was built with — changing the variable means redeploying, which
// is the right amount of friction for "make the shop indexable".
function noIndexHeader() {
  const indexable = shouldAllowIndexing({
    vercelEnv: process.env.VERCEL_ENV,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });

  if (indexable) return [];

  return [
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
  ];
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      {
        // Every route, including API responses.
        source: "/:path*",
        headers: [...securityHeaders, ...noIndexHeader()],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Content-Type", value: "application/manifest+json" }],
      },
      {
        // Never let a CDN/browser pin an old service worker — otherwise a
        // stale sw.js keeps serving its old caching rules to returning users.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
