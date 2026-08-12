"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { WHOLESALE_PRODUCTS } from "@/lib/mock/wholesale-products";
import { useWholesaleOrderStore } from "@/lib/stores/wholesale-order-store";
import { wholesalePriceForQty } from "@/types/catalog";

export default function QuickOrderPage() {
  const [qtyBySku, setQtyBySku] = useState<Record<string, number>>({});
  const upsertLine = useWholesaleOrderStore((s) => s.upsertLine);

  function addAll() {
    let added = 0;
    for (const product of WHOLESALE_PRODUCTS) {
      const qty = qtyBySku[product.sku] ?? 0;
      if (qty >= product.moq) {
        upsertLine({
          productId: product.id,
          sku: product.sku,
          slug: product.slug,
          name: product.name,
          image: product.images[0],
          pricePerUnit: wholesalePriceForQty(product, qty),
          currency: product.currency,
          qty,
          packSize: product.packSize,
          moq: product.moq,
        });
        added++;
      }
    }
    if (added === 0) {
      toast.error("Enter a quantity that meets the MOQ for at least one item");
    } else {
      toast.success(`${added} item(s) added to your order`);
      setQtyBySku({});
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quick Order</h1>
          <p className="mt-1 text-sm text-slate-500">Enter quantities by SKU and add them all at once.</p>
        </div>
        <Link href="/wholesale/order">
          <Button variant="outline">Review Order</Button>
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">MOQ</th>
              <th className="px-4 py-3">Best price/unit</th>
              <th className="px-4 py-3">Quantity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {WHOLESALE_PRODUCTS.map((product) => {
              const qty = qtyBySku[product.sku] ?? 0;
              const bestTier = product.priceTiers[product.priceTiers.length - 1];
              return (
                <tr key={product.sku}>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">
                    {product.sku}
                  </td>
                  <td className="px-4 py-3 text-slate-800">{product.name}</td>
                  <td className="px-4 py-3 text-slate-500">{product.moq}</td>
                  <td className="px-4 py-3 text-slate-800">{formatPrice(bestTier.pricePerUnit)}</td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={0}
                      step={product.packSize}
                      value={qty || ""}
                      placeholder="0"
                      onChange={(e) =>
                        setQtyBySku((prev) => ({
                          ...prev,
                          [product.sku]: Number(e.target.value) || 0,
                        }))
                      }
                      className="h-9 w-24 rounded-md border border-slate-300 px-2 text-sm focus:border-blue-600 focus:outline-none"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Button variant="wholesale" size="lg" className="mt-6" onClick={addAll}>
        Add Selected Items to Order
      </Button>
    </div>
  );
}
