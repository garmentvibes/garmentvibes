"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductCard } from "@/components/retail/product-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RetailProduct } from "@/types/catalog";

const PRICE_BUCKETS = [
  { label: "Under ₹999", max: 99900 },
  { label: "₹999 - ₹1,999", min: 99900, max: 199900 },
  { label: "₹1,999 - ₹2,999", min: 199900, max: 299900 },
  { label: "Above ₹2,999", min: 299900 },
];

const DISCOUNT_BUCKETS = [10, 20, 30, 40];

const discountPercent = (p: RetailProduct) =>
  p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;

const PAGE_SIZE = 9;

type SortKey = "popularity" | "price-asc" | "price-desc" | "rating" | "discount";

const SORT_LABELS: Record<SortKey, string> = {
  popularity: "Popularity",
  "price-asc": "Price: Low to High",
  "price-desc": "Price: High to Low",
  rating: "Customer Rating",
  discount: "Discount",
};

export function CategoryBrowser({
  products,
  initialSubcategory,
}: {
  products: RetailProduct[];
  initialSubcategory?: string;
}) {
  const [sort, setSort] = useState<SortKey>("popularity");
  const [priceBucket, setPriceBucket] = useState<number | null>(null);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>(
    initialSubcategory ? [initialSubcategory] : []
  );
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [minDiscount, setMinDiscount] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const allSizes = useMemo(
    () => Array.from(new Set(products.flatMap((p) => p.sizes.map((s) => s.label)))),
    [products]
  );
  const allSubcategories = useMemo(
    () => Array.from(new Set(products.map((p) => p.subcategory))).sort(),
    [products]
  );
  const allBrands = useMemo(
    () => Array.from(new Set(products.map((p) => p.brand))).sort(),
    [products]
  );
  const allColors = useMemo(
    () => Array.from(new Set(products.flatMap((p) => p.colors))).sort(),
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

    if (selectedSubcategories.length > 0) {
      list = list.filter((p) => selectedSubcategories.includes(p.subcategory));
    }

    if (selectedBrands.length > 0) {
      list = list.filter((p) => selectedBrands.includes(p.brand));
    }

    if (selectedColors.length > 0) {
      list = list.filter((p) => p.colors.some((c) => selectedColors.includes(c)));
    }

    if (minDiscount !== null) {
      list = list.filter((p) => discountPercent(p) >= minDiscount);
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
      case "discount":
        list.sort((a, b) => discountPercent(b) - discountPercent(a));
        break;
      default:
        list.sort((a, b) => b.ratingCount - a.ratingCount);
    }

    return list;
  }, [
    products,
    sort,
    priceBucket,
    selectedSizes,
    selectedSubcategories,
    selectedBrands,
    selectedColors,
    minDiscount,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Filters can shrink the list below the current page. Clamp during render
  // rather than correcting in an effect, which would cause a second pass with
  // an empty grid painted in between.
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function toggleSize(size: string) {
    setPage(1);
    setSelectedSizes((prev) => (prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]));
  }

  function toggleSubcategory(sub: string) {
    setPage(1);
    setSelectedSubcategories((prev) => (prev.includes(sub) ? prev.filter((s) => s !== sub) : [...prev, sub]));
  }

  function toggleBrand(brand: string) {
    setPage(1);
    setSelectedBrands((prev) => (prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]));
  }

  function toggleColor(color: string) {
    setPage(1);
    setSelectedColors((prev) =>
      prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
      <aside className="space-y-6 md:col-span-1">
        {allSubcategories.length > 1 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-neutral-900">Category</h2>
            <div className="space-y-1.5 text-sm text-neutral-600">
              {allSubcategories.map((sub) => (
                <label key={sub} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedSubcategories.includes(sub)}
                    onChange={() => toggleSubcategory(sub)}
                    className="accent-rose-600"
                  />
                  {sub}
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Price</h2>
          <div className="space-y-1.5 text-sm text-neutral-600">
            {PRICE_BUCKETS.map((bucket, i) => (
              <label key={bucket.label} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="price"
                  checked={priceBucket === i}
                  onChange={() => {
                    setPage(1);
                    setPriceBucket(priceBucket === i ? null : i);
                  }}
                  className="accent-rose-600"
                />
                {bucket.label}
              </label>
            ))}
          </div>
        </div>

        {allBrands.length > 1 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-neutral-900">Brand</h2>
            <div className="space-y-1.5 text-sm text-neutral-600">
              {allBrands.map((brand) => (
                <label key={brand} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedBrands.includes(brand)}
                    onChange={() => toggleBrand(brand)}
                    className="accent-rose-600"
                  />
                  {brand}
                </label>
              ))}
            </div>
          </div>
        )}

        {allColors.length > 1 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-neutral-900">Colour</h2>
            <div className="space-y-1.5 text-sm text-neutral-600">
              {allColors.map((color) => (
                <label key={color} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedColors.includes(color)}
                    onChange={() => toggleColor(color)}
                    className="accent-rose-600"
                  />
                  {color}
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Discount</h2>
          <div className="space-y-1.5 text-sm text-neutral-600">
            {DISCOUNT_BUCKETS.map((pct) => (
              <label key={pct} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="discount"
                  checked={minDiscount === pct}
                  onChange={() => {
                    setPage(1);
                    setMinDiscount(minDiscount === pct ? null : pct);
                  }}
                  className="accent-rose-600"
                />
                {pct}% and above
              </label>
            ))}
          </div>
        </div>

        {allSizes.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-neutral-900">Size</h2>
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
          <p className="text-sm text-neutral-500">
            {filtered.length === 0
              ? "No products"
              : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}-${Math.min(currentPage * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
          </p>
          <select
            aria-label="Sort products by"
            value={sort}
            onChange={(e) => {
              setPage(1);
              setSort(e.target.value as SortKey);
            }}
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
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {paginated.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            {totalPages > 1 && (
              <nav
                aria-label="Pagination"
                className="mt-8 flex items-center justify-center gap-2"
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                  onClick={() => setPage(Math.max(1, currentPage - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`Page ${n}`}
                    aria-current={n === currentPage ? "page" : undefined}
                    onClick={() => setPage(n)}
                    className={cn(
                      "h-8 min-w-8 rounded-md border px-2 text-sm font-medium",
                      n === currentPage
                        ? "border-rose-600 bg-rose-600 text-white"
                        : "border-neutral-300 text-neutral-700 hover:border-neutral-400"
                    )}
                  >
                    {n}
                  </button>
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === totalPages}
                  aria-label="Next page"
                  onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}
