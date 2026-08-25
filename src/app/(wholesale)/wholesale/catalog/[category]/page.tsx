import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { WholesaleBreadcrumbs } from "@/components/wholesale/breadcrumbs";
import { CatalogBrowser } from "@/components/wholesale/catalog-browser";
import { getWholesaleProductsByCategory } from "@/lib/catalogue/wholesale";
import { WHOLESALE_CATEGORY_LABELS } from "@/lib/mock/wholesale-taxonomy";
import type { WholesaleCategory } from "@/types/catalog";

// NOTE: no `dynamicParams = false` here, unlike the product routes.
//
// This page reads searchParams (the subcategory filter), which opts it into
// dynamic rendering — so generateStaticParams no longer gates anything and
// the flag would be dead config. An unknown category therefore renders the
// not-found page with HTTP 200 rather than 404.
//
// Left as-is deliberately. Next injects <meta name="robots" content="noindex">
// on that render, so it is not indexed, and the obvious fix — moving the
// subcategory read into the client component behind Suspense — was measured
// and drops every product link out of the prerendered HTML. A soft 404 on a
// URL nobody links to is the cheaper problem.

// See the note in wholesale/product/[slug]/page.tsx: the catalogue is read at
// build time and at revalidation, not per request.
export const revalidate = 3600;

export function generateStaticParams() {
  return Object.keys(WHOLESALE_CATEGORY_LABELS).map((category) => ({ category }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const label = WHOLESALE_CATEGORY_LABELS[category as WholesaleCategory] ?? "Catalog";
  return {
    title: `Wholesale ${label}`,
    description: `Bulk ${label.toLowerCase()} apparel from GarmentVibes — quantity-break pricing, minimum order quantities and lead times for each style.`,
  };
}

export default async function WholesaleCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ subcategory?: string }>;
}) {
  const { category } = await params;
  if (!(category in WHOLESALE_CATEGORY_LABELS)) notFound();

  const { subcategory } = await searchParams;
  const label = WHOLESALE_CATEGORY_LABELS[category as WholesaleCategory];
  const products = await getWholesaleProductsByCategory(category);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <WholesaleBreadcrumbs
        items={
          subcategory
            ? [
                { label: "Catalog", href: "/wholesale/catalog" },
                { label, href: `/wholesale/catalog/${category}` },
                { label: subcategory },
              ]
            : [{ label: "Catalog", href: "/wholesale/catalog" }, { label }]
        }
      />
      <h1 className="mt-2 text-2xl font-bold text-slate-900">{label}</h1>
      <p className="mt-1 text-sm text-slate-500">{products.length} products</p>

      <div className="mt-6">
        <CatalogBrowser
          products={products}
          showCategoryFilter={false}
          initialSubcategory={subcategory}
        />
      </div>
    </div>
  );
}
