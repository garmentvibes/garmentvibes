import { notFound } from "next/navigation";
import { ProductCard } from "@/components/retail/product-card";
import { RETAIL_PRODUCTS } from "@/lib/mock/retail-products";
import type { RetailCategory } from "@/types/catalog";

const CATEGORY_LABELS: Record<RetailCategory, string> = {
  women: "Women",
  men: "Men",
  kids: "Kids",
};

export function generateStaticParams() {
  return Object.keys(CATEGORY_LABELS).map((category) => ({ category }));
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  if (!(category in CATEGORY_LABELS)) notFound();

  const products = RETAIL_PRODUCTS.filter((p) => p.category === category);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        {CATEGORY_LABELS[category as RetailCategory]}
      </h1>
      <p className="mt-1 text-sm text-neutral-500">{products.length} products</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
