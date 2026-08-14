import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SEED_CREDIT_INVOICES } from "@/lib/mock/credit-data";
import { amountPaid, type CreditInvoice, type CreditPayment } from "@/types/credit";

interface CreditState {
  invoices: CreditInvoice[];
  recordPayment: (invoiceId: string, payment: Omit<CreditPayment, "id">) => void;
  writeOff: (invoiceId: string) => void;
}

let counter = 0;
function nextPaymentId() {
  counter += 1;
  return `PAY${Date.now().toString().slice(-6)}${counter}`;
}

export const useCreditStore = create<CreditState>()(
  persist(
    (set) => ({
      invoices: SEED_CREDIT_INVOICES,

      recordPayment: (invoiceId, payment) =>
        set((s) => ({
          invoices: s.invoices.map((invoice) => {
            if (invoice.id !== invoiceId) return invoice;
            const payments = [...invoice.payments, { ...payment, id: nextPaymentId() }];
            const paid = payments.reduce((sum, p) => sum + p.amount, 0);
            // Status is derived from the payments rather than set by hand, so
            // it can never disagree with the arithmetic underneath it.
            const status =
              paid >= invoice.amount ? "paid" : paid > 0 ? "part_paid" : "open";
            return { ...invoice, payments, status };
          }),
        })),

      writeOff: (invoiceId) =>
        set((s) => ({
          invoices: s.invoices.map((i) =>
            i.id === invoiceId ? { ...i, status: "written_off" } : i
          ),
        })),
    }),
    { name: "garmentvibes-credit", skipHydration: true }
  )
);

export function useInvoicesForAccount(accountId: string) {
  return useCreditStore((s) => s.invoices).filter((i) => i.accountId === accountId);
}

/** Total still owed by an account across every open invoice. */
export function outstandingForAccount(invoices: CreditInvoice[]) {
  return invoices
    .filter((i) => i.status !== "written_off")
    .reduce((sum, i) => sum + Math.max(0, i.amount - amountPaid(i)), 0);
}
