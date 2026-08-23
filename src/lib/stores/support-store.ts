import { create } from "zustand";
import { persist } from "zustand/middleware";

import { SEED_SUPPORT_TICKETS } from "@/lib/mock/support-data";
import { statusAfterCustomerReply, statusAfterStaffReply } from "@/lib/support";
import type { SupportCategory, SupportTicket } from "@/types/support";

// Support threads.
//
// Becomes `support_tickets` + `support_messages` once Supabase is connected.
// The RLS shape it needs: a customer reads and writes rows where
// `customer_email = auth.email()`, staff read and write everything via
// `is_staff()`. `ticketsFor()` in lib/support.ts already encodes the customer
// half, so the policy and the UI cannot disagree.

let counter = 0;
function nextId(prefix: string) {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

/** Short, quotable, and not sequential — a ticket count is not public data. */
function nextReference() {
  return `SUP${Math.floor(10_000 + (Date.now() % 90_000))}`;
}

interface SupportState {
  tickets: SupportTicket[];
  open: (input: {
    customerName: string;
    customerEmail: string;
    subject: string;
    category: SupportCategory;
    body: string;
    orderId?: string;
  }) => SupportTicket;
  reply: (ticketId: string, from: "customer" | "staff", body: string) => void;
  resolve: (ticketId: string) => void;
}

export const useSupportStore = create<SupportState>()(
  persist(
    (set) => ({
      tickets: SEED_SUPPORT_TICKETS,

      open: (input) => {
        const now = new Date().toISOString();
        const ticket: SupportTicket = {
          id: nextId("sup"),
          reference: nextReference(),
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          subject: input.subject.trim(),
          category: input.category,
          orderId: input.orderId,
          status: "open",
          createdAt: now,
          updatedAt: now,
          messages: [
            { id: nextId("sm"), from: "customer", body: input.body.trim(), createdAt: now },
          ],
        };
        set((s) => ({ tickets: [ticket, ...s.tickets] }));
        return ticket;
      },

      reply: (ticketId, from, body) =>
        set((s) => ({
          tickets: s.tickets.map((ticket) => {
            if (ticket.id !== ticketId) return ticket;
            const now = new Date().toISOString();
            return {
              ...ticket,
              // Status is decided by lib/support.ts, not here — a customer
              // reply reopens a resolved thread, and a staff reply never
              // marks it resolved on the customer's behalf.
              status:
                from === "customer" ? statusAfterCustomerReply() : statusAfterStaffReply(),
              updatedAt: now,
              messages: [
                ...ticket.messages,
                { id: nextId("sm"), from, body: body.trim(), createdAt: now },
              ],
            };
          }),
        })),

      resolve: (ticketId) =>
        set((s) => ({
          tickets: s.tickets.map((ticket) =>
            ticket.id === ticketId
              ? { ...ticket, status: "resolved", updatedAt: new Date().toISOString() }
              : ticket
          ),
        })),
    }),
    { name: "garmentvibes-support", skipHydration: true }
  )
);
