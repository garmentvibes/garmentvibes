import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_ITEMS = 8;

interface RecentlyViewedState {
  productIds: string[];
  record: (productId: string) => void;
}

export const useRecentlyViewedStore = create<RecentlyViewedState>()(
  persist(
    (set, get) => ({
      productIds: [],
      record: (productId) => {
        const existing = get().productIds.filter((id) => id !== productId);
        set({ productIds: [productId, ...existing].slice(0, MAX_ITEMS) });
      },
    }),
    { name: "garmentvibes-retail-recently-viewed", skipHydration: true }
  )
);
