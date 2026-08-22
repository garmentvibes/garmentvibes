import { create } from "zustand";
import { persist } from "zustand/middleware";

import { SEEDED_FIT_VOTES } from "@/lib/mock/fit-votes";
import type { FitVote } from "@/lib/fit";

// How a garment runs, as reported by the people who bought it.
//
// Becomes a `product_fit_votes` table once Supabase is connected. The row that
// matters there is (product_id, user_id) unique — one vote per person per
// product, so a single enthusiast cannot swing a verdict. This store enforces
// the same thing per browser, which is as much as it can.
//
// Seeded votes come from mock/fit-votes.ts and are layered under the real
// ones, the same way seeded reviews are.

interface FitFeedbackState {
  /** Product id -> this browser's vote. One each; voting again replaces it. */
  votes: Record<string, FitVote>;
  setVote: (productId: string, vote: FitVote) => void;
  clearVote: (productId: string) => void;
}

export const useFitFeedbackStore = create<FitFeedbackState>()(
  persist(
    (set, get) => ({
      votes: {},
      setVote: (productId, vote) => set({ votes: { ...get().votes, [productId]: vote } }),
      clearVote: (productId) => {
        const next = { ...get().votes };
        delete next[productId];
        set({ votes: next });
      },
    }),
    { name: "garmentvibes-fit-feedback", skipHydration: true }
  )
);

/**
 * Every vote on a product: the seeded ones plus this browser's, if any.
 *
 * Kept as a function rather than a selector so the summary is computed from
 * one place and the seeded and live votes cannot drift apart.
 */
export function votesFor(productId: string, own: Record<string, FitVote>): FitVote[] {
  const seeded = SEEDED_FIT_VOTES[productId] ?? [];
  const mine = own[productId];
  return mine ? [...seeded, mine] : seeded;
}
