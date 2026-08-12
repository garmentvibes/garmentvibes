"use client";

import { useSearchParams } from "next/navigation";

export function OrderIdLabel() {
  const orderId = useSearchParams().get("order");
  if (!orderId) return null;
  return <p className="mt-1 text-sm text-neutral-400">Order ID: {orderId}</p>;
}
