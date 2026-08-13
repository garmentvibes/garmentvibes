import Link from "next/link";
import { WHOLESALE_TAXONOMY, WHOLESALE_CATEGORY_LABELS } from "@/lib/mock/wholesale-taxonomy";
import type { WholesaleCategory } from "@/types/catalog";

const CATEGORIES: WholesaleCategory[] = ["women", "men", "kids", "unisex", "fabric"];

export function WholesaleMegaMenu() {
  return (
    <div className="group relative">
      <Link
        href="/wholesale/catalog"
        className="block rounded-md px-3 py-2 text-slate-300 hover:text-white group-hover:text-white"
      >
        Catalog
      </Link>

      <div className="invisible absolute left-0 top-full z-50 flex gap-8 rounded-lg border border-slate-200 bg-white p-6 opacity-0 shadow-lg transition-opacity duration-150 group-hover:visible group-hover:opacity-100">
        {CATEGORIES.map((category) => (
          <div key={category} className="min-w-40">
            <Link
              href={`/wholesale/catalog/${category}`}
              className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-blue-700"
            >
              {WHOLESALE_CATEGORY_LABELS[category]}
            </Link>
            <ul className="space-y-1.5">
              {WHOLESALE_TAXONOMY[category].flatMap((dept) =>
                dept.subcategories.map((sub) => (
                  <li key={sub}>
                    <Link
                      href={`/wholesale/catalog/${category}?subcategory=${encodeURIComponent(sub)}`}
                      className="whitespace-nowrap text-sm text-slate-600 hover:text-blue-700"
                    >
                      {sub}
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
