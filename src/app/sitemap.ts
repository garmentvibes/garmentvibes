import type { MetadataRoute } from "next";
import { RETAIL_PRODUCTS } from "@/lib/mock/retail-products";
import { WHOLESALE_PRODUCTS } from "@/lib/mock/wholesale-products";

const RETAIL_CATEGORIES = ["women", "men", "kids"];
const WHOLESALE_CATEGORIES = ["women", "men", "kids", "unisex", "fabric"];

// Every publicly reachable, indexable page. Account and checkout routes are
// deliberately absent — they're behind a login and disallowed in robots.txt.
//
// The policy pages are not just SEO: Razorpay reads the Refund/Cancellation
// and Grievance Officer pages during merchant onboarding, and both are a
// requirement under the Consumer Protection (E-Commerce) Rules 2020. Leaving
// them out of the sitemap makes them harder to find exactly when it matters.
const STATIC_RETAIL_PAGES = [
  "/shop",
  "/shop/about",
  "/shop/contact",
  "/shop/faq",
  "/shop/shipping-policy",
  "/shop/refund-policy",
  "/shop/grievance",
  "/shop/terms",
  "/shop/privacy",
  "/shop/signup", // acquisition page, worth indexing; /shop/login is not
];

const STATIC_WHOLESALE_PAGES = [
  "/wholesale",
  "/wholesale/how-it-works",
  "/wholesale/faq",
  "/wholesale/catalog",
  "/wholesale/contact",
  "/wholesale/terms",
  "/wholesale/pricing-calculator",
  "/wholesale/signup", // how new B2B buyers find us
];

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const entries: MetadataRoute.Sitemap = [{ url: siteUrl, priority: 1 }];

  for (const path of STATIC_RETAIL_PAGES) entries.push({ url: `${siteUrl}${path}` });
  for (const path of STATIC_WHOLESALE_PAGES) entries.push({ url: `${siteUrl}${path}` });
  for (const category of RETAIL_CATEGORIES) entries.push({ url: `${siteUrl}/shop/${category}` });
  for (const category of WHOLESALE_CATEGORIES)
    entries.push({ url: `${siteUrl}/wholesale/catalog/${category}` });
  for (const product of RETAIL_PRODUCTS)
    entries.push({ url: `${siteUrl}/shop/product/${product.slug}` });
  for (const product of WHOLESALE_PRODUCTS)
    entries.push({ url: `${siteUrl}/wholesale/product/${product.slug}` });

  return entries;
}
