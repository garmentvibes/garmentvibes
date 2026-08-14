// Credit ledger for wholesale accounts on Net-30 terms.
//
// Granting credit without tracking what's outstanding is the trap this
// closes: the portal could already mark an account Net-30, but nothing
// recorded what had been invoiced, what had been paid, or who was overdue —
// which is the entire reason a supplier offers terms in the first place.

export type InvoiceStatus = "open" | "part_paid" | "paid" | "written_off";

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  open: "Open",
  part_paid: "Part paid",
  paid: "Paid",
  written_off: "Written off",
};

export interface CreditPayment {
  id: string;
  amount: number; // minor units
  receivedOn: string; // ISO date
  method: "bank_transfer" | "cheque" | "upi" | "adjustment";
  reference?: string;
}

export interface CreditInvoice {
  id: string;
  /** The wholesale order this invoice bills. */
  orderId: string;
  accountId: string;
  businessName: string;
  contactName: string;
  email: string;
  /** GST-inclusive amount payable. */
  amount: number;
  issuedOn: string; // ISO date
  /** issuedOn + the account's terms, computed once and stored. */
  dueOn: string; // ISO date
  payments: CreditPayment[];
  status: InvoiceStatus;
}

export const PAYMENT_METHOD_LABELS: Record<CreditPayment["method"], string> = {
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  upi: "UPI",
  adjustment: "Credit note adjustment",
};

export function amountPaid(invoice: CreditInvoice) {
  return invoice.payments.reduce((sum, p) => sum + p.amount, 0);
}

export function amountOutstanding(invoice: CreditInvoice) {
  if (invoice.status === "written_off") return 0;
  return Math.max(0, invoice.amount - amountPaid(invoice));
}

/**
 * Days past due. Negative means still within terms.
 *
 * `now` is a parameter so this stays pure and testable — the clock is read
 * once at the call site via useNow().
 */
export function daysOverdue(invoice: CreditInvoice, now: number) {
  const due = new Date(invoice.dueOn).getTime();
  return Math.floor((now - due) / (24 * 60 * 60 * 1000));
}

export function isOverdue(invoice: CreditInvoice, now: number) {
  return amountOutstanding(invoice) > 0 && daysOverdue(invoice, now) > 0;
}

/**
 * Standard ageing buckets. Anything past 90 days is usually a write-off
 * conversation rather than a chase, so the last bucket is open-ended.
 */
export function ageingBucket(daysPastDue: number) {
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "1-30";
  if (daysPastDue <= 60) return "31-60";
  if (daysPastDue <= 90) return "61-90";
  return "90+";
}

export const AGEING_BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;

export function addDays(isoDate: string, days: number) {
  return new Date(new Date(isoDate).getTime() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}
