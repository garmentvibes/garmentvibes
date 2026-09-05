import Link from "next/link";
import { RETAIL_TAXONOMY, CATEGORY_LABELS } from "@/lib/mock/category-taxonomy";
import type { RetailCategory } from "@/types/catalog";

const CATEGORIES: RetailCategory[] = ["women", "men", "kids"];

export function MegaMenu() {
  return (
    <nav className="hidden gap-1 text-sm font-medium text-neutral-700 sm:flex">
      {CATEGORIES.map((category) => (
        <div key={category} className="group relative">
          <Link
            href={`/shop/${category}`}
            className="block rounded-md px-3 py-2 hover:text-rose-700 group-hover:text-rose-700"
          >
            {CATEGORY_LABELS[category]}
          </Link>

          {/* `hidden`, not `invisible`. visibility:hidden keeps the element in
              the layout, and this panel is ~720px wide — so on a tablet in
              portrait it pushed the document to 962px and every retail page
              scrolled sideways, with nothing visible to explain why.
              display:none takes it out of the flow entirely. The cost is the
              opacity fade, which is not worth a horizontal scrollbar. */}
          <div className="absolute left-0 top-full z-50 hidden gap-8 rounded-lg border border-neutral-200 bg-white p-6 shadow-lg group-hover:flex">
            {RETAIL_TAXONOMY[category].map((dept) => (
              <div key={dept.label} className="min-w-36">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {dept.label}
                </p>
                <ul className="space-y-1.5">
                  {dept.subcategories.map((sub) => (
                    <li key={sub}>
                      <Link
                        href={`/shop/${category}?subcategory=${encodeURIComponent(sub)}`}
                        className="whitespace-nowrap text-neutral-600 hover:text-rose-700"
                      >
                        {sub}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
