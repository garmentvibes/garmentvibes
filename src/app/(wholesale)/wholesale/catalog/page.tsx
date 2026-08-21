import { CatalogBrowser } from "@/components/wholesale/catalog-browser";
import { PriceListExportButton } from "@/components/wholesale/price-list-export-button";
import { WHOLESALE_PRODUCTS } from "@/lib/mock/wholesale-products";

export const metadata = {
  title: "Wholesale Catalog",
  description:
    "The full GarmentVibes trade range by category — basics, denim, ethnic wear and fabric, with minimum order quantities and lead times.",
};

export default function WholesaleCatalogPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Full Catalog</h1>
          <p className="mt-1 text-sm text-slate-500">
            {WHOLESALE_PRODUCTS.length} products available for bulk order
          </p>
        </div>
        <PriceListExportButton />
      </div>

      <div className="mt-6">
        <CatalogBrowser products={WHOLESALE_PRODUCTS} />
      </div>
    </div>
  );
}
