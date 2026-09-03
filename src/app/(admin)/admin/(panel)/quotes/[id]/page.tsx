"use client";

import { use, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Building2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { useAdminOrdersStore } from "@/lib/stores/admin-orders-store";
import { useAdminQuote } from "@/lib/hooks/use-admin-quotes";
import { setWholesaleQuoteStatus, setWholesaleShipment } from "@/lib/admin/quotes/actions";
import { notify } from "@/lib/stores/notification-store";
import { COURIERS, trackingUrlFor } from "@/lib/couriers";
import { checkAwb } from "@/lib/shipping/awb";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  WHOLESALE_QUOTE_STATUSES,
  WHOLESALE_QUOTE_STATUS_LABELS,
  wholesaleQuoteTotal,
  wholesaleQuoteUnits,
  type WholesaleQuoteStatus,
} from "@/types/admin";

export default function AdminQuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { quote, loaded, live, refresh } = useAdminQuote(id);
  const setQuoteStatus = useAdminOrdersStore((s) => s.setQuoteStatus);
  const setQuoteShipment = useAdminOrdersStore((s) => s.setQuoteShipment);
  const [courierId, setCourierId] = useState(quote?.shipment?.courierId ?? COURIERS[0].id);
  const [awb, setAwb] = useState(quote?.shipment?.awb ?? "");

  // A "not found" while the answer is in flight sends staff back to the list
  // for a quote that is about to appear.
  if (!loaded) {
    return <div className="mx-auto max-w-3xl py-16 text-center text-neutral-500">Loading quote…</div>;
  }

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

  async function updateStatus(status: WholesaleQuoteStatus) {
    // The database first, where there is one: it sets the status, stamps the
    // date bulk claims run from, and queues the buyer's message from the row
    // it actually wrote.
    if (live) {
      const result = await setWholesaleQuoteStatus(id, status);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      refresh();
      toast.success(`Marked as ${WHOLESALE_QUOTE_STATUS_LABELS[status]}`);
      return;
    }

    // No database: the store is the quote book and the browser outbox is the
    // queue, which is what every QA suite here exercises.
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

    // Shipping a consignment is the other transition the buyer acts on —
    // they need to know to check it against the packing list on arrival.
    if (status === "shipped" && quote) {
      notify({
        templateId: "bulk_order_shipped",
        recipientName: quote.contactName,
        email: quote.email,
        relatedTo: quote.id,
        vars: {
          name: quote.contactName,
          orderId: quote.id,
          businessName: quote.businessName,
          trackingUrl: trackingUrlFor(quote.shipment?.courierId, quote.shipment?.awb) ?? undefined,
        },
      });
      toast.success("Marked as Shipped — buyer notified");
      return;
    }

    toast.success(`Marked as ${WHOLESALE_QUOTE_STATUS_LABELS[status]}`);
  }

  async function saveShipment() {
    // Same guard as the retail side — see the note there.
    const checked = checkAwb(courierId, awb);
    if (!checked.valid) {
      toast.error(checked.error);
      return;
    }

    if (live) {
      const result = await setWholesaleShipment(id, courierId, checked.normalised);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setAwb(checked.normalised);
      refresh();
      toast.success("Tracking saved — it now appears on the buyer's order");
      return;
    }

    setQuoteShipment(id, courierId, checked.normalised);
    setAwb(checked.normalised);
    toast.success("Tracking saved — it now appears on the buyer's order");
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
              <thead className="text-left text-xs uppercase text-neutral-500">
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
                      <p className="font-mono text-xs text-neutral-500">{item.sku}</p>
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
            <p className="mt-2 text-xs text-neutral-500">
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

          {/* Enter tracking before marking the consignment shipped, so the
              buyer's notification carries a working link. */}
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-neutral-900">Consignment tracking</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,12rem)_1fr_auto] sm:items-end">
              <div>
                <Label htmlFor="courier">Courier</Label>
                <select
                  id="courier"
                  value={courierId}
                  onChange={(e) => setCourierId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                >
                  {COURIERS.map((courier) => (
                    <option key={courier.id} value={courier.id}>
                      {courier.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="awb">AWB / LR number</Label>
                <Input
                  id="awb"
                  value={awb}
                  onChange={(e) => setAwb(e.target.value)}
                  placeholder="e.g. 1234567890"
                  className="mt-1"
                />
              </div>
              <Button size="sm" onClick={saveShipment}>
                Save tracking
              </Button>
            </div>

            {quote.shipment && (
              <p className="mt-3 text-xs text-neutral-500">
                Shipped {quote.shipment.shippedAt} &middot;{" "}
                <a
                  href={trackingUrlFor(quote.shipment.courierId, quote.shipment.awb) ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-neutral-800"
                >
                  Track {quote.shipment.awb}
                </a>
              </p>
            )}
            {quote.deliveredAt && (
              <p className="mt-1 text-xs text-neutral-500">
                Received {quote.deliveredAt} — claims window runs from this date
              </p>
            )}
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
