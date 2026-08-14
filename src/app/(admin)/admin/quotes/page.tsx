"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import { useWholesaleQuotes } from "@/lib/stores/admin-orders-store";
import {
  WHOLESALE_QUOTE_STATUSES,
  WHOLESALE_QUOTE_STATUS_LABELS,
  wholesaleQuoteTotal,
  wholesaleQuoteUnits,
  type WholesaleQuoteStatus,
} from "@/types/admin";

const STATUS_VARIANT: Record<
  WholesaleQuoteStatus,
  "outline" | "warning" | "wholesale" | "success" | "destructive"
> = {
  requested: "warning",
  quoted: "wholesale",
  confirmed: "wholesale",
  in_production: "wholesale",
  shipped: "wholesale",
  fulfilled: "success",
  rejected: "destructive",
};

export default function AdminQuotesPage() {
  const quotes = useWholesaleQuotes();
  const [filter, setFilter] = useState<WholesaleQuoteStatus | "all">("all");

  const visible = quotes.filter((q) => filter === "all" || q.status === filter);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold text-neutral-900">Quotes &amp; Bulk Orders</h1>
      <p className="mt-1 text-sm text-neutral-500">{quotes.length} requests</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {(["all", ...WHOLESALE_QUOTE_STATUSES] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filter === f
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 text-neutral-600 hover:border-neutral-400"
            }`}
          >
            {f === "all" ? "All" : WHOLESALE_QUOTE_STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Units</th>
              <th className="px-4 py-3">Estimated</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {visible.map((quote) => (
              <tr key={quote.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/quotes/${quote.id}`}
                    className="font-mono text-xs text-neutral-700 hover:underline"
                  >
                    {quote.id}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{quote.requestedAt}</td>
                <td className="px-4 py-3 text-neutral-700">{quote.businessName}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="capitalize">
                    {quote.kind}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-neutral-600">{wholesaleQuoteUnits(quote)}</td>
                <td className="px-4 py-3 font-medium text-neutral-900">
                  {formatPrice(wholesaleQuoteTotal(quote))}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[quote.status]}>
                    {WHOLESALE_QUOTE_STATUS_LABELS[quote.status]}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-neutral-500">
            No requests with this status.
          </p>
        )}
      </div>
    </div>
  );
}
