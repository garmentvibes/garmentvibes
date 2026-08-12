import { notFound } from "next/navigation";
import { WholesaleProductCard } from "@/components/wholesale/product-card";
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

export default async function WholesaleCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  if (!(category in CATEGORY_LABELS)) notFound();

  const products = WHOLESALE_PRODUCTS.filter((p) => p.category === category);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">
        {CATEGORY_LABELS[category as WholesaleCategory]}
      </h1>
      <p className="mt-1 text-sm text-slate-500">{products.length} products</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {products.map((product) => (
          <WholesaleProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
