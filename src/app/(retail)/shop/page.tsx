import Link from "next/link";
import { ProductCard } from "@/components/retail/product-card";
import { RecentlyViewedRail } from "@/components/retail/recently-viewed-rail";
import { getRetailCatalogue } from "@/lib/catalogue/retail";

// See the note in shop/product/[slug]/page.tsx: the catalogue is read at build
// time and at revalidation, not per request, and admin writes publish an edit
// immediately with revalidatePath().
export const revalidate = 3600;

export const metadata = {
  title: "Shop Fashion Online",
  description:
    "Browse women's, men's and kids' clothing at GarmentVibes — kurtas, tees, denim and more, with free returns within 7 days.",
};

const CATEGORY_TILES = [
  { href: "/shop/women", label: "Women", from: "from-rose-500", to: "to-rose-700" },
  { href: "/shop/men", label: "Men", from: "from-neutral-700", to: "to-neutral-900" },
  { href: "/shop/kids", label: "Kids", from: "from-amber-500", to: "to-orange-600" },
];

export default async function ShopHomePage() {
  const catalogue = await getRetailCatalogue();
  const bestsellers = catalogue.filter((p) => p.tags?.includes("bestseller"));
  const newArrivals = catalogue.filter((p) => p.tags?.includes("new"));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-rose-600 to-rose-800 px-6 py-14 text-white sm:px-12">
        <p className="text-sm font-medium uppercase tracking-wide text-rose-100">New Season</p>
        <h1 className="mt-2 max-w-lg text-3xl font-bold sm:text-4xl">
          Fashion that keeps up with your vibe
        </h1>
        <p className="mt-3 max-w-md text-rose-50/90">
          Shop the latest drops across women&apos;s, men&apos;s and kids&apos; fashion — new arrivals every week.
        </p>
        <Link
          href="/shop/women"
          className="mt-6 inline-block rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"
        >
          Shop Now
        </Link>
      </section>

      <section className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CATEGORY_TILES.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className={`flex h-32 items-end rounded-xl bg-gradient-to-br ${tile.from} ${tile.to} p-4 text-xl font-bold text-white transition-transform hover:scale-[1.02]`}
          >
            {tile.label}
          </Link>
        ))}
      </section>

      {newArrivals.length > 0 && (
        <section className="mt-14">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-neutral-900">New Arrivals</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {newArrivals.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {bestsellers.length > 0 && (
        <section className="mt-14 mb-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-neutral-900">Bestsellers</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {bestsellers.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      <RecentlyViewedRail />
    </div>
  );
}
