import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { WholesaleBreadcrumbs } from "@/components/wholesale/breadcrumbs";
import { CatalogBrowser } from "@/components/wholesale/catalog-browser";
import { WHOLESALE_PRODUCTS } from "@/lib/mock/wholesale-products";
import type { WholesaleCategory } from "@/types/catalog";

const CATEGORY_LABELS: Record<WholesaleCategory, string> = {
  women: "Women",
  men: "Men",
  kids: "Kids",
  unisex: "Unisex",
  fabric: "Fabric",
};

export function generateStaticParams() {
  return Object.keys(CATEGORY_LABELS).map((category) => ({ category }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const label = CATEGORY_LABELS[category as WholesaleCategory] ?? "Catalog";
  return { title: `Wholesale ${label}` };
}

export default async function WholesaleCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  if (!(category in CATEGORY_LABELS)) notFound();

  const label = CATEGORY_LABELS[category as WholesaleCategory];
  const products = WHOLESALE_PRODUCTS.filter((p) => p.category === category);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <WholesaleBreadcrumbs items={[{ label: "Catalog", href: "/wholesale/catalog" }, { label }]} />
      <h1 className="mt-2 text-2xl font-bold text-slate-900">{label}</h1>
      <p className="mt-1 text-sm text-slate-500">{products.length} products</p>

      <div className="mt-6">
        <CatalogBrowser products={products} showCategoryFilter={false} />
      </div>
    </div>
  );
}
