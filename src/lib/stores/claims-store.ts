import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ClaimStatus, WholesaleClaim } from "@/types/claims";

interface ClaimsState {
  claims: WholesaleClaim[];
  create: (claim: Omit<WholesaleClaim, "id" | "status" | "createdAt">) => WholesaleClaim;
  setStatus: (id: string, status: ClaimStatus, decisionNote?: string) => void;
}

let counter = 0;
function nextId() {
  counter += 1;
  return `CLM${Date.now().toString().slice(-6)}${counter}`;
}

export const useClaimsStore = create<ClaimsState>()(
  persist(
    (set) => ({
      // No seed: a claim is an exception, and an empty queue is the honest
      // default state for a new deployment.
      claims: [],

      create: (input) => {
        const claim: WholesaleClaim = {
          ...input,
          id: nextId(),
          status: "submitted",
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ claims: [claim, ...s.claims] }));
        return claim;
      },

      setStatus: (id, status, decisionNote) =>
        set((s) => ({
          claims: s.claims.map((c) =>
            c.id === id
              ? {
                  ...c,
                  status,
                  decisionNote: decisionNote ?? c.decisionNote,
                  updatedAt: new Date().toISOString(),
                }
              : c
          ),
        })),
    }),
    { name: "garmentvibes-claims", skipHydration: true }
  )
);

export function useClaimsForOrder(orderId: string) {
  return useClaimsStore((s) => s.claims).filter((c) => c.orderId === orderId);
}
