"use client";

import { useEffect } from "react";
import { useSessionStore } from "@/lib/stores/session-store";
import { currentCustomer } from "@/lib/auth/customer-actions";

// ---------------------------------------------------------------------------
// Mirrors the server's idea of who is signed in into the client store.
//
// Nineteen components read `useSessionStore` to decide what chrome to draw —
// which header, whether "My Orders" appears, whether a review form is offered.
// Rewriting all of them into server components would be a large change with a
// lot of surface for mistakes, and would not by itself make anything safer.
//
// What makes it safer is which direction the truth flows. Before this, the
// store WAS the session: `login({ name, email, role })` and you were whoever
// you said you were. Now the server decides and the store reflects it, so the
// worst a tampered localStorage can do is draw the wrong header. Every server
// action re-derives identity from the Supabase cookie via
// `src/lib/auth/customer.ts`, and RLS scopes every row by `auth.uid()`
// whatever the browser believes.
//
// The store is presentation. It is not permission.
//
// ---------------------------------------------------------------------------
// Why this fetches rather than being handed the session as a prop
// ---------------------------------------------------------------------------
//
// Resolving the customer in the root layout is the obvious shape and it costs
// too much: getCustomer() reads cookies(), which opts the entire tree out of
// static prerendering. Measured, with Supabase configured — `/` and
// `/shop/product/[slug]` both flip from ○ to ƒ, taking roughly sixty
// prerendered catalogue pages with them. next.config.ts already weighs that
// prerendering against a stricter CSP and keeps the prerendering; spending it
// here, as a side effect of drawing a name in a header, would be worse.
//
// So the pages stay static and the session arrives just after hydration. The
// store is persisted, so the header renders immediately from what it last
// knew and is corrected a moment later — which is the right order: instant
// from cache, authoritative from the server.
// ---------------------------------------------------------------------------

export function SessionSync() {
  const login = useSessionStore((s) => s.login);
  const logout = useSessionStore((s) => s.logout);

  useEffect(() => {
    let cancelled = false;

    currentCustomer()
      .then((result) => {
        if (cancelled || !result.authoritative) return;

        if (result.customer) {
          login(result.customer);
        } else {
          // Signed out on the server. Clearing is what stops a stale name
          // sitting in the header after a session expires or is revoked from
          // another device.
          logout();
        }
      })
      .catch(() => {
        // A failed lookup is not a sign-out. The network dropped, or the auth
        // server is briefly unreachable; logging the customer out of their own
        // chrome because of it would be worse than showing what we last knew,
        // and nothing they can do while it is wrong will get past RLS anyway.
      });

    return () => {
      cancelled = true;
    };
  }, [login, logout]);

  return null;
}
