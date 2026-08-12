import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WishlistState {
  productIds: string[];
  toggle: (productId: string) => void;
  isSaved: (productId: string) => boolean;
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      productIds: [],
      toggle: (productId) => {
        const { productIds } = get();
        set({
          productIds: productIds.includes(productId)
            ? productIds.filter((id) => id !== productId)
            : [...productIds, productId],
        });
      },
      isSaved: (productId) => get().productIds.includes(productId),
    }),
    { name: "garmentvibes-retail-wishlist", skipHydration: true }
  )
);
