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
import { useAdminOrdersStore } from "@/lib/stores/admin-orders-store";
import { useAdminOrder } from "@/lib/hooks/use-admin-orders";
import { setRetailOrderStatus, setRetailShipment } from "@/lib/admin/orders/actions";
import { notify } from "@/lib/stores/notification-store";
import { COURIERS, trackingUrlFor } from "@/lib/couriers";
import { checkAwb } from "@/lib/shipping/awb";
import { bookShipment } from "@/lib/shipping/actions";
import { RETAIL_ORDER_STATUSES, retailOrderTotal, type RetailOrderStatus } from "@/types/admin";
import type { NotificationTemplateId } from "@/types/notifications";

export default function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { order, loaded, live, refresh } = useAdminOrder(id);
  const setRetailStatus = useAdminOrdersStore((s) => s.setRetailStatus);
  const setShipment = useAdminOrdersStore((s) => s.setShipment);
  const [courierId, setCourierId] = useState(order?.shipment?.courierId ?? COURIERS[0].id);
  const [awb, setAwb] = useState(order?.shipment?.awb ?? "");
  const [booking, setBooking] = useState(false);

  // A page that says "not found" while the answer is still in flight sends
  // staff back to the list for an order that is about to appear.
  if (!loaded) {
    return <div className="mx-auto max-w-3xl py-16 text-center text-neutral-500">Loading order…</div>;
  }

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

  async function updateStatus(status: RetailOrderStatus) {
    // The database first, where there is one. It sets the status, stamps the
    // date the return window runs from, and queues the customer's message from
    // the row it actually wrote — so a refused update announces nothing.
    if (live) {
      const result = await setRetailOrderStatus(id, status);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      refresh();
      toast.success(`Order marked as ${status}`);
      return;
    }

    // No database: the store is the order book and the browser outbox is the
    // queue. This is what every QA suite here exercises.
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

  async function bookWithCourier() {
    if (!order) return;
    setBooking(true);
    try {
      // The address is passed from here because orders still live in the
      // browser. Once they are in retail_orders this should send an order id
      // and let the server read the address it is actually shipping to.
      const result = await bookShipment({
        orderId: order.id,
        customerName: order.customerName,
        phone: order.phone,
        email: order.customerEmail,
        addressLine1: order.shippingAddress,
        city: "",
        state: "",
        pincode: "",
        value: retailOrderTotal(order),
        collectOnDelivery: order.paymentMethod === "cod" ? retailOrderTotal(order) : 0,
        items: order.items.map((item) => ({
          name: item.name,
          sku: item.productId,
          qty: item.qty,
          price: item.price,
        })),
        // Placeholder until parcels are weighed. Volumetric weight is what
        // the courier bills on, so this must be measured before real volume.
        weightKg: 0.5,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setCourierId(result.shipment.courierId);
      setAwb(result.shipment.awb);
      setShipment(order.id, result.shipment.courierId, result.shipment.awb);
      toast.success(`Booked — AWB ${result.shipment.awb}`);
    } finally {
      setBooking(false);
    }
  }

  async function saveShipment() {
    // Validated against the courier's own AWB format before it is stored,
    // because this number goes straight into the shipment email as a tracking
    // link. A transposed digit sends the customer to a "not found" page and
    // support cannot tell that from a lost parcel.
    const checked = checkAwb(courierId, awb);
    if (!checked.valid) {
      toast.error(checked.error);
      return;
    }

    if (live) {
      // One call, because attaching tracking and shipping are one event: an
      // AWB on a `packed` order is a parcel the courier has and the customer
      // has not been told about.
      const result = await setRetailShipment(id, courierId, checked.normalised);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setAwb(checked.normalised);
      refresh();
      toast.success("Tracking saved — it now appears on the customer's order");
      return;
    }

    setShipment(id, courierId, checked.normalised);
    // Show back what was actually stored. Leaving the field holding the raw
    // typed text means the spaces someone pasted stay on screen while a
    // different string went to the customer.
    setAwb(checked.normalised);
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
              <thead className="text-left text-xs uppercase text-neutral-500">
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
                      <p className="text-xs text-neutral-500">
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
            <p className="mt-3 text-xs text-neutral-500">
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

            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-3">
              <Button size="sm" variant="outline" onClick={bookWithCourier} disabled={booking}>
                {booking ? "Booking…" : "Book with courier"}
              </Button>
              <p className="text-xs text-neutral-500">
                Books the pickup and fills the AWB automatically. Falls back to entering it by hand
                — which is what happens today, since no shipping account is configured.
              </p>
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
