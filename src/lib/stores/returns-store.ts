import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SEED_RETURNS } from "@/lib/mock/returns-data";
import type { ReturnRequest, ReturnStatus } from "@/types/returns";

// Return requests, customer-raised and staff-actioned. Like the other admin
// stores, this layers on seed data until Supabase is connected; the
// component API is what a real table would expose, so only this file changes.

interface ReturnsState {
  requests: ReturnRequest[];
  create: (request: Omit<ReturnRequest, "id" | "status" | "createdAt">) => ReturnRequest;
  setStatus: (id: string, status: ReturnStatus, decisionNote?: string) => void;
}

let counter = 0;
function nextId() {
  counter += 1;
  return `RET${Date.now().toString().slice(-6)}${counter}`;
}

export const useReturnsStore = create<ReturnsState>()(
  persist(
    (set) => ({
      requests: SEED_RETURNS,

      create: (input) => {
        const request: ReturnRequest = {
          ...input,
          id: nextId(),
          status: "requested",
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ requests: [request, ...s.requests] }));
        return request;
      },

      setStatus: (id, status, decisionNote) =>
        set((s) => ({
          requests: s.requests.map((r) =>
            r.id === id
              ? { ...r, status, decisionNote: decisionNote ?? r.decisionNote, updatedAt: new Date().toISOString() }
              : r
          ),
        })),
    }),
    { name: "garmentvibes-returns", skipHydration: true }
  )
);

export function useReturnsForOrder(orderId: string) {
  return useReturnsStore((s) => s.requests).filter((r) => r.orderId === orderId);
}

export function useReturnRequest(id: string) {
  return useReturnsStore((s) => s.requests).find((r) => r.id === id);
}
