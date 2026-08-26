"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";
import { getStaffUser } from "@/lib/auth/dal";
import type { CreditPayment } from "@/types/credit";

// ---------------------------------------------------------------------------
// Recording money against a credit invoice.
//
// ---------------------------------------------------------------------------
// Why status is not set here
// ---------------------------------------------------------------------------
//
// It cannot be. 0008 derives it with a trigger on `credit_payments`, and its
// note explains why: the client store already computed status from the
// payments "so it can never disagree with the arithmetic underneath it", and
// that guarantee belongs where no code path can break it.
//
// So the write is an INSERT and nothing else. open → part_paid → paid follows
// on its own, a written-off invoice stays written off even if a late payment
// arrives against it, and overpayment caps at `paid` rather than being refused
// — duplicate transfers genuinely happen, and refusing to record one leaves
// the ledger further from the truth than recording it does.
//
// ---------------------------------------------------------------------------
// Who keyed it in
// ---------------------------------------------------------------------------
//
// `recorded_by` is stamped from the signed-in staff user rather than accepted
// from the caller. Cash handling needs a name against it, and a name the
// person entering the payment could choose is not one.
// ---------------------------------------------------------------------------

export interface CreditWriteResult {
  error: string | null;
  /** True when there was no database; the caller keeps its local store. */
  notConfigured?: boolean;
}

const NOT_STAFF: CreditWriteResult = { error: "Only staff can manage the credit ledger" };

async function staffClient() {
  if (!supabaseConfigured()) return { client: null, notConfigured: true as const };

  const staff = await getStaffUser();
  if (!staff) return { client: null, notConfigured: false as const };

  return { client: await createClient(), notConfigured: false as const };
}

/**
 * The auth id of the staff member making this request, for `recorded_by`.
 *
 * Read from the session rather than taken from `getStaffUser()`, which carries
 * a name and an email but no id — and rather than accepted as an argument,
 * because a name the person entering a payment could choose is not
 * accountability. Null only where the column already allows it.
 *
 * getUser(), not getSession(): the latter trusts the cookie as it stands, and
 * this is the name that ends up against a receipt.
 */
async function recordedBy(client: NonNullable<Awaited<ReturnType<typeof createClient>>>) {
  const { data } = await client.auth.getUser();
  return data.user?.id ?? null;
}

function republish() {
  revalidatePath("/admin/credit");
  revalidatePath("/admin");
  // The buyer's own statement reads the same rows.
  revalidatePath("/wholesale/account");
  revalidatePath("/wholesale/dashboard");
}

/**
 * Records a receipt against an invoice.
 *
 * `reference` is the identifier the bank statement will show — a UTR, cheque
 * number or UPI reference — and is what makes a recorded payment checkable
 * against the account later.
 *
 * Addressed by the invoice's reference rather than its uuid, like everything
 * else the panel does: that is what is printed on the invoice and what the
 * business quotes when they pay.
 */
export async function recordCreditPayment(
  invoiceReference: string,
  payment: Omit<CreditPayment, "id">
): Promise<CreditWriteResult> {
  const { client, notConfigured } = await staffClient();
  if (notConfigured) return { error: null, notConfigured: true };
  if (!client) return NOT_STAFF;

  // Validated here as well as in the form: this is the copy an admin cannot
  // skip by posting to the action directly, and `amount > 0` is a check
  // constraint that would otherwise raise a Postgres error at them.
  if (!Number.isInteger(payment.amount) || payment.amount <= 0) {
    return { error: "A payment has to be a positive whole number of paise" };
  }

  const { data: invoice, error: lookupError } = await client
    .from("credit_invoices")
    .select("id, status")
    .eq("reference", invoiceReference)
    .maybeSingle();

  if (lookupError) {
    console.error("[admin/credit] could not find the invoice", {
      invoiceReference,
      message: lookupError.message,
    });
    return { error: "Could not record that payment" };
  }

  if (!invoice) return { error: "No such invoice" };

  const { error } = await client.from("credit_payments").insert({
    invoice_id: invoice.id,
    amount: payment.amount,
    received_on: payment.receivedOn,
    method: payment.method,
    reference: payment.reference ?? null,
    recorded_by: await recordedBy(client),
  });

  if (error) {
    console.error("[admin/credit] could not record the payment", {
      invoiceReference,
      message: error.message,
    });
    return { error: "Could not record that payment" };
  }

  republish();

  return { error: null };
}

/**
 * Writes an invoice off.
 *
 * Set directly rather than derived, because this is the one status the
 * payments cannot imply — it is an accounting decision that money will not be
 * collected, not a fact about what has been received. The trigger in 0008
 * knows to leave it alone afterwards.
 *
 * Deliberately one-way here. Reversing a write-off is a decision that should
 * leave a trail rather than a button, and there is nowhere yet to record who
 * reversed it or why.
 */
export async function writeOffCreditInvoice(
  invoiceReference: string
): Promise<CreditWriteResult> {
  const { client, notConfigured } = await staffClient();
  if (notConfigured) return { error: null, notConfigured: true };
  if (!client) return NOT_STAFF;

  const { data, error } = await client
    .from("credit_invoices")
    .update({ status: "written_off" })
    .eq("reference", invoiceReference)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[admin/credit] could not write off the invoice", {
      invoiceReference,
      message: error.message,
    });
    return { error: "Could not write that invoice off" };
  }

  if (!data) return { error: "No such invoice" };

  republish();

  return { error: null };
}
