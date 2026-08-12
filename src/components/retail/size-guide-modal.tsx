"use client";

import { useState } from "react";
import { X } from "lucide-react";

const SIZE_CHART = [
  { size: "S", chest: "34-36", waist: "28-30", length: "27" },
  { size: "M", chest: "38-40", waist: "32-34", length: "28" },
  { size: "L", chest: "42-44", waist: "36-38", length: "29" },
  { size: "XL", chest: "46-48", waist: "40-42", length: "30" },
];

export function SizeGuideModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-rose-600"
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
              <h2 className="font-semibold text-neutral-900">Size Guide (inches)</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-5 w-5 text-neutral-500" />
              </button>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-neutral-400">
                <tr>
                  <th className="py-1">Size</th>
                  <th className="py-1">Chest</th>
                  <th className="py-1">Waist</th>
                  <th className="py-1">Length</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {SIZE_CHART.map((row) => (
                  <tr key={row.size}>
                    <td className="py-1.5 font-medium">{row.size}</td>
                    <td className="py-1.5">{row.chest}</td>
                    <td className="py-1.5">{row.waist}</td>
                    <td className="py-1.5">{row.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-neutral-400">
              Measurements are approximate and may vary slightly by style.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
