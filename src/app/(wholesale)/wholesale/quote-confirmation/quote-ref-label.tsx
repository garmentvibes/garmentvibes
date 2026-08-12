"use client";

import { useSearchParams } from "next/navigation";

export function QuoteRefLabel() {
  const params = useSearchParams();
  const ref = params.get("ref");
  const kind = params.get("kind");
  if (!ref) return null;
  return (
    <p className="mt-1 text-sm text-slate-400">
      {kind === "order" ? "Order" : "Quote"} reference: {ref}
    </p>
  );
}
