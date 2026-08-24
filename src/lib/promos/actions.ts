"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";
import { getCustomer } from "@/lib/auth/customer";
import type { PromoEvaluation } from "@/lib/promo-eligibility";
import { verdictFromRpc, type PromoRpcResult } from "./verdict";

// ---------------------------------------------------------------------------
// Asking the database whether a code may be used.
//
// The rules already exist twice over: `evaluatePromo()` in
// src/lib/promo-eligibility.ts, and `evaluate_promo()` in 0017. That is not
// duplication for its own sake — the local one is the only one a deployment
// with no database has, and its header has always said what it is worth:
//
//     browser-side enforcement is advisory
//
// What makes this worth the round trip is that the local one counts
// redemptions in the localStorage of the person being counted. A
// one-per-customer code resets with the Clear Site Data button, and a code
// capped at 100 is unlimited to anyone with a second browser. The count here
// is in a table that customer cannot write to.
//
// This does not enforce anything either. `place_retail_order` does, in the
// same transaction as the order — see 0017. The job of this function is to
// tell the customer the truth at "Apply" rather than at "Pay", so a code that
// is going to be refused is refused while they can still do something about
// it.
// ---------------------------------------------------------------------------

/** The server's verdict, or null when there is nobody to ask. */
export type ServerPromoEvaluation = PromoEvaluation | null;

/**
 * Whether the signed-in customer may use a code.
 *
 * Returns null — not a rejection — when there is no Supabase project or
 * nobody is signed in. The caller falls back to the local rules in that case,
 * because "we cannot check" and "you may not" are different answers and
 * conflating them would refuse every code on a deployment without a database.
 */
export async function evaluatePromoOnServer(code: string): Promise<ServerPromoEvaluation> {
  if (!supabaseConfigured()) return null;

  const customer = await getCustomer();
  if (!customer) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("evaluate_promo", { p_code: code });

  if (error) {
    console.error("[promo] could not evaluate the code", error.message);
    // Null rather than a rejection, again. A network blip must not tell a
    // customer their code is invalid — `place_retail_order` still has the
    // final say, so falling back to the local rules risks accepting a code
    // that will be refused at payment, which is recoverable. Refusing a
    // perfectly good code is not: they go away.
    return null;
  }

  return verdictFromRpc(data as PromoRpcResult | null);
}
