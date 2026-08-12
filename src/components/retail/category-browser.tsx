"use client";

import { useMemo, useState } from "react";
import { ProductCard } from "@/components/retail/product-card";
import { cn } from "@/lib/utils";
import type { RetailProduct } from "@/types/catalog";

const PRICE_BUCKETS = [
  { label: "Under ₹999", max: 99900 },
  { label: "₹999 - ₹1,999", min: 99900, max: 199900 },
  { label: "₹1,999 - ₹2,999", min: 199900, max: 299900 },
  { label: "Above ₹2,999", min: 299900 },
];

type SortKey = "popularity" | "price-asc" | "price-desc" | "rating";

const SORT_LABELS: Record<SortKey, string> = {
  popularity: "Popularity",
  "price-asc": "Price: Low to High",
  "price-desc": "Price: High to Low",
  rating: "Customer Rating",
};

export function CategoryBrowser({ products }: { products: RetailProduct[] }) {
  const [sort, setSort] = useState<SortKey>("popularity");
  const [priceBucket, setPriceBucket] = useState<number | null>(null);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);

  const allSizes = useMemo(
    () => Array.from(new Set(products.flatMap((p) => p.sizes.map((s) => s.label)))),
    [products]
  );

  const filtered = useMemo(() => {
    let list = [...products];

    if (priceBucket !== null) {
      const bucket = PRICE_BUCKETS[priceBucket];
      list = list.filter((p) => (!bucket.min || p.price >= bucket.min) && (!bucket.max || p.price <= bucket.max));
    }

    if (selectedSizes.length > 0) {
      list = list.filter((p) => p.sizes.some((s) => s.inStock && selectedSizes.includes(s.label)));
    }

    switch (sort) {
      case "price-asc":
        list.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        list.sort((a, b) => b.price - a.price);
        break;
      case "rating":
        list.sort((a, b) => b.rating - a.rating);
        break;
      default:
        list.sort((a, b) => b.ratingCount - a.ratingCount);
    }

    return list;
  }, [products, sort, priceBucket, selectedSizes]);

  function toggleSize(size: string) {
    setSelectedSizes((prev) => (prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]));
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
      <aside className="space-y-6 md:col-span-1">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-neutral-900">Price</h3>
          <div className="space-y-1.5 text-sm text-neutral-600">
            {PRICE_BUCKETS.map((bucket, i) => (
              <label key={bucket.label} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="price"
                  checked={priceBucket === i}
                  onChange={() => setPriceBucket(priceBucket === i ? null : i)}
                  className="accent-rose-600"
                />
                {bucket.label}
              </label>
            ))}
          </div>
        </div>

        {allSizes.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-neutral-900">Size</h3>
            <div className="flex flex-wrap gap-2">
              {allSizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => toggleSize(size)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-medium",
                    selectedSizes.includes(size)
                      ? "border-rose-600 bg-rose-50 text-rose-700"
                      : "border-neutral-300 text-neutral-600 hover:border-neutral-400"
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      <div className="md:col-span-3">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-neutral-500">{filtered.length} products</p>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-700 focus:border-rose-400 focus:outline-none"
          >
            {Object.entries(SORT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                Sort: {label}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="py-16 text-center text-neutral-500">No products match these filters.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
