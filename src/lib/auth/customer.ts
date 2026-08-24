import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "./demo";

// ---------------------------------------------------------------------------
// The data access layer for customer identity.
//
// `dal.ts` answers "is this request from staff?". This answers "which customer
// is this?", and the difference matters: staff identity gates a whole route
// group, while customer identity decides which rows RLS will hand back. Every
// one of the customer-owned tables — retail_orders, cart_items, wishlists,
// retail_addresses — is scoped by `auth.uid()`, so without a real session on
// the server there is nobody to scope to and every query returns nothing.
//
// This is what `src/lib/stores/session-store.ts` never was. That store is a
// zustand object in localStorage, and its own header says not to treat it as
// secure; it can say anyone is signed in as anyone. It stays, because 19
// components read it for their chrome, but it is now a *reflection* of this
// rather than the source. Anything that decides what a customer may see or do
// asks here.
// ---------------------------------------------------------------------------

export type CustomerRole = "retail" | "wholesale";

/**
 * The customer identity the rest of the app sees.
 *
 * Deliberately not the profile row. That carries `wholesale_account_id` and
 * the credit terms hanging off it, none of which the storefront chrome needs
 * to print a name in a header — and all of which would cross into the client
 * bundle the moment this did.
 */
export interface Customer {
  id: string;
  name: string;
  email: string;
  role: CustomerRole;
  /** Set for a trade buyer, so the wholesale portal can find their business. */
  wholesaleAccountId: string | null;
}

/**
 * The current customer, or null.
 *
 * `cache()` scopes memoisation to one request, so a layout and the page inside
 * it share a single lookup rather than each paying for a round trip.
 */
export const getCustomer = cache(async (): Promise<Customer | null> => {
  // Read the cookie jar before branching, and read it even when the answer is
  // going to be "nobody" — same reasoning as dal.ts. Touching cookies() is
  // what marks the route as depending on the request; a page that decides who
  // someone is must never be prerendered.
  await cookies();

  if (!supabaseConfigured()) return null;

  const supabase = await createClient();

  // getUser(), never getSession(). getSession() reads the cookie and believes
  // it; getUser() revalidates with the auth server. That is the difference
  // between "the browser sent something shaped like a session" and "this
  // person is signed in".
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  // 0015 guarantees a profile exists for every account, so a missing row here
  // means something is wrong rather than "new customer" — return null and let
  // the caller treat them as signed out rather than inventing a default.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, full_name, email, wholesale_account_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return null;

  // Staff signing into the storefront are not customers. They have no orders
  // of their own and no wholesale account; treating them as a customer would
  // show them an empty account page and let them check out as themselves.
  if (profile.role !== "retail" && profile.role !== "wholesale") return null;

  return {
    id: profile.id,
    name: profile.full_name,
    email: profile.email,
    role: profile.role,
    wholesaleAccountId: profile.wholesale_account_id ?? null,
  };
});
