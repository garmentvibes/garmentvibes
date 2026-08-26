"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";
import { getStaffUser } from "@/lib/auth/dal";
import { QUOTE_SELECT, toWholesaleQuote, type QuoteRow } from "./rows";
import type { WholesaleQuote } from "@/types/admin";

// ---------------------------------------------------------------------------
// Every quote and bulk order, for the people who have to fulfil them.
//
// The same problem #37 fixed on the retail side, on the other half of the
// panel: `useWholesaleQuotes()` returned `SEED_WHOLESALE_QUOTES` with status
// changes layered on from localStorage, and nothing ever put a real request
// into that array. A business could submit a quote request, have it land in
// `wholesale_quotes`, and staff would never see it.
//
// It is arguably worse here than for retail. A wholesale buyer is a business
// with a delivery deadline and a purchase order, chasing a consignment by
// phone — and the person they are chasing was looking at a list that could not
// contain it.
//
// No ownership filter, deliberately: the staff policy from 0004 is
// `for all using (is_staff())`, and a filter in the query would look like the
// protection while being decoration on top of it.
// ---------------------------------------------------------------------------

export interface AdminQuoteRead {
  quotes: WholesaleQuote[];
  /**
   * False when there was nothing to read from — no Supabase project, or the
   * caller is not staff — and the panel falls back to the demo seed.
   *
   * Distinct from `live: true` with an empty list, which is a real portal with
   * no requests yet.
   */
  live: boolean;
}

/** Every wholesale quote and bulk order, newest first. */
export async function allWholesaleQuotes(): Promise<AdminQuoteRead> {
  if (!supabaseConfigured()) return { quotes: [], live: false };

  const staff = await getStaffUser();
  if (!staff) return { quotes: [], live: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wholesale_quotes")
    .select(QUOTE_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin/quotes] could not read quotes", error.message);
    // Not `live: false`. Falling back to the seed here would put fictional
    // quotes in front of somebody about to act on one.
    return { quotes: [], live: true };
  }

  return {
    quotes: (data as unknown as QuoteRow[]).map(toWholesaleQuote),
    live: true,
  };
}
