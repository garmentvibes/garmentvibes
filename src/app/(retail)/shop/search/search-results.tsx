"use client";

import { useSearchParams } from "next/navigation";
import { ProductCard } from "@/components/retail/product-card";
import { searchRetailProducts } from "@/lib/mock/retail-products";

export function SearchResults() {
  const query = useSearchParams().get("q") ?? "";
  const results = searchRetailProducts(query);

  return (
    <>
      <h1 className="text-xl font-bold text-neutral-900">
        {results.length} results for &ldquo;{query}&rdquo;
      </h1>

      {results.length === 0 ? (
        <p className="mt-6 text-neutral-500">
          No products matched your search. Try a different keyword or browse a category.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {results.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </>
  );
}
