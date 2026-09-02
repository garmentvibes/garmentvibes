-- ---------------------------------------------------------------------------
-- The server-side wishlist.
--
-- Same two questions as 43_cart_sync.sql, and the second is again the one
-- worth the file.
--
--   1. That the three functions do what they say — save once, refuse a
--      withdrawn product, still un-save one that was withdrawn after the fact,
--      merge without duplicating.
--   2. That one customer cannot reach another's wishlist through them.
--
-- (2) is not covered by 10_rls_isolation.sql, for the reason set out at the
-- top of the cart file: every function here is SECURITY DEFINER, so the
-- `auth.uid() = user_id` policy on `wishlists` is not consulted while they
-- run. The isolation that policy provides is switched off inside exactly the
-- code that does the writing, and all that holds it up is each function
-- scoping its statements to `require_caller()`.
--
-- So the isolation cases below put the *same product* on both customers'
-- lists. A test using different products would pass even with the scoping
-- removed, because the statement would have nothing of the other customer's to
-- match.
-- ---------------------------------------------------------------------------

begin;

truncate retail_products cascade;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'asha@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bhavna@example.com')
on conflict (id) do nothing;

insert into profiles (id, role, full_name, email) values
  ('11111111-1111-1111-1111-111111111111', 'retail', 'Asha', 'asha@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'retail', 'Bhavna', 'bhavna@example.com')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp)
values
  ('eeee0000-0000-0000-0000-000000000001', 'wish-kurta', 'Wish Kurta', 'Brand',
   'women', 'Kurtas', 199900, 249900),
  ('eeee0000-0000-0000-0000-000000000002', 'wish-tee', 'Wish Tee', 'Brand',
   'women', 'T-Shirts', 79900, 99900);

-- Withdrawn from the start: stands for a slug a stale localStorage wishlist
-- still names.
insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp, is_active)
values ('eeee0000-0000-0000-0000-000000000003', 'wish-retired', 'Retired', 'Brand',
        'women', 'Dresses', 149900, 199900, false);

-- Withdrawn later in the file, once it is already on a list: stands for a
-- product pulled from sale while somebody had it saved.
insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp)
values ('eeee0000-0000-0000-0000-000000000004', 'wish-doomed', 'Doomed', 'Brand',
        'women', 'Dresses', 129900, 159900);

/**
 * "Is this on this customer's list?", read as that customer.
 *
 * Through RLS rather than around it, so the read proves the row is reachable
 * by its owner as well as present in the table.
 */
create or replace function saved(p_user uuid, p_slug text)
returns boolean language plpgsql as $$
declare
  result boolean;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
  select exists (
    select 1 from wishlists w join retail_products p on p.id = w.product_id
     where p.slug = p_slug
  ) into result;
  reset role;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- wishlist_add
-- ---------------------------------------------------------------------------

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select wishlist_add('wish-kurta')$$) = 'true',
  'wishlist: saving a product reports that a row was written');

select assert(
  saved('11111111-1111-1111-1111-111111111111', 'wish-kurta'),
  'wishlist: and it is on her list');

-- The heart is a toggle in the UI, but a double-tap, a retry after a timeout
-- and a merge all reach this twice. The second must be a no-op, not an error
-- and not a second row.
select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select wishlist_add('wish-kurta')$$) = 'false',
  'wishlist: saving it again reports nothing was written');

select assert(
  (select count(*) from wishlists
    where user_id = '11111111-1111-1111-1111-111111111111') = 1,
  'wishlist: and there is still one row, not two');

-- A definer function does not see the policy that hides withdrawn products, so
-- it has to make that decision itself. Saving one would queue a back-in-stock
-- alert for something nobody can buy.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    $$select wishlist_add('wish-retired')$$) like '%No such product%',
  'wishlist: a withdrawn product cannot be saved');

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    $$select wishlist_add('no-such-slug')$$) like '%No such product%',
  'wishlist: nor can a slug that names nothing');

-- Nobody signed in means nobody to save it for, and there are two separate
-- things stopping it. Both are asserted, because an earlier version of this
-- file checked only that *something* refused — which passed with the grant
-- removed and passed again with it restored, so it was testing neither.

