import { create } from "zustand";
import { persist } from "zustand/middleware";

// ---------------------------------------------------------------------------
// The hearts.
//
// Still the thing components render from, and still the whole wishlist for
// signed-out visitors and for deployments with no database. What changed with
// 0028 is that a signed-in customer's list is also written to `wishlists`, so
// it survives switching device — and so that something server-side can read
// what a customer saved, which is the reason that table was created in 0005.
//
// The mutations themselves moved to src/lib/hooks/use-wishlist.ts, which
// writes here first and to the database after. This store keeps no knowledge
// of the network; `adopt` and `forgetSync` are the two seams that sync needs.
// ---------------------------------------------------------------------------

interface WishlistState {
  /**
   * What is saved, as slugs.
   *
   * Named `productIds` because that is what `RetailProduct.id` is called and
   * this holds exactly that field — and, by the decision recorded on that
   * type, that field IS the slug. The database's uuid is deliberately not
   * here: it differs between environments, so anything persisted against one
   * orphans the next time a database is created. `wishlist_add` resolves the
   * slug server-side, as `cart_add` and `place_retail_order` do.
   */
  productIds: string[];

  /**
   * The customer whose stored wishlist this list has already been reconciled
   * with, or undefined if it has not been.
   *
   * Exactly the marker the cart carries, for exactly the reason: sign-in
   * merges the local list into the stored one, and that merge must not repeat
   * on a device that has already done it. Un-hearting something on a phone
   * leaves this device still holding it, and merging again would bring it
   * back. See src/lib/sync/decide.ts for the rule this feeds.
   */
  syncedFor?: string;

  toggle: (productId: string) => void;
  isSaved: (productId: string) => boolean;
  /** Replaces the list with the stored one, and records who it belongs to. */
  adopt: (productIds: string[], syncedFor: string) => void;
  /** Forgets the sync marker, so the next sign-in merges again. */
  forgetSync: () => void;
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
      adopt: (productIds, syncedFor) => set({ productIds, syncedFor }),
      forgetSync: () => set({ syncedFor: undefined }),
    }),
    { name: "garmentvibes-retail-wishlist", skipHydration: true }
  )
);
