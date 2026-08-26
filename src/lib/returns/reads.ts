"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";
import { getCustomer } from "@/lib/auth/customer";
import { getStaffUser } from "@/lib/auth/dal";
import { RETURN_SELECT, toReturnRequest, type ReturnRow } from "./rows";
import type { ReturnRequest } from "@/types/returns";

// ---------------------------------------------------------------------------
// Return requests, from the database.
//
// `return_requests` and `return_items` have existed since 0007, with policies
// that already say exactly who may do what: a customer raises a return on
// their own order and can never decide it, staff decide everything. Nothing in
// TypeScript read either table — the customer's request form and the admin
// queue both used a zustand store seeded from src/lib/mock/returns-data.ts.
//
// So a return a customer raised existed only in that customer's browser, and
// the queue staff worked from contained only invented ones. Neither side could
// see the other, on a flow whose entire purpose is the two sides communicating
// about a specific parcel.
//
// Both reads below rely on the policies rather than filtering: staff get the
// `for all using (is_staff())` policy, a customer gets the one scoped through
// their own orders. A `.eq()` doing the same job would look like the
// protection while being decoration on top of it.
// ---------------------------------------------------------------------------

export interface ReturnRead {
  requests: ReturnRequest[];
  /**
   * False when there was nothing to read from — no Supabase project, or nobody
   * signed in / not staff — and the caller keeps its seed.
   *
   * Distinct from `live: true` with an empty list, which is a customer who has
   * never returned anything, or a queue with nothing waiting.
   */
  live: boolean;
}

/** Every return request, newest first. Staff only. */
export async function allReturns(): Promise<ReturnRead> {
  if (!supabaseConfigured()) return { requests: [], live: false };

  const staff = await getStaffUser();
  if (!staff) return { requests: [], live: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("return_requests")
    .select(RETURN_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[returns] could not read the queue", error.message);
    // Not `live: false`. Fictional returns in front of somebody about to
    // approve a refund is the worst thing this screen can do.
    return { requests: [], live: true };
  }

  return {
    requests: (data as unknown as ReturnRow[]).map(toReturnRequest),
    live: true,
  };
}

/** The signed-in customer's own return requests, newest first. */
export async function myReturns(): Promise<ReturnRead> {
  if (!supabaseConfigured()) return { requests: [], live: false };

  const customer = await getCustomer();
  if (!customer) return { requests: [], live: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("return_requests")
    .select(RETURN_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[returns] could not read the customer's returns", error.message);
    return { requests: [], live: true };
  }

  return {
    requests: (data as unknown as ReturnRow[]).map(toReturnRequest),
    live: true,
  };
}