-- One: anon cannot reach the function at all. `like '%permission denied%'`
-- rather than `is not null`, so restoring anon's execute grant fails here
-- instead of falling through to the check inside.
-- All three, not just the first. A grant is written per function, so testing
-- one of three leaves two that could quietly gain an anon endpoint.
select assert(
  anon_error($$select wishlist_add('wish-kurta')$$) like '%permission denied%',
  'wishlist: a signed-out visitor cannot even reach the save function');

select assert(
  anon_error($$select wishlist_remove('wish-kurta')$$) like '%permission denied%',
  'wishlist: nor the un-save one');

select assert(
  anon_error($$select wishlist_merge(array['wish-kurta'])$$) like '%permission denied%',
  'wishlist: nor the merge');

-- Two: `require_caller()` refuses inside it. Reached as `authenticated` with no
-- subject claim, which is the shape of a request whose session has expired —
-- and the case that matters, because a null uuid in a WHERE clause matches
-- nothing and would report success rather than failing.
select assert(
  as_user_error(null, $$select wishlist_add('wish-kurta')$$) like '%Not signed in%',
  'wishlist: and a request with no subject is refused inside the function');

select assert(
  as_user_error(null, $$select wishlist_remove('wish-kurta')$$) like '%Not signed in%',
  'wishlist: un-saving refuses one too');

select assert(
  as_user_error(null, $$select wishlist_merge(array['wish-kurta'])$$) like '%Not signed in%',
  'wishlist: and so does merging');

-- ---------------------------------------------------------------------------
-- wishlist_remove
-- ---------------------------------------------------------------------------

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select wishlist_remove('wish-kurta')$$) = 'true',
  'wishlist: un-saving reports that a row went');

select assert(
  not saved('11111111-1111-1111-1111-111111111111', 'wish-kurta'),
  'wishlist: and it is off her list');

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select wishlist_remove('wish-kurta')$$) = 'false',
  'wishlist: un-saving what is not saved reports nothing went');

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select wishlist_remove('no-such-slug')$$) = 'false',
  'wishlist: and a slug that names nothing is the same answer, not an error');

-- The reason wishlist_remove does not use active_product_id(). A product
-- withdrawn while it sat on a list must still come off it, or the customer is
-- left with a heart they cannot un-press.
select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select wishlist_add('wish-doomed')$$) = 'true',
  'wishlist: a product is saved while it is still for sale');

update retail_products set is_active = false
 where slug = 'wish-doomed';

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select wishlist_remove('wish-doomed')$$) = 'true',
  'wishlist: and can still be un-saved after it is withdrawn');

-- ---------------------------------------------------------------------------
-- wishlist_merge
-- ---------------------------------------------------------------------------

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select wishlist_merge(array['wish-kurta', 'wish-tee'])$$) = '2',
  'wishlist: merging a signed-out list saves both of its products');

-- The property the whole sync rests on. This runs on every load, not on a
-- button press, so a second run must change nothing.
select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select wishlist_merge(array['wish-kurta', 'wish-tee'])$$) = '0',
  'wishlist: merging the same list again writes nothing');

select assert(
  (select count(*) from wishlists
    where user_id = '11111111-1111-1111-1111-111111111111') = 2,
  'wishlist: and leaves the list exactly as it was');

-- A stale localStorage list naming a product since withdrawn must not fail the
-- sign-in — the customer cannot fix that without knowing to clear site data.
select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select wishlist_merge(array['wish-retired'])$$) = '0',
  'wishlist: a withdrawn product in the merged list is skipped, not raised');

select assert(
  not saved('11111111-1111-1111-1111-111111111111', 'wish-retired'),
  'wishlist: and does not end up on the list');

-- A browser can send the same slug twice. ON CONFLICT resolves against
-- committed rows, not against a second row in the same statement, so without
-- the DISTINCT this raises "cannot affect row a second time".
select assert(
  as_user_error('22222222-2222-2222-2222-222222222222',
    $$select wishlist_merge(array['wish-kurta', 'wish-kurta'])$$) is null,
  'wishlist: a duplicated slug in one merge is not an error');

