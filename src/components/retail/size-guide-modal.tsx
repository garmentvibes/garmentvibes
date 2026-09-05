"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { sizeChartFor } from "@/lib/fit";

/**
 * The size guide for one product's own sizing system.
 *
 * `sizes` is required rather than optional on purpose. This used to render a
 * fixed S/M/L/XL chest/waist/length table on every product, so a customer
 * buying 32" jeans or a 4-5Y frock was shown a chart with no row for their
 * size — which is worse than no chart, because it looks like an answer.
 */
export function SizeGuideModal({ sizes }: { sizes: string[] }) {
  const [open, setOpen] = useState(false);
  const chart = sizeChartFor(sizes);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-rose-700"
      >
        Size Guide
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Size guide"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-neutral-900">
                Size Guide{chart.rows.length > 0 ? " (inches)" : ""}
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-5 w-5 text-neutral-500" />
              </button>
            </div>

            {chart.rows.length > 0 && (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-neutral-500">
                  <tr>
                    <th className="py-1">Size</th>
                    {chart.headings.map((heading) => (
                      <th key={heading} className="py-1">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {chart.rows.map((row) => (
                    <tr
                      key={row.size}
                      // Rows for sizes this product does not carry are dimmed
                      // rather than removed, so the chart still reads as a
                      // range and a customer can see where their size sits.
                      className={sizes.includes(row.size) ? "" : "text-neutral-300"}
                    >
                      <td className="py-1.5 font-medium">{row.size}</td>
                      {row.values.map((value, i) => (
                        <td key={chart.headings[i]} className="py-1.5">
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <p className="mt-4 text-xs text-neutral-500">{chart.note}</p>
          </div>
        </div>
      )}
    </>
  );
}
