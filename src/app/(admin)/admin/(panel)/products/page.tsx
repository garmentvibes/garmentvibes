"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { withdrawRetailProduct } from "@/lib/admin/products/actions";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/utils";
import {
  useAdminCatalogStore,
  useAdminRetailProducts,
  useAdminWholesaleProducts,
} from "@/lib/stores/admin-catalog-store";

type Tab = "retail" | "wholesale";

/**
 * Whether this deployment has a database to withdraw products from.
 *
 * From the inlined public env, as elsewhere in the panel: fixed at build time,
 * and asking would cost a round trip on a page that falls back regardless.
 */
const CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function AdminProductsPage() {
  const [tab, setTab] = useState<Tab>("retail");
  const [query, setQuery] = useState("");

  const retailProducts = useAdminRetailProducts();
  const wholesaleProducts = useAdminWholesaleProducts();
  const deleteRetail = useAdminCatalogStore((s) => s.deleteRetail);
  const deleteWholesale = useAdminCatalogStore((s) => s.deleteWholesale);
  const resetAll = useAdminCatalogStore((s) => s.resetAll);

  const q = query.trim().toLowerCase();
  const visibleRetail = retailProducts.filter((p) =>
    !q ? true : [p.name, p.brand, p.category, p.subcategory].some((f) => f.toLowerCase().includes(q))
  );
  const visibleWholesale = wholesaleProducts.filter((p) =>
    !q ? true : [p.name, p.sku, p.category, p.subcategory].some((f) => f.toLowerCase().includes(q))
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Products</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {retailProducts.length} retail &middot; {wholesaleProducts.length} wholesale
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetAll();
              toast.success("Local catalog edits reset");
            }}
          >
            <RotateCcw className="mr-1.5 h-4 w-4" /> Reset local edits
          </Button>
          <Link href={`/admin/products/${tab}/new`}>
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" /> New {tab} product
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-neutral-200 bg-white p-1">
          {(["retail", "wholesale"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
                tab === t ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <Input
          placeholder="Search products…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 max-w-xs"
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        {tab === "retail" ? (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Brand</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {visibleRetail.map((p) => (
                <tr key={p.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/products/retail/${p.id}`}
                      className="font-medium text-neutral-800 hover:underline"
                    >
                      {p.name}
                    </Link>
                    <p className="text-xs text-neutral-400">{p.subcategory}</p>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{p.brand}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="capitalize">
                      {p.category}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-neutral-800">
                    {formatPrice(p.price)}
                    <span className="ml-1 text-xs text-neutral-400 line-through">
                      {formatPrice(p.mrp)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {p.rating} ({p.ratingCount})
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      // "Withdraw", not "delete". retail_order_items references
                      // retail_products with no ON DELETE clause, so Postgres
                      // refuses to remove a product anything has been ordered
                      // of — and where it would succeed, it takes the reviews,
                      // wishlists and questions with it. is_active = false is
                      // what the storefront already respects.
                      aria-label={`Withdraw ${p.name}`}
                      title="Withdraw from sale"
                      onClick={async () => {
                        if (CONFIGURED) {
                          const result = await withdrawRetailProduct(p.slug);
                          if (result.error) {
                            toast.error(result.error);
                            return;
                          }
                          if (!result.notConfigured) {
                            toast.success(`${p.name} withdrawn from sale`);
                            return;
                          }
                        }

                        deleteRetail(p.id);
                        toast.success(`${p.name} removed`);
                      }}
                      className="text-neutral-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3">SKU / Product</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">MOQ</th>
                <th className="px-4 py-3">Best price</th>
                <th className="px-4 py-3">Lead time</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {visibleWholesale.map((p) => (
                <tr key={p.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs text-neutral-400">{p.sku}</p>
                    <Link
                      href={`/admin/products/wholesale/${p.id}`}
                      className="font-medium text-neutral-800 hover:underline"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="capitalize">
                      {p.category}
                    </Badge>
                    <p className="mt-1 text-xs text-neutral-400">{p.subcategory}</p>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{p.moq}</td>
                  <td className="px-4 py-3 text-neutral-800">
                    {formatPrice(p.priceTiers[p.priceTiers.length - 1].pricePerUnit)}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{p.leadTimeDays}d</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      aria-label={`Delete ${p.name}`}
                      onClick={() => {
                        deleteWholesale(p.id);
                        toast.success(`${p.name} removed`);
                      }}
                      className="text-neutral-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
