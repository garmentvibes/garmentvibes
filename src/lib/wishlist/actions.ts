"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";
import { getCustomer } from "@/lib/auth/customer";
import { decideSync } from "@/lib/sync/decide";
import { slugsFromRows, type StoredWishlistRow } from "./rows";

// ---------------------------------------------------------------------------
// The wishlist, server side.
//
// The counterpart to src/lib/cart/actions.ts, and deliberately its shape. The
// local store stays as the wishlist for signed-out visitors and for
// deployments with no Supabase project, and as the thing the UI renders; these
// keep it in step with `wishlists` for customers who have a session. See
// src/lib/hooks/use-wishlist.ts for that half.
//
// As in the cart actions, there is no ownership filter anywhere below. The
// three RPCs scope every statement to `auth.uid()` themselves — they are
// SECURITY DEFINER, so RLS is not consulted inside them and they have to — and
// the read is policy-scoped. A `.eq("user_id", ...)` here would look like the
// protection while being decoration on top of it.
// ---------------------------------------------------------------------------

/** What a wishlist read returns, and whether it came from the database. */
export interface WishlistRead {
  /** Slugs, matching what the store holds. */
  productIds: string[];
  /**
   * False when there is no Supabase project or nobody is signed in. The caller
   * keeps its local list in that case rather than replacing it with an empty
   * one — the difference between "we have nothing to sync with" and "you have
   * saved nothing".
   */
  live: boolean;
  /**
   * Who the returned list belongs to, for the client to record against it, or
   * null when `live` is false. The customer's email, for the reasons set out
   * on `CartRead.syncKey`.
   */
  syncKey: string | null;
}

/**
 * The join back to the catalogue. `wishlists` stores the uuid; every consumer
 * works in slugs, so the slug is the only column worth reading and the uuid
 * never leaves the server.
 */
const WISHLIST_SELECT = "retail_products ( slug )";

const NOTHING: WishlistRead = { productIds: [], live: false, syncKey: null };

/**
 * Reconciles the local wishlist with the stored one, in one round trip.
 *
 * Merge-or-adopt is decided here rather than in the browser for the reason
 * given in the cart's `syncCart`: the decision needs to know who is signed in,
 * and the browser's idea of that is a value the customer could have edited.
 * The client sends what it has and the server compares it against the session
 * RLS is actually keyed to.
 *
 * The rule is shared — src/lib/sync/decide.ts — and the merge itself is
 * `wishlist_merge`, which is idempotent by construction: a wishlist entry has
 * no quantity to double, so saving it twice is saving it once.
 */
export async function syncWishlist(
  localProductIds: string[],
  syncedFor: string | undefined
): Promise<WishlistRead> {
  if (!supabaseConfigured()) return NOTHING;

  const customer = await getCustomer();
  if (!customer) return NOTHING;

  const supabase = await createClient();

  const plan = decideSync({
    localCount: localProductIds.length,
    syncedFor,
    customerKey: customer.email,
  });

  if (plan === "merge") {
    const { error } = await supabase.rpc("wishlist_merge", { p_slugs: localProductIds });

    if (error) {
      // Read the stored list anyway, exactly as the cart does. The local saves
      // did not make it, which is a loss — but leaving the two unreconciled
      // means the next toggle pushes against a list the customer is not
      // looking at.
      console.error("[wishlist] could not merge the local wishlist", error.message);
    }
  }

  const { data, error } = await supabase.from("wishlists").select(WISHLIST_SELECT);

  if (error) {
    console.error("[wishlist] could not read the stored wishlist", error.message);
    // Not live. A failed read must not be reported as an authoritative empty
    // list: the caller would adopt it, clearing hearts the customer can see,
    // over a network blip.
    return NOTHING;
  }

  return {
    productIds: slugsFromRows((data ?? []) as unknown as StoredWishlistRow[]),
    live: true,
    syncKey: customer.email,
  };
}

/** What a wishlist write settled on. */
export interface WishlistWrite {
  /**
   * Whether there was a session to write against.
   *
   * Separate from `changed` for the reason set out on `CartWrite.signedIn`:
   * "nobody is signed in" means this list has diverged from whatever is stored
   * and must be merged rather than replaced at the next sign-in, while "the
   * call failed" means the customer IS signed in and one write was lost —
   * which is not grounds for re-merging a list that may be carrying something
   * they un-hearted elsewhere.
   */
  signedIn: boolean;
  /**
   * Whether a row was actually written or removed, or null if the call did not
   * land. False is not a failure: it means the product was already saved, or
   * already not.
   */
  changed: boolean | null;
}

const NOT_SIGNED_IN: WishlistWrite = { signedIn: false, changed: null };

async function callWishlist(
  fn: "wishlist_add" | "wishlist_remove",
  slug: string
): Promise<WishlistWrite> {
  if (!supabaseConfigured()) return NOT_SIGNED_IN;

  const customer = await getCustomer();
  if (!customer) return NOT_SIGNED_IN;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, { p_slug: slug });

  if (error) {
    console.error(`[wishlist] ${fn} failed`, error.message);
    return { signedIn: true, changed: null };
  }

  return { signedIn: true, changed: typeof data === "boolean" ? data : null };
}

/** Saves a product to the signed-in customer's wishlist. */
export async function wishlistAdd(slug: string): Promise<WishlistWrite> {
  return callWishlist("wishlist_add", slug);
}

/** Removes a product from the signed-in customer's wishlist. */
export async function wishlistRemove(slug: string): Promise<WishlistWrite> {
  return callWishlist("wishlist_remove", slug);
}
