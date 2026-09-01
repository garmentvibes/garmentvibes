-- Moving the three policy helpers out of the API's reach.
--
-- ---------------------------------------------------------------------------
-- The finding
-- ---------------------------------------------------------------------------
--
-- Supabase publishes every function in `public` at /rest/v1/rpc/, and the
-- security advisor reports three of ours as callable without signing in:
-- is_staff(), wholesale_account_id() and is_approved_wholesale(). They are not
-- endpoints. They are the predicates thirty-nine policies are written in.
--
-- ---------------------------------------------------------------------------
-- Why the obvious fix would take the site down
-- ---------------------------------------------------------------------------
--
-- The advisor's own suggestion is to revoke EXECUTE. Doing that here breaks
-- every read on the site, measured rather than guessed:
--
--   authed read of retail_orders   → permission denied for function is_staff
--   anonymous browse of products   → permission denied for function is_staff
--
-- A policy expression is permission-checked as the role running the query, and
-- all thirty-nine of these policies are `to public`, so anon and authenticated
-- both evaluate them. The second line is the one that surprises: anonymous
-- product browsing is granted by a different, permissive policy — but
-- permissive policies are OR'd and NOT short-circuited, so the staff branch is
-- evaluated anyway, and its error is what the visitor gets.
--
-- SECURITY INVOKER is not an escape either: is_staff() reads `profiles`, which
-- is itself behind RLS whose policies call is_staff().
--
-- So the grants must stay. What can move is the function.
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
--
-- PostgREST exposes only the schemas it is configured with, and `app_private`
-- is not one of them. The three helpers move there, keep their grants, and the
-- policies are restated to call them schema-qualified. The RPC routes go; the
-- policies carry on.
--
-- Qualified explicitly rather than left to search_path: a policy that resolves
-- its own predicate by search_path is a policy whose meaning depends on who is
-- asking, which is the last property an access rule should have.
--
-- Restated mechanically from pg_get_expr() with only the function names
-- rewritten — same reasoning as 0024, and checked the same way: the schema is
-- built with and without this file and every policy in `public` compared, so
-- the only difference is the two added schema qualifiers.

create schema if not exists app_private;

-- USAGE only. Without it the grants below are unreachable and every policy
-- fails closed — which is the safe direction, and also a broken site.
grant usage on schema app_private to anon, authenticated, service_role;

-- Recreated rather than moved with ALTER FUNCTION ... SET SCHEMA, because
-- is_approved_wholesale() calls wholesale_account_id() by name and the body
-- has to be rewritten anyway.
create or replace function app_private.is_staff()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  );
$$;

create or replace function app_private.wholesale_account_id()
returns uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    (select p.wholesale_account_id from public.profiles p where p.id = auth.uid()),
    (select m.account_id from public.wholesale_account_members m
      where m.user_id = auth.uid() and m.status = 'active' limit 1)
  );
$$;

create or replace function app_private.is_approved_wholesale()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.wholesale_accounts a
    where a.id = app_private.wholesale_account_id() and a.status = 'approved'
  );
$$;

-- Postgres grants EXECUTE to PUBLIC on every function it creates, so without
-- the revokes these three would be open to every role there is and to every
-- role added later — in a schema whose entire purpose is to be closed. The
-- revoke also makes the grants below mean something: a mutation removing them
-- is caught only because PUBLIC is not quietly holding the door.
--
-- (Found by mutation testing. Revoking only from anon and authenticated left
-- PUBLIC in place, both roles still had EXECUTE through it, and the test that
-- should have failed passed. The same shape as the finding that led to this
-- migration, one schema over.)
revoke all on function app_private.is_staff() from public;
revoke all on function app_private.wholesale_account_id() from public;
revoke all on function app_private.is_approved_wholesale() from public;

-- The same access the public copies had, and for the same reason: the policies
-- are evaluated as anon and as authenticated, so both must be able to run the
-- predicate. Nothing is widened — what changes is that these are no longer
-- reachable as HTTP endpoints.
grant execute on function app_private.is_staff() to anon, authenticated, service_role;
grant execute on function app_private.wholesale_account_id() to anon, authenticated, service_role;
grant execute on function app_private.is_approved_wholesale() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The policies
-- ---------------------------------------------------------------------------

