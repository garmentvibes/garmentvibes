// Structured data (schema.org JSON-LD) builders.
//
// Google reads these to render rich results — price, stock and star ratings
// directly in search listings. Everything here is derived from the same
// catalog data the pages render, so the markup can never drift from the
// visible content (which is itself a Google policy requirement).

import { BUSINESS_INFO } from "@/lib/business-info";
import type { RetailProduct, WholesaleProduct } from "@/types/catalog";
import { wholesalePriceForQty } from "@/types/catalog";

/**
 * The origin this deployment should present as, used for canonicals, OG
 * image URLs, the sitemap and robots.txt.
 *
 * Precedence:
 *   1. NEXT_PUBLIC_SITE_URL — set this only for Production, to the real
 *      domain. Setting it for Preview too would make every preview claim
 *      canonical URLs on the live site.
 *   2. The Vercel deployment URL, which Vercel injects automatically. This
 *      is what makes a preview self-consistent instead of emitting
 *      localhost links that 404 for anyone who clicks them.
 *   3. localhost, for local development.
 */
export function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;

  const vercelUrl =
    process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;

  return "http://localhost:3000";
}

/**
 * Whether search engines should be allowed to index this deployment.
 *
 * Pure so it can be unit tested; `robots.ts` passes the live environment.
 *
 * A preview deployment must never be indexed. Google finding a half-built
 * shop is bad on its own, and it also competes with the real site for the
 * same content once that exists. Vercel does add a noindex header to
 * previews, but relying on someone else's default for something this
 * expensive to undo is not worth it.
 */
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

export function absoluteUrl(path: string) {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Minor units (paise) -> the decimal string schema.org expects. */
function schemaPrice(minorUnits: number) {
  return (minorUnits / 100).toFixed(2);
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "GarmentVibes",
    legalName: BUSINESS_INFO.legalName,
    url: siteUrl(),
    logo: absoluteUrl("/icons/icon-512.png"),
    description:
      "GarmentVibes is a dual-mode clothing platform: shop retail fashion or source wholesale apparel in bulk.",
    address: {
      "@type": "PostalAddress",
      streetAddress: BUSINESS_INFO.address,
      addressCountry: "IN",
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: BUSINESS_INFO.supportEmail,
        telephone: BUSINESS_INFO.supportPhone,
        areaServed: "IN",
        availableLanguage: ["en", "hi"],
      },
      {
        "@type": "ContactPoint",
        contactType: "sales",
        email: BUSINESS_INFO.wholesaleEmail,
        areaServed: "IN",
      },
    ],
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "GarmentVibes",
    url: siteUrl(),
    // Lets Google offer a search box for the site directly in results.
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl()}/shop/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function retailProductSchema(product: RetailProduct) {
  const anySizeInStock = product.sizes.some((s) => s.inStock);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    sku: product.id,
    image: product.images.map((img) =>
      img.startsWith("http") ? img : absoluteUrl(img)
    ),
    brand: { "@type": "Brand", name: product.brand },
    category: `${product.category} / ${product.subcategory}`,
    color: product.colors.join(", "),
    offers: {
      "@type": "Offer",
      url: absoluteUrl(`/shop/product/${product.slug}`),
      priceCurrency: product.currency,
      price: schemaPrice(product.price),
      availability: anySizeInStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: "GarmentVibes" },
    },
    ...(product.ratingCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.rating,
            reviewCount: product.ratingCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}

export function wholesaleProductSchema(product: WholesaleProduct) {
  const lowest = wholesalePriceForQty(
    product,
    product.priceTiers[product.priceTiers.length - 1]?.minQty ?? product.moq
  );
  const highest = wholesalePriceForQty(product, product.moq);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    sku: product.sku,
    image: product.images.map((img) =>
      img.startsWith("http") ? img : absoluteUrl(img)
    ),
    brand: { "@type": "Brand", name: "GarmentVibes" },
    category: `wholesale / ${product.category} / ${product.subcategory}`,
    material: product.fabric,
    color: product.colors.join(", "),
    // Bulk pricing is a range, not a single number — AggregateOffer is the
    // correct shape for tiered per-unit prices.
    offers: {
      "@type": "AggregateOffer",
      url: absoluteUrl(`/wholesale/product/${product.slug}`),
      priceCurrency: product.currency,
      lowPrice: schemaPrice(lowest),
      highPrice: schemaPrice(highest),
      offerCount: product.priceTiers.length,
      availability: "https://schema.org/InStock",
      seller: { "@type": "Organization", name: "GarmentVibes" },
    },
  };
}

export function breadcrumbSchema(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function faqSchema(entries: Array<{ question: string; answer: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}

export function itemListSchema(
  name: string,
  items: Array<{ name: string; path: string }>
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}
