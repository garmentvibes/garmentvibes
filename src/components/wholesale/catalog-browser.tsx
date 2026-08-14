"use client";

import { useMemo, useState } from "react";
import { WholesaleProductCard } from "@/components/wholesale/product-card";
import { cn } from "@/lib/utils";
import type { WholesaleCategory, WholesaleProduct } from "@/types/catalog";

const CATEGORY_LABELS: Record<WholesaleCategory, string> = {
  women: "Women",
  men: "Men",
  kids: "Kids",
  unisex: "Unisex",
  fabric: "Fabric",
};

type SortKey = "popularity" | "price-asc" | "price-desc" | "moq-asc" | "lead-time";

const SORT_LABELS: Record<SortKey, string> = {
  popularity: "Popularity",
  "price-asc": "Price: Low to High",
  "price-desc": "Price: High to Low",
  "moq-asc": "Lowest MOQ first",
  "lead-time": "Fastest lead time",
};

export function CatalogBrowser({
  products,
  showCategoryFilter = true,
  initialSubcategory,
}: {
  products: WholesaleProduct[];
  showCategoryFilter?: boolean;
  initialSubcategory?: string;
}) {
  const [sort, setSort] = useState<SortKey>("popularity");
  const [categories, setCategories] = useState<string[]>([]);
  const [maxMoq, setMaxMoq] = useState<number | null>(null);
  const [subcategories, setSubcategories] = useState<string[]>(
    initialSubcategory ? [initialSubcategory] : []
  );

  const allCategories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category))),
    [products]
  );
  const allSubcategories = useMemo(
    () => Array.from(new Set(products.map((p) => p.subcategory))).sort(),
    [products]
  );

  const filtered = useMemo(() => {
    let list = [...products];

    if (categories.length > 0) {
      list = list.filter((p) => categories.includes(p.category));
    }
    if (subcategories.length > 0) {
      list = list.filter((p) => subcategories.includes(p.subcategory));
    }
    if (maxMoq !== null) {
      list = list.filter((p) => p.moq <= maxMoq);
    }

    const bestPrice = (p: WholesaleProduct) => p.priceTiers[p.priceTiers.length - 1].pricePerUnit;

    switch (sort) {
      case "price-asc":
        list.sort((a, b) => bestPrice(a) - bestPrice(b));
        break;
      case "price-desc":
        list.sort((a, b) => bestPrice(b) - bestPrice(a));
        break;
      case "moq-asc":
        list.sort((a, b) => a.moq - b.moq);
        break;
      case "lead-time":
        list.sort((a, b) => a.leadTimeDays - b.leadTimeDays);
        break;
      default:
        break;
    }

    return list;
  }, [products, sort, categories, subcategories, maxMoq]);

  function toggleCategory(cat: string) {
    setCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  function toggleSubcategory(sub: string) {
    setSubcategories((prev) => (prev.includes(sub) ? prev.filter((s) => s !== sub) : [...prev, sub]));
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
      <aside className="space-y-6 md:col-span-1">
        {showCategoryFilter && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Category</h3>
            <div className="space-y-1.5 text-sm text-slate-600">
              {allCategories.map((cat) => (
                <label key={cat} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={categories.includes(cat)}
                    onChange={() => toggleCategory(cat)}
                    className="accent-blue-700"
                  />
                  {CATEGORY_LABELS[cat as WholesaleCategory]}
                </label>
              ))}
            </div>
          </div>
        )}

        {allSubcategories.length > 1 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Product Type</h3>
            <div className="space-y-1.5 text-sm text-slate-600">
              {allSubcategories.map((sub) => (
                <label key={sub} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={subcategories.includes(sub)}
                    onChange={() => toggleSubcategory(sub)}
                    className="accent-blue-700"
                  />
                  {sub}
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Max MOQ</h3>
          <div className="space-y-1.5 text-sm text-slate-600">
            {[60, 120, 240].map((moq) => (
              <label key={moq} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="moq"
                  checked={maxMoq === moq}
                  onChange={() => setMaxMoq(maxMoq === moq ? null : moq)}
                  className="accent-blue-700"
                />
                Up to {moq} units
              </label>
            ))}
          </div>
        </div>
      </aside>

      <div className={cn("md:col-span-3")}>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">{filtered.length} products</p>
          <select
            aria-label="Sort products by"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-700 focus:border-blue-600 focus:outline-none"
          >
            {Object.entries(SORT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                Sort: {label}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="py-16 text-center text-slate-500">No products match these filters.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {filtered.map((product) => (
              <WholesaleProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
