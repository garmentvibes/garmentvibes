"use client";

import { useCallback } from "react";
import { useCartStore } from "@/lib/stores/cart-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { signOutCustomer } from "@/lib/auth/customer-actions";

// ---------------------------------------------------------------------------
// Signing out, on both sides of the app.
//
// Until now the two Sign out buttons called `useSessionStore.logout()` and
// nothing else, which cleared the local store and left the Supabase cookie
// exactly where it was. On a deployment with a database that is not a sign
// out: SessionSync asks the server who is signed in on the next load, the
// server still says "this customer", and the store is repopulated. The button
// appears to work — the header empties, the toast fires, the redirect
// happens — and the customer is back a moment later.
//
// It was invisible because every environment the buttons have been exercised
// in has no Supabase project configured, where `signOutCustomer()` is a no-op
// and clearing the store genuinely is the whole of signing out.
// ---------------------------------------------------------------------------

/**
 * Ends the session on the server, then locally.
 *
 * Server first. If the order were reversed and the round trip failed, the
 * store would already be empty and the customer would believe they had signed
 * out of a session that is still live — which, on the shared laptop this
 * matters for, is the wrong way round to fail.
 */
export function useSignOut(): () => Promise<void> {
  const logout = useSessionStore((s) => s.logout);

  return useCallback(async () => {
    await signOutCustomer();
    logout();

    // The bag goes too, but only if it came from a server. `syncedFor` being
    // set is what says so: the lines on screen are then a copy of a stored
    // cart that is safe in the database and will come back at the next sign
    // in, and leaving them on screen would show the next person to use this
    // browser what the last one was buying.
    //
    // With no database there is nothing to come back from, so a signed-out
    // visitor's bag is left alone — binning it would be destroying the only
    // copy of something the customer assembled.
    const cart = useCartStore.getState();
    if (cart.syncedFor !== undefined) {
      // The store's own clear, deliberately, not the one from `useCart`.
      // That one also calls `cart_clear()`, which would empty the stored cart
      // as well — turning "sign out" into "throw away my bag".
      cart.clear();
      cart.forgetSync();
    }
  }, [logout]);
}
