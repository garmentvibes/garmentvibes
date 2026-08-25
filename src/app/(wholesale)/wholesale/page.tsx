import Link from "next/link";
import { WholesaleProductCard } from "@/components/wholesale/product-card";
import { getWholesaleCatalogue } from "@/lib/catalogue/wholesale";

// See the note in wholesale/product/[slug]/page.tsx: the catalogue is read at
// build time and at revalidation, not per request.
export const revalidate = 3600;

export const metadata = {
  title: "Wholesale Apparel Sourcing",
  description:
    "Source apparel in bulk from GarmentVibes: quantity-break pricing, ready size runs and Net-30 terms for approved trade accounts.",
};

const CATEGORY_TILES = [
  { href: "/wholesale/catalog/women", label: "Women" },
  { href: "/wholesale/catalog/men", label: "Men" },
  { href: "/wholesale/catalog/kids", label: "Kids" },
  { href: "/wholesale/catalog/fabric", label: "Fabric" },
];

export default async function WholesaleHomePage() {
  const catalogue = await getWholesaleCatalogue();
  const bestsellers = catalogue.filter((p) => p.tags?.includes("bestseller"));
  const newArrivals = catalogue.filter((p) => p.tags?.includes("new"));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-blue-700 to-blue-950 px-6 py-14 text-white sm:px-12">
        <p className="text-sm font-medium uppercase tracking-wide text-blue-200">For Retailers</p>
        <h1 className="mt-2 max-w-lg text-3xl font-bold sm:text-4xl">
          Source apparel in bulk, at wholesale prices
        </h1>
        <p className="mt-3 max-w-md text-blue-50/90">
          Tiered pricing, low MOQs, and fast turnaround for boutiques, resellers and retail chains.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/wholesale/catalog"
            className="inline-block rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-50"
          >
            Browse Catalog
          </Link>
          <Link
            href="/wholesale/quick-order"
            className="inline-block rounded-full border border-white/40 px-6 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
          >
            Quick Order by SKU
          </Link>
        </div>
      </section>

      <section className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {CATEGORY_TILES.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="flex h-24 items-end rounded-xl border border-slate-200 bg-white p-4 text-base font-semibold text-slate-800 shadow-sm transition-transform hover:scale-[1.02]"
          >
            {tile.label}
          </Link>
        ))}
      </section>

      {newArrivals.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-4 text-xl font-bold text-slate-900">New Arrivals</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {newArrivals.map((product) => (
              <WholesaleProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {bestsellers.length > 0 && (
        <section className="mt-14 mb-4">
          <h2 className="mb-4 text-xl font-bold text-slate-900">Bestsellers</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {bestsellers.map((product) => (
              <WholesaleProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
