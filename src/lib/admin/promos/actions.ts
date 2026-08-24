"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";
import { getStaffUser } from "@/lib/auth/dal";
import { parsePromoForm, type ManagedPromoCode, type PromoFormInput } from "./form";
import { sortForAdmin, toManagedCodes, type PromoCodeRow, type PromoUsageRow } from "./rows";

// ---------------------------------------------------------------------------
// Promo codes, managed against the database.
//
// 0009 opened with the problem and it has been true ever since:
//
//     a code created in the admin panel discounts the basket in the UI and is
//     then rejected at checkout
//
// The table has existed since then; nothing has ever written to it from the
// panel. The codes an admin creates live in `usePromoStore`, a zustand store
// in localStorage — which means they exist on one laptop, in one browser, and
// nowhere the server can see. Two people running the shop see two different
// sets of codes, and neither set is the one checkout enforces.
//
// #29 made that gap louder rather than quieter: `evaluate_promo` now refuses
// codes the database has never heard of at "Apply", where before they were
// refused at "Pay". This is the other half — putting the code where both ends
// can read it.
//
// The local store stays as the fallback for deployments with no Supabase
// project, which is every environment the QA suites run in.
//
// ---------------------------------------------------------------------------
// Where the authorisation is
// ---------------------------------------------------------------------------
//
// `getStaffUser()` gates every function below, and RLS gates the writes
// underneath it — 0009 put `is_staff()` on insert, update and delete. Two
// checks for one decision is deliberate: the DAL call is what makes this
// return a readable error instead of an empty result, and the policy is what
// makes it true. Deleting the DAL call would leave the panel working and the
// data protected; deleting the policy would leave it protected by a function
// anyone can stop calling.
// ---------------------------------------------------------------------------

const CODE_SELECT =
  "code, percent, active, built_in, starts_on, expires_on, max_redemptions, max_per_customer, issued_to";

export interface PromoList {
  codes: ManagedPromoCode[];
  /**
   * False when there is no Supabase project or the caller is not staff, in
   * which case `codes` is empty and the panel falls back to its local store.
   * Distinct from a live empty list, which means a shop that genuinely has no
   * codes — and those two must not render the same way.
   */
  live: boolean;
}

const NOTHING: PromoList = { codes: [], live: false };

/** Every promo code, with how many times each has been redeemed. */
export async function listPromoCodes(): Promise<PromoList> {
  if (!supabaseConfigured()) return NOTHING;

  const staff = await getStaffUser();
  if (!staff) return NOTHING;

  const supabase = await createClient();

  // Two round trips rather than an embedded aggregate. PostgREST can embed a
  // count, but the shape it returns is something this repo's SQL tests cannot
  // reach — they run against a plain Postgres with no PostgREST in front of
  // it — so `promo_code_usage` (0018) is a view the tests can hold to account.
  const [codes, usage] = await Promise.all([
    supabase.from("promo_codes").select(CODE_SELECT),
    supabase.from("promo_code_usage").select("code, redemptions, customers"),
  ]);

  if (codes.error) {
    console.error("[admin/promos] could not read the codes", codes.error.message);
    return NOTHING;
  }

  if (usage.error) {
    // The codes are the page; the counts are a detail on it. Failing the whole
    // list because a count did not arrive would take the panel down to lose a
    // number — toManagedCodes fills the gap with zero.
    console.error("[admin/promos] could not read redemption counts", usage.error.message);
  }

  return {
    codes: sortForAdmin(
      toManagedCodes(
        (codes.data ?? []) as unknown as PromoCodeRow[],
        (usage.data ?? []) as unknown as PromoUsageRow[]
      )
    ),
    live: true,
  };
}

export interface PromoWriteResult {
  error: string | null;
  /**
   * True when there was no database to write to. The caller applies the change
   * to its local store instead, which is the behaviour every deployment has
   * today — an error message would tell an admin their code was rejected when
   * it was in fact created.
   */
  notConfigured?: boolean;
}

const NOT_STAFF: PromoWriteResult = { error: "Only staff can manage promo codes" };

async function staffClient() {
  if (!supabaseConfigured()) return { client: null, notConfigured: true as const };

  const staff = await getStaffUser();
  if (!staff) return { client: null, notConfigured: false as const };

  return { client: await createClient(), notConfigured: false as const };
}

/** Creates a code, or explains why it could not be created. */
export async function createPromoCode(input: PromoFormInput): Promise<PromoWriteResult> {
  const { client, notConfigured } = await staffClient();
  if (notConfigured) return { error: null, notConfigured: true };
  if (!client) return NOT_STAFF;

  // Validated again here, not just in the form. The browser's copy is for
  // immediate feedback; this is the one an admin cannot skip by posting to the
  // action directly, and the caps it enforces are the ones #29 made binding.
  const parsed = parsePromoForm(input, Date.now());
  if (!parsed.ok) return { error: parsed.error };

  const { code, percent, expiresOn, maxRedemptions, maxPerCustomer } = parsed.value;

  const { error } = await client.from("promo_codes").insert({
    code,
    percent,
    active: true,
    expires_on: expiresOn ?? null,
    max_redemptions: maxRedemptions ?? null,
    max_per_customer: maxPerCustomer ?? null,
    // Never from the form. `built_in` means "compiled into the server's
    // fallback list in src/lib/pricing.ts", and a code created here is not —
    // claiming otherwise would make it undeletable for no reason.
    built_in: false,
  });

  if (error) {
    console.error("[admin/promos] could not create the code", error.message);
    // The unique violation is the one that actually happens, and it is worth
    // its own sentence: an admin retyping a code they already made should be
    // told it exists, not handed a Postgres constraint name.
    if (error.code === "23505") return { error: `${code} already exists` };
    return { error: "Could not create that code" };
  }

  return { error: null };
}

/** Switches a code on or off. */
export async function setPromoActive(code: string, active: boolean): Promise<PromoWriteResult> {
  const { client, notConfigured } = await staffClient();
  if (notConfigured) return { error: null, notConfigured: true };
  if (!client) return NOT_STAFF;

  const { error } = await client
    .from("promo_codes")
    .update({ active })
    .eq("code", code.toUpperCase());

  if (error) {
    console.error("[admin/promos] could not change the code", error.message);
    return { error: "Could not change that code" };
  }

  return { error: null };
}

/**
 * Deletes a code.
 *
 * Built-in codes are refused by RLS rather than here — 0009's delete policy is
 * `is_staff() and not built_in`, so the row simply does not match and nothing
 * is deleted. That reads as success from PostgREST, which is why this checks
 * what came back rather than only the error.
 */
export async function deletePromoCode(code: string): Promise<PromoWriteResult> {
  const { client, notConfigured } = await staffClient();
  if (notConfigured) return { error: null, notConfigured: true };
  if (!client) return NOT_STAFF;

  const { data, error } = await client
    .from("promo_codes")
    .delete()
    .eq("code", code.toUpperCase())
    .select("code");

  if (error) {
    console.error("[admin/promos] could not delete the code", error.message);
    return { error: "Could not delete that code" };
  }

  if (!data || data.length === 0) {
    return { error: "Built-in codes can be switched off but not deleted" };
  }

  return { error: null };
}
