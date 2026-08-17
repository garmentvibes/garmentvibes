-- Wholesale accounts, their people, and the delivery addresses on both sides.
--
-- The account is the business, not the person who signed up. That distinction
-- is what makes the rest work: approval, payment terms and a credit limit are
-- properties of the firm we are extending credit to, so inviting a colleague
-- must not mint a second set of terms, and approving the firm must approve
-- everyone at it.

do $$ begin
  create type wholesale_approval_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type payment_terms as enum ('prepay', 'net30');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- The business
-- ---------------------------------------------------------------------------

create table if not exists wholesale_accounts (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  gstin text,
  contact_name text not null,
  email text not null,
  phone text,
  -- Signups start pending, per the approval-gated product decision.
  status wholesale_approval_status not null default 'pending',
  payment_terms payment_terms not null default 'prepay',
  credit_terms_requested boolean not null default false,
  -- Minor units. Null means no limit has been set, which is different from a
  -- limit of zero — the latter is a deliberate freeze on further credit.
  credit_limit integer,
  -- Days to pay on Net terms. Stored per account so a good customer can be
  -- given 45 without redefining what "net30" means for everyone else.
  credit_days integer not null default 30,
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  decision_note text
);

-- One account per GSTIN. The same registration signing up twice is the same
-- business, and letting both through would split its credit exposure across
-- two ledgers that nobody reconciles.
create unique index if not exists wholesale_accounts_gstin_key
  on wholesale_accounts (upper(gstin))
  where gstin is not null;

create index if not exists wholesale_accounts_status_idx
  on wholesale_accounts (status, registered_at desc);

alter table wholesale_accounts drop constraint if exists wholesale_accounts_credit_sane;
alter table wholesale_accounts add constraint wholesale_accounts_credit_sane check (
  (credit_limit is null or credit_limit >= 0) and credit_days > 0
);

-- Credit terms on an unapproved account are a contradiction: we have not
-- decided whether to trade with them at all.
alter table wholesale_accounts drop constraint if exists wholesale_accounts_net30_requires_approval;
alter table wholesale_accounts add constraint wholesale_accounts_net30_requires_approval check (
  payment_terms = 'prepay' or status = 'approved'
);

drop trigger if exists wholesale_accounts_touch_updated_at on wholesale_accounts;
create trigger wholesale_accounts_touch_updated_at
  before update on wholesale_accounts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- The people
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists wholesale_account_id uuid
  references wholesale_accounts (id) on delete set null;

create index if not exists profiles_wholesale_account_idx on profiles (wholesale_account_id);

do $$ begin
  create type team_role as enum ('admin', 'purchaser', 'viewer');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type membership_status as enum ('invited', 'active', 'revoked');
exception when duplicate_object then null;
end $$;

-- Invitations, and the roles within a business.
--
-- `user_id` is nullable on purpose: an invitation exists before the invitee
-- has an account, which is the whole point of inviting them. It is filled in
-- when they accept.
create table if not exists wholesale_account_members (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references wholesale_accounts (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  name text not null,
  role team_role not null default 'viewer',
  status membership_status not null default 'invited',
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (account_id, email)
);

create index if not exists wholesale_account_members_account_idx
  on wholesale_account_members (account_id);
create index if not exists wholesale_account_members_user_idx
  on wholesale_account_members (user_id);

-- ---------------------------------------------------------------------------
-- Approval gate
-- ---------------------------------------------------------------------------

-- Wholesale pricing, credit terms and bulk ordering are all gated on approval,
-- and signups start life pending. A buyer who has applied but not been
-- approved must not be able to read trade pricing.
--
-- SECURITY DEFINER for the same reason as is_staff(): the policies that call
-- this sit on tables it reads, and search_path is pinned so the lookup cannot
-- be redirected at a shadow table.
create or replace function public.wholesale_account_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.wholesale_account_id from public.profiles p where p.id = auth.uid()),
    (select m.account_id from public.wholesale_account_members m
      where m.user_id = auth.uid() and m.status = 'active' limit 1)
  );
$$;

create or replace function public.is_approved_wholesale()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.wholesale_accounts a
    where a.id = public.wholesale_account_id() and a.status = 'approved'
  );
$$;

revoke all on function public.wholesale_account_id() from public;
revoke all on function public.is_approved_wholesale() from public;
grant execute on function public.wholesale_account_id() to anon, authenticated, service_role;
grant execute on function public.is_approved_wholesale() to anon, authenticated, service_role;

