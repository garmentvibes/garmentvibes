"use client";

import { useSearchParams } from "next/navigation";
import { WholesaleProductCard } from "@/components/wholesale/product-card";
import { searchWholesaleProducts } from "@/lib/mock/wholesale-products";

export function WholesaleSearchResults() {
  const query = useSearchParams().get("q") ?? "";
  const results = searchWholesaleProducts(query);

  return (
    <>
      <h1 className="text-xl font-bold text-slate-900">
        {results.length} results for &ldquo;{query}&rdquo;
      </h1>

      {results.length === 0 ? (
        <p className="mt-6 text-slate-500">
          No products matched your search. Try a SKU, product name, or fabric type.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {results.map((product) => (
            <WholesaleProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </>
  );
}
