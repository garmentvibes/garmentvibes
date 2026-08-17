-- Shared machinery every later migration leans on: a couple of profile
-- columns, the staff identity helper the policies are written in terms of,
-- and an updated_at trigger.
--
-- Note what is deliberately absent: approval status, payment terms and credit
-- limits. src/lib/stores/session-store.ts hangs those off the *user*, but the
-- portal also lets a business invite colleagues — so two people at the same
-- firm would each carry their own copy of their employer's credit terms, and
-- approving one would not approve the other. They belong to the business, and
-- 0006 puts them there.

-- ---------------------------------------------------------------------------
-- Profile columns
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists phone text;
alter table profiles add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- Identity helpers
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER is load-bearing, not laziness.
--
-- A policy on `profiles` that calls a function which reads `profiles` would
-- re-enter that same policy and recurse until Postgres gives up. Running the
-- lookup as the definer bypasses RLS on the read, which breaks the cycle.
-- search_path is pinned because a SECURITY DEFINER function that resolves
-- table names through the caller's search_path can be aimed at a shadow table
-- by anyone able to create a schema.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  );
$$;

comment on function public.is_staff() is
  'True when the caller is a GarmentVibes staff account. Used by every admin-visibility policy.';

revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

-- Set by trigger rather than by the application. Every write path would
-- otherwise have to remember, and the one that forgets is the one whose
-- staleness nobody notices.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on profiles;
create trigger profiles_touch_updated_at
  before update on profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Staff visibility
-- ---------------------------------------------------------------------------

-- Staff need the approval queue, which is a read across every wholesale
-- profile — the one legitimate exception to "your own row only".
drop policy if exists "Staff can view all profiles" on profiles;
create policy "Staff can view all profiles"
  on profiles for select
  using (public.is_staff());

drop policy if exists "Staff can update any profile" on profiles;
create policy "Staff can update any profile"
  on profiles for update
  using (public.is_staff());

-- The public catalog policies in 0001 are `select` on active rows only, so
-- without these the admin panel cannot see a deactivated product, let alone
-- edit one.
drop policy if exists "Staff manage retail products" on retail_products;
create policy "Staff manage retail products"
  on retail_products for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Staff manage retail sizes" on retail_product_sizes;
create policy "Staff manage retail sizes"
  on retail_product_sizes for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Staff manage wholesale products" on wholesale_products;
create policy "Staff manage wholesale products"
  on wholesale_products for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Staff manage wholesale price tiers" on wholesale_price_tiers;
create policy "Staff manage wholesale price tiers"
  on wholesale_price_tiers for all
  using (public.is_staff())
  with check (public.is_staff());
