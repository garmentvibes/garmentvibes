import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { DEMO_COOKIE, demoAdminEnabled, supabaseConfigured, verifyDemoSession } from "./demo";

// ---------------------------------------------------------------------------
// The data access layer for staff identity.
//
// Everything that needs to know "is this request from staff?" asks here, and
// this module only runs on the server — `server-only` turns an accidental
// client import into a build error rather than a silent bundle of this logic
// into the browser.
//
// It fails closed at every branch. No Supabase project and no demo opt-in
// means no staff user, which means the admin panel redirects to its login
// page rather than rendering. There is no path through this file that grants
// access by default.
// ---------------------------------------------------------------------------

/**
 * The only shape of staff identity the rest of the app sees. Deliberately not
 * the profile row: that carries an auth user id and, for wholesale accounts,
 * business details — none of which the admin chrome needs in order to print a
 * name in the sidebar, and all of which would end up in the client bundle the
 * moment this crossed into a Client Component.
 */
export interface StaffUser {
  name: string;
  email: string;
  /** True when this session came from the demo path rather than Supabase Auth. */
  demo: boolean;
}

/**
 * Resolves the current staff user, or null.
 *
 * `cache()` scopes memoisation to a single request, so a layout and the page
 * inside it share one lookup instead of hitting Supabase twice.
 */
export const getStaffUser = cache(async (): Promise<StaffUser | null> => {
  // Read the cookie jar before branching, and read it even when the answer is
  // going to be "nobody". Touching cookies() is what marks a route as
  // depending on the request, and an authorisation boundary must never be
  // prerendered — a statically baked /admin is a decision made at build time
  // about a request that has not happened yet. Without this line, an
  // unconfigured build renders the gate once, at compile time, and ships the
  // result.
  const store = await cookies();

  if (supabaseConfigured()) return getSupabaseStaffUser();
  if (demoAdminEnabled()) return getDemoStaffUser(store);
  return null;
});

async function getSupabaseStaffUser(): Promise<StaffUser | null> {
  const supabase = await createClient();

  // getUser(), never getSession(). getSession() reads the cookie and trusts
  // it; getUser() revalidates the token with the auth server, which is the
  // difference between "the browser sent something shaped like a session" and
  // "this person is signed in".
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  // Being signed in is not being staff. The role lives in `profiles`, and the
  // RLS policy on that table only lets a caller read their own row — so this
  // query cannot be steered into reading somebody else's.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") return null;

  return {
    name: profile.full_name,
    email: profile.email,
    demo: false,
  };
}

type CookieStore = Awaited<ReturnType<typeof cookies>>;

async function getDemoStaffUser(store: CookieStore): Promise<StaffUser | null> {
  const email = verifyDemoSession(store.get(DEMO_COOKIE)?.value);
  if (!email) return null;

  return {
    name: email.split("@")[0],
    email,
    demo: true,
  };
}

/**
 * The gate. Server Components and Server Actions behind /admin call this
 * first; it either returns the staff user or never returns at all.
 *
 * Next.js documents that a proxy matcher does not cover Server Functions
 * reliably — a matcher change or moving an action to another route silently
 * drops proxy coverage — so `src/proxy.ts` redirecting unauthenticated
 * traffic is a convenience, and this is the check that actually holds.
 */
export async function requireStaff(): Promise<StaffUser> {
  const user = await getStaffUser();
  if (!user) redirect("/admin/login");
  return user;
}
