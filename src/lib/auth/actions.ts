"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { callerKey, createRateLimiter } from "@/lib/rate-limit";
import {
  DEMO_COOKIE,
  DEMO_SESSION_MAX_AGE,
  demoAdminEnabled,
  signDemoSession,
  supabaseConfigured,
} from "./demo";

export interface SignInState {
  error: string | null;
}

const Credentials = z.object({
  email: z.email({ error: "Enter a valid email address" }),
  password: z.string().min(6, { error: "Enter your password" }),
});

// Sign-in is the one endpoint where guessing is the attack. Five attempts a
// minute is generous for someone who mistyped their own password and useless
// for anyone working through a word list. Keyed by caller rather than by
// email, so an attacker cannot get a fresh allowance per address tried.
const LIMIT = 5;
const signInLimiter = createRateLimiter({ limit: LIMIT, windowMs: 60_000 });

// One message for "no such account" and "wrong password" alike. Distinguishing
// them turns the login form into an oracle for which staff emails exist.
const INVALID = "Those credentials were not recognised";

export async function signInAdmin(
  _previous: SignInState,
  formData: FormData
): Promise<SignInState> {
  const parsed = Credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details and try again" };
  }

  const requestHeaders = await headers();
  const limit = signInLimiter.check(callerKey(requestHeaders));
  if (!limit.allowed) {
    return {
      error: `Too many sign-in attempts. Try again in ${limit.retryAfterSeconds} seconds.`,
    };
  }

  const { email, password } = parsed.data;

  if (supabaseConfigured()) {
    const failure = await signInWithSupabase(email, password);
    if (failure) return { error: failure };
  } else if (demoAdminEnabled()) {
    await startDemoSession(email);
  } else {
    return {
      error: "Admin sign-in is unavailable: this deployment has no Supabase project configured.",
    };
  }

  // Outside the try/catch surface above on purpose: redirect() signals by
  // throwing, so calling it inside a try would be caught as a failure.
  redirect("/admin");
}

async function signInWithSupabase(email: string, password: string): Promise<string | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return INVALID;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    // Correct password, wrong person. Sign the session straight back out
    // rather than leaving a customer holding a valid cookie on the admin
    // origin, and answer with the same message as a bad password so this
    // does not become a way to enumerate which accounts are staff.
    await supabase.auth.signOut();
    return INVALID;
  }

  return null;
}

async function startDemoSession(email: string): Promise<void> {
  const store = await cookies();
  store.set(DEMO_COOKIE, signDemoSession(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEMO_SESSION_MAX_AGE,
  });
}

export async function signOutAdmin(): Promise<void> {
  if (supabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  // Cleared unconditionally. If demo mode was switched off while a cookie was
  // still in a browser, this is what removes it rather than leaving it to
  // expire.
  const store = await cookies();
  store.delete(DEMO_COOKIE);

  redirect("/admin/login");
}
