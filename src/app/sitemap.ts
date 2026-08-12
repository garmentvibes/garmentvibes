import type { MetadataRoute } from "next";
import { RETAIL_PRODUCTS } from "@/lib/mock/retail-products";
import { WHOLESALE_PRODUCTS } from "@/lib/mock/wholesale-products";

const RETAIL_CATEGORIES = ["women", "men", "kids"];
const WHOLESALE_CATEGORIES = ["women", "men", "kids", "unisex", "fabric"];

const STATIC_RETAIL_PAGES = ["/shop", "/shop/about", "/shop/faq", "/shop/shipping-policy"];
const STATIC_WHOLESALE_PAGES = ["/wholesale", "/wholesale/how-it-works", "/wholesale/faq", "/wholesale/catalog"];

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
