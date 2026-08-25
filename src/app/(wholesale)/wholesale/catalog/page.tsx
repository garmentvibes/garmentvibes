import { CatalogBrowser } from "@/components/wholesale/catalog-browser";
import { PriceListExportButton } from "@/components/wholesale/price-list-export-button";
import { getWholesaleCatalogue } from "@/lib/catalogue/wholesale";

// See the note in wholesale/product/[slug]/page.tsx: the catalogue is read at
// build time and at revalidation, not per request.
export const revalidate = 3600;

export const metadata = {
  title: "Wholesale Catalog",
  description:
    "The full GarmentVibes trade range by category — basics, denim, ethnic wear and fabric, with minimum order quantities and lead times.",
};

export default async function WholesaleCatalogPage() {
  const catalogue = await getWholesaleCatalogue();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Full Catalog</h1>
          <p className="mt-1 text-sm text-slate-500">
            {catalogue.length} products available for bulk order
          </p>
        </div>
        <PriceListExportButton />
      </div>

      <div className="mt-6">
        <CatalogBrowser products={catalogue} />
      </div>
    </div>
  );
}
