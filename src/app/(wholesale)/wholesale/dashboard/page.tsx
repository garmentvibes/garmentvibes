"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { useWholesaleCatalogue } from "@/components/shared/catalogue-provider";
import { useWholesaleOrderStore } from "@/lib/stores/wholesale-order-store";
import { useWholesaleQuotes } from "@/lib/stores/admin-orders-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { courierById, trackingUrlFor } from "@/lib/couriers";
import { wholesalePriceForQty } from "@/types/catalog";
import {
  WHOLESALE_QUOTE_STATUS_LABELS,
  wholesaleQuoteTotal,
  wholesaleQuoteUnits,
  type WholesaleQuote,
  type WholesaleQuoteStatus,
} from "@/types/admin";

// Reads the same source as the admin quote list, so a status change or a
// tracking number entered by staff shows up here immediately. This page used
// to keep its own MOCK_ORDERS array, which meant the buyer and the office
// were looking at different data.

const STATUS_VARIANT: Record<WholesaleQuoteStatus, "wholesale" | "warning" | "success" | "destructive"> = {
  requested: "warning",
  quoted: "warning",
  confirmed: "wholesale",
  in_production: "wholesale",
  shipped: "warning",
  fulfilled: "success",
  rejected: "destructive",
};

type StatusFilter = WholesaleQuoteStatus | "all";

const FILTERS: StatusFilter[] = ["all", "quoted", "confirmed", "in_production", "shipped", "fulfilled"];

export default function WholesaleDashboardPage() {
  const mounted = useHasMounted();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const upsertLine = useWholesaleOrderStore((s) => s.upsertLine);
  const quotes = useWholesaleQuotes();
  // Above the early return below — a hook after one runs in some renders and
  // not others.
  const catalogue = useWholesaleCatalogue();

  if (!mounted) return null;

  const visible = quotes.filter((q) => filter === "all" || q.status === filter);

  function handleReorder(quote: WholesaleQuote) {
    let added = 0;
    for (const item of quote.items) {
      const product = catalogue.find((p) => p.sku === item.sku);
      if (!product) continue;
      upsertLine({
        productId: product.id,
        sku: product.sku,
        slug: product.slug,
        name: product.name,
        image: product.images[0],
        pricePerUnit: wholesalePriceForQty(product, item.qty),
        currency: product.currency,
        qty: item.qty,
        packSize: product.packSize,
        moq: product.moq,
      });
      added++;
    }
    toast.success(`${added} item(s) from ${quote.id} added to your order`);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Account Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">
        Your quotes and bulk orders, with live status and consignment tracking.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filter === status
                ? "border-blue-700 bg-blue-700 text-white"
                : "border-slate-300 text-slate-600 hover:border-slate-400"
            }`}
          >
            {status === "all" ? "All" : WHOLESALE_QUOTE_STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {visible.map((quote) => {
          const trackingUrl = trackingUrlFor(quote.shipment?.courierId, quote.shipment?.awb);
          return (
            <div
              key={quote.id}
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">{quote.id}</span>
                    <Badge variant={STATUS_VARIANT[quote.status]}>
                      {WHOLESALE_QUOTE_STATUS_LABELS[quote.status]}
                    </Badge>
                    <span className="text-xs capitalize text-slate-400">{quote.kind}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">
                    {quote.requestedAt} &middot; {wholesaleQuoteUnits(quote)} units &middot;{" "}
                    {formatPrice(wholesaleQuoteTotal(quote))}
                    <span className="ml-1 text-xs text-slate-400">+ GST</span>
                  </p>

                  {quote.shipment && (
                    <p className="mt-1.5 text-xs text-slate-500">
                      {courierById(quote.shipment.courierId)?.name ?? "Courier"} &middot;{" "}
                      <span className="font-mono">{quote.shipment.awb}</span>
                      {trackingUrl && (
                        <>
                          {" "}
                          &middot;{" "}
                          <a
                            href={trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-700 underline"
                          >
                            Track consignment
                          </a>
                        </>
                      )}
                    </p>
                  )}

                  {quote.deliveredAt && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      Received {quote.deliveredAt}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {quote.status === "fulfilled" && (
                    <Link href={`/wholesale/orders/${quote.id}/claim`}>
                      <Button variant="outline" size="sm">
                        Raise a claim
                      </Button>
                    </Link>
                  )}
                  <Button variant="outline" size="sm" onClick={() => handleReorder(quote)}>
                    Reorder
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {visible.length === 0 && (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          No orders with this status.
        </p>
      )}
    </div>
  );
}
