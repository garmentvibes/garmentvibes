import { describe, expect, it } from "vitest";

import { toCreditInvoice, type InvoiceRow } from "./rows";
import { amountOutstanding, amountPaid } from "@/types/credit";

// ---------------------------------------------------------------------------
// The ledger mapping.
//
// This is the one screen in the app where a mapping mistake is a wrong number
// on a demand for money — either chasing a business that has paid, or failing
// to chase one that has not.
// ---------------------------------------------------------------------------

function row(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: "b2c4e6a8-0000-0000-0000-000000000001",
    reference: "GV-INV-3007",
    quote_id: "9a1c0b2d-0000-0000-0000-000000000001",
    account_id: "aa11bb22-0000-0000-0000-000000000001",
    business_name: "Sunrise Traders",
    contact_name: "Meera Iyer",
    email: "accounts@sunrisetraders.example",
    amount: 5256000,
    issued_on: "2026-07-15",
    due_on: "2026-08-14",
    status: "part_paid",
    credit_payments: [
      {
        id: "p2",
        amount: 1000000,
        received_on: "2026-08-02",
        method: "upi",
        reference: "UPI-8842",
      },
      {
        id: "p1",
        amount: 2000000,
        received_on: "2026-07-20",
        method: "bank_transfer",
        reference: "UTR-55120",
      },
    ],
    ...overrides,
  };
}

describe("toCreditInvoice", () => {
  it("identifies the invoice by its reference", () => {
    // What is printed on the invoice the business received, and what they will
    // quote when they pay it.
    expect(toCreditInvoice(row()).id).toBe("GV-INV-3007");
  });

  it("falls back to the uuid when there is no reference", () => {
    expect(toCreditInvoice(row({ reference: null })).id).toBe(
      "b2c4e6a8-0000-0000-0000-000000000001"
    );
  });

  it("orders payments oldest first", () => {
    // Not cosmetic: this list is what somebody reads down while reconciling
    // against a bank statement, and Postgres returns embedded rows in no
    // particular order.
    const invoice = toCreditInvoice(row());
    expect(invoice.payments.map((p) => p.receivedOn)).toEqual(["2026-07-20", "2026-08-02"]);
  });

  it("carries every payment, so the totals come out right", () => {
    const invoice = toCreditInvoice(row());
    expect(amountPaid(invoice)).toBe(3000000);
    expect(amountOutstanding(invoice)).toBe(2256000);
  });

  it("keeps a payment with no reference", () => {
    // A cash or adjustment entry has no UTR. Dropping it would understate
    // what a business has paid.
    const invoice = toCreditInvoice(
      row({
        credit_payments: [
          { id: "p1", amount: 500000, received_on: "2026-07-20", method: "adjustment", reference: null },
        ],
      })
    );

    expect(invoice.payments).toHaveLength(1);
    expect(invoice.payments[0].reference).toBeUndefined();
    expect(amountPaid(invoice)).toBe(500000);
  });

  it("treats an invoice with no payments as wholly outstanding", () => {
    const invoice = toCreditInvoice(row({ credit_payments: null, status: "open" }));
    expect(amountPaid(invoice)).toBe(0);
    expect(amountOutstanding(invoice)).toBe(5256000);
  });

  it("reports nothing outstanding on a written-off invoice", () => {
    // The accounting decision, not the arithmetic: the money is not coming,
    // so it must stop appearing in what to chase.
    const invoice = toCreditInvoice(row({ status: "written_off" }));
    expect(amountOutstanding(invoice)).toBe(0);
  });

  it("keeps the dates as stored", () => {
    // `due_on` is stored rather than derived precisely so that shortening an
    // account's terms cannot retroactively make old invoices overdue — 0008
    // says so. Recomputing it here would undo that.
    const invoice = toCreditInvoice(row());
    expect(invoice.issuedOn).toBe("2026-07-15");
    expect(invoice.dueOn).toBe("2026-08-14");
  });

  it("survives an invoice not linked to an order", () => {
    // `quote_id` is nullable and set null on delete, so an invoice can outlive
    // the order it billed — which is the point of ON DELETE RESTRICT on the
    // account.
    expect(toCreditInvoice(row({ quote_id: null })).orderId).toBe("");
  });
});
