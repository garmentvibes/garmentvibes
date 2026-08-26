"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, X, IndianRupee, Truck, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatPrice } from "@/lib/utils";
import { useReturnsStore } from "@/lib/stores/returns-store";
import { useStockStore, getStock } from "@/lib/stores/stock-store";
import { adjustRetailStock } from "@/lib/admin/products/actions";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { notify } from "@/lib/stores/notification-store";
import { notifyRestocked } from "@/lib/notify-restock";
import { useCatalogue } from "@/components/shared/catalogue-provider";
import {
  RETURN_STATUS_LABELS,
  exchangeBalance,
  isRestockable,
  returnRefundTotal,
  type ReturnRequest,
  type ReturnStatus,
} from "@/types/returns";

type Filter = ReturnStatus | "all";

/**
 * Whether this deployment has a database to move stock in.
 *
 * From the inlined public env, like the other admin components: the answer is
 * fixed at build time, and asking would cost a round trip on a page that falls
 * back regardless.
 */
const CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const STATUS_VARIANT: Record<ReturnStatus, "warning" | "success" | "destructive"> = {
  requested: "warning",
  approved: "warning",
  picked_up: "warning",
  rejected: "destructive",
  refunded: "success",
  exchange_shipped: "success",
};

export default function AdminReturnsPage() {
  // Resolves a product id to the product, from the catalogue the panel was
  // given rather than from the mock module — a renamed product should read
  // with its new name here too.
  const catalogue = useCatalogue();
  const productById = (id: string) => catalogue.find((p) => p.id === id);

  const mounted = useHasMounted();
  const requests = useReturnsStore((s) => s.requests);
  const setStatus = useReturnsStore((s) => s.setStatus);
  const increment = useStockStore((s) => s.increment);
  const decrement = useStockStore((s) => s.decrement);
  const stockOverrides = useStockStore((s) => s.overrides);
  const [filter, setFilter] = useState<Filter>("requested");

  if (!mounted) return null;

  const visible = requests.filter((r) => filter === "all" || r.status === filter);
  const openCount = requests.filter((r) => r.status === "requested").length;

  function approve(request: ReturnRequest) {
    setStatus(request.id, "approved", "Approved — free pickup will be arranged.");
    notify({
      templateId: "return_approved",
      recipientName: request.customerName,
      email: request.customerEmail,
      phone: request.phone,
      relatedTo: request.id,
      vars: {
        name: request.customerName,
        orderId: request.orderId,
        amount: formatPrice(returnRefundTotal(request)),
      },
    });
    toast.success(`Return ${request.id} approved — customer notified`);
  }

  function reject(request: ReturnRequest) {
    setStatus(request.id, "rejected", "Rejected after review.");
    notify({
      templateId: "return_rejected",
      recipientName: request.customerName,
      email: request.customerEmail,
      phone: request.phone,
      relatedTo: request.id,
      vars: { name: request.customerName, orderId: request.orderId },
    });
    toast.success(`Return ${request.id} rejected — customer notified`);
  }

  /**
   * The level a variant is at now.
   *
   * Read from the catalogue the panel was handed, which is the database's
   * `stock_qty` wherever there is a database — not from the mock module, which
   * `stockForProductId()` used and which knows nothing about either the
   * catalogue or the shelf. It matters beyond display: "was this at zero
   * before?" is what decides whether back-in-stock alerts fire, and answering
   * it from the wrong source either spams people or silently drops the alert
   * they asked for.
   */
  function currentStock(productId: string, size: string) {
    const product = productById(productId);
    return product ? getStock(stockOverrides, product, size) : 0;
  }

  /**
   * Moves a variant's stock by a delta — positive back onto the shelf, negative
   * off it.
   *
   * Written to both places for the same reason every other admin write is: on a
   * deployment with a database the row is the shelf, and on one without it the
   * store is. The store write is unconditional because it is harmless where it
   * is ignored, and the alternative is a branch that silently does nothing on
   * whichever path is not being tested.
   *
   * Not awaited. These run inside a transition that also sets the return's
   * status and notifies the customer, and holding those up for a round trip
   * would leave the admin looking at an unresponsive button; a failure is
   * reported by toast when it arrives.
   */
  function moveStock(productId: string, size: string, delta: number, before: number) {
    if (delta > 0) increment(productId, size, delta, before);
    else decrement(productId, size, -delta, before);

    if (!CONFIGURED) return;

    // `product.id` is the slug — pinned by a static check, and the reason the
    // action can be addressed by slug at all.
    void adjustRetailStock(productId, size, delta).then((result) => {
      if (result.error) toast.error(result.error);
    });
  }

  /**
   * Puts the returned units back on the shelf, but only when the reason
   * means they are actually sellable — a damaged or poor-quality item must
   * not be quietly re-sold to the next customer.
   *
   * Called once, on the transition that means we physically have the goods
   * back and have accepted them.
   */
  function restockIfSellable(request: ReturnRequest) {
    if (!isRestockable(request.reason)) return 0;
    let restocked = 0;
    for (const item of request.items) {
      const before = currentStock(item.productId, item.size);
      moveStock(item.productId, item.size, item.qty, before);
      restocked += item.qty;
      // Going from zero to available is exactly what people registered for.
      if (before === 0) {
        notifyRestocked(item.productId, item.size, item.name);
      }
    }
    return restocked;
  }

  function markPickedUp(request: ReturnRequest) {
    setStatus(request.id, "picked_up");
    toast.success(`Return ${request.id} marked as picked up`);
  }

  function shipExchange(request: ReturnRequest) {
    // The replacement leaves stock; the original comes back into it if it is
    // still sellable. Both movements belong to this single transition.
    for (const item of request.items) {
      if (!item.exchangeForSize) continue;
      // The replacement may be a different product entirely, so stock comes
      // off whatever is actually being shipped — not off the item returned.
      const outgoingProductId = item.exchangeForProductId ?? item.productId;
      moveStock(
        outgoingProductId,
        item.exchangeForSize,
        -item.qty,
        currentStock(outgoingProductId, item.exchangeForSize)
      );
    }
    const restocked = restockIfSellable(request);

    setStatus(request.id, "exchange_shipped");
    notify({
      templateId: "exchange_shipped",
      recipientName: request.customerName,
      email: request.customerEmail,
      phone: request.phone,
      relatedTo: request.id,
      vars: {
        name: request.customerName,
        orderId: request.orderId,
        replacementSize: request.items.find((i) => i.exchangeForSize)?.exchangeForSize,
      },
    });
    toast.success(
      restocked > 0
        ? `Exchange shipped — ${restocked} unit${restocked === 1 ? "" : "s"} back in stock`
        : "Exchange shipped — returned items not restocked (not sellable)"
    );
  }

  function refund(request: ReturnRequest) {
    const restocked = restockIfSellable(request);
    setStatus(request.id, "refunded");
    notify({
      templateId: "refund_initiated",
      recipientName: request.customerName,
      email: request.customerEmail,
      phone: request.phone,
      relatedTo: request.id,
      vars: {
        name: request.customerName,
        orderId: request.orderId,
        amount: formatPrice(returnRefundTotal(request)),
      },
    });
    toast.success(
      restocked > 0
        ? `Refund of ${formatPrice(returnRefundTotal(request))} initiated — ${restocked} unit${restocked === 1 ? "" : "s"} back in stock`
        : `Refund of ${formatPrice(returnRefundTotal(request))} initiated — not restocked (not sellable)`
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-bold text-neutral-900">Returns</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {openCount} awaiting review. The published policy promises a decision within 2 business
        days, and free pickup on anything approved.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            "requested",
            "approved",
            "picked_up",
            "refunded",
            "exchange_shipped",
            "rejected",
            "all",
          ] as Filter[]
        ).map(
          (f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                filter === f
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 text-neutral-600 hover:border-neutral-400"
              )}
            >
              {f === "all" ? "All" : RETURN_STATUS_LABELS[f]}
            </button>
          )
        )}
      </div>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-neutral-500">No returns match this filter.</p>
      ) : (
        /* The id lets tests count the queue without also matching the
           nested per-item lists inside each card. */
        <ul id="returns-list" className="mt-5 space-y-3">
          {visible.map((request) => (
            <li key={request.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-neutral-900">
                      {request.id}
                    </span>
                    <Badge variant={STATUS_VARIANT[request.status]}>
                      {RETURN_STATUS_LABELS[request.status]}
                    </Badge>
                    <Link
                      href={`/admin/orders/${request.orderId}`}
                      className="font-mono text-xs text-neutral-500 underline hover:text-neutral-800"
                    >
                      {request.orderId}
                    </Link>
                  </div>

                  <p className="mt-1 text-sm text-neutral-700">
                    <span className="font-medium capitalize">{request.resolution}</span> &middot;{" "}
                    {request.customerName} &middot; {request.reason}
                  </p>

                  <ul className="mt-2 space-y-0.5 text-xs text-neutral-500">
                    {request.items.map((item, i) => (
                      <li key={`${item.productId}-${i}`}>
                        {item.qty} &times; {item.name} (Size {item.size}, {item.color})
                        {item.exchangeForSize
                          ? ` → ${
                              item.exchangeForProductId &&
                              item.exchangeForProductId !== item.productId
                                ? `${productById(item.exchangeForProductId)?.name ?? "another item"}, `
                                : ""
                            }size ${item.exchangeForSize}`
                          : ""}{" "}
                        — {formatPrice(item.qty * item.price)}
                      </li>
                    ))}
                  </ul>

                  {/* Staff need to know before acting whether these units
                      will come back into sellable stock. */}
                  {!isRestockable(request.reason) && (
                    <p className="mt-1.5 text-xs text-amber-700">
                      Not restocked on completion — {request.reason.toLowerCase()} means the unit
                      isn&apos;t resellable.
                    </p>
                  )}

                  {request.comments && (
                    <p className="mt-2 rounded bg-neutral-50 p-2 text-xs italic text-neutral-600">
                      &ldquo;{request.comments}&rdquo;
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-neutral-900">
                    {formatPrice(returnRefundTotal(request))}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {request.resolution === "exchange" ? "value exchanged" : "refund value"}
                  </p>
                  {/* Staff need to know whether money still has to move. */}
                  {request.resolution === "exchange" && exchangeBalance(request) !== 0 && (
                    <p className="mt-0.5 text-xs font-medium text-amber-700">
                      {exchangeBalance(request) > 0
                        ? `${formatPrice(exchangeBalance(request))} to collect`
                        : `${formatPrice(Math.abs(exchangeBalance(request)))} to refund`}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    {request.status === "requested" && (
                      <>
                        <Button size="sm" onClick={() => approve(request)}>
                          <Check className="mr-1 h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => reject(request)}>
                          <X className="mr-1 h-3.5 w-3.5" /> Reject
                        </Button>
                      </>
                    )}
                    {request.status === "approved" && (
                      <Button size="sm" variant="outline" onClick={() => markPickedUp(request)}>
                        <Truck className="mr-1 h-3.5 w-3.5" /> Mark picked up
                      </Button>
                    )}
                    {request.status === "picked_up" &&
                      (request.resolution === "exchange" ? (
                        <Button size="sm" onClick={() => shipExchange(request)}>
                          <Repeat className="mr-1 h-3.5 w-3.5" /> Ship exchange
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => refund(request)}>
                          <IndianRupee className="mr-1 h-3.5 w-3.5" /> Initiate refund
                        </Button>
                      ))}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
