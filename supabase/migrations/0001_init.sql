-- GarmentVibes — initial schema (Phase 2)
-- Two fully separate catalogs (retail vs wholesale), per product decision.
-- Written ahead of the live Supabase project existing; apply once the
-- dedicated "GarmentVibes" org/project is created (see README).
--
-- Every statement here is guarded, so the file can be re-applied without
-- error. Supabase's runner already tracks what it has applied; the guards are
-- for the messier cases — a half-applied deploy, or a file run by hand.

-- ---------------------------------------------------------------------------
-- Profiles — one row per auth.users, carries the retail/wholesale role split
-- ---------------------------------------------------------------------------

do $$ begin
  create type user_role as enum ('retail', 'wholesale');
exception when duplicate_object then null;
end $$;

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null,
  full_name text not null,
  email text not null,
  -- wholesale only
  business_name text,
  gstin text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "Users can view their own profile" on profiles;
create policy "Users can view their own profile"
  on profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on profiles;
create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on profiles;
create policy "Users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- Retail catalog — individual shoppers, single-unit purchases
-- ---------------------------------------------------------------------------

do $$ begin
  create type retail_category as enum ('women', 'men', 'kids');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type retail_tag as enum ('new', 'bestseller', 'sale');
exception when duplicate_object then null;
end $$;

create table if not exists retail_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  brand text not null,
  category retail_category not null,
  subcategory text not null,
  description text not null default '',
  images text[] not null default '{}',
  price integer not null, -- minor units
  mrp integer not null, -- minor units
  currency text not null default 'INR',
  colors text[] not null default '{}',
  rating numeric(2, 1) not null default 0,
  rating_count integer not null default 0,
  tags retail_tag[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists retail_product_sizes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references retail_products (id) on delete cascade,
  label text not null,
  in_stock boolean not null default true,
  unique (product_id, label)
);

create index if not exists retail_products_category_idx on retail_products (category);
create index if not exists retail_product_sizes_product_idx on retail_product_sizes (product_id);

alter table retail_products enable row level security;
alter table retail_product_sizes enable row level security;

drop policy if exists "Retail catalog is publicly readable" on retail_products;
create policy "Retail catalog is publicly readable"
  on retail_products for select
  using (is_active = true);

drop policy if exists "Retail sizes are publicly readable" on retail_product_sizes;
create policy "Retail sizes are publicly readable"
  on retail_product_sizes for select
  using (true);

-- ---------------------------------------------------------------------------
-- Wholesale catalog — B2B buyers, bulk purchases with MOQ + tiered pricing
-- ---------------------------------------------------------------------------

do $$ begin
  create type wholesale_category as enum ('women', 'men', 'kids', 'unisex', 'fabric');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type wholesale_tag as enum ('new', 'bestseller', 'closeout');
exception when duplicate_object then null;
end $$;

create table if not exists wholesale_products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  slug text not null unique,
  name text not null,
  category wholesale_category not null,
  subcategory text not null,
  description text not null default '',
  images text[] not null default '{}',
  currency text not null default 'INR',
  moq integer not null,
  pack_size integer not null,
  size_run text not null default '',
  fabric text not null default '',
  colors text[] not null default '{}',
  lead_time_days integer not null default 7,
  tags wholesale_tag[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists wholesale_price_tiers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references wholesale_products (id) on delete cascade,
  min_qty integer not null,
  price_per_unit integer not null, -- minor units
  unique (product_id, min_qty)
);

create index if not exists wholesale_products_category_idx on wholesale_products (category);
create index if not exists wholesale_price_tiers_product_idx on wholesale_price_tiers (product_id);

alter table wholesale_products enable row level security;
alter table wholesale_price_tiers enable row level security;

drop policy if exists "Wholesale catalog is publicly readable" on wholesale_products;
create policy "Wholesale catalog is publicly readable"
  on wholesale_products for select
  using (is_active = true);

drop policy if exists "Wholesale price tiers are publicly readable" on wholesale_price_tiers;
create policy "Wholesale price tiers are publicly readable"
  on wholesale_price_tiers for select
  using (true);

-- ---------------------------------------------------------------------------
-- Retail orders
-- ---------------------------------------------------------------------------

do $$ begin
  create type order_status as enum ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists retail_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  status order_status not null default 'pending',
  total integer not null, -- minor units
  currency text not null default 'INR',
  shipping_address jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists retail_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references retail_orders (id) on delete cascade,
  product_id uuid not null references retail_products (id),
  size text not null,
  color text not null,
  qty integer not null,
  price integer not null -- minor units, at time of order
);

-- "My orders" is the hottest authenticated query on the site and the RLS
-- policy filters on user_id, so without this index every read of one
-- customer's orders scans every order in the system.
create index if not exists retail_orders_user_idx on retail_orders (user_id, created_at desc);
create index if not exists retail_order_items_order_idx on retail_order_items (order_id);
create index if not exists retail_order_items_product_idx on retail_order_items (product_id);

alter table retail_orders enable row level security;
alter table retail_order_items enable row level security;

drop policy if exists "Users can view their own retail orders" on retail_orders;
create policy "Users can view their own retail orders"
  on retail_orders for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own retail orders" on retail_orders;
create policy "Users can create their own retail orders"
  on retail_orders for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can view their own retail order items" on retail_order_items;
create policy "Users can view their own retail order items"
  on retail_order_items for select
  using (exists (
    select 1 from retail_orders
    where retail_orders.id = retail_order_items.order_id
    and retail_orders.user_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- Wholesale quotes / orders
-- ---------------------------------------------------------------------------

do $$ begin
  create type quote_status as enum ('requested', 'confirmed', 'rejected', 'fulfilled');
exception when duplicate_object then null;
end $$;

create table if not exists wholesale_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  status quote_status not null default 'requested',
  total_estimate integer not null, -- minor units
  currency text not null default 'INR',
  created_at timestamptz not null default now()
);

create table if not exists wholesale_quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references wholesale_quotes (id) on delete cascade,
  product_id uuid not null references wholesale_products (id),
  qty integer not null,
  price_per_unit integer not null -- minor units, at time of quote
);

create index if not exists wholesale_quotes_user_idx on wholesale_quotes (user_id, created_at desc);
create index if not exists wholesale_quote_items_quote_idx on wholesale_quote_items (quote_id);
create index if not exists wholesale_quote_items_product_idx on wholesale_quote_items (product_id);

alter table wholesale_quotes enable row level security;
alter table wholesale_quote_items enable row level security;

drop policy if exists "Users can view their own wholesale quotes" on wholesale_quotes;
create policy "Users can view their own wholesale quotes"
  on wholesale_quotes for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own wholesale quotes" on wholesale_quotes;
create policy "Users can create their own wholesale quotes"
  on wholesale_quotes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can view their own wholesale quote items" on wholesale_quote_items;
create policy "Users can view their own wholesale quote items"
  on wholesale_quote_items for select
  using (exists (
    select 1 from wholesale_quotes
    where wholesale_quotes.id = wholesale_quote_items.quote_id
    and wholesale_quotes.user_id = auth.uid()
  ));
