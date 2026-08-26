"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";
import { getStaffUser } from "@/lib/auth/dal";
import { INVOICE_SELECT, toCreditInvoice, type InvoiceRow } from "./rows";
import type { CreditInvoice } from "@/types/credit";

// ---------------------------------------------------------------------------
// The credit ledger, from the database.
//
// `credit_invoices` and `credit_payments` have existed since 0008, with a
// trigger deriving invoice status from the payments and a `security_invoker`
// view for balances. Nothing in TypeScript read either table: /admin/credit
// rendered `SEED_CREDIT_INVOICES` from a zustand store and recorded payments
// into it.
//
// That is a worse failure than the catalogue equivalents. A payment recorded
// against a Net-30 invoice is a business being told it no longer owes money —
// and it was being told that by one browser, which no colleague could see, no
// server could read, and clearing site data would erase. Two people chasing
// the same account would each have their own idea of what had been received.
//
// No account filter here: the staff policy from 0008 is
// `for all using (is_staff())`, and a filter in the query would look like the
// protection while being decoration on top of it.
// ---------------------------------------------------------------------------

export interface CreditRead {
  invoices: CreditInvoice[];
  /**
   * False when there was nothing to read from — no Supabase project, or the
   * caller is not staff — and the panel keeps its seed.
   *
   * Distinct from `live: true` with an empty list, which is a shop that has
   * issued no invoices. Those must render differently: "no invoices" and "the
   * ledger failed to load" are not the same news for a finance screen.
   */
  live: boolean;
}

/** Every credit invoice with its payments, newest first. */
export async function allCreditInvoices(): Promise<CreditRead> {
  if (!supabaseConfigured()) return { invoices: [], live: false };

  const staff = await getStaffUser();
  if (!staff) return { invoices: [], live: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credit_invoices")
    .select(INVOICE_SELECT)
    .order("issued_on", { ascending: false });

  if (error) {
    console.error("[admin/credit] could not read the ledger", error.message);
    // Not `live: false`. Falling back to the seed would put fictional debts in
    // front of somebody about to chase one, and "you owe us ₹52,560" against
    // an invoice that does not exist is the worst outcome this screen has.
    return { invoices: [], live: true };
  }

  return {
    invoices: (data as unknown as InvoiceRow[]).map(toCreditInvoice),
    live: true,
  };
}
