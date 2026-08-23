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

// Sign-in is the one endpoint where guessing is the attack, so it is limited
// on two axes rather than one.
//
// The first version keyed on the caller alone, reasoning that an attacker
// should not get a fresh allowance per address tried. True, but it made the
// budget SHARED: callerKey() returns "unidentified" when no forwarding header
// is present, so every staff member behind a deployment without a reverse
// proxy — and every browser in the QA suite — draws from one bucket of five a
// minute. A three-person team hits that during a normal morning, and it is
// not hypothetical: adding a fourth admin login to the e2e suite is what
// exposed it, with the second attempt already refused.
//
// Two tiers fix it without weakening the defence:
//
//   Per caller AND email — the tight one. Password guessing against a single
//   account is the actual threat, and this is unchanged at five a minute for
//   that case.
//
//   Per caller — the loose one. Catches spraying, where one source tries many
//   addresses. Set high enough that a shared office IP, or a test suite, does
//   not trip it.
const PER_ACCOUNT_LIMIT = 5;
const PER_CALLER_LIMIT = 30;

const perAccountLimiter = createRateLimiter({ limit: PER_ACCOUNT_LIMIT, windowMs: 60_000 });
const perCallerLimiter = createRateLimiter({ limit: PER_CALLER_LIMIT, windowMs: 60_000 });

const tooMany = (seconds: number) => ({
  error: `Too many sign-in attempts. Try again in ${seconds} seconds.`,
});

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

  const { email, password } = parsed.data;

  const requestHeaders = await headers();
  const caller = callerKey(requestHeaders);

  // Lower-cased so Staff@ and staff@ cannot be used as two budgets against
  // the same account.
  const accountKey = `${caller}:${email.toLowerCase()}`;

  // peek, not check: only FAILURES are recorded, below. The budget exists to
  // stop password guessing, and a correct password is not a guess — charging
  // successes for it locks out someone signing in on a phone, a laptop and a
  // tablet inside a minute, which is a legitimate morning.
  const account = perAccountLimiter.peek(accountKey);
  if (!account.allowed) return tooMany(account.retryAfterSeconds);

  const spray = perCallerLimiter.peek(caller);
  if (!spray.allowed) return tooMany(spray.retryAfterSeconds);

  /** Charges one attempt against both budgets. Called only when sign-in failed. */
  const recordFailure = () => {
    perAccountLimiter.check(accountKey);
    perCallerLimiter.check(caller);
  };

  if (supabaseConfigured()) {
    const failure = await signInWithSupabase(email, password);
    if (failure) {
      recordFailure();
      return { error: failure };
    }
  } else if (demoAdminEnabled()) {
    await startDemoSession(email);
  } else {
    // Not a credential failure — there is nothing to guess against — so this
    // does not consume anyone's budget.
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
