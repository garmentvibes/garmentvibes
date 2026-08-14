"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { WHOLESALE_PRODUCTS } from "@/lib/mock/wholesale-products";
import { useWholesaleOrderStore } from "@/lib/stores/wholesale-order-store";
import { wholesalePriceForQty } from "@/types/catalog";

const MOCK_ORDERS = [
  {
    id: "GVQ84213567",
    date: "2026-08-05",
    status: "Confirmed" as const,
    items: [
      { sku: "GV-WCT-001", qty: 300 },
      { sku: "GV-WDN-003", qty: 96 },
    ],
  },
  {
    id: "GVQ84119042",
    date: "2026-07-22",
    status: "Shipped" as const,
    items: [{ sku: "GV-WKR-002", qty: 150 }],
  },
  {
    id: "GVQ83997211",
    date: "2026-07-02",
    status: "Delivered" as const,
    items: [{ sku: "GV-WKD-004", qty: 72 }],
  },
];

const STATUS_VARIANT = {
  Confirmed: "wholesale",
  Shipped: "warning",
  Delivered: "success",
} as const;

type StatusFilter = "All" | keyof typeof STATUS_VARIANT;

function orderTotal(items: { sku: string; qty: number }[]) {
  return items.reduce((sum, item) => {
    const product = WHOLESALE_PRODUCTS.find((p) => p.sku === item.sku);
    if (!product) return sum;
    return sum + wholesalePriceForQty(product, item.qty) * item.qty;
  }, 0);
}

function orderUnits(items: { sku: string; qty: number }[]) {
  return items.reduce((sum, item) => sum + item.qty, 0);
}

export default function WholesaleDashboardPage() {
  const [filter, setFilter] = useState<StatusFilter>("All");
  const upsertLine = useWholesaleOrderStore((s) => s.upsertLine);

  const visibleOrders = MOCK_ORDERS.filter((o) => filter === "All" || o.status === filter);

  function handleReorder(order: (typeof MOCK_ORDERS)[number]) {
    let added = 0;
    for (const item of order.items) {
      const product = WHOLESALE_PRODUCTS.find((p) => p.sku === item.sku);
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
    toast.success(`${added} item(s) from ${order.id} added to your order`);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Account Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">
        Sample order history — will reflect real orders once accounts are connected.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {(["All", "Confirmed", "Shipped", "Delivered"] as StatusFilter[]).map((status) => (
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
            {status}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Units</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleOrders.map((order) => (
              <tr key={order.id}>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{order.id}</td>
                <td className="px-4 py-3 text-slate-700">{order.date}</td>
                <td className="px-4 py-3 text-slate-700">{orderUnits(order.items)}</td>
                <td className="px-4 py-3 text-slate-800">{formatPrice(orderTotal(order.items))}</td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[order.status]}>{order.status}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Button variant="outline" size="sm" onClick={() => handleReorder(order)}>
                    Reorder
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleOrders.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No orders with this status.</p>
        )}
      </div>
    </div>
  );
}
