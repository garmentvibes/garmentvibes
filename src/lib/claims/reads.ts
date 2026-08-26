"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";
import { getCustomer } from "@/lib/auth/customer";
import { getStaffUser } from "@/lib/auth/dal";
import { CLAIM_SELECT, toWholesaleClaim, type ClaimRow } from "./rows";
import type { WholesaleClaim } from "@/types/claims";

// ---------------------------------------------------------------------------
// Wholesale claims, from the database.
//
// The last of the 0007 tables nothing in TypeScript read. A buyer raising a
// short-shipment claim wrote it into their own browser, and the queue staff
// worked from held only the seed — so a business could report that a
// consignment arrived 40 units light and nobody at this end would ever see it.
//
// Both reads lean on the policies rather than filtering: staff get
// `for all using (is_staff())`, a buyer gets the one scoped to their account.
// ---------------------------------------------------------------------------

export interface ClaimRead {
  claims: WholesaleClaim[];
  /**
   * False when there was nothing to read from. Distinct from `live: true` with
   * an empty list, which is a consignment history with no disputes in it —
   * good news rather than a broken page.
   */
  live: boolean;
}

/** Every claim, newest first. Staff only. */
export async function allClaims(): Promise<ClaimRead> {
  if (!supabaseConfigured()) return { claims: [], live: false };

  const staff = await getStaffUser();
  if (!staff) return { claims: [], live: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wholesale_claims")
    .select(CLAIM_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[claims] could not read the queue", error.message);
    // Not the seed: invented claims in front of somebody about to raise a
    // credit note is money moving against a dispute that does not exist.
    return { claims: [], live: true };
  }

  return { claims: (data as unknown as ClaimRow[]).map(toWholesaleClaim), live: true };
}

/** The signed-in buyer's own claims, newest first. */
export async function myClaims(): Promise<ClaimRead> {
  if (!supabaseConfigured()) return { claims: [], live: false };

  const customer = await getCustomer();
  if (!customer) return { claims: [], live: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wholesale_claims")
    .select(CLAIM_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[claims] could not read the buyer's claims", error.message);
    return { claims: [], live: true };
  }

  return { claims: (data as unknown as ClaimRow[]).map(toWholesaleClaim), live: true };
}
