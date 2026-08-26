"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import { useAdminOrders } from "@/lib/hooks/use-admin-orders";
import { RETAIL_ORDER_STATUSES, retailOrderTotal, type RetailOrderStatus } from "@/types/admin";

const STATUS_VARIANT: Record<RetailOrderStatus, "outline" | "warning" | "wholesale" | "success" | "destructive"> = {
  pending: "warning",
  confirmed: "wholesale",
  packed: "wholesale",
  shipped: "wholesale",
  delivered: "success",
  cancelled: "destructive",
};

export default function AdminOrdersPage() {
  const { orders } = useAdminOrders();
  const [filter, setFilter] = useState<RetailOrderStatus | "all">("all");

  const visible = orders.filter((o) => filter === "all" || o.status === filter);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold text-neutral-900">Retail Orders</h1>
      <p className="mt-1 text-sm text-neutral-500">{orders.length} orders</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {(["all", ...RETAIL_ORDER_STATUSES] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${
              filter === f
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 text-neutral-600 hover:border-neutral-400"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {visible.map((order) => (
              <tr key={order.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="font-mono text-xs text-neutral-700 hover:underline"
                  >
                    {order.id}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{order.placedAt}</td>
                <td className="px-4 py-3 text-neutral-700">{order.customerName}</td>
                <td className="px-4 py-3 text-neutral-600">
                  {order.items.reduce((s, i) => s + i.qty, 0)}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline">{order.paymentMethod === "cod" ? "COD" : "Online"}</Badge>
                </td>
                <td className="px-4 py-3 font-medium text-neutral-900">
                  {formatPrice(retailOrderTotal(order))}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[order.status]} className="capitalize">
                    {order.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-neutral-500">
            No orders with this status.
          </p>
        )}
      </div>
    </div>
  );
}
