"use client";

import { use, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Circle,
  FileText,
  MapPin,
  Truck,
  Wallet,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatPrice } from "@/lib/utils";
import { useAdminOrdersStore, useRetailOrder } from "@/lib/stores/admin-orders-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { retailOrderTotal, type RetailOrderStatus } from "@/types/admin";

// The customer-visible journey. "packed" is folded into Processing, and
// "cancelled" is handled separately rather than as a step.
const TIMELINE: { status: RetailOrderStatus; label: string; description: string }[] = [
  { status: "pending", label: "Order placed", description: "We've received your order" },
  { status: "confirmed", label: "Confirmed", description: "Payment confirmed, preparing your order" },
  { status: "packed", label: "Packed", description: "Your order is packed and ready to ship" },
  { status: "shipped", label: "Shipped", description: "On its way to you" },
  { status: "delivered", label: "Delivered", description: "Order delivered" },
];

// Cancellation is self-service only until the order leaves the warehouse.
const CANCELLABLE: RetailOrderStatus[] = ["pending", "confirmed", "packed"];

export default function CustomerOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const mounted = useHasMounted();
  const order = useRetailOrder(id);
  const setRetailStatus = useAdminOrdersStore((s) => s.setRetailStatus);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  if (!mounted) return null;

  if (!order) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <p className="text-neutral-500">Order not found.</p>
        <Link href="/shop/orders" className="mt-4 inline-block text-sm text-rose-600 underline">
          Back to my orders
        </Link>
      </div>
    );
  }

  const isCancelled = order.status === "cancelled";
  const canCancel = CANCELLABLE.includes(order.status);
  const currentStep = TIMELINE.findIndex((s) => s.status === order.status);

  function cancelOrder() {
    setRetailStatus(id, "cancelled");
    setConfirmingCancel(false);
    toast.success("Order cancelled — any payment will be refunded per our refund policy");
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link
        href="/shop/orders"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-rose-600"
      >
        <ArrowLeft className="h-4 w-4" /> Back to my orders
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-bold text-neutral-900">{order.id}</h1>
          <p className="mt-1 text-sm text-neutral-500">Placed on {order.placedAt}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/shop/orders/${order.id}/invoice`}>
            <Button variant="outline" size="sm">
              <FileText className="mr-1.5 h-4 w-4" /> Invoice
            </Button>
          </Link>
          {canCancel && !confirmingCancel && (
            <Button variant="outline" size="sm" onClick={() => setConfirmingCancel(true)}>
              Cancel order
            </Button>
          )}
        </div>
      </div>

      {confirmingCancel && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-900">Cancel this order?</p>
          <p className="mt-1 text-sm text-red-800">
            This can&apos;t be undone. If you&apos;ve already paid, the refund is processed per our{" "}
            <Link href="/shop/refund-policy" className="underline">
              refund policy
            </Link>
            .
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="destructive" size="sm" onClick={cancelOrder}>
              Yes, cancel order
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmingCancel(false)}>
              Keep order
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Timeline */}
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="mb-4 font-semibold text-neutral-900">Order status</h2>

            {isCancelled ? (
              <div className="flex items-center gap-3 rounded-md bg-red-50 p-4">
                <XCircle className="h-5 w-5 shrink-0 text-red-600" />
                <div>
                  <p className="text-sm font-medium text-red-900">Order cancelled</p>
                  <p className="text-sm text-red-800">
                    Any payment made will be refunded to the original payment method.
                  </p>
                </div>
              </div>
            ) : (
              <ol className="space-y-0">
                {TIMELINE.map((step, i) => {
                  const done = i <= currentStep;
                  const isCurrent = i === currentStep;
                  const isLast = i === TIMELINE.length - 1;
                  return (
                    <li key={step.status} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                            done ? "border-green-600 bg-green-600" : "border-neutral-300 bg-white"
                          )}
                        >
                          {done ? (
                            <Check className="h-3.5 w-3.5 text-white" />
                          ) : (
                            <Circle className="h-2 w-2 fill-neutral-300 text-neutral-300" />
                          )}
                        </span>
                        {!isLast && (
                          <span
                            className={cn(
                              "w-0.5 flex-1",
                              i < currentStep ? "bg-green-600" : "bg-neutral-200"
                            )}
                          />
                        )}
                      </div>
                      <div className={cn("pb-6", isLast && "pb-0")}>
                        <p
                          className={cn(
                            "text-sm font-medium",
                            done ? "text-neutral-900" : "text-neutral-400"
                          )}
                        >
                          {step.label}
                          {isCurrent && (
                            <Badge variant="retail" className="ml-2">
                              Current
                            </Badge>
                          )}
                        </p>
                        <p className="text-sm text-neutral-500">{step.description}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* Items */}
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-neutral-900">Items</h2>
            <ul className="divide-y divide-neutral-100">
              {order.items.map((item, i) => (
                <li key={`${item.productId}-${i}`} className="flex justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm text-neutral-800">{item.name}</p>
                    <p className="text-xs text-neutral-400">
                      Size {item.size} &middot; {item.color} &middot; Qty {item.qty}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-medium text-neutral-900">
                    {formatPrice(item.qty * item.price)}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-neutral-200 pt-3 font-semibold text-neutral-900">
              <span>Total</span>
              <span>{formatPrice(retailOrderTotal(order))}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="mb-2 flex items-center gap-2 font-semibold text-neutral-900">
              <MapPin className="h-4 w-4 text-neutral-400" /> Delivery address
            </h2>
            <p className="text-sm text-neutral-800">{order.customerName}</p>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600">{order.shippingAddress}</p>
            <p className="mt-1 text-sm text-neutral-500">{order.phone}</p>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="mb-2 flex items-center gap-2 font-semibold text-neutral-900">
              {order.paymentMethod === "cod" ? (
                <Truck className="h-4 w-4 text-neutral-400" />
              ) : (
                <Wallet className="h-4 w-4 text-neutral-400" />
              )}
              Payment
            </h2>
            <p className="text-sm text-neutral-600">
              {order.paymentMethod === "cod"
                ? "Cash on Delivery — pay when your order arrives"
                : "Paid online"}
            </p>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-white p-5 text-sm">
            <h2 className="mb-2 font-semibold text-neutral-900">Need help?</h2>
            <Link href="/shop/contact" className="block text-rose-600 underline underline-offset-4">
              Contact support
            </Link>
            <Link
              href="/shop/refund-policy"
              className="mt-1 block text-rose-600 underline underline-offset-4"
            >
              Refund &amp; cancellation policy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
