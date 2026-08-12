"use client";

import { useSearchParams } from "next/navigation";

export function OrderIdLabel() {
  const params = useSearchParams();
  const orderId = params.get("order");
  const method = params.get("method");
  if (!orderId) return null;
  return (
    <>
      <p className="mt-1 text-sm text-neutral-400">Order ID: {orderId}</p>
      {method === "cod" && (
        <p className="mt-1 text-sm text-neutral-500">Pay in cash when your order arrives.</p>
      )}
    </>
  );
}
