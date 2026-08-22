-- Two findings from Supabase's database linter, run against the live project
-- after 0001-0010 were applied.
--
-- It raised nine warnings. Seven are one finding repeated: the three identity
-- helpers are SECURITY DEFINER and callable over REST by `anon` and
-- `authenticated`. Those are intentional and are NOT changed here — see the
-- note at the bottom for why revoking them breaks the storefront outright.

-- ---------------------------------------------------------------------------
-- 1. Pin the trigger function's search_path
-- ---------------------------------------------------------------------------

-- Every other function in the schema pins it; this one was missed. It is not
-- SECURITY DEFINER, so it runs as the caller and the exposure is smaller — but
-- an unqualified name inside a function that fires on writes to nine tables is
-- still resolved through whatever search_path the caller happens to have set.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Stop the credit trigger being callable as an API endpoint
-- ---------------------------------------------------------------------------

-- recompute_invoice_status() is a trigger function and nothing else. Supabase
-- exposes every function in `public` at /rest/v1/rpc/, so it was reachable as
-- an endpoint by anyone — SECURITY DEFINER, and touching the credit ledger.
--
-- Safe to revoke: Postgres checks EXECUTE against the table owner when firing a
-- trigger, not against the user whose write fired it. The credit tests in
-- supabase/tests/20_invariants.sql prove the trigger still recomputes status
-- after this.
revoke all on function public.recompute_invoice_status() from public;
revoke all on function public.recompute_invoice_status() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Deliberately not changed: is_staff, is_approved_wholesale, wholesale_account_id
-- ---------------------------------------------------------------------------

-- The linter flags all three as SECURITY DEFINER functions callable without
-- signing in, and suggests revoking EXECUTE. Doing so breaks the site.
--
-- RLS evaluates every permissive policy on a table for the command being run.
-- retail_products carries both "publicly readable" and a staff policy, so a
-- signed-out catalogue read evaluates is_staff() too. Measured on the live
-- project: with EXECUTE granted anon reads 33 products; with it revoked the
-- read fails outright with "permission denied for function is_staff".
--
-- The exposure is also empty. Each function answers a question about the
-- caller — are you staff, are you an approved buyer, which account are you on —
-- so an anonymous caller learns only that it is nobody, which it already knew.
-- They take no arguments, so there is nothing to probe with.
