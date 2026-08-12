import Link from "next/link";
import { Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";

const MOCK_ORDERS = [
  {
    id: "GV84213567",
    date: "2026-08-05",
    items: "Floral Printed Anarkali Kurta + 1 more",
    total: 209800,
    status: "Delivered" as const,
  },
  {
    id: "GV84119042",
    date: "2026-07-22",
    items: "Graphic Print Oversized T-Shirt",
    total: 69900,
    status: "Shipped" as const,
  },
  {
    id: "GV83997211",
    date: "2026-07-02",
    items: "Quilted Bomber Jacket",
    total: 219900,
    status: "Processing" as const,
  },
];

const STATUS_VARIANT = {
  Delivered: "success",
  Shipped: "wholesale",
  Processing: "warning",
} as const;

export const metadata = { title: "My Orders" };

export default function OrdersPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-neutral-900">My Orders</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Sample order history — will reflect real orders once accounts are connected.
      </p>

      <div className="mt-6 space-y-3">
        {MOCK_ORDERS.map((order) => (
          <div key={order.id} className="flex items-start gap-4 rounded-lg border border-neutral-200 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100">
              <Package className="h-5 w-5 text-neutral-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs text-neutral-400">{order.id}</p>
                <Badge variant={STATUS_VARIANT[order.status]}>{order.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-neutral-800">{order.items}</p>
              <p className="mt-1 text-sm text-neutral-500">
                Placed on {order.date} &middot; {formatPrice(order.total)}
              </p>
            </div>
          </div>
        ))}
      </div>

      <Link href="/shop" className="mt-8 inline-block text-sm text-rose-600 underline underline-offset-4">
        &larr; Continue Shopping
      </Link>
    </div>
  );
}
