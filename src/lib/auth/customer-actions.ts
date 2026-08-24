"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getCustomer } from "./customer";
import { supabaseConfigured } from "./demo";
import { callerKey, createRateLimiter } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { phoneField } from "@/lib/validation/address";

// ---------------------------------------------------------------------------
// Customer sign-up, sign-in and sign-out.
//
// The staff equivalents live in ./actions.ts and are deliberately not shared
// with these. They look similar and they are not the same thing: a staff sign
// in checks `profiles.role = 'admin'` and signs the session straight back out
// if it does not match, while a customer sign-in must accept exactly the
// accounts that one rejects. Folding them together would mean a flag deciding
// which check to apply, on the code path where getting the check wrong is
// worst.
// ---------------------------------------------------------------------------

export interface AuthResult {
  error: string | null;
  /** Set when the account was created but needs its email confirmed first. */
  needsConfirmation?: boolean;
  /**
   * Set when there is no Supabase project on this deployment.
   *
   * A flag rather than a message the caller has to match on. The forms fall
   * back to the local-only session in this case, and deciding that by
   * comparing error strings is the kind of thing that breaks silently the
   * first time the wording changes.
   */
  notConfigured?: boolean;
}

const Credentials = z.object({
  email: z.email({ error: "Enter a valid email address" }),
  password: z.string().min(6, { error: "Enter your password" }),
});

const SignUp = Credentials.extend({
  fullName: z.string().trim().min(2, { error: "Enter your name" }),
  phone: phoneField.optional(),
  // 'retail' or 'wholesale' only — and it is a *request*, not a grant. The
  // trigger in 0015 clamps it, so anything else arriving here becomes retail
  // at the database. Validated anyway so the form can say so rather than
  // silently doing something else.
  role: z.enum(["retail", "wholesale"]).default("retail"),
});

// Same two-tier shape as staff sign-in, and for the same reason — see the long
// note in ./actions.ts. Keying on the caller alone puts every customer behind
// a deployment with no forwarding header into one shared bucket.
const PER_ACCOUNT_LIMIT = 5;
const PER_CALLER_LIMIT = 30;

const perAccountLimiter = createRateLimiter({ limit: PER_ACCOUNT_LIMIT, windowMs: 60_000 });
const perCallerLimiter = createRateLimiter({ limit: PER_CALLER_LIMIT, windowMs: 60_000 });

// Sign-up is limited on the caller only. There is no account to key against
// yet, and the thing worth stopping is one source creating accounts in bulk.
const SIGNUP_LIMIT = 5;
const signUpLimiter = createRateLimiter({ limit: SIGNUP_LIMIT, windowMs: 60_000 });

const tooMany = (seconds: number, verb: string) => ({
  error: `Too many ${verb} attempts. Try again in ${seconds} seconds.`,
});

// One message for "no such account" and "wrong password" alike. Distinguishing
// them turns the form into an oracle for which email addresses have accounts —
// which, on a shop, is a customer list.
const INVALID = "Those credentials were not recognised";

const NOT_CONFIGURED =
  "Accounts are not available on this deployment yet.";

async function caller(): Promise<string> {
  return callerKey(await headers());
}

export async function signUpCustomer(
  _prev: AuthResult | null,
  formData: FormData
): Promise<AuthResult> {
  if (!supabaseConfigured()) return { error: NOT_CONFIGURED, notConfigured: true };

  const parsed = SignUp.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
    phone: formData.get("phone") || undefined,
    role: formData.get("role") || "retail",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again" };
  }

  const rate = signUpLimiter.check(await caller());
  if (!rate.allowed) return tooMany(rate.retryAfterSeconds, "sign-up");

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Everything here lands in raw_user_meta_data, which is
      // attacker-controlled by definition — the trigger in 0015 treats it that
      // way and clamps `role` to retail unless it is exactly 'wholesale'.
      data: {
        full_name: parsed.data.fullName,
        phone: parsed.data.phone ?? null,
        role: parsed.data.role,
      },
    },
  });

  if (error) {
    // Supabase distinguishes "already registered" from other failures. Passing
    // that through would confirm which addresses have accounts, so it does not
    // get its own message — the customer is told to sign in instead, which is
    // true either way and is what they need to do.
    console.error("[auth] customer sign-up failed", error.message);
    return { error: "Could not create that account. If you already have one, sign in instead." };
  }

  // With email confirmation on, signUp returns a user but no session. The form
  // has to say so rather than redirecting to a page that will bounce them.
  if (data.user && !data.session) return { error: null, needsConfirmation: true };

  return { error: null };
}

export async function signInCustomer(
  _prev: AuthResult | null,
  formData: FormData
): Promise<AuthResult> {
  if (!supabaseConfigured()) return { error: NOT_CONFIGURED, notConfigured: true };

  const parsed = Credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? INVALID };
  }

  const key = await caller();
  const accountKey = `${key}:${parsed.data.email.toLowerCase()}`;

  // peek() rather than check(): only failures are charged, below. A customer
  // who signs in correctly five times in a minute — which happens across tabs
  // and devices — must not be locked out for succeeding.
  const account = perAccountLimiter.peek(accountKey);
  if (!account.allowed) return tooMany(account.retryAfterSeconds, "sign-in");

  const spray = perCallerLimiter.peek(key);
  if (!spray.allowed) return tooMany(spray.retryAfterSeconds, "sign-in");

  const recordFailure = () => {
    perAccountLimiter.check(accountKey);
    perCallerLimiter.check(key);
  };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    recordFailure();
    return { error: INVALID };
  }

  return { error: null };
}

export async function signOutCustomer(): Promise<void> {
  if (!supabaseConfigured()) return;
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export interface CurrentCustomer {
  /**
   * False when there is no Supabase project, in which case the client store is
   * left entirely alone: this deployment has no server-side session to mirror,
   * and clearing it would sign out anyone using the local-only flow that still
   * exists for exactly that case.
   */
  authoritative: boolean;
  customer: { name: string; email: string; role: "retail" | "wholesale" } | null;
}

/**
 * Who the server thinks is signed in, for the client store to mirror.
 *
 * Deliberately narrow. The full Customer carries `wholesaleAccountId` and the
 * id, and this crosses into the browser — so it returns only what the chrome
 * needs to draw itself.
 */
export async function currentCustomer(): Promise<CurrentCustomer> {
  if (!supabaseConfigured()) return { authoritative: false, customer: null };

  const customer = await getCustomer();
  if (!customer) return { authoritative: true, customer: null };

  return {
    authoritative: true,
    customer: { name: customer.name, email: customer.email, role: customer.role },
  };
}
