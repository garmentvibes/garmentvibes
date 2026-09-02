-- The retail wishlist, server-side.
--
-- `wishlists` has existed since 0005 and nothing has ever written to it. The
-- comment there says why the table was made:
--
--   "Server-side rather than local, because back-in-stock notifications are
--    only possible if we know what someone saved — a wishlist in localStorage
--    is invisible to the job that would email them."
--
-- The wishlist the storefront actually uses is a zustand store in
-- localStorage, so all of that is still true. A heart tapped on a phone is
-- invisible on the same customer's laptop, invisible after a browser profile
-- is replaced, and invisible to anything running on a server.
--
-- This is the same change 0016 made for the cart, and it is deliberately the
-- same shape: three functions that resolve a slug and write one row, a read
-- that stays a plain embedded select, and the local store kept as the wishlist
-- for signed-out visitors and for deployments with no database.
--
-- ---------------------------------------------------------------------------
-- Addressed by slug, not by id
-- ---------------------------------------------------------------------------
--
-- As in 0013 and 0016. The browser holds slugs — `RetailProduct.id` IS the
-- slug, by the decision recorded on that type — and handing a uuid to the
-- client so that it can hand it back is a round trip whose only product is an
-- identifier the client had no business holding. These resolve the slug and
-- store the uuid the foreign key wants.
--
-- ---------------------------------------------------------------------------
-- Why functions at all, when the table is two columns
-- ---------------------------------------------------------------------------
--
-- The cart needed functions for arithmetic PostgREST cannot express. This does
-- not: a wishlist row has nothing to compute. It needs them for the slug, and
-- for the one rule worth keeping in the database — that you cannot save a
-- product that is not for sale. A withdrawn product saved to a wishlist is a
-- back-in-stock alert waiting to be sent about something nobody can buy.
--
-- ---------------------------------------------------------------------------
-- Idempotence comes free here
-- ---------------------------------------------------------------------------
--
-- `cart_merge` had to think hard about running twice, because quantities add
-- up and a sign-in is not a button press: it happens again after every session
-- expiry, and summing would double the bag each time. A wishlist entry has no
-- quantity. It is either saved or it is not, so `on conflict do nothing` is
-- the whole of the merge semantics, and running it ten times leaves what
-- running it once left.
--
-- What is NOT free is the same thing that was not free for the cart: a merge
-- that keeps running would resurrect deletions. Unsave something on a phone
-- and the laptop still holds it locally; merge again and it comes back. That
-- is settled above this file, by the sync marker in the store and the rule in
-- src/lib/sync/decide.ts — merge exactly once per device, then adopt.

-- ---------------------------------------------------------------------------
-- Saving
-- ---------------------------------------------------------------------------

/**
 * Saves a product to the caller's wishlist.
 *
 * Returns true when a row was actually written, false when it was already
 * saved. The caller does not need the distinction to render anything — it has
 * already drawn a filled heart — but it makes a "did that land?" question
 * answerable from the response rather than by reading the table back.
 *
 * `active_product_id` from 0016 rather than a bare lookup, so a withdrawn
 * product cannot be saved. These functions are SECURITY DEFINER and so do not
 * see the RLS policy that hides withdrawn products from customers; reproducing
 * that decision explicitly is what stops a definer function being a hole.
 */
create or replace function public.wishlist_add(p_slug text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_caller();
  v_product uuid;
  v_written integer;
begin
  v_product := active_product_id(p_slug);
  if v_product is null then
    raise exception 'No such product: %', p_slug using errcode = '22023';
  end if;

  insert into wishlists (user_id, product_id)
  values (v_uid, v_product)
  on conflict (user_id, product_id) do nothing;

  get diagnostics v_written = row_count;
  return v_written > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Unsaving
-- ---------------------------------------------------------------------------

/**
 * Removes a product from the caller's wishlist.
 *
 * Returns true when a row went, false when there was nothing saved — including
 * when the slug names no product at all, which the caller does not need to
 * tell apart: both mean "it is not on your list".
 *
 * Deliberately NOT `active_product_id`, for the reason `cart_set_qty` is not
 * either. A product withdrawn while it sat on someone's wishlist must still be
 * removable; resolving only active products would strand the entry, leaving a
 * heart the customer cannot un-press.
 */
create or replace function public.wishlist_remove(p_slug text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_caller();
  v_product uuid;
  v_gone integer;
begin
  select id into v_product from retail_products where slug = p_slug;
  if v_product is null then
    return false;
  end if;

  delete from wishlists where user_id = v_uid and product_id = v_product;

  get diagnostics v_gone = row_count;
  return v_gone > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Merging a signed-out wishlist in at sign-in
-- ---------------------------------------------------------------------------

/**
 * Folds a locally-assembled wishlist into the caller's stored one.
 *
 * Takes an array of slugs and saves the ones that resolve to a product still
 * for sale. Returns how many rows were newly written, so "nothing to do" can
 * be told from "everything on that list has been withdrawn".
 *
 * Slugs that do not resolve are skipped rather than raised, as in `cart_merge`
 * and for the same reason: a local wishlist can name a product withdrawn since
 * it was saved, and a sign-in that fails because of something in localStorage
 * is a sign-in the customer cannot fix without knowing to clear site data. The
 * entry drops out, which is the truth — it is not for sale.
 *
 * Written as one statement rather than a loop because, unlike the cart, there
 * is nothing per-row to decide: no quantity to clamp, no size to check against
 * the product. `select ... where is_active` does the resolving and the
 * filtering at once, and `on conflict do nothing` does the merge.
 */
create or replace function public.wishlist_merge(p_slugs text[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_caller();
  v_written integer;
begin
  if p_slugs is null then
    raise exception 'Slugs must be an array' using errcode = '22023';
  end if;

  with saved as (
    insert into wishlists (user_id, product_id)
    select v_uid, p.id
      from retail_products p
     -- A slug repeated in the array cannot produce a repeated row, because the
     -- select is over `retail_products` and `slug` is unique: `= any` is a
     -- membership test, so a duplicate in the array matches the same single
     -- product. Worth stating, because the usual hazard here is real — ON
     -- CONFLICT resolves against committed rows, not against a second row in
     -- the same command, so a statement that COULD produce the same key twice
     -- would raise rather than be rescued. This one cannot.
     where p.slug = any (p_slugs)
       and p.is_active = true
    on conflict (user_id, product_id) do nothing
    returning 1
  )
  select count(*) into v_written from saved;

  return v_written;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- The functions are the only way a row appears, so that the withdrawn-product
-- check is not optional. UPDATE goes too: the table is a composite key and a
-- timestamp, so the only thing an update could usefully change is
-- `product_id` — which is precisely the check being enforced, dodged.
--
-- SELECT and DELETE stay. The read is a plain embedded select and needs the
-- privilege; a DELETE of your own row cannot produce a state the functions
-- would have prevented, so routing it through one would buy nothing. The app
-- uses `wishlist_remove` regardless, because it holds slugs and not uuids.
revoke insert, update on wishlists from authenticated;

revoke all on function public.wishlist_add(text) from public, anon;
grant execute on function public.wishlist_add(text) to authenticated;

revoke all on function public.wishlist_remove(text) from public, anon;
grant execute on function public.wishlist_remove(text) to authenticated;

revoke all on function public.wishlist_merge(text[]) from public, anon;
grant execute on function public.wishlist_merge(text[]) to authenticated;
