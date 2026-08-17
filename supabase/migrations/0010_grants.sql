-- Table-level privileges for the request roles.
--
-- Supabase applies broad default grants to `anon` and `authenticated` when a
-- project is created. Relying on that leaves the schema's security depending on
-- setup that isn't in this repository, so it is stated explicitly here — and
-- tightened for `anon` while we're at it.
--
-- Why `authenticated` gets wide grants rather than a careful minimum: staff and
-- customers are both `authenticated`. Postgres grants are per-role, so no grant
-- can distinguish them, and trying would only lock staff out of their own admin
-- panel. Row visibility is therefore RLS's job entirely, and grants exist to
-- stop a signed-out visitor reaching tables they have no business touching at
-- all. That division is the standard Supabase model; the comment is here
-- because the wide grant looks alarming without it.

-- Start from nothing so this file describes the whole picture rather than
-- layering on top of whatever was granted before it.
revoke all on all tables in schema public from anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- authenticated — every table, filtered by policy
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- anon — a signed-out visitor
-- ---------------------------------------------------------------------------

-- Browsing the catalogue. Note wholesale_price_tiers is absent: trade pricing
-- is gated on an approved account by the policy added in 0006, and there is no
-- reason to hand anon the table privilege it would need to try.
grant select on retail_products to anon;
grant select on retail_product_sizes to anon;
grant select on wholesale_products to anon;

-- Published reviews are part of the product page.
grant select on reviews to anon;

-- Checkout validates a promo code before asking anyone to sign in, so the
-- basket can show the discount it will actually get.
grant select on promo_codes to anon;

-- Two things a visitor may do without an account, because requiring one would
-- lose the lead: ask to be told when a size is restocked, and apply for a
-- wholesale account.
grant insert on stock_alerts to anon;
grant insert on wholesale_accounts to anon;

-- ---------------------------------------------------------------------------
-- service_role — server-side jobs
-- ---------------------------------------------------------------------------

-- Bypasses RLS by design. This is the role the notification sender, the
-- Razorpay webhook and any scheduled job run as, all of which act on behalf of
-- the business rather than a signed-in user.
grant select, insert, update, delete on all tables in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- Safe to expose because the view is security_invoker (see 0008): it evaluates
-- the caller's policies rather than its owner's.
grant select on public.credit_invoice_balances to authenticated, service_role;
