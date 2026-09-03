"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { useWholesaleOrderStore } from "@/lib/stores/wholesale-order-store";
import { wholesalePriceForQty, type WholesaleProduct } from "@/types/catalog";

export function AddToOrderPanel({ product }: { product: WholesaleProduct }) {
  const [qty, setQty] = useState(product.moq);
  const upsertLine = useWholesaleOrderStore((s) => s.upsertLine);
  const router = useRouter();

  const unitPrice = wholesalePriceForQty(product, qty);
  const lineTotal = unitPrice * qty;

  function changeQty(delta: number) {
    setQty((prev) => Math.max(product.moq, prev + delta * product.packSize));
  }

  function handleAddToOrder() {
    upsertLine({
      productId: product.id,
      sku: product.sku,
      slug: product.slug,
      name: product.name,
      image: product.images[0],
      pricePerUnit: unitPrice,
      currency: product.currency,
      qty,
      packSize: product.packSize,
      moq: product.moq,
    });
    toast.success(`${qty} units added to order`);
  }

  function handleRequestQuote() {
    handleAddToOrder();
    router.push("/wholesale/order");
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Quantity</th>
              <th className="px-3 py-2">Price / unit</th>
            </tr>
          </thead>
          <tbody>
            {product.priceTiers.map((tier, i) => {
              const next = product.priceTiers[i + 1];
              const range = next ? `${tier.minQty} - ${next.minQty - 1}` : `${tier.minQty}+`;
              const active = unitPrice === tier.pricePerUnit;
              return (
                <tr key={tier.minQty} className={active ? "bg-blue-50" : ""}>
                  <td className="px-3 py-2 text-slate-700">{range} units</td>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {formatPrice(tier.pricePerUnit)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">
          Quantity <span className="text-slate-500">(multiples of {product.packSize}, MOQ {product.moq})</span>
        </p>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-md border border-slate-300">
            <button
              type="button"
              className="p-2 hover:bg-slate-50"
              onClick={() => changeQty(-1)}
              aria-label="Decrease quantity"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-16 text-center font-medium">{qty}</span>
            <button
              type="button"
              className="p-2 hover:bg-slate-50"
              onClick={() => changeQty(1)}
              aria-label="Increase quantity"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <span className="text-sm text-slate-500">
            = {formatPrice(lineTotal)} total ({formatPrice(unitPrice)}/unit)
          </span>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="wholesale" size="lg" className="flex-1" onClick={handleAddToOrder}>
          Add to Order
        </Button>
        <Button variant="outline" size="lg" className="flex-1" onClick={handleRequestQuote}>
          Request Quote
        </Button>
      </div>
    </div>
  );
}
