"use client";

import { useEffect } from "react";
import { useRecentlyViewedStore } from "@/lib/stores/recently-viewed-store";
import { track } from "@/lib/analytics";

// Invisible — records the current product into recently-viewed on mount and
// emits the product_viewed analytics event.
export function RecentlyViewedTracker({
  productId,
  productName,
  price,
}: {
  productId: string;
  productName: string;
  price: number;
}) {
  const record = useRecentlyViewedStore((s) => s.record);

  useEffect(() => {
    record(productId);
    track({ name: "product_viewed", productId, productName, price });
  }, [productId, productName, price, record]);

  return null;
}
