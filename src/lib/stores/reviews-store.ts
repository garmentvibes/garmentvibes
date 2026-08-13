import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { RetailReview } from "@/lib/mock/retail-reviews";

// Customer-submitted reviews, layered over the seeded mock ones.
// Becomes a `reviews` table (with a real moderation queue) once Supabase is
// connected — reviews here are published immediately, which a live store
// would gate behind verification of an actual purchase.

export interface SubmittedReview extends RetailReview {
  productId: string;
}

interface ReviewsState {
  reviews: SubmittedReview[];
  addReview: (review: Omit<SubmittedReview, "id">) => void;
  removeReview: (id: string) => void;
}

export const useReviewsStore = create<ReviewsState>()(
  persist(
    (set, get) => ({
      reviews: [],
      addReview: (review) =>
        set({ reviews: [{ ...review, id: crypto.randomUUID() }, ...get().reviews] }),
      removeReview: (id) => set({ reviews: get().reviews.filter((r) => r.id !== id) }),
    }),
    { name: "garmentvibes-reviews", skipHydration: true }
  )
);

export function useProductReviews(productId: string, seeded: RetailReview[]) {
  const submitted = useReviewsStore((s) => s.reviews);
  return [...submitted.filter((r) => r.productId === productId), ...seeded];
}
