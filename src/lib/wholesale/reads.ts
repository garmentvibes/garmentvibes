"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";
import { getCustomer } from "@/lib/auth/customer";
import { QUOTE_SELECT, toWholesaleQuote, type QuoteRow } from "@/lib/admin/quotes/rows";
import type { WholesaleQuote } from "@/types/admin";

// ---------------------------------------------------------------------------
// A buyer's own quotes and bulk orders.
//
// The counterpart to lib/admin/quotes/reads.ts, and written in the same change
// deliberately. Moving only the admin side would have left staff looking at
// real quotes while the buyer's own dashboard still rendered
// `SEED_WHOLESALE_QUOTES` — the two halves of one conversation disagreeing
// about whether a consignment had shipped, which is the mirror image of the
// bug being fixed and worse for the person with the delivery deadline.
//
// No ownership check here, deliberately. RLS scopes `wholesale_quotes` to
// `auth.uid()` and the items to quotes the caller owns, so the query cannot be
// steered into another business's order book. An `.eq("user_id", …)` would look
// like the protection while being decoration on top of it.
// ---------------------------------------------------------------------------

export interface WholesaleQuoteRead {
  quotes: WholesaleQuote[];
  /**
   * False when there is no Supabase project or nobody is signed in, in which
   * case the caller keeps showing the demo seed. Distinct from an empty list
   * with `live: true`, which is a real business that has not ordered yet.
   */
  live: boolean;
}

/** Every quote and bulk order belonging to the signed-in buyer, newest first. */
export async function myWholesaleQuotes(): Promise<WholesaleQuoteRead> {
  if (!supabaseConfigured()) return { quotes: [], live: false };

  const customer = await getCustomer();
  if (!customer) return { quotes: [], live: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wholesale_quotes")
    .select(QUOTE_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[wholesale] could not read the buyer's quotes", error.message);
    // Not `live: false`. The buyer IS signed in and this deployment does have a
    // database, so falling back to the seed would show them another business's
    // fictional orders because a query failed.
    return { quotes: [], live: true };
  }

  return {
    quotes: (data as unknown as QuoteRow[]).map(toWholesaleQuote),
    live: true,
  };
}
