"use client";

import { use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Wallet, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { useAdminOrdersStore, useRetailOrder } from "@/lib/stores/admin-orders-store";
import { RETAIL_ORDER_STATUSES, retailOrderTotal, type RetailOrderStatus } from "@/types/admin";

export default function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const order = useRetailOrder(id);
  const setRetailStatus = useAdminOrdersStore((s) => s.setRetailStatus);

  if (!order) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center">
        <p className="text-neutral-500">Order not found.</p>
        <Link href="/admin/orders" className="mt-4 inline-block text-sm underline">
          Back to orders
        </Link>
      </div>
    );
  }

  function updateStatus(status: RetailOrderStatus) {
    setRetailStatus(id, status);
    toast.success(`Order marked as ${status}`);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800"
      >
        <ArrowLeft className="h-4 w-4" /> Back to orders
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-bold text-neutral-900">{order.id}</h1>
          <p className="mt-1 text-sm text-neutral-500">Placed {order.placedAt}</p>
        </div>
        <Badge variant="outline" className="capitalize">
          {order.status}
        </Badge>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-neutral-900">Items</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-neutral-400">
                <tr>
                  <th className="pb-2">Product</th>
                  <th className="pb-2">Qty</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {order.items.map((item, i) => (
                  <tr key={`${item.productId}-${i}`}>
                    <td className="py-2.5">
                      <p className="text-neutral-800">{item.name}</p>
                      <p className="text-xs text-neutral-400">
                        {item.size} &middot; {item.color} &middot; {formatPrice(item.price)} each
                      </p>
                    </td>
                    <td className="py-2.5 text-neutral-600">{item.qty}</td>
                    <td className="py-2.5 text-right font-medium text-neutral-900">
                      {formatPrice(item.qty * item.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex justify-between border-t border-neutral-200 pt-3 font-semibold text-neutral-900">
              <span>Total</span>
              <span>{formatPrice(retailOrderTotal(order))}</span>
            </div>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-neutral-900">Update status</h2>
            <div className="flex flex-wrap gap-2">
              {RETAIL_ORDER_STATUSES.map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={status === order.status ? "default" : "outline"}
                  onClick={() => updateStatus(status)}
                  className="capitalize"
                >
                  {status}
                </Button>
              ))}
            </div>
            <p className="mt-3 text-xs text-neutral-400">
              Customer notification emails will fire from here once transactional email is wired up.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-neutral-900">Customer</h2>
            <p className="text-sm text-neutral-800">{order.customerName}</p>
            <p className="text-sm text-neutral-500">{order.customerEmail}</p>
            <p className="text-sm text-neutral-500">{order.phone}</p>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="mb-2 flex items-center gap-2 font-semibold text-neutral-900">
              <MapPin className="h-4 w-4 text-neutral-400" /> Shipping
            </h2>
            <p className="text-sm leading-relaxed text-neutral-600">{order.shippingAddress}</p>
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
                ? "Cash on Delivery — collect on handover"
                : "Paid online (simulated)"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
