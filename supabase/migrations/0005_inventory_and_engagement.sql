-- Stock levels, and the customer-owned data that currently lives in
-- localStorage: wishlists, carts, reviews and back-in-stock registrations.

-- ---------------------------------------------------------------------------
-- Per-variant stock
-- ---------------------------------------------------------------------------

-- Stock is per size, not per product: someone waiting on a Medium is not
-- served by a Small being in stock. 0001 could only express a boolean, which
-- cannot say "3 left" or be decremented by an order.
alter table retail_product_sizes add column if not exists stock_qty integer not null default 0;

-- Never let stock go negative.
--
-- This is the oversell guard. Two customers checking out the last unit at the
-- same time both pass an application-level "is it in stock" read; only a
-- constraint in the database stops the second write. Failing loudly here is
-- the point — the alternative is negative stock and a parcel that never ships.
alter table retail_product_sizes drop constraint if exists retail_product_sizes_stock_non_negative;
alter table retail_product_sizes add constraint retail_product_sizes_stock_non_negative
  check (stock_qty >= 0);

-- `in_stock` becomes derived rather than stored, so it can no longer disagree
-- with the number beside it. A size showing as available while its quantity is
-- zero is the exact bug this removes; it is safe to rebuild the column because
-- no database has ever been created from these migrations.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'retail_product_sizes'
      and column_name = 'in_stock' and is_generated = 'NEVER'
  ) then
    alter table retail_product_sizes drop column in_stock;
  end if;
end
$$;

alter table retail_product_sizes
  add column if not exists in_stock boolean generated always as (stock_qty > 0) stored;

-- ---------------------------------------------------------------------------
-- Back-in-stock registrations
-- ---------------------------------------------------------------------------

create table if not exists stock_alerts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references retail_products (id) on delete cascade,
  size_label text not null,
  -- Not a profile reference: someone can ask to be told about a restock
  -- without having an account, and requiring one would lose the lead.
  email text not null,
  name text not null,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Set when the alert fires. Registrations are consumed rather than deleted
  -- so we can see demand for a variant after the fact.
  notified_at timestamptz
);

-- Signing up twice must not queue two emails later. Case-insensitive because
-- an address differing only in case is the same inbox.
create unique index if not exists stock_alerts_unique_pending
  on stock_alerts (product_id, size_label, lower(email))
  where notified_at is null;

create index if not exists stock_alerts_variant_idx
  on stock_alerts (product_id, size_label)
  where notified_at is null;

create index if not exists stock_alerts_user_idx on stock_alerts (user_id);

alter table stock_alerts enable row level security;

-- Anyone may register interest, including a signed-out visitor.
drop policy if exists "Anyone can register a stock alert" on stock_alerts;
create policy "Anyone can register a stock alert"
  on stock_alerts for insert
  with check (true);

drop policy if exists "Users can view their own stock alerts" on stock_alerts;
create policy "Users can view their own stock alerts"
  on stock_alerts for select
  using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "Users can cancel their own stock alerts" on stock_alerts;
create policy "Users can cancel their own stock alerts"
  on stock_alerts for delete
  using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "Staff manage stock alerts" on stock_alerts;
create policy "Staff manage stock alerts"
  on stock_alerts for all
  using (public.is_staff())
  with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Wishlists
-- ---------------------------------------------------------------------------

-- Server-side rather than local, because back-in-stock notifications are only
-- possible if we know what someone saved — a wishlist in localStorage is
-- invisible to the job that would email them.
create table if not exists wishlists (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references retail_products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index if not exists wishlists_product_idx on wishlists (product_id);

alter table wishlists enable row level security;

drop policy if exists "Users manage their own wishlist" on wishlists;
create policy "Users manage their own wishlist"
  on wishlists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Carts
-- ---------------------------------------------------------------------------

-- Server-side so a cart survives switching device, which is the common path
-- for this catalogue: browse on a laptop, buy on a phone.
--
-- Note what is NOT here: `recently viewed` stays in localStorage on purpose.
-- It is a per-device browsing convenience with no server-side consumer, and
-- storing it would turn a harmless UI nicety into a retained record of what
-- every customer looked at.
create table if not exists cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references retail_products (id) on delete cascade,
  size_label text not null,
  color text not null,
  qty integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One line per variant. Adding the same size and colour twice increments the
  -- existing line rather than creating a second one that would render as a
  -- duplicate row in the basket.
  unique (user_id, product_id, size_label, color)
);

alter table cart_items drop constraint if exists cart_items_qty_positive;
alter table cart_items add constraint cart_items_qty_positive check (qty > 0);

create index if not exists cart_items_user_idx on cart_items (user_id);
create index if not exists cart_items_product_idx on cart_items (product_id);

drop trigger if exists cart_items_touch_updated_at on cart_items;
create trigger cart_items_touch_updated_at
  before update on cart_items
  for each row execute function public.touch_updated_at();

alter table cart_items enable row level security;

drop policy if exists "Users manage their own cart" on cart_items;
create policy "Users manage their own cart"
  on cart_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------

do $$ begin
  create type review_status as enum ('pending', 'published', 'rejected');
exception when duplicate_object then null;
end $$;

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references retail_products (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Display name as submitted. Snapshotted so a later profile rename does not
  -- silently reattribute a published review.
  author text not null,
  rating integer not null,
  title text not null default '',
  body text not null default '',
  -- The order that proves the reviewer bought the thing. Nullable because a
  -- review can be left without one, but its presence is what `verified` means.
  order_id uuid references retail_orders (id) on delete set null,
  status review_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One review per customer per product. Without this, a single unhappy
  -- afternoon can move a product's rating on its own.
  unique (product_id, user_id)
);

alter table reviews drop constraint if exists reviews_rating_range;
alter table reviews add constraint reviews_rating_range check (rating between 1 and 5);

create index if not exists reviews_product_published_idx
  on reviews (product_id, created_at desc)
  where status = 'published';

create index if not exists reviews_user_idx on reviews (user_id);
create index if not exists reviews_order_idx on reviews (order_id);
create index if not exists reviews_moderation_idx on reviews (created_at) where status = 'pending';

drop trigger if exists reviews_touch_updated_at on reviews;
create trigger reviews_touch_updated_at
  before update on reviews
  for each row execute function public.touch_updated_at();

alter table reviews enable row level security;

-- Published reviews are public; unpublished ones are visible only to their
-- author and to staff. The current client-side store publishes immediately,
-- which is exactly what a moderation queue exists to prevent.
drop policy if exists "Published reviews are publicly readable" on reviews;
create policy "Published reviews are publicly readable"
  on reviews for select
  using (status = 'published');

drop policy if exists "Users can view their own reviews" on reviews;
create policy "Users can view their own reviews"
  on reviews for select
  using (auth.uid() = user_id);

drop policy if exists "Users can write their own reviews" on reviews;
create policy "Users can write their own reviews"
  on reviews for insert
  with check (auth.uid() = user_id);

-- Editing is allowed, but only back into the queue — otherwise a review could
-- be published as innocuous and then rewritten.
drop policy if exists "Users can edit their own reviews" on reviews;
create policy "Users can edit their own reviews"
  on reviews for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "Staff moderate reviews" on reviews;
create policy "Staff moderate reviews"
  on reviews for all
  using (public.is_staff())
  with check (public.is_staff());