drop policy if exists "Members can view their account's invoices" on credit_invoices;
create policy "Members can view their account's invoices"
  on credit_invoices for select
  using ((account_id = app_private.wholesale_account_id()));

drop policy if exists "Staff manage credit invoices" on credit_invoices;
create policy "Staff manage credit invoices"
  on credit_invoices for all
  using (app_private.is_staff())
  with check (app_private.is_staff());

drop policy if exists "Members can view payments on their invoices" on credit_payments;
create policy "Members can view payments on their invoices"
  on credit_payments for select
  using ((EXISTS ( SELECT 1
   FROM credit_invoices i
  WHERE ((i.id = credit_payments.invoice_id) AND (i.account_id = app_private.wholesale_account_id())))));

drop policy if exists "Staff manage credit payments" on credit_payments;
create policy "Staff manage credit payments"
  on credit_payments for all
  using (app_private.is_staff())
  with check (app_private.is_staff());

drop policy if exists "Staff manage the outbox" on notifications;
create policy "Staff manage the outbox"
  on notifications for all
  using (app_private.is_staff())
  with check (app_private.is_staff());

drop policy if exists "Staff can update any profile" on profiles;
create policy "Staff can update any profile"
  on profiles for update
  using (app_private.is_staff());

drop policy if exists "Staff can view all profiles" on profiles;
create policy "Staff can view all profiles"
  on profiles for select
  using (app_private.is_staff());

drop policy if exists "Staff can create promo codes" on promo_codes;
create policy "Staff can create promo codes"
  on promo_codes for insert
  with check (app_private.is_staff());

drop policy if exists "Staff can delete only non-built-in codes" on promo_codes;
create policy "Staff can delete only non-built-in codes"
  on promo_codes for delete
  using ((app_private.is_staff() AND (NOT built_in)));

drop policy if exists "Staff can edit promo codes" on promo_codes;
create policy "Staff can edit promo codes"
  on promo_codes for update
  using (app_private.is_staff())
  with check (app_private.is_staff());

drop policy if exists "Staff can read every promo code" on promo_codes;
create policy "Staff can read every promo code"
  on promo_codes for select
  using (app_private.is_staff());

drop policy if exists "Staff can see every redemption" on promo_redemptions;
create policy "Staff can see every redemption"
  on promo_redemptions for all
  using (app_private.is_staff())
  with check (app_private.is_staff());

drop policy if exists "Staff can view retail addresses" on retail_addresses;
create policy "Staff can view retail addresses"
  on retail_addresses for select
  using (app_private.is_staff());

drop policy if exists "Staff manage retail order items" on retail_order_items;
create policy "Staff manage retail order items"
  on retail_order_items for all
  using (app_private.is_staff())
  with check (app_private.is_staff());

drop policy if exists "Staff manage retail orders" on retail_orders;
create policy "Staff manage retail orders"
  on retail_orders for all
  using (app_private.is_staff())
  with check (app_private.is_staff());

drop policy if exists "Staff manage retail sizes" on retail_product_sizes;
create policy "Staff manage retail sizes"
  on retail_product_sizes for all
  using (app_private.is_staff())
  with check (app_private.is_staff());

drop policy if exists "Staff manage retail products" on retail_products;
create policy "Staff manage retail products"
  on retail_products for all
  using (app_private.is_staff())
  with check (app_private.is_staff());

drop policy if exists "Staff manage return items" on return_items;
create policy "Staff manage return items"
  on return_items for all
  using (app_private.is_staff())
  with check (app_private.is_staff());

drop policy if exists "Staff manage returns" on return_requests;
create policy "Staff manage returns"
  on return_requests for all
  using (app_private.is_staff())
  with check (app_private.is_staff());

drop policy if exists "Staff moderate reviews" on reviews;
create policy "Staff moderate reviews"
  on reviews for all
  using (app_private.is_staff())
  with check (app_private.is_staff());

