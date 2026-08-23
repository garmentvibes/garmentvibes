import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PROMO_CODES } from "@/lib/pricing";
import { recordRedemption } from "@/lib/promo-eligibility";
import type { PromoCode, PromoRedemptions } from "@/types/promo";

// Promo codes, editable from the admin panel.
//
// The two codes in lib/pricing.ts remain the built-in defaults so the server
// has something to validate against with no store present — the payment route
// runs on the server and cannot read this browser-side store. Admin-created
// codes therefore work in the UI today and will work end to end once codes
// live in the database; that gap is called out in QA.md rather than papered
// over.

const SEED: PromoCode[] = Object.entries(PROMO_CODES).map(([code, percent]) => ({
  code,
  percent,
  active: true,
  builtIn: true,
}));

interface PromoState {
  codes: PromoCode[];
  /**
   * Who has redeemed what. Separate from `codes` so a code can be edited —
   * its percent changed, its cap raised — without its history being rewritten
   * or lost.
   */
  redemptions: PromoRedemptions;
  add: (code: PromoCode) => void;
  toggle: (code: string) => void;
  remove: (code: string) => void;
  /** Called when an order is placed, not when a code is typed in. */
  redeem: (code: string, customerEmail: string) => void;
}

export const usePromoStore = create<PromoState>()(
  persist(
    (set) => ({
      codes: SEED,
      redemptions: {},
      add: (promo) =>
        set((s) => ({
          // Re-adding an existing code replaces it rather than creating a
          // duplicate that would shadow the original unpredictably.
          codes: [...s.codes.filter((c) => c.code !== promo.code), promo],
        })),
      toggle: (code) =>
        set((s) => ({
          codes: s.codes.map((c) => (c.code === code ? { ...c, active: !c.active } : c)),
        })),
      // Recorded at order time rather than at "Apply", or abandoning a
      // checkout would burn a one-per-customer code the customer never used.
      redeem: (code, customerEmail) =>
        set((s) => ({ redemptions: recordRedemption(s.redemptions, code, customerEmail) })),

      remove: (code) =>
        // Built-ins can be deactivated but not deleted: they are compiled
        // into the server's validation list, so removing one here would put
        // the UI and the payment route into disagreement.
        set((s) => ({ codes: s.codes.filter((c) => c.code !== code || c.builtIn) })),
    }),
    { name: "garmentvibes-promos", skipHydration: true }
  )
);

/**
 * Discount percent for a code, or 0 if unknown, inactive or expired.
 *
 * Superseded by evaluatePromo() in lib/promo-eligibility.ts, which also
 * enforces redemption caps and says WHY a code was refused. Kept for callers
 * that only need the percentage and have no customer to attribute a
 * redemption to.
 */
export function promoPercentFromStore(codes: PromoCode[], input: string, now: number) {
  const code = codes.find((c) => c.code === input.trim().toUpperCase());
  if (!code || !code.active) return 0;
  if (code.expiresOn && new Date(code.expiresOn).getTime() < now) return 0;
  return code.percent;
}
