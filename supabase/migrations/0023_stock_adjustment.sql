-- Moving stock by a delta.
--
-- The storefront now reads `retail_product_sizes.stock_qty` — until this point
-- it decided sold-out from a zustand store in the customer's own browser while
-- `place_retail_order` enforced this column, so the page and the checkout
-- disagreed about the shelf.
--
-- That leaves the movements that are not a sale. Approving a return puts
-- sellable goods back; shipping an exchange takes the replacement off. Both run
-- from the admin panel, and both were writing to the same browser store — which
-- on a deployment with a database now means returned stock never comes back for
-- sale at all, because nothing reads that store any more.
--
-- ---------------------------------------------------------------------------
-- Why a function rather than an update
-- ---------------------------------------------------------------------------
--
-- Same reason as `cart_add` in 0016: PostgREST can set a column but cannot
-- compute one from its current value, so the alternative is read-then-write.
-- Two returns approved at the same moment both read 4, both write 6, and two
-- units are lost — and stock loss discovered a week later is indistinguishable
-- from theft.
--
-- `stock_qty = stock_qty + p_delta` in one statement takes the row lock
-- Postgres already takes for an UPDATE, so concurrent adjustments serialise.
--
-- ---------------------------------------------------------------------------
-- Why staff-only, and why it re-checks
-- ---------------------------------------------------------------------------
--
-- A customer must never be able to move stock: a negative delta on the last
-- unit of something would make it unbuyable for everyone else, and a positive
-- one would let them order stock that does not exist. `is_staff()` is checked
-- inside the function because it is SECURITY DEFINER and therefore does not see
-- the RLS policy that would otherwise have said so.

/**
 * Adds `p_delta` units to one variant and returns the resulting level.
 *
 * A negative delta takes stock off the shelf; a positive one puts it back.
 * Refuses to take more than is there rather than letting the `stock_qty >= 0`
 * constraint from 0005 fire, so the caller gets a sentence instead of a
 * constraint name.
 *
 * Addressed by slug, like every other function the app calls: the browser holds
 * slugs because that is what a URL carries, and the uuid stays server-side.
 */
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
  if not public.is_staff() then
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

-- Granted to `authenticated`, because that is the only role staff have.
--
-- Supabase has no separate staff role: an admin signs in as an ordinary
-- authenticated user and is staff by virtue of their `profiles.role`. So the
-- grant cannot be the gate — every customer holds the same role — and
-- `is_staff()` inside the function is what actually refuses them. That is why
-- the check is written there rather than left to the grant, and why removing
-- it would open stock adjustment to anyone with an account.
--
-- `anon` is revoked outright: a signed-out caller has no profile to be staff
-- by, so the endpoint has nothing to offer them but an error.
revoke all on function public.adjust_retail_stock(text, text, integer) from public, anon;
grant execute on function public.adjust_retail_stock(text, text, integer) to authenticated, service_role;
