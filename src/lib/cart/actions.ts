"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";
import { getCustomer } from "@/lib/auth/customer";
import { linesFromRows, type StoredCartRow } from "./lines";
import type { MergeLine } from "./payload";
import { decideSync } from "@/lib/sync/decide";
import type { CartLine } from "@/lib/stores/cart-store";
import type { Database } from "@/types/database";

// ---------------------------------------------------------------------------
// The cart, server side.
//
// `cart_items` has existed since 0005 and nothing has ever written to it. The
// bag the storefront uses is a zustand store in localStorage, which means it
// does not survive switching device — and "browse on a laptop, buy on a phone"
// is the journey this catalogue is built around.
//
// The local store does not go away. It stays as the bag for signed-out
// visitors and for deployments with no Supabase project, and as the thing the
// UI actually renders; these functions keep it in step with the database for
// the customers who have one. See src/lib/hooks/use-cart.ts for that half.
//
// As in src/lib/orders/reads.ts, there is no ownership filter anywhere below.
// The four RPCs scope every statement to `auth.uid()` themselves — they are
// SECURITY DEFINER, so RLS is not consulted inside them and they have to — and
// `cart_items` reads are policy-scoped. A `.eq("user_id", ...)` here would look
// like the protection while being decoration on top of it.
// ---------------------------------------------------------------------------

/** What a cart read returns, and whether it came from the database. */
export interface CartRead {
  lines: CartLine[];
  /**
   * False when there is no Supabase project or nobody is signed in. The caller
   * keeps its local bag in that case rather than replacing it with an empty
   * one — which is the difference between "we have nothing to sync with" and
   * "your bag is empty".
   */
  live: boolean;
  /**
   * Who the returned bag belongs to, for the client to record against it, or
   * null when `live` is false.
   *
   * The customer's email rather than their user id. It is stable enough for
   * the one job it has — telling "this device already reconciled with this
   * customer" from "somebody else was signed in here" — and it is already in
   * the browser, put there by SessionSync, so using it adds no identifier the
   * client did not already hold.
   */
  syncKey: string | null;
}

/**
 * Only what is needed to rebuild a line. Name, price and image come from the
 * catalogue module — see the note in ./lines.ts — so the join fetches the slug
 * and nothing else.
 */
const CART_SELECT = "size_label, color, qty, retail_products ( slug )";

const NOTHING: CartRead = { lines: [], live: false, syncKey: null };

/**
 * Reconciles the local bag with the stored one, in one round trip.
 *
 * Merge-or-adopt is decided here rather than in the browser because the
 * decision needs to know who is signed in, and the browser does not — not
 * reliably. `useSessionStore` holds an email the customer could have edited by
 * hand; asking the server for it first and then acting would be two requests
 * and a window between them. The client sends what it has (`syncedFor`, its
 * own record of who this bag was last reconciled with) and the server compares
 * it against the session that RLS is actually keyed to.
 *
 * The rule itself is in ./decide.ts, and the merge semantics — keep whichever
 * quantity is larger, per variant — are in `cart_merge()`, with the reasoning
 * in 0016. The short version is that this runs on every sign-in rather than on
 * a button press, so it has to be idempotent: summing would double the bag
 * every time a session expired.
 */
export async function syncCart(
  localLines: MergeLine[],
  syncedFor: string | undefined
): Promise<CartRead> {
  if (!supabaseConfigured()) return NOTHING;

  const customer = await getCustomer();
  if (!customer) return NOTHING;

  const supabase = await createClient();

  const plan = decideSync({
    localCount: localLines.length,
    syncedFor,
    customerKey: customer.email,
  });

  if (plan === "merge") {
    const { error } = await supabase.rpc("cart_merge", { p_lines: localLines });

    if (error) {
      // Read the stored cart anyway. The local additions did not make it,
      // which is a loss — but leaving the two unreconciled means the next
      // mutation pushes against a bag the customer is not looking at, and the
      // read below at least leaves them looking at what is really stored.
      console.error("[cart] could not merge the local cart", error.message);
    }
  }

  const { data, error } = await supabase.from("cart_items").select(CART_SELECT);

  if (error) {
    console.error("[cart] could not read the stored cart", error.message);
    // Not live. A failed read must not be reported as an authoritative empty
    // bag: the caller would adopt it, wiping a local cart the customer can
    // see, over a network blip.
    return NOTHING;
  }

  return {
    lines: linesFromRows((data ?? []) as unknown as StoredCartRow[]),
    live: true,
    syncKey: customer.email,
  };
}

