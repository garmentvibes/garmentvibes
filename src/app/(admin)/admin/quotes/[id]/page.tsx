"use client";

import { use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Building2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { useAdminOrdersStore, useWholesaleQuote } from "@/lib/stores/admin-orders-store";
import { notify } from "@/lib/stores/notification-store";
import {
  WHOLESALE_QUOTE_STATUSES,
  WHOLESALE_QUOTE_STATUS_LABELS,
  wholesaleQuoteTotal,
  wholesaleQuoteUnits,
  type WholesaleQuoteStatus,
} from "@/types/admin";

export default function AdminQuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const quote = useWholesaleQuote(id);
  const setQuoteStatus = useAdminOrdersStore((s) => s.setQuoteStatus);

  if (!quote) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center">
        <p className="text-neutral-500">Quote not found.</p>
        <Link href="/admin/quotes" className="mt-4 inline-block text-sm underline">
          Back to quotes
        </Link>
      </div>
    );
  }

  function updateStatus(status: WholesaleQuoteStatus) {
    setQuoteStatus(id, status);

    // "quoted" is the one transition the buyer is actively waiting on.
    if (status === "quoted" && quote) {
      const queued = notify({
        templateId: "quote_ready",
        recipientName: quote.contactName,
        email: quote.email,
        relatedTo: quote.id,
        vars: {
          name: quote.contactName,
          orderId: quote.id,
          amount: formatPrice(wholesaleQuoteTotal(quote)),
          businessName: quote.businessName,
        },
      });
      toast.success(
        `Marked as Quoted — ${queued.length} notification${queued.length === 1 ? "" : "s"} queued`
      );
      return;
    }

    toast.success(`Marked as ${WHOLESALE_QUOTE_STATUS_LABELS[status]}`);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/admin/quotes"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800"
      >
        <ArrowLeft className="h-4 w-4" /> Back to quotes
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-bold text-neutral-900">{quote.id}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {quote.kind === "quote" ? "Quote request" : "Direct order"} &middot; {quote.requestedAt}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{WHOLESALE_QUOTE_STATUS_LABELS[quote.status]}</Badge>
          <Link href={`/admin/quotes/${quote.id}/invoice`}>
            <Button variant="outline" size="sm">
              <FileText className="mr-1.5 h-4 w-4" /> Tax invoice
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-neutral-900">Requested items</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-neutral-400">
                <tr>
                  <th className="pb-2">SKU / Product</th>
                  <th className="pb-2">Units</th>
                  <th className="pb-2">Unit price</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {quote.items.map((item) => (
                  <tr key={item.productId}>
                    <td className="py-2.5">
                      <p className="font-mono text-xs text-neutral-400">{item.sku}</p>
                      <p className="text-neutral-800">{item.name}</p>
                    </td>
                    <td className="py-2.5 text-neutral-600">{item.qty}</td>
                    <td className="py-2.5 text-neutral-600">{formatPrice(item.pricePerUnit)}</td>
                    <td className="py-2.5 text-right font-medium text-neutral-900">
                      {formatPrice(item.qty * item.pricePerUnit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex justify-between border-t border-neutral-200 pt-3 text-sm text-neutral-600">
              <span>Total units</span>
              <span>{wholesaleQuoteUnits(quote)}</span>
            </div>
            <div className="mt-1 flex justify-between font-semibold text-neutral-900">
              <span>Estimated total</span>
              <span>{formatPrice(wholesaleQuoteTotal(quote))}</span>
            </div>
            <p className="mt-2 text-xs text-neutral-400">
              Indicative at catalog tier pricing. GST and freight are quoted separately.
            </p>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-neutral-900">Update status</h2>
            <div className="flex flex-wrap gap-2">
              {WHOLESALE_QUOTE_STATUSES.map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={status === quote.status ? "default" : "outline"}
                  onClick={() => updateStatus(status)}
                >
                  {WHOLESALE_QUOTE_STATUS_LABELS[status]}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-neutral-900">
            <Building2 className="h-4 w-4 text-neutral-400" /> Business
          </h2>
          <p className="text-sm font-medium text-neutral-800">{quote.businessName}</p>
          <p className="text-sm text-neutral-500">{quote.contactName}</p>
          <p className="text-sm text-neutral-500">{quote.email}</p>
          <Link
            href="/admin/accounts"
            className="mt-3 inline-block text-xs text-neutral-500 underline underline-offset-4 hover:text-neutral-800"
          >
            View account &amp; terms
          </Link>
        </div>
      </div>
    </div>
  );
}