drop policy if exists "Staff manage stock alerts" on stock_alerts;
create policy "Staff manage stock alerts"
  on stock_alerts for all
  using (app_private.is_staff())
  with check (app_private.is_staff());

drop policy if exists "Members can view their colleagues" on wholesale_account_members;
create policy "Members can view their colleagues"
  on wholesale_account_members for select
  using ((account_id = app_private.wholesale_account_id()));

drop policy if exists "Staff manage account members" on wholesale_account_members;
create policy "Staff manage account members"
  on wholesale_account_members for all
  using (app_private.is_staff())
  with check (app_private.is_staff());

drop policy if exists "Members can view their own account" on wholesale_accounts;
create policy "Members can view their own account"
  on wholesale_accounts for select
  using ((id = app_private.wholesale_account_id()));

drop policy if exists "Staff manage wholesale accounts" on wholesale_accounts;
create policy "Staff manage wholesale accounts"
  on wholesale_accounts for all
  using (app_private.is_staff())
  with check (app_private.is_staff());

drop policy if exists "Members can add lines to their claims" on wholesale_claim_lines;
create policy "Members can add lines to their claims"
  on wholesale_claim_lines for insert
  with check ((EXISTS ( SELECT 1
   FROM wholesale_claims c
  WHERE ((c.id = wholesale_claim_lines.claim_id) AND (c.account_id = app_private.wholesale_account_id())))));

drop policy if exists "Members can view their claim lines" on wholesale_claim_lines;
create policy "Members can view their claim lines"
  on wholesale_claim_lines for select
  using ((EXISTS ( SELECT 1
   FROM wholesale_claims c
  WHERE ((c.id = wholesale_claim_lines.claim_id) AND (c.account_id = app_private.wholesale_account_id())))));

drop policy if exists "Staff manage claim lines" on wholesale_claim_lines;
create policy "Staff manage claim lines"
  on wholesale_claim_lines for all
  using (app_private.is_staff())
  with check (app_private.is_staff());

drop policy if exists "Approved buyers can raise claims" on wholesale_claims;
create policy "Approved buyers can raise claims"
  on wholesale_claims for insert
  with check (((status = 'submitted'::claim_status) AND app_private.is_approved_wholesale() AND (account_id = app_private.wholesale_account_id())));

drop policy if exists "Members can view their account's claims" on wholesale_claims;
create policy "Members can view their account's claims"
  on wholesale_claims for select
  using (((account_id IS NOT NULL) AND (account_id = app_private.wholesale_account_id())));

drop policy if exists "Staff manage claims" on wholesale_claims;
create policy "Staff manage claims"
  on wholesale_claims for all
  using (app_private.is_staff())
  with check (app_private.is_staff());

drop policy if exists "Approved buyers can read wholesale prices" on wholesale_price_tiers;
create policy "Approved buyers can read wholesale prices"
  on wholesale_price_tiers for select
  using (app_private.is_approved_wholesale());

drop policy if exists "Staff manage wholesale price tiers" on wholesale_price_tiers;
create policy "Staff manage wholesale price tiers"
  on wholesale_price_tiers for all
  using (app_private.is_staff())
  with check (app_private.is_staff());

drop policy if exists "Staff manage wholesale products" on wholesale_products;
create policy "Staff manage wholesale products"
  on wholesale_products for all
  using (app_private.is_staff())
  with check (app_private.is_staff());

drop policy if exists "Staff manage wholesale quote items" on wholesale_quote_items;
create policy "Staff manage wholesale quote items"
  on wholesale_quote_items for all
  using (app_private.is_staff())
  with check (app_private.is_staff());

drop policy if exists "Members can view their account's quotes" on wholesale_quotes;
create policy "Members can view their account's quotes"
  on wholesale_quotes for select
  using (((account_id IS NOT NULL) AND (account_id = app_private.wholesale_account_id())));

