"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";
import { getCustomer } from "@/lib/auth/customer";

// ---------------------------------------------------------------------------
// Deleting your own account.
//
// Required by Apple's guideline 5.1.1(v) — an app that lets you make an
// account must let you delete it from inside the app — and by s.12 of India's
// DPDP Act 2023, which gives the same right in law.
//
// Almost nothing happens here. The whole of the decision is `erase_my_account`
// in 0030: what is erased, what is retained under CGST Rule 56, what refuses
// and why, and the deletion of the login itself. That is deliberate. Erasure
// is irreversible and partly load-bearing for tax compliance, so it belongs
// where it can be tested against a real database rather than split across a
// server action and an auth call that cannot both be made to happen.
//
// See the header of the migration for the retention reasoning, which is the
// part of this feature that actually needed thought.
// ---------------------------------------------------------------------------

/** What the customer is shown after asking to be deleted. */
export interface EraseResult {
  error: string | null;
  /**
   * The receipt from the database: what was erased, how many orders were
   * retained, and the sentence explaining why. Shown to the customer, so the
   * claim it makes has to be one the function actually kept.
   */
  receipt?: {
    erased: Record<string, number>;
    orders_retained: number;
    retained_because: string;
  };
  /** True when there is no database, so there is no account to erase. */
  notConfigured?: boolean;
}

/**
 * Erases the signed-in customer's account.
 *
 * The caller is not a parameter and cannot be: `erase_my_account` reads it
 * from the session with `require_caller()`, so there is no argument with which
 * one customer could name another.
 *
 * Errors are passed through rather than flattened. The refusals the function
 * raises — an undelivered order, an open return, a business account — are
 * written to be read by the person who hit the button, and each one names the
 * thing that has to happen first. Replacing them with "something went wrong"
 * would turn a clear next step into a support ticket.
 */
export async function eraseMyAccount(): Promise<EraseResult> {
  if (!supabaseConfigured()) return { error: null, notConfigured: true };

  const customer = await getCustomer();
  if (!customer) return { error: "Please sign in first" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("erase_my_account");

  if (error) {
    // Logged without the message body: whatever went wrong, this line should
    // not be the thing that copies a customer's email into the server log of a
    // request whose entire purpose was to remove it.
    console.error("[account] erasure did not complete", { code: error.code });

    // 42501 is the permission refusals (staff, business account); 55000 is
    // "not in a state where this can happen" (order in flight, open return).
    // Both carry a sentence written for the customer.
    if (error.code === "42501" || error.code === "55000") {
      return { error: error.message };
    }

    return { error: "We could not delete your account. Please try again, or contact us." };
  }

  return { error: null, receipt: data as unknown as EraseResult["receipt"] };
}
