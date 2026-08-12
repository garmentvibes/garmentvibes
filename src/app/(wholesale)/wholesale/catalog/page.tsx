import { CatalogBrowser } from "@/components/wholesale/catalog-browser";
import { WHOLESALE_PRODUCTS } from "@/lib/mock/wholesale-products";

export const metadata = { title: "Wholesale Catalog" };

export default function WholesaleCatalogPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Full Catalog</h1>
      <p className="mt-1 text-sm text-slate-500">{WHOLESALE_PRODUCTS.length} products available for bulk order</p>

      <div className="mt-6">
        <CatalogBrowser products={WHOLESALE_PRODUCTS} />
      </div>
    </div>
  );
}
