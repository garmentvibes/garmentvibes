"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CategoryBrowser } from "@/components/retail/category-browser";
import { searchRetailProducts } from "@/lib/mock/retail-products";

export function SearchResults() {
  const query = useSearchParams().get("q") ?? "";
  const results = searchRetailProducts(query);

  return (
    <>
      <h1 className="text-xl font-bold text-neutral-900">
        {results.length} {results.length === 1 ? "result" : "results"} for &ldquo;{query}&rdquo;
      </h1>

      {results.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-neutral-300 py-12 text-center">
          <p className="text-neutral-600">No products matched &ldquo;{query}&rdquo;.</p>
          <p className="mt-1 text-sm text-neutral-500">
            Check the spelling, try a broader term, or browse a category.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {[
              { href: "/shop/women", label: "Women" },
              { href: "/shop/men", label: "Men" },
              { href: "/shop/kids", label: "Kids" },
            ].map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm text-neutral-700 hover:border-rose-400 hover:text-rose-600"
              >
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        // Reuse the category browser so search results get the same facets,
        // sorting and pagination as any listing page.
        <div className="mt-6">
          <CategoryBrowser products={results} />
        </div>
      )}
    </>
  );
}
