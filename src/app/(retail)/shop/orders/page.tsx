"use client";

import Link from "next/link";
import { Package, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { useMyOrders } from "@/lib/hooks/use-my-orders";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { retailOrderTotal, type RetailOrderStatus } from "@/types/admin";

// Customer-facing labels for the internal status values. "packed" is an
// operational state customers don't need to distinguish from processing.
const STATUS_LABEL: Record<RetailOrderStatus, string> = {
  pending: "Processing",
  confirmed: "Confirmed",
  packed: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_VARIANT: Record<RetailOrderStatus, "warning" | "wholesale" | "success" | "destructive"> = {
  pending: "warning",
  confirmed: "wholesale",
  packed: "warning",
  shipped: "wholesale",
  delivered: "success",
  cancelled: "destructive",
};

export default function OrdersPage() {
  const mounted = useHasMounted();
  const { orders, loaded, live } = useMyOrders();

  if (!mounted) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-neutral-900">My Orders</h1>
      {/* Only shown when these really are demo orders. Leaving it up over a
          customer's own order history would tell them their purchases are not
          real, which is a worse mistake than the one it was warning about. */}
      {!live && loaded && (
        <p className="mt-1 text-sm text-neutral-500">
          Sample order history — this deployment has no account database connected yet.
        </p>
      )}

      <div className="mt-6 space-y-3">
        {orders.map((order) => {
          const itemSummary =
            order.items.length === 1
              ? order.items[0].name
              : `${order.items[0].name} + ${order.items.length - 1} more`;

          return (
            <Link
              key={order.id}
              href={`/shop/orders/${order.id}`}
              className="flex items-start gap-4 rounded-lg border border-neutral-200 p-4 transition-colors hover:border-rose-200"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100">
                <Package className="h-5 w-5 text-neutral-500" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs text-neutral-400">{order.id}</p>
                  <Badge variant={STATUS_VARIANT[order.status]}>
                    {STATUS_LABEL[order.status]}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-sm text-neutral-800">{itemSummary}</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Placed on {order.placedAt} &middot; {formatPrice(retailOrderTotal(order))}
                </p>
              </div>
              <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-neutral-300" />
            </Link>
          );
        })}
      </div>

      {!loaded && (
        <p className="mt-6 text-sm text-neutral-500">Loading your orders…</p>
      )}

      {loaded && orders.length === 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-neutral-300 py-12 text-center">
          <p className="text-neutral-500">You haven&apos;t placed any orders yet.</p>
          <Link href="/shop">
            <Button variant="retail" className="mt-4">
              Start Shopping
            </Button>
          </Link>
        </div>
      )}

      <Link href="/shop" className="mt-8 inline-block text-sm text-rose-600 underline underline-offset-4">
        &larr; Continue Shopping
      </Link>
    </div>
  );
}
