"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, X, IndianRupee, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatPrice } from "@/lib/utils";
import { useReturnsStore } from "@/lib/stores/returns-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { notify } from "@/lib/stores/notification-store";
import {
  RETURN_STATUS_LABELS,
  returnRefundTotal,
  type ReturnRequest,
  type ReturnStatus,
} from "@/types/returns";

type Filter = ReturnStatus | "all";

const STATUS_VARIANT: Record<ReturnStatus, "warning" | "success" | "destructive"> = {
  requested: "warning",
  approved: "warning",
  picked_up: "warning",
  rejected: "destructive",
  refunded: "success",
};

export default function AdminReturnsPage() {
  const mounted = useHasMounted();
  const requests = useReturnsStore((s) => s.requests);
  const setStatus = useReturnsStore((s) => s.setStatus);
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

  function markPickedUp(request: ReturnRequest) {
    setStatus(request.id, "picked_up");
    toast.success(`Return ${request.id} marked as picked up`);
  }

  function refund(request: ReturnRequest) {
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
    toast.success(`Refund of ${formatPrice(returnRefundTotal(request))} initiated`);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-bold text-neutral-900">Returns</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {openCount} awaiting review. The published policy promises a decision within 2 business
        days, and free pickup on anything approved.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {(["requested", "approved", "picked_up", "refunded", "rejected", "all"] as Filter[]).map(
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
                    {request.customerName} &middot; {request.reason}
                  </p>

                  <ul className="mt-2 space-y-0.5 text-xs text-neutral-500">
                    {request.items.map((item, i) => (
                      <li key={`${item.productId}-${i}`}>
                        {item.qty} &times; {item.name} (Size {item.size}, {item.color}) —{" "}
                        {formatPrice(item.qty * item.price)}
                      </li>
                    ))}
                  </ul>

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
                  <p className="text-xs text-neutral-400">refund value</p>

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
                    {request.status === "picked_up" && (
                      <Button size="sm" onClick={() => refund(request)}>
                        <IndianRupee className="mr-1 h-3.5 w-3.5" /> Initiate refund
                      </Button>
                    )}
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
