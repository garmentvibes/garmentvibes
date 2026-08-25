import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";
import { getRetailCatalogue } from "@/lib/catalogue/retail";
import { getWholesaleCatalogue } from "@/lib/catalogue/wholesale";

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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const retailCatalogue = await getRetailCatalogue();
  const wholesaleCatalogue = await getWholesaleCatalogue();
  const origin = siteUrl();
  const entries: MetadataRoute.Sitemap = [{ url: origin, priority: 1 }];

  for (const path of STATIC_RETAIL_PAGES) entries.push({ url: `${origin}${path}` });
  for (const path of STATIC_WHOLESALE_PAGES) entries.push({ url: `${origin}${path}` });
  for (const category of RETAIL_CATEGORIES) entries.push({ url: `${origin}/shop/${category}` });
  for (const category of WHOLESALE_CATEGORIES)
    entries.push({ url: `${origin}/wholesale/catalog/${category}` });
  for (const product of retailCatalogue)
    entries.push({ url: `${origin}/shop/product/${product.slug}` });
  for (const product of wholesaleCatalogue)
    entries.push({ url: `${origin}/wholesale/product/${product.slug}` });

  return entries;
}
