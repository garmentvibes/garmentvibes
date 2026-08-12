"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatPrice, generateReferenceId } from "@/lib/utils";
import { useWholesaleOrderStore, wholesaleOrderTotals } from "@/lib/stores/wholesale-order-store";

export default function WholesaleOrderReviewPage() {
  const lines = useWholesaleOrderStore((s) => s.lines);
  const removeLine = useWholesaleOrderStore((s) => s.removeLine);
  const clear = useWholesaleOrderStore((s) => s.clear);
  const { totalUnits, totalPrice } = wholesaleOrderTotals(lines);
  const router = useRouter();

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
        <h1 className="text-xl font-bold text-slate-900">Your order is empty</h1>
        <p className="mt-2 text-slate-500">Browse the catalog or use Quick Order to add items.</p>
        <Link href="/wholesale/catalog">
          <Button variant="wholesale" className="mt-6">
            Browse Catalog
          </Button>
        </Link>
      </div>
    );
  }

  function handleSubmit(kind: "quote" | "order") {
    const quoteId = generateReferenceId("GVQ");
    clear();
    if (kind === "quote") {
      toast.success("Quote request sent — our team will follow up shortly");
    } else {
      toast.success("Order placed");
    }
    router.push(`/wholesale/quote-confirmation?ref=${quoteId}&kind=${kind}`);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Review Order ({totalUnits} units)</h1>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {lines.map((line) => (
            <div key={line.productId} className="flex gap-4 rounded-lg border border-slate-200 bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={line.image} alt={line.name} className="h-24 w-20 rounded object-cover" />
              <div className="flex-1">
                <p className="font-mono text-xs text-slate-400">{line.sku}</p>
                <p className="font-medium text-slate-900">{line.name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {line.qty} units &times; {formatPrice(line.pricePerUnit)}
                </p>
                <p className="mt-1 font-semibold text-slate-900">
                  {formatPrice(line.qty * line.pricePerUnit)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeLine(line.productId)}
                className="flex h-fit items-center gap-1 text-sm text-slate-500 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="h-fit rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Order Summary</h2>
          <div className="mt-4 flex justify-between text-sm text-slate-600">
            <span>Total units</span>
            <span>{totalUnits}</span>
          </div>
          <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 font-semibold text-slate-900">
            <span>Estimated total</span>
            <span>{formatPrice(totalPrice)}</span>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Final pricing confirmed on quote. GST and shipping calculated separately.
          </p>
          <Button variant="wholesale" size="lg" className="mt-5 w-full" onClick={() => handleSubmit("quote")}>
            Request Quote
          </Button>
          <Button variant="outline" size="lg" className="mt-2 w-full" onClick={() => handleSubmit("order")}>
            Place Order Directly
          </Button>
        </div>
      </div>
    </div>
  );
}
