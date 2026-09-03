"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";

// ---------------------------------------------------------------------------
// "Tell me when it's back", server side.
//
// `stock_alerts` has existed since 0005 and nothing has ever written to it.
// The registrations the storefront collects live in a zustand store, so an
// alert taken on a phone is invisible everywhere else — including to whatever
// would send it.
//
// Unlike the cart and the wishlist there is nothing to reconcile here. A
// registration is not a list the customer edits and expects to find again; it
// is a one-off request that either reaches the server or does not. So there is
// no merge, no sync marker, and no adopt — just a write, and a local store
// kept for deployments with no database.
// ---------------------------------------------------------------------------

export interface StockAlertResult {
  error: string | null;
  /**
   * True when a registration was written, false when this address was already
   * waiting on this variant. Not an error: the caller says "you're already on
   * the list" rather than "something went wrong".
   */
  added?: boolean;
  /** True when there is no database; the caller keeps its local store. */
  notConfigured?: boolean;
}

/**
 * Registers interest in a sold-out variant.
 *
 * Signed in or not — that is the feature, and 0029 grants `anon` execute for
 * it. What the caller cannot do is say who they are: `user_id` is read from
 * the session inside the function, not passed, because a caller who could set
 * it could file a registration under somebody else's account.
 *
 * Addressed by slug, like every other function the app calls.
 */
export async function subscribeToRestock(
  slug: string,
  size: string,
  email: string,
  name: string
): Promise<StockAlertResult> {
  if (!supabaseConfigured()) return { error: null, notConfigured: true };

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("stock_alert_subscribe", {
    p_slug: slug,
    p_size: size,
    p_email: email,
    p_name: name,
  });

  if (error) {
    console.error("[stock-alerts] could not register interest", {
      slug,
      size,
      message: error.message,
    });

    // The function's own messages name a product, a size or the address —
    // nothing internal — so they are safe to show and more useful than a
    // generic sentence.
    if (error.message.includes("valid email")) {
      return { error: "Enter a valid email address" };
    }
    if (error.message.includes("not available")) {
      return { error: `That size is not one we sell for this product` };
    }
    if (error.message.includes("No such product")) {
      return { error: "We are not selling that product at the moment" };
    }
    return { error: "We could not sign you up. Please try again." };
  }

  return { error: null, added: data === true };
}
