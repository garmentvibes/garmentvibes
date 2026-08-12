import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TeamRole = "Admin" | "Purchaser" | "Viewer";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  status: "Active" | "Invited";
}

interface TeamState {
  members: TeamMember[];
  invite: (member: Omit<TeamMember, "id" | "status">) => void;
  remove: (id: string) => void;
}

export const useTeamStore = create<TeamState>()(
  persist(
    (set, get) => ({
      members: [],
      invite: (member) =>
        set({
          members: [...get().members, { ...member, id: crypto.randomUUID(), status: "Invited" }],
        }),
      remove: (id) => set({ members: get().members.filter((m) => m.id !== id) }),
    }),
    { name: "garmentvibes-wholesale-team" }
  )
);