/** What a cart write settled on. */
export interface CartWrite {
  /**
   * Whether there was a session to write against.
   *
   * Separate from `qty` because the caller treats the two failures very
   * differently. "Nobody is signed in" means this bag has diverged from
   * whatever is stored and must be merged rather than replaced at the next
   * sign-in — a session that expired mid-visit is exactly how a customer ends
   * up adding to a bag that nothing is recording. "The call failed" means the
   * customer IS signed in and one write was lost, which is not grounds for
   * re-merging a bag that may be carrying a line they deleted elsewhere.
   *
   * Collapsing both into a null quantity is what made that distinction
   * disappear the first time this was written.
   */
  signedIn: boolean;
  /**
   * The quantity the variant ended up at, or null if the write did not land.
   *
   * Worth returning because it is not always the one asked for: `cart_add`
   * clamps at a ceiling of 99. The caller writes it back rather than assuming,
   * so the browser and the database cannot disagree about the bag.
   */
  qty: number | null;
}

const NOT_SIGNED_IN: CartWrite = { signedIn: false, qty: null };

// The function name is a variable, so it is typed as the set of functions the
// database actually has rather than as `string`. A cart helper renamed in a
// migration, or a typo here, is now a compile error rather than a PostgREST
// 404 discovered by a customer whose basket silently stopped saving.
type CartFunction = Extract<
  keyof Database["public"]["Functions"],
  "cart_add" | "cart_set_qty" | "cart_clear" | "cart_merge"
>;

// Generic over which function, so the arguments are checked against that
// function's parameters rather than against a shape common to all four:
// cart_clear takes none, and cart_add takes four.
async function callCart<F extends CartFunction>(
  fn: F,
  // `[Args] extends [never]` rather than `Args extends never`: cart_clear takes
  // no arguments and the generator writes that as `Args: never`, and a naked
  // `never` in a conditional short-circuits the whole thing to `never`. The
  // tuple wrapper stops the distribution so the branch is actually taken.
  args: [Database["public"]["Functions"][F]["Args"]] extends [never]
    ? Record<string, never>
    : Database["public"]["Functions"][F]["Args"]
): Promise<CartWrite> {
  if (!supabaseConfigured()) return NOT_SIGNED_IN;

  const customer = await getCustomer();
  if (!customer) return NOT_SIGNED_IN;

  const supabase = await createClient();
  // The one cast, and it is where the genericity is erased rather than where a
  // type is being dodged: every call site above is checked against the named
  // function's own parameters, and this line only has `F` in the abstract.
  const { data, error } = await supabase.rpc(
    fn,
    args as Database["public"]["Functions"][F]["Args"]
  );

  if (error) {
    console.error(`[cart] ${fn} failed`, error.message);
    return { signedIn: true, qty: null };
  }

  return { signedIn: true, qty: typeof data === "number" ? data : null };
}

/** Adds to, or increments, one line of the signed-in customer's cart. */
export async function cartAdd(
  slug: string,
  size: string,
  color: string,
  qty: number
): Promise<CartWrite> {
  return callCart("cart_add", { p_slug: slug, p_size: size, p_color: color, p_qty: qty });
}

/** Sets one line to an exact quantity, or removes it when that is zero. */
export async function cartSetQty(
  slug: string,
  size: string,
  color: string,
  qty: number
): Promise<CartWrite> {
  return callCart("cart_set_qty", { p_slug: slug, p_size: size, p_color: color, p_qty: qty });
}

/** Empties the signed-in customer's cart. Returns how many lines went. */
export async function cartClear(): Promise<CartWrite> {
  return callCart("cart_clear", {});
}
