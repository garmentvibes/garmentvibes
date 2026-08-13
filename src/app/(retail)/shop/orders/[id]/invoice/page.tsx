"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { BUSINESS_INFO } from "@/lib/business-info";
import { useRetailOrder } from "@/lib/stores/admin-orders-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { retailOrderTotal } from "@/types/admin";

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const mounted = useHasMounted();
  const order = useRetailOrder(id);

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

  const total = retailOrderTotal(order);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Screen-only controls — hidden when printing */}
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={`/shop/orders/${order.id}`}
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-rose-600"
        >
          <ArrowLeft className="h-4 w-4" /> Back to order
        </Link>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-1.5 h-4 w-4" /> Print / Save as PDF
        </Button>
      </div>

      <article className="mt-4 rounded-lg border border-neutral-200 bg-white p-8 print:border-0 print:p-0">
        <header className="grid grid-cols-1 gap-4 border-b border-neutral-200 pb-6 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <p className="text-lg font-bold text-rose-600">GarmentVibes</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-neutral-500">
              {BUSINESS_INFO.legalName}
              <br />
              {BUSINESS_INFO.address}
              <br />
              GSTIN: {BUSINESS_INFO.gstin}
            </p>
          </div>
          <div className="shrink-0 sm:text-right">
            <h1 className="text-lg font-bold text-neutral-900">INVOICE</h1>
            <p className="mt-1 font-mono text-xs text-neutral-500">{order.id}</p>
            <p className="text-xs text-neutral-500">Date: {order.placedAt}</p>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 border-b border-neutral-200 py-6 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Billed to
            </h2>
            <p className="mt-1.5 text-sm font-medium text-neutral-900">{order.customerName}</p>
            <p className="text-sm leading-relaxed text-neutral-600">{order.shippingAddress}</p>
            <p className="text-sm text-neutral-600">{order.phone}</p>
            <p className="text-sm text-neutral-600">{order.customerEmail}</p>
          </div>
          <div className="sm:text-right">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Payment
            </h2>
            <p className="mt-1.5 text-sm text-neutral-800">
              {order.paymentMethod === "cod" ? "Cash on Delivery" : "Paid online"}
            </p>
            <p className="text-sm capitalize text-neutral-600">Status: {order.status}</p>
          </div>
        </section>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-400">
              <th className="pb-2">Item</th>
              <th className="pb-2 text-center">Qty</th>
              <th className="pb-2 text-right">Rate</th>
              <th className="pb-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {order.items.map((item, i) => (
              <tr key={`${item.productId}-${i}`}>
                <td className="py-3">
                  <p className="text-neutral-800">{item.name}</p>
                  <p className="text-xs text-neutral-400">
                    Size {item.size} &middot; {item.color}
                  </p>
                </td>
                <td className="py-3 text-center text-neutral-600">{item.qty}</td>
                <td className="py-3 text-right text-neutral-600">{formatPrice(item.price)}</td>
                <td className="py-3 text-right font-medium text-neutral-900">
                  {formatPrice(item.qty * item.price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <dl className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between text-neutral-600">
              <dt>Subtotal</dt>
              <dd>{formatPrice(total)}</dd>
            </div>
            <div className="flex justify-between text-neutral-600">
              <dt>Delivery</dt>
              <dd className="text-green-700">Free</dd>
            </div>
            <div className="flex justify-between border-t border-neutral-200 pt-1.5 text-base font-bold text-neutral-900">
              <dt>Total</dt>
              <dd>{formatPrice(total)}</dd>
            </div>
          </dl>
        </div>

        <footer className="mt-8 border-t border-neutral-200 pt-4 text-xs leading-relaxed text-neutral-400">
          <p>
            Prices are inclusive of all applicable taxes. This is a computer-generated invoice and
            does not require a signature.
          </p>
          <p className="mt-1">
            Questions? {BUSINESS_INFO.supportEmail} &middot; {BUSINESS_INFO.supportPhone}
          </p>
          <p className="mt-2 text-amber-600 print:hidden">
            Note: this is a preview invoice generated from sample data. A GST-compliant tax invoice
            with HSN codes and a tax breakdown will be issued once tax calculation is configured.
          </p>
        </footer>
      </article>
    </div>
  );
}
