"use client";

import { ProductCard } from "@/components/retail/product-card";
import { useRecentlyViewedStore } from "@/lib/stores/recently-viewed-store";
import { RETAIL_PRODUCTS } from "@/lib/mock/retail-products";

export function RecentlyViewedRail({ excludeId }: { excludeId?: string }) {
  const productIds = useRecentlyViewedStore((s) => s.productIds);
  const products = productIds
    .filter((id) => id !== excludeId)
    .map((id) => RETAIL_PRODUCTS.find((p) => p.id === id))
    .filter((p): p is (typeof RETAIL_PRODUCTS)[number] => Boolean(p));

  if (products.length === 0) return null;

  return (
    <section className="mt-14">
      <h2 className="mb-4 text-xl font-bold text-neutral-900">Recently Viewed</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
