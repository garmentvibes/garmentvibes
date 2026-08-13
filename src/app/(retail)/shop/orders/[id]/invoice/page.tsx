"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { BUSINESS_INFO } from "@/lib/business-info";
import { useRetailOrder } from "@/lib/stores/admin-orders-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { getRetailProductById } from "@/lib/mock/retail-products";
import { computeGst, SELLER_STATE_CODE } from "@/lib/gst";

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

  // Prices are GST-inclusive, so this splits the amount already charged —
  // it never adds anything to what the customer paid.
  const gst = computeGst(
    order.items.map((item) => ({
      name: item.name,
      qty: item.qty,
      price: item.price,
      subcategory: getRetailProductById(item.productId)?.subcategory,
    })),
    order.shippingAddress
  );

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

        {/* Wide on paper, but scrollable on a phone rather than forcing the
            whole page sideways. */}
        <div className="mt-6 overflow-x-auto print:overflow-x-visible">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-400">
                <th className="pb-2">Item</th>
                <th className="pb-2 text-right">HSN</th>
                <th className="pb-2 text-center">Qty</th>
                <th className="pb-2 text-right">Taxable</th>
                <th className="pb-2 text-right">GST</th>
                <th className="pb-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {gst.lines.map((line, i) => (
                <tr key={`${order.items[i].productId}-${i}`}>
                  <td className="py-3">
                    <p className="text-neutral-800">{line.name}</p>
                    <p className="text-xs text-neutral-400">
                      Size {order.items[i].size} &middot; {order.items[i].color}
                    </p>
                  </td>
                  <td className="py-3 text-right font-mono text-xs text-neutral-500">{line.hsn}</td>
                  <td className="py-3 text-center text-neutral-600">{line.qty}</td>
                  <td className="py-3 text-right text-neutral-600">
                    {formatPrice(line.taxableValue)}
                  </td>
                  <td className="py-3 text-right text-neutral-600">
                    {formatPrice(line.taxAmount)}
                    <span className="ml-1 text-xs text-neutral-400">@{line.ratePercent}%</span>
                  </td>
                  <td className="py-3 text-right font-medium text-neutral-900">
                    {formatPrice(line.gross)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          <dl className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between text-neutral-600">
              <dt>Taxable value</dt>
              <dd>{formatPrice(gst.taxableValue)}</dd>
            </div>

            {gst.isInterState ? (
              <div className="flex justify-between text-neutral-600">
                <dt>IGST</dt>
                <dd>{formatPrice(gst.igst)}</dd>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-neutral-600">
                  <dt>CGST</dt>
                  <dd>{formatPrice(gst.cgst)}</dd>
                </div>
                <div className="flex justify-between text-neutral-600">
                  <dt>SGST</dt>
                  <dd>{formatPrice(gst.sgst)}</dd>
                </div>
              </>
            )}

            <div className="flex justify-between text-neutral-600">
              <dt>Delivery</dt>
              <dd className="text-green-700">Free</dd>
            </div>
            <div className="flex justify-between border-t border-neutral-200 pt-1.5 text-base font-bold text-neutral-900">
              <dt>Total</dt>
              <dd>{formatPrice(gst.grandTotal)}</dd>
            </div>
          </dl>
        </div>

        {/* A GST invoice must show tax grouped by slab, not just one total. */}
        <div className="mt-6 overflow-x-auto print:overflow-x-visible">
          <table className="w-full min-w-[24rem] text-xs">
            <caption className="pb-2 text-left font-semibold uppercase tracking-wide text-neutral-400">
              Tax summary
            </caption>
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-400">
                <th className="pb-1.5">Rate</th>
                <th className="pb-1.5 text-right">Taxable value</th>
                <th className="pb-1.5 text-right">
                  {gst.isInterState ? "IGST" : "CGST"}
                </th>
                {!gst.isInterState && <th className="pb-1.5 text-right">SGST</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-600">
              {gst.byRate.map((row) => {
                const half = Math.floor(row.taxAmount / 2);
                return (
                  <tr key={row.ratePercent}>
                    <td className="py-1.5">{row.ratePercent}%</td>
                    <td className="py-1.5 text-right">{formatPrice(row.taxableValue)}</td>
                    <td className="py-1.5 text-right">
                      {formatPrice(gst.isInterState ? row.taxAmount : half)}
                    </td>
                    {!gst.isInterState && (
                      <td className="py-1.5 text-right">
                        {formatPrice(row.taxAmount - half)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-neutral-400">
          Place of supply: {gst.placeOfSupplyCode ?? "—"} &middot; Seller state:{" "}
          {SELLER_STATE_CODE} &middot;{" "}
          {gst.isInterState ? "Inter-state supply (IGST)" : "Intra-state supply (CGST + SGST)"}
        </p>

        <footer className="mt-8 border-t border-neutral-200 pt-4 text-xs leading-relaxed text-neutral-400">
          <p>
            Prices are inclusive of all applicable taxes. This is a computer-generated invoice and
            does not require a signature.
          </p>
          <p className="mt-1">
            Questions? {BUSINESS_INFO.supportEmail} &middot; {BUSINESS_INFO.supportPhone}
          </p>
          <p className="mt-2 text-amber-600 print:hidden">
            Note: this is a preview invoice generated from sample data. The GST rates and HSN codes
            shown are defaults that must be confirmed with a chartered accountant before invoicing
            a real customer.
          </p>
        </footer>
      </article>
    </div>
  );
}
