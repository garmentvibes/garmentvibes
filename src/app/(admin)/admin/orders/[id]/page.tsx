"use client";

import { use, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Wallet, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/utils";
import { useAdminOrdersStore, useRetailOrder } from "@/lib/stores/admin-orders-store";
import { notify } from "@/lib/stores/notification-store";
import { COURIERS, trackingUrlFor } from "@/lib/couriers";
import { RETAIL_ORDER_STATUSES, retailOrderTotal, type RetailOrderStatus } from "@/types/admin";
import type { NotificationTemplateId } from "@/types/notifications";

export default function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const order = useRetailOrder(id);
  const setRetailStatus = useAdminOrdersStore((s) => s.setRetailStatus);
  const setShipment = useAdminOrdersStore((s) => s.setShipment);
  const [courierId, setCourierId] = useState(order?.shipment?.courierId ?? COURIERS[0].id);
  const [awb, setAwb] = useState(order?.shipment?.awb ?? "");

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

  // Only some transitions are worth interrupting a customer for. Moving an
  // order to "packed", for instance, is internal and notifies nobody.
  const CUSTOMER_FACING: Partial<Record<RetailOrderStatus, NotificationTemplateId>> = {
    shipped: "order_shipped",
    delivered: "order_delivered",
    cancelled: "order_cancelled",
  };

  function updateStatus(status: RetailOrderStatus) {
    setRetailStatus(id, status);

    const templateId = CUSTOMER_FACING[status];
    if (templateId && order) {
      const queued = notify({
        templateId,
        recipientName: order.customerName,
        email: order.customerEmail,
        phone: order.phone,
        relatedTo: order.id,
        vars: {
          name: order.customerName,
          orderId: order.id,
          amount: formatPrice(retailOrderTotal(order)),
          reason: status === "cancelled" ? "cancelled by GarmentVibes" : undefined,
          // A "your order shipped" message with nowhere to track is the
          // most common complaint about these emails, so send the real
          // courier link when we have one.
          trackingUrl:
            trackingUrlFor(order.shipment?.courierId, order.shipment?.awb) ?? undefined,
        },
      });
      toast.success(
        `Order marked as ${status} — ${queued.length} notification${queued.length === 1 ? "" : "s"} queued`
      );
      return;
    }

    toast.success(`Order marked as ${status}`);
  }

  function saveShipment() {
    if (!awb.trim()) {
      toast.error("Enter the AWB / tracking number");
      return;
    }
    setShipment(id, courierId, awb.trim());
    toast.success("Tracking saved — it now appears on the customer's order");
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
              Status changes queue a customer message in the notification outbox.
            </p>
          </div>

          {/* Tracking. Entered before marking the order shipped, so the
              shipment notification can carry a working link. */}
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-neutral-900">Shipment tracking</h2>
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
                <Label htmlFor="awb">AWB / tracking number</Label>
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

            {order.shipment && (
              <p className="mt-3 text-xs text-neutral-500">
                Shipped {order.shipment.shippedAt} &middot;{" "}
                <a
                  href={trackingUrlFor(order.shipment.courierId, order.shipment.awb) ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-neutral-800"
                >
                  Track {order.shipment.awb}
                </a>
              </p>
            )}
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