select assert(
  (select count(*) from wishlists
    where user_id = '22222222-2222-2222-2222-222222222222') = 1,
  'wishlist: and saves one row');

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select wishlist_merge(array[]::text[])$$) = '0',
  'wishlist: merging an empty list is a no-op rather than an error');

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    $$select wishlist_merge(null)$$) like '%must be an array%',
  'wishlist: a null list is refused with a sentence');

-- ---------------------------------------------------------------------------
-- One customer cannot reach another's list
-- ---------------------------------------------------------------------------
--
-- Both now have wish-kurta saved, which is what makes these tests bite: a
-- function that dropped its `user_id = require_caller()` scoping would match
-- the other customer's row and these would fail.

select assert(
  saved('11111111-1111-1111-1111-111111111111', 'wish-kurta')
    and saved('22222222-2222-2222-2222-222222222222', 'wish-kurta'),
  'wishlist: both customers have the same product saved');

select assert(
  as_user_scalar('22222222-2222-2222-2222-222222222222',
    $$select wishlist_remove('wish-kurta')$$) = 'true',
  'wishlist: one of them un-saves it');

select assert(
  not saved('22222222-2222-2222-2222-222222222222', 'wish-kurta'),
  'wishlist: hers is gone');

select assert(
  saved('11111111-1111-1111-1111-111111111111', 'wish-kurta'),
  'wishlist: and the other customer still has hers');

select assert(
  (select count(*) from wishlists) = 2,
  'wishlist: a removal took exactly one row from the table');

-- A read is policy-scoped rather than function-scoped, so this is the RLS
-- half. Worth stating here as well as in 10_rls_isolation.sql because the
-- app's read is a plain select and this is the only thing standing behind it.
--
-- Bhavna takes a row back first, so the table holds rows belonging to two
-- different people. Reading it while one of them owns everything would be
-- satisfied by a policy that let everyone see everything.
select assert(
  as_user_scalar('22222222-2222-2222-2222-222222222222',
    $$select wishlist_add('wish-tee')$$) = 'true',
  'wishlist: the other customer saves something of her own');

select assert(
  (select count(*) from wishlists) = 3,
  'wishlist: so the table holds three rows across two people');

select assert(
  visible_count('11111111-1111-1111-1111-111111111111',
    $$select count(*) from wishlists$$) = 2,
  'wishlist: and a customer reads only her own two');

select assert(
  visible_count('22222222-2222-2222-2222-222222222222',
    $$select count(*) from wishlists$$) = 1,
  'wishlist: while the other reads only her own one');

select assert(
  anon_denied($$select count(*) from wishlists$$),
  'wishlist: and a signed-out visitor reads none of them');

-- ---------------------------------------------------------------------------
-- The functions are the only door
-- ---------------------------------------------------------------------------
--
-- 0028 revokes INSERT so the withdrawn-product check is not optional, and
-- UPDATE because the only column an update could usefully move is product_id —
-- which is that same check, dodged.

select assert(
  is_denied('11111111-1111-1111-1111-111111111111', $$
    insert into wishlists (user_id, product_id)
    values ('11111111-1111-1111-1111-111111111111',
            'eeee0000-0000-0000-0000-000000000003')
  $$),
  'wishlist: a customer cannot insert a row directly, withdrawn or not');

select assert(
  is_denied('11111111-1111-1111-1111-111111111111', $$
    update wishlists set product_id = 'eeee0000-0000-0000-0000-000000000003'
  $$),
  'wishlist: nor move a saved row onto another product');

-- DELETE stays granted: removing your own row cannot produce a state the
-- functions would have prevented. The app still goes through wishlist_remove
-- because it holds slugs and not uuids.
-- Unfiltered on purpose. A DELETE naming a column would have to satisfy the
-- SELECT policy as well, so it would pass whether or not the DELETE policy
-- scoped anything; an unfiltered one is filtered by policy or it is not.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    $$delete from wishlists$$) is null,
  'wishlist: but a customer may still delete her own rows directly');

select assert(
  (select count(*) from wishlists) = 1,
  'wishlist: and that took her two, leaving the other customer''s one');

rollback;
