import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin", // staff tooling
        "/offline", // service-worker fallback only, not real content
        "/shop/cart",
        "/shop/checkout",
        "/shop/account",
        "/shop/orders",
        "/shop/addresses",
        "/shop/wishlist", // per-user state, nothing to index
        // Internal search results are thin, near-duplicate pages — Google
        // explicitly discourages indexing them.
        "/shop/search",
        "/wholesale/search",
        // Confirmation pages only make sense with the query params that
        // brought you there; indexed on their own they're empty shells.
        "/shop/order-confirmation",
        "/wholesale/quote-confirmation",
        // Sign-in pages have no search value and shouldn't compete with the
        // signup pages, which do.
        "/shop/login",
        "/wholesale/login",
        "/wholesale/order",
        // Buyer-scoped: the bulk order list and per-order claim pages, the
        // counterpart of /shop/orders above.
        "/wholesale/orders",
        "/wholesale/quick-order",
        "/wholesale/dashboard",
        "/wholesale/settings",
        "/wholesale/team",
        "/wholesale/account",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
