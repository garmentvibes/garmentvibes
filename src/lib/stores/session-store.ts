import { create } from "zustand";
import { persist } from "zustand/middleware";

// Placeholder client-side session, standing in for real Supabase Auth until
// the GarmentVibes Supabase project exists (see Phase 1). Swap this out for
// a server-derived session once wired up — do not treat this as secure.
export type UserRole = "retail" | "wholesale";

export interface MockUser {
  name: string;
  email: string;
  role: UserRole;
  businessName?: string; // wholesale only
}

interface SessionState {
  user: MockUser | null;
  login: (user: MockUser) => void;
  logout: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      login: (user) => set({ user }),
      logout: () => set({ user: null }),
    }),
    { name: "garmentvibes-session" }
  )
);
