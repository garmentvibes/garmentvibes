import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/retail/breadcrumbs";
import { CategoryBrowser } from "@/components/retail/category-browser";
import { RETAIL_PRODUCTS } from "@/lib/mock/retail-products";
import type { RetailCategory } from "@/types/catalog";
import type { Metadata } from "next";

const CATEGORY_LABELS: Record<RetailCategory, string> = {
  women: "Women",
  men: "Men",
  kids: "Kids",
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
  const label = CATEGORY_LABELS[category as RetailCategory] ?? "Shop";
  return { title: `${label}'s Fashion` };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  if (!(category in CATEGORY_LABELS)) notFound();

  const label = CATEGORY_LABELS[category as RetailCategory];
  const products = RETAIL_PRODUCTS.filter((p) => p.category === category);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ label }]} />
      <h1 className="mt-2 text-2xl font-bold text-neutral-900">{label}</h1>
      <p className="mt-1 text-sm text-neutral-500">{products.length} products</p>

      <div className="mt-6">
        <CategoryBrowser products={products} />
      </div>
    </div>
  );
}
