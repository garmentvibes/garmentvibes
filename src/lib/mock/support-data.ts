import type { SupportTicket } from "@/types/support";

// Two seeded threads so the admin queue and the account page are not empty:
// one waiting on us, one already answered.
//
// Placeholder content, like the reviews and questions. Deliberately NOT in
// supabase/seed.sql — the seed carries the catalogue only, and invented
// customer complaints in a real database are a support history nobody can
// tell apart from the real thing.
//
// Timestamps are relative to load so the queue's "waiting N hours" reads
// sensibly whenever this is opened, rather than showing a wait of several
// months by the time anyone looks.
const hoursAgo = (n: number) => new Date(Date.now() - n * 60 * 60 * 1000).toISOString();

export const SEED_SUPPORT_TICKETS: SupportTicket[] = [
  {
    id: "sup_seed_1",
    reference: "SUP74120",
    customerName: "Ritu Sharma",
    customerEmail: "ritu.seed@example.com",
    subject: "Parcel marked delivered but not received",
    category: "delivery",
    orderId: "GV84213567",
    status: "open",
    createdAt: hoursAgo(29),
    updatedAt: hoursAgo(29),
    messages: [
      {
        id: "sm_1",
        from: "customer",
        body: "The tracking says delivered yesterday evening but nothing arrived, and the security desk has no record of it. Could you check with the courier?",
        createdAt: hoursAgo(29),
      },
    ],
  },
  {
    id: "sup_seed_2",
    reference: "SUP74098",
    customerName: "Karan Patel",
    customerEmail: "karan.seed@example.com",
    subject: "Invoice needs my company GSTIN",
    category: "payment",
    orderId: "GV84190233",
    status: "awaiting_customer",
    createdAt: hoursAgo(52),
    updatedAt: hoursAgo(48),
    messages: [
      {
        id: "sm_2",
        from: "customer",
        body: "I need the invoice reissued with my company's GSTIN for reimbursement. Can that be done?",
        createdAt: hoursAgo(52),
      },
      {
        id: "sm_3",
        from: "staff",
        body: "We can reissue it, but a GST invoice can only carry a GSTIN captured at the time of sale — this was placed as a retail order, so we cannot add one after the fact. If you order through the wholesale portal your GSTIN is captured up front. Would you like us to reissue with your billing address corrected instead?",
        createdAt: hoursAgo(48),
      },
    ],
  },
];
