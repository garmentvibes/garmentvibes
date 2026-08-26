import type { CreditInvoice, CreditPayment, InvoiceStatus } from "@/types/credit";

// ---------------------------------------------------------------------------
// Stored credit rows, as the app's CreditInvoice.
//
// The ledger is the one place in this app where a mapping mistake is a wrong
// number on a demand for money. So this carries the payments with the invoice
// rather than deriving a balance here: `amountPaid` and `amountOutstanding` in
// types/credit.ts already compute from the payment list, are unit-tested, and
// are what every screen uses. Recomputing the same figures a second way here
// would give two answers to "what does this business owe".
//
// The database has a third: `credit_invoice_balances`, the view 0008 added,
// and the trigger that derives `status` from the payments. Those agree with
// this because they are computed from the same rows — which is exactly why the
// rows are what gets carried across.
// ---------------------------------------------------------------------------

/** The columns an invoice needs, with its payments, in one round trip. */
export const INVOICE_SELECT = `
  id, reference, quote_id, account_id, business_name, contact_name, email,
  amount, issued_on, due_on, status,
  credit_payments ( id, amount, received_on, method, reference )
`;

export interface InvoiceRow {
  id: string;
  reference: string | null;
  quote_id: string | null;
  account_id: string;
  business_name: string;
  contact_name: string;
  email: string;
  amount: number;
  issued_on: string;
  due_on: string;
  status: string;
  credit_payments: Array<{
    id: string;
    amount: number;
    received_on: string;
    method: string;
    reference: string | null;
  }> | null;
}

export function toCreditInvoice(row: InvoiceRow): CreditInvoice {
  const payments: CreditPayment[] = (row.credit_payments ?? [])
    // Oldest first. The order is not cosmetic: the payment list is what a
    // finance person reads down when reconciling against a bank statement,
    // and Postgres returns embedded rows in no particular order.
    .sort((a, b) => a.received_on.localeCompare(b.received_on))
    .map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      receivedOn: payment.received_on,
      method: payment.method as CreditPayment["method"],
      reference: payment.reference ?? undefined,
    }));

  return {
    // The reference is what appears on the invoice the business received and
    // what they will quote when they pay it.
    id: row.reference ?? row.id,
    orderId: row.quote_id ?? "",
    accountId: row.account_id,
    businessName: row.business_name,
    contactName: row.contact_name,
    email: row.email,
    amount: row.amount,
    issuedOn: row.issued_on,
    dueOn: row.due_on,
    payments,
    status: row.status as InvoiceStatus,
  };
}
