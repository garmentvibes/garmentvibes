import { create } from "zustand";
import { persist } from "zustand/middleware";

// Placeholder client-side session, standing in for real Supabase Auth until
// the GarmentVibes Supabase project exists (see Phase 1). Swap this out for
// a server-derived session once wired up — do not treat this as secure.
export type UserRole = "retail" | "wholesale" | "admin";

export type WholesaleApprovalStatus = "pending" | "approved";
export type PaymentTerms = "prepay" | "net30";

export interface MockUser {
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  businessName?: string; // wholesale only
  gstin?: string; // wholesale only
  approvalStatus?: WholesaleApprovalStatus; // wholesale only — new signups start "pending"
  paymentTerms?: PaymentTerms; // wholesale only
  creditTermsRequested?: boolean; // wholesale only
}

interface SessionState {
  user: MockUser | null;
  login: (user: MockUser) => void;
  logout: () => void;
  updateProfile: (updates: Partial<MockUser>) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      user: null,
      login: (user) => set({ user }),
      logout: () => set({ user: null }),
      updateProfile: (updates) => {
        const { user } = get();
        if (!user) return;
        set({ user: { ...user, ...updates } });
      },
    }),
    { name: "garmentvibes-session", skipHydration: true }
  )
);
