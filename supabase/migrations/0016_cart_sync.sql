-- The retail cart, server-side.
--
-- `cart_items` has existed since 0005 and nothing has ever written to it. The
-- cart the storefront actually uses is a zustand store in localStorage, which
-- means:
--
--   * It does not survive switching device. The catalogue's own pitch is
--     "browse on a laptop, buy on a phone" — the comment in 0005 says so — and
--     that journey currently loses the bag at the handover.
--   * It does not survive clearing site data, a new browser profile, or a
--     phone replacing another phone.
--   * It carries a price captured at add-to-bag time. A cart left for a month
--     shows last month's price, and `place_retail_order` re-derives prices from
--     the catalogue, so the customer sees one number and the order is rejected
--     or charged another.
--   * It is invisible to anything server-side. Abandoned-cart recovery in
--     src/lib/abandoned-cart.ts can only run in the tab that owns the cart.
--
-- This migration adds the writes. Reads stay as a plain PostgREST select with
-- the product embedded, so price, name and image come from the catalogue on
-- every read and the stale-price problem disappears rather than being patched.
--
-- ---------------------------------------------------------------------------
-- Addressed by slug, not by id
-- ---------------------------------------------------------------------------
--
-- Same reasoning as `place_retail_order`: the browser holds slugs because that
-- is what a URL carries, and handing a uuid to the client so it can hand it
-- back is a round trip whose only product is an identifier the client had no
-- business holding. The functions below resolve the slug and store the uuid.
--
-- ---------------------------------------------------------------------------
-- What is locked and what is not
-- ---------------------------------------------------------------------------
--
-- INSERT and UPDATE grants are revoked below, so the functions are the only
-- way a row appears or a quantity changes. That is not the same weight of
-- decision as it was for `retail_orders`: nothing here decides money, and RLS
-- already confines every row to its owner, so the worst a direct write could
-- do is put a strange line in the writer's own cart. It is revoked because the
-- functions apply a quantity ceiling and refuse withdrawn products, and a
-- second door that skips both makes those checks decoration.
--
-- SELECT and DELETE stay granted. The read is a plain embedded select and
-- needs the privilege; a DELETE of your own line cannot produce a state the
-- functions would have prevented, so routing it through one would buy nothing.

-- ---------------------------------------------------------------------------
-- A ceiling on the quantity of one line
-- ---------------------------------------------------------------------------
--
-- `qty` is an `integer` and `cart_add` increments it, so without a bound a
-- determined caller reaches 2^31 and the addition overflows — which is a
-- crash rather than a mispriced order, but it is a crash reachable from a
-- browser.
--
-- 99 rather than something tighter because stock is the real limiter and it
-- binds first: `place_retail_order` refuses more than is on the shelf. This is
-- only here to stop nonsense, so it is set where a genuine order never meets
-- it.
alter table cart_items drop constraint if exists cart_items_qty_ceiling;
alter table cart_items add constraint cart_items_qty_ceiling check (qty <= 99);

-- ---------------------------------------------------------------------------
-- Resolving a slug to a buyable variant
-- ---------------------------------------------------------------------------

/**
 * The product id for an active product, or null.
 *
 * `is_active` is checked here rather than left to the RLS policy because these
 * functions are SECURITY DEFINER and therefore see every row, active or not.
 * The policy on `retail_products` hides withdrawn products from customers; a
 * definer function has to reproduce that decision itself, and forgetting to is
 * the standard way a definer function becomes a hole.
 */
