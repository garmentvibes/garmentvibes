"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { BUSINESS_INFO } from "@/lib/business-info";
import { useWholesaleQuote } from "@/lib/stores/admin-orders-store";
import { useWholesaleAccounts } from "@/lib/stores/admin-accounts-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { useWholesaleCatalogue } from "@/components/shared/catalogue-provider";
import { computeGstExclusive, SELLER_STATE_CODE } from "@/lib/gst";
import { wholesaleQuoteUnits } from "@/types/admin";

export default function WholesaleInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  // The catalogue the panel was given, not the module: the subcategory it
  // supplies decides the HSN code printed on a GST invoice.
  const catalogue = useWholesaleCatalogue();
  const bySku = (sku: string) => catalogue.find((p) => p.sku === sku);

  const { id } = use(params);
  const mounted = useHasMounted();
  const quote = useWholesaleQuote(id);
  const accounts = useWholesaleAccounts();

  if (!mounted) return null;

  if (!quote) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center">
        <p className="text-neutral-500">Order not found.</p>
        <Link href="/admin/quotes" className="mt-4 inline-block text-sm underline">
          Back to quotes
        </Link>
      </div>
    );
  }

  // The buyer's GSTIN is what lets them claim input tax credit, so it has to
  // be on the invoice. It's resolved from their account here; a production
  // system would snapshot it onto the order at the time of supply, since a
  // business can change its registration later and the invoice must record
  // what was true when the sale happened.
  const account = accounts.find((a) => a.email === quote.email);
  const billingAddress = account?.gstin
    ? `GSTIN: ${account.gstin}`
    : "GSTIN not on file — required for input tax credit";

  // Wholesale prices are quoted excluding GST, so tax is added on top.
  const gst = computeGstExclusive(
    quote.items.map((item) => ({
      name: item.name,
      qty: item.qty,
      price: item.pricePerUnit,
      subcategory: bySku(item.sku)?.subcategory,
    })),
    // Place of supply. Without a shipping address on the quote we fall back
    // to the buyer's registered state, taken from the GSTIN prefix.
    account?.gstin ? stateNameForCode(account.gstin.slice(0, 2)) : ""
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={`/admin/quotes/${quote.id}`}
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800"
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
            <p className="text-lg font-bold text-blue-800">GarmentVibes Wholesale</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-neutral-500">
              {BUSINESS_INFO.legalName}
              <br />
              {BUSINESS_INFO.address}
              <br />
              GSTIN: {BUSINESS_INFO.gstin}
            </p>
          </div>
          <div className="shrink-0 sm:text-right">
            <h1 className="text-lg font-bold text-neutral-900">TAX INVOICE</h1>
            <p className="mt-1 font-mono text-xs text-neutral-500">{quote.id}</p>
            <p className="text-xs text-neutral-500">Date: {quote.requestedAt}</p>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 border-b border-neutral-200 py-6 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Billed to
            </h2>
            <p className="mt-1.5 text-sm font-medium text-neutral-900">{quote.businessName}</p>
            <p className="text-sm text-neutral-600">{quote.contactName}</p>
            <p className="text-sm text-neutral-600">{quote.email}</p>
            <p className="mt-1 text-sm font-medium text-neutral-800">{billingAddress}</p>
          </div>
          <div className="sm:text-right">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Order
            </h2>
            <p className="mt-1.5 text-sm capitalize text-neutral-800">{quote.kind}</p>
            <p className="text-sm capitalize text-neutral-600">Status: {quote.status.replace("_", " ")}</p>
            <p className="text-sm text-neutral-600">{wholesaleQuoteUnits(quote)} units</p>
          </div>
        </section>

        <div className="mt-6 overflow-x-auto print:overflow-x-visible">
          <table className="w-full min-w-[38rem] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-400">
                <th className="pb-2">Item</th>
                <th className="pb-2 text-right">HSN</th>
                <th className="pb-2 text-center">Qty</th>
                <th className="pb-2 text-right">Rate</th>
                <th className="pb-2 text-right">Taxable</th>
                <th className="pb-2 text-right">GST</th>
                <th className="pb-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {gst.lines.map((line, i) => (
                <tr key={`${quote.items[i].sku}-${i}`}>
                  <td className="py-3">
                    <p className="text-neutral-800">{line.name}</p>
                    <p className="font-mono text-xs text-neutral-400">{quote.items[i].sku}</p>
                  </td>
                  <td className="py-3 text-right font-mono text-xs text-neutral-500">{line.hsn}</td>
                  <td className="py-3 text-center text-neutral-600">{line.qty}</td>
                  <td className="py-3 text-right text-neutral-600">
                    {formatPrice(quote.items[i].pricePerUnit)}
                  </td>
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
            <div className="flex justify-between border-t border-neutral-200 pt-1.5 text-base font-bold text-neutral-900">
              <dt>Total</dt>
              <dd>{formatPrice(gst.grandTotal)}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-6 overflow-x-auto print:overflow-x-visible">
          <table className="w-full min-w-[24rem] text-xs">
            <caption className="pb-2 text-left font-semibold uppercase tracking-wide text-neutral-400">
              Tax summary
            </caption>
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-400">
                <th className="pb-1.5">Rate</th>
                <th className="pb-1.5 text-right">Taxable value</th>
                <th className="pb-1.5 text-right">{gst.isInterState ? "IGST" : "CGST"}</th>
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
                      <td className="py-1.5 text-right">{formatPrice(row.taxAmount - half)}</td>
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
            All prices are exclusive of GST; tax is charged in addition as shown above. This is a
            computer-generated invoice and does not require a signature.
          </p>
          <p className="mt-1">
            Questions? {BUSINESS_INFO.wholesaleEmail} &middot; {BUSINESS_INFO.supportPhone}
          </p>
          <p className="mt-2 text-amber-600 print:hidden">
            Note: preview invoice from sample data. GST rates, HSN codes and the exclusive-pricing
            convention all need confirming with a chartered accountant before real invoicing.
          </p>
        </footer>
      </article>
    </div>
  );
}

/**
 * Maps a GST state code back to a state name, so place of supply can be
 * derived from the buyer's GSTIN when no shipping address is recorded.
 */
function stateNameForCode(code: string) {
  const entry = Object.entries({
    "07": "Delhi",
    "24": "Gujarat",
    "27": "Maharashtra",
    "29": "Karnataka",
    "33": "Tamil Nadu",
    "36": "Telangana",
    "37": "Andhra Pradesh",
  }).find(([c]) => c === code);
  return entry?.[1] ?? "";
}