drop policy if exists "Staff manage wholesale quotes" on wholesale_quotes;
create policy "Staff manage wholesale quotes"
  on wholesale_quotes for all
  using (app_private.is_staff())
  with check (app_private.is_staff());

drop policy if exists "Members manage their account's ship-to addresses" on wholesale_ship_to_addresses;
create policy "Members manage their account's ship-to addresses"
  on wholesale_ship_to_addresses for all
  using ((account_id = app_private.wholesale_account_id()))
  with check ((account_id = app_private.wholesale_account_id()));

drop policy if exists "Staff can view ship-to addresses" on wholesale_ship_to_addresses;
create policy "Staff can view ship-to addresses"
  on wholesale_ship_to_addresses for select
  using (app_private.is_staff());

-- ---------------------------------------------------------------------------
-- The two function bodies that also ask
-- ---------------------------------------------------------------------------
--
-- Neither is a policy, so neither was found by looking at pg_policy. They are
-- restated verbatim with only the call qualified — and the drop below would
-- have caught them anyway, because Postgres refuses to drop a function
-- something still depends on. That refusal is the check, not the comment.

create or replace function public.adjust_retail_stock(
  p_slug text,
  p_size text,
  p_delta integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product uuid;
  v_qty integer;
begin
  if not app_private.is_staff() then
    raise exception 'Only staff can adjust stock' using errcode = '42501';
  end if;

  if p_delta is null or p_delta = 0 then
    raise exception 'A stock adjustment must move something' using errcode = '22023';
  end if;

  -- Deliberately not active_product_id(). A product withdrawn from sale still
  -- has to accept a return that was already in flight when it was withdrawn —
  -- refusing would strand goods that are physically back in the warehouse.
  select id into v_product from retail_products where slug = p_slug;
  if v_product is null then
    raise exception 'No such product: %', p_slug using errcode = '22023';
  end if;

  update retail_product_sizes
     set stock_qty = stock_qty + p_delta
   where product_id = v_product
     and label = p_size
     and stock_qty + p_delta >= 0
  returning stock_qty into v_qty;

  if not found then
    -- Two different failures with one message would be a support ticket that
    -- starts from nothing, so they are told apart.
    if not exists (
      select 1 from retail_product_sizes
       where product_id = v_product and label = p_size
    ) then
      raise exception '% is not sold in size %', p_slug, p_size using errcode = '23503';
    end if;

    raise exception 'Not enough stock of % size % to remove %', p_slug, p_size, abs(p_delta)
      using errcode = '23514';
  end if;

  return v_qty;
end;
$$;

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  -- `rolsuper` as well as `rolbypassrls`: a superuser bypasses RLS implicitly
  -- and its rolbypassrls flag is usually false, so testing the flag alone
  -- exempts service_role and not the owner running the migrations.
  v_privileged boolean := app_private.is_staff() or coalesce(
    (select rolsuper or rolbypassrls from pg_roles where rolname = current_user),
    false);
begin
  if v_privileged then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      raise exception 'only staff can change a profile''s role'
        using errcode = 'insufficient_privilege';
    end if;
    if new.wholesale_account_id is distinct from old.wholesale_account_id then
      raise exception 'only staff can attach a profile to a business account'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  -- INSERT. Unreachable while a profile row exists for every account, because
  -- profiles.id references auth.users and 0015's trigger fills it in at
  -- signup. It stops being unreachable the moment a row is deleted or a future
  -- flow writes profiles directly, and the two columns are the same two.
  if new.role = 'admin' then
    raise exception 'a profile cannot be created as staff'
      using errcode = 'insufficient_privilege';
  end if;
  if new.wholesale_account_id is not null then
    raise exception 'only staff can attach a profile to a business account'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- And the RPC routes go
-- ---------------------------------------------------------------------------
--
-- `drop function` fails if anything still depends on it, so this line is the
-- proof that every caller above was found. A policy or function left pointing
-- at the old copy makes the migration fail rather than quietly keeping the
-- endpoint alive.
drop function public.is_approved_wholesale();
drop function public.is_staff();
drop function public.wholesale_account_id();