create or replace function public.active_product_id(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from retail_products where slug = p_slug and is_active = true;
$$;

-- ---------------------------------------------------------------------------
-- The caller
-- ---------------------------------------------------------------------------

/**
 * The signed-in user, or an exception.
 *
 * Every function below is SECURITY DEFINER, which means RLS does not run for
 * it — the `auth.uid() = user_id` policy that protects `cart_items` is simply
 * not consulted. Each one therefore has to establish whose cart it is working
 * on, and refuse rather than default when there is nobody: a null `user_id`
 * would fail the NOT NULL, but a null slipping into a WHERE clause would
 * silently match nothing and report success.
 *
 * Not SECURITY DEFINER itself: it needs no privilege, only the JWT claim, and
 * `auth.uid()` reads that from the request rather than from the role the
 * surrounding function happens to be running as.
 */
create or replace function public.require_caller()
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Adding to the bag
-- ---------------------------------------------------------------------------

/**
 * Adds `p_qty` of a variant to the caller's cart, or increments the line that
 * is already there.
 *
 * Returns the resulting quantity, which is not always the one asked for — the
 * ceiling clamps it. The caller writes the returned number back into its own
 * state rather than assuming, so the browser and the database cannot end up
 * disagreeing about what is in the bag.
 *
 * `qty = qty + n` is why this is a function at all: PostgREST's upsert can set
 * a column but cannot compute one from its current value, so the alternative
 * is read-then-write, which loses an increment whenever two devices add at
 * once.
 */
create or replace function public.cart_add(
  p_slug text,
  p_size text,
  p_color text,
  p_qty integer default 1
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_caller();
  v_product uuid;
  v_qty integer;
begin
  if p_qty is null or p_qty < 1 then
    raise exception 'Quantity must be at least 1' using errcode = '22023';
  end if;

  v_product := active_product_id(p_slug);
  if v_product is null then
    raise exception 'No such product: %', p_slug using errcode = '22023';
  end if;

  -- The size has to be one the product is actually sold in. `cart_items` has
  -- no foreign key to `retail_product_sizes` — it stores the label as text —
  -- so nothing else would catch "XXL" on a product that stops at L, and the
  -- line would sit in the bag until checkout refused it.
  if not exists (
    select 1 from retail_product_sizes
    where product_id = v_product and label = p_size
  ) then
    raise exception 'Size % is not available for %', p_size, p_slug using errcode = '22023';
  end if;

  insert into cart_items (user_id, product_id, size_label, color, qty)
  values (v_uid, v_product, p_size, p_color, least(p_qty, 99))
  on conflict (user_id, product_id, size_label, color)
  do update set qty = least(cart_items.qty + excluded.qty, 99)
  returning qty into v_qty;

  return v_qty;
end;
$$;

-- ---------------------------------------------------------------------------
-- Changing and removing
-- ---------------------------------------------------------------------------

/**
 * Sets a line to an exact quantity, or removes it when that quantity is zero.
 *
 * Zero means remove rather than "a line of nothing", so the quantity stepper
 * on the cart page and the remove button are the same call. A line of zero
 * would violate `cart_items_qty_positive` anyway; treating it as a delete is
 * what the UI means by it.
 *
 * Returns the resulting quantity — 0 when the line is gone, and 0 also when
 * there was no such line to begin with, which the caller does not need to
 * distinguish: both mean "it is not in the bag".
 */
create or replace function public.cart_set_qty(
  p_slug text,
  p_size text,
  p_color text,
  p_qty integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_caller();
  v_product uuid;
  v_qty integer;
begin
  if p_qty is null or p_qty < 0 then
    raise exception 'Quantity cannot be negative' using errcode = '22023';
  end if;

  -- Deliberately not active_product_id(). A product withdrawn while it sat in
  -- someone's bag must still be removable; resolving only active products
  -- would strand the line, leaving a cart the customer cannot empty.
  select id into v_product from retail_products where slug = p_slug;
  if v_product is null then
    return 0;
  end if;

  if p_qty = 0 then
    delete from cart_items
    where user_id = v_uid and product_id = v_product
      and size_label = p_size and color = p_color;
    return 0;
  end if;

  update cart_items
  set qty = least(p_qty, 99)
  where user_id = v_uid and product_id = v_product
    and size_label = p_size and color = p_color
  returning qty into v_qty;

  return coalesce(v_qty, 0);
end;
$$;

/** Empties the caller's cart. Returns how many lines went. */
create or replace function public.cart_clear()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_caller();
  v_count integer;
begin
  with gone as (
    delete from cart_items where user_id = v_uid returning 1
  )
  select count(*) into v_count from gone;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Merging a signed-out cart in at sign-in
-- ---------------------------------------------------------------------------

/**
 * Folds a locally-assembled cart into the caller's stored one.
 *
 * Takes `[{slug, size, color, qty}, ...]` and, for each line, keeps whichever
 * quantity is larger — the local one or the one already stored.
 *
 * ## Why the larger, and not the sum
 *
 * Because this runs more than once. The local cart is not cleared by signing
 * in, and a customer signs in again after every session expiry, so summing
 * would double the bag each time: two kurtas become four become eight, without
 * anyone touching the add button. Taking the larger is idempotent — running it
 * ten times leaves the same cart as running it once — and idempotence is the
 * property that matters when the trigger is "a session was established" rather
 * than "somebody pressed something".
 *
 * It is not free. A customer who genuinely adds two more of something while
 * signed out, on top of two already stored, ends up with two rather than four.
 * That is a smaller and more explicable surprise than a bag that grows on its
 * own, and the quantity stepper is right there.
 *
 * ## Lines that no longer resolve
 *
 * Skipped, not raised. A local cart can name a product withdrawn since it was
 * added, and a sign-in that fails because of something in localStorage is a
 * sign-in the customer cannot fix without knowing to clear site data. The line
 * drops out of the bag, which is the truth: it is not for sale.
 *
 * Returns the number of lines that merged, so the caller can tell "nothing to
 * do" from "everything was withdrawn" if it ever needs to.
 */
create or replace function public.cart_merge(p_lines jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_caller();
  v_line jsonb;
  v_product uuid;
  v_qty integer;
  v_merged integer := 0;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Lines must be a JSON array' using errcode = '22023';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_product := active_product_id(v_line ->> 'slug');
    if v_product is null then
      continue;
    end if;

    if not exists (
      select 1 from retail_product_sizes
      where product_id = v_product and label = v_line ->> 'size'
    ) then
      continue;
    end if;

    v_qty := greatest(1, least(coalesce((v_line ->> 'qty')::integer, 1), 99));

    insert into cart_items (user_id, product_id, size_label, color, qty)
    values (v_uid, v_product, v_line ->> 'size', coalesce(v_line ->> 'color', ''), v_qty)
    on conflict (user_id, product_id, size_label, color)
    do update set qty = greatest(cart_items.qty, excluded.qty);

    v_merged := v_merged + 1;
  end loop;

  return v_merged;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- See the note at the top: the functions are the only way a line appears or a
-- quantity changes, so that the ceiling and the withdrawn-product check are
-- not optional.
revoke insert, update on cart_items from authenticated;

-- `require_caller` and `active_product_id` are helpers for the four functions
-- above and not part of the API. Supabase publishes every function in `public`
-- at /rest/v1/rpc/, so leaving them executable would expose two more endpoints
-- for no reason — `active_product_id` in particular would answer "does this
-- slug exist" for withdrawn products to anyone who asked.
revoke all on function public.require_caller() from public, anon, authenticated;
revoke all on function public.active_product_id(text) from public, anon, authenticated;

revoke all on function public.cart_add(text, text, text, integer) from public, anon;
grant execute on function public.cart_add(text, text, text, integer) to authenticated;

revoke all on function public.cart_set_qty(text, text, text, integer) from public, anon;
grant execute on function public.cart_set_qty(text, text, text, integer) to authenticated;

revoke all on function public.cart_clear() from public, anon;
grant execute on function public.cart_clear() to authenticated;

revoke all on function public.cart_merge(jsonb) from public, anon;
grant execute on function public.cart_merge(jsonb) to authenticated;
