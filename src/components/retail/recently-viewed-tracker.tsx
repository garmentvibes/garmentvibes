"use client";

import { useEffect } from "react";
import { useRecentlyViewedStore } from "@/lib/stores/recently-viewed-store";

// Invisible — just records the current product into recently-viewed on mount.
export function RecentlyViewedTracker({ productId }: { productId: string }) {
  const record = useRecentlyViewedStore((s) => s.record);

  useEffect(() => {
    record(productId);
  }, [productId, record]);

  return null;
}
