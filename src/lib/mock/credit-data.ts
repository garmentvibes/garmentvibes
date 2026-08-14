import { addDays, type CreditInvoice } from "@/types/credit";

// Seed ledger entries so the ageing view has something meaningful to show.
//
// Issue dates are relative to today for the same reason the delivery dates
// are: a fixed date would drift and every invoice would eventually read as
// 300 days overdue, which tells you nothing.

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const NET_30 = 30;

export const SEED_CREDIT_INVOICES: CreditInvoice[] = [
  {
    // Comfortably within terms.
    id: "INV100241",
    orderId: "GVQ84190233",
    accountId: "wa1",
    businessName: "Meera Fashion House",
    contactName: "Meera Nair",
    email: "meera@meerafashion.example",
    amount: 1_04_37_000, // ₹1,04,370.00 in paise
    issuedOn: daysAgo(12),
    dueOn: addDays(daysAgo(12), NET_30),
    payments: [],
    status: "open",
  },
  {
    // Part paid, still within terms.
    id: "INV100198",
    orderId: "GVQ84119042",
    accountId: "wa3",
    businessName: "Kumar Retail Chain",
    contactName: "Suresh Kumar",
    email: "suresh@kumarretail.example",
    amount: 62_85_000,
    issuedOn: daysAgo(22),
    dueOn: addDays(daysAgo(22), NET_30),
    payments: [
      {
        id: "PAY1001",
        amount: 30_00_000,
        receivedOn: daysAgo(6),
        method: "bank_transfer",
        reference: "NEFT/2026/44821",
      },
    ],
    status: "part_paid",
  },
  {
    // Overdue — the case the whole ledger exists to surface.
    id: "INV100112",
    orderId: "GVQ83997211",
    accountId: "wa4",
    businessName: "Style Bazaar",
    contactName: "Anita Desai",
    email: "anita@stylebazaar.example",
    amount: 47_52_000,
    issuedOn: daysAgo(58),
    dueOn: addDays(daysAgo(58), NET_30),
    payments: [],
    status: "open",
  },
  {
    // Settled in full.
    id: "INV100077",
    orderId: "GVQ84213567",
    accountId: "wa1",
    businessName: "Meera Fashion House",
    contactName: "Meera Nair",
    email: "meera@meerafashion.example",
    amount: 88_20_000,
    issuedOn: daysAgo(70),
    dueOn: addDays(daysAgo(70), NET_30),
    payments: [
      {
        id: "PAY0994",
        amount: 88_20_000,
        receivedOn: daysAgo(44),
        method: "bank_transfer",
        reference: "NEFT/2026/41077",
      },
    ],
    status: "paid",
  },
];