alter table wholesale_accounts enable row level security;
alter table wholesale_account_members enable row level security;

-- A signup has to be able to create the account it is applying for, but must
-- not be able to approve it — hence insert-only, with status left at its
-- default. Staff own every transition after that.
drop policy if exists "Anyone can apply for a wholesale account" on wholesale_accounts;
create policy "Anyone can apply for a wholesale account"
  on wholesale_accounts for insert
  with check (status = 'pending' and payment_terms = 'prepay');

drop policy if exists "Members can view their own account" on wholesale_accounts;
create policy "Members can view their own account"
  on wholesale_accounts for select
  using (id = public.wholesale_account_id());

drop policy if exists "Staff manage wholesale accounts" on wholesale_accounts;
create policy "Staff manage wholesale accounts"
  on wholesale_accounts for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Members can view their colleagues" on wholesale_account_members;
create policy "Members can view their colleagues"
  on wholesale_account_members for select
  using (account_id = public.wholesale_account_id());

drop policy if exists "Staff manage account members" on wholesale_account_members;
create policy "Staff manage account members"
  on wholesale_account_members for all
  using (public.is_staff())
  with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Wholesale catalogue pricing is trade-only
-- ---------------------------------------------------------------------------

-- 0001 made price tiers world-readable, which publishes our trade pricing to
-- anyone who asks — including competitors and retail customers who would
-- reasonably ask why they are paying more. Product records stay public so the
-- catalogue can still be browsed and indexed; the prices behind them do not.
drop policy if exists "Wholesale price tiers are publicly readable" on wholesale_price_tiers;

drop policy if exists "Approved buyers can read wholesale prices" on wholesale_price_tiers;
create policy "Approved buyers can read wholesale prices"
  on wholesale_price_tiers for select
  using (public.is_approved_wholesale());

-- ---------------------------------------------------------------------------
-- Delivery addresses
-- ---------------------------------------------------------------------------

create table if not exists retail_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  full_name text not null,
  phone text not null,
  address_line1 text not null,
  city text not null,
  state text not null,
  pincode text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists retail_addresses_user_idx on retail_addresses (user_id);

-- Exactly one default per customer. The app enforces this in JavaScript by
-- rewriting every row on change; a partial unique index makes it true even if
-- two tabs try at once.
create unique index if not exists retail_addresses_one_default_per_user
  on retail_addresses (user_id)
  where is_default;

alter table retail_addresses enable row level security;

drop policy if exists "Users manage their own addresses" on retail_addresses;
create policy "Users manage their own addresses"
  on retail_addresses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Staff can view retail addresses" on retail_addresses;
create policy "Staff can view retail addresses"
  on retail_addresses for select
  using (public.is_staff());

-- Wholesale ship-to addresses belong to the business, not to whoever added
-- them: a colleague must be able to send a consignment to the same warehouse.
create table if not exists wholesale_ship_to_addresses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references wholesale_accounts (id) on delete cascade,
  label text not null,
  contact_name text not null,
  phone text not null,
  address_line1 text not null,
  city text not null,
  state text not null,
  pincode text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists wholesale_ship_to_account_idx
  on wholesale_ship_to_addresses (account_id);

create unique index if not exists wholesale_ship_to_one_default_per_account
  on wholesale_ship_to_addresses (account_id)
  where is_default;

alter table wholesale_ship_to_addresses enable row level security;

drop policy if exists "Members manage their account's ship-to addresses"
  on wholesale_ship_to_addresses;
create policy "Members manage their account's ship-to addresses"
  on wholesale_ship_to_addresses for all
  using (account_id = public.wholesale_account_id())
  with check (account_id = public.wholesale_account_id());

drop policy if exists "Staff can view ship-to addresses" on wholesale_ship_to_addresses;
create policy "Staff can view ship-to addresses"
  on wholesale_ship_to_addresses for select
  using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Link orders to the business
-- ---------------------------------------------------------------------------

-- Without this a colleague cannot see an order a co-worker placed, which is
-- most of the reason a business wants team accounts at all.
alter table wholesale_quotes add column if not exists account_id uuid
  references wholesale_accounts (id) on delete set null;

create index if not exists wholesale_quotes_account_idx on wholesale_quotes (account_id);

drop policy if exists "Members can view their account's quotes" on wholesale_quotes;
create policy "Members can view their account's quotes"
  on wholesale_quotes for select
  using (account_id is not null and account_id = public.wholesale_account_id());
