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
        "/wholesale/order",
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
