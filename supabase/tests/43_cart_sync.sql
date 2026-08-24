-- ---------------------------------------------------------------------------
-- The server-side cart.
--
-- Two things are under test and the second is the one worth the file.
--
--   1. That the four functions do what they say — increment rather than
--      duplicate, clamp, refuse a withdrawn product, remove on zero.
--   2. That one customer cannot reach another's cart through them.
--
-- (2) is not covered by the RLS tests in 10_rls_isolation.sql, and that is the
-- whole point. Every function here is SECURITY DEFINER, which means the
-- `auth.uid() = user_id` policy on `cart_items` is not consulted when they
-- run. The isolation that policy provides is switched off inside exactly the
-- code that does the writing, and the only thing left holding it up is each
-- function scoping its own statements to `require_caller()`. So the isolation
-- cases below give both customers the *same variant* in their carts: if the
-- scoping were dropped, the statement would match the other customer's row
-- too, and a test that used different variants would sail past it.
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
values ('dddddddd-0000-0000-0000-000000000001', 'cart-kurta', 'Cart Kurta', 'Brand',
        'women', 'Kurtas', 199900, 249900);

insert into retail_product_sizes (product_id, label, stock_qty) values
  ('dddddddd-0000-0000-0000-000000000001', 'S', 50),
  ('dddddddd-0000-0000-0000-000000000001', 'M', 50);

insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp)
values ('dddddddd-0000-0000-0000-000000000002', 'cart-tee', 'Cart Tee', 'Brand',
        'women', 'T-Shirts', 79900, 99900);

insert into retail_product_sizes (product_id, label, stock_qty) values
  ('dddddddd-0000-0000-0000-000000000002', 'M', 50);

-- Withdrawn. Stands in both for "a product pulled from sale while it sat in
-- someone's bag" and for "a slug a stale localStorage cart still names".
insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp, is_active)
values ('dddddddd-0000-0000-0000-000000000003', 'cart-retired', 'Retired', 'Brand',
        'women', 'Dresses', 149900, 199900, false);

insert into retail_product_sizes (product_id, label, stock_qty) values
  ('dddddddd-0000-0000-0000-000000000003', 'M', 4);

-- Shorthand for "how many of this variant does this customer have?", as that
-- customer, so the read goes through RLS rather than around it.
create or replace function held(p_user uuid, p_slug text, p_size text)
returns integer language plpgsql as $$
declare
  result integer;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
  select coalesce(sum(ci.qty), 0) into result
  from cart_items ci join retail_products p on p.id = ci.product_id
  where p.slug = p_slug and ci.size_label = p_size;
  reset role;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- cart_add
-- ---------------------------------------------------------------------------

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select cart_add('cart-kurta', 'M', 'Rose', 2)$$) = '2',
  'cart: adding two returns two');

select assert(
  held('11111111-1111-1111-1111-111111111111', 'cart-kurta', 'M') = 2,
  'cart: and two are in the bag');

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select cart_add('cart-kurta', 'M', 'Rose', 3)$$) = '5',
  'cart: adding the same variant again increments to five');

select assert(
  (select count(*) from cart_items
   where user_id = '11111111-1111-1111-1111-111111111111') = 1,
  'cart: as one line, not two');

-- The same product in a different colour is a different line. Someone buying
-- the rose and the indigo wants both in the bag, not one row that lost a
-- colour, and the unique index has to agree.
select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select cart_add('cart-kurta', 'M', 'Indigo', 1)$$) = '1',
  'cart: a different colour is its own line');

select assert(
  (select count(*) from cart_items
   where user_id = '11111111-1111-1111-1111-111111111111') = 2,
  'cart: so the bag now holds two lines');

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    $$select cart_add('cart-kurta', 'M', 'Rose', 200)$$) is null,
  'cart: asking for two hundred is accepted');

select assert(
  held('11111111-1111-1111-1111-111111111111', 'cart-kurta', 'M') = 99 + 1,
  'cart: but clamped to the ninety-nine ceiling (plus the indigo line)');

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    $$select cart_add('cart-retired', 'M', 'Rose', 1)$$)
    like '%No such product%',
  'cart: a withdrawn product cannot be added');

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    $$select cart_add('not-a-product', 'M', 'Rose', 1)$$)
    like '%No such product%',
  'cart: nor can a slug that never existed');

-- Without this check nothing catches it: cart_items stores the size as text
-- with no foreign key, so the line would sit in the bag looking ordinary and
-- fail at checkout.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    $$select cart_add('cart-kurta', 'XXL', 'Rose', 1)$$)
    like '%not available%',
  'cart: a size the product is not sold in is refused');

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    $$select cart_add('cart-kurta', 'M', 'Rose', 0)$$)
    like '%at least 1%',
  'cart: a quantity of zero is not an add');

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    $$select cart_add('cart-kurta', 'M', 'Rose', -5)$$)
    like '%at least 1%',
  'cart: nor is a negative one');

-- ---------------------------------------------------------------------------
-- Signed out
-- ---------------------------------------------------------------------------

-- The functions are SECURITY DEFINER, so a missing session is not caught by
-- anything else. `anon` has no execute grant, which is the outer wall; the
-- inner one is require_caller() refusing a null uid, and it matters because
-- `authenticated` is a role a request can hold with no user behind it.
select assert(
  anon_denied($$select cart_add('cart-kurta', 'M', 'Rose', 1)$$),
  'cart: a signed-out visitor cannot add to a cart');

select assert(
  as_user_error(null, $$select cart_add('cart-kurta', 'M', 'Rose', 1)$$)
    like '%Not signed in%',
  'cart: and a session-less authenticated request is refused by name');

select assert(
  as_user_error(null, $$select cart_clear()$$) like '%Not signed in%',
  'cart: clearing without a session is refused too');

select assert(
  as_user_error(null, $$select cart_merge('[]'::jsonb)$$) like '%Not signed in%',
  'cart: as is merging');

-- ---------------------------------------------------------------------------
-- cart_set_qty
-- ---------------------------------------------------------------------------

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select cart_set_qty('cart-kurta', 'M', 'Rose', 4)$$) = '4',
  'cart: setting a quantity returns it');

select assert(
  held('11111111-1111-1111-1111-111111111111', 'cart-kurta', 'M') = 4 + 1,
  'cart: and the line now holds four');

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select cart_set_qty('cart-kurta', 'M', 'Rose', 500)$$) = '99',
  'cart: setting above the ceiling clamps and says so');

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select cart_set_qty('cart-kurta', 'M', 'Indigo', 0)$$) = '0',
  'cart: setting zero removes the line');

select assert(
  (select count(*) from cart_items
   where user_id = '11111111-1111-1111-1111-111111111111') = 1,
  'cart: so the indigo line is gone rather than sitting at zero');

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    $$select cart_set_qty('cart-kurta', 'M', 'Rose', -1)$$)
    like '%cannot be negative%',
  'cart: a negative quantity is refused');

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select cart_set_qty('never-existed', 'M', 'Rose', 3)$$) = '0',
  'cart: setting a quantity on an unknown slug is a no-op, not an error');

-- A product withdrawn while it sat in a bag has to stay removable. Resolving
-- through active_product_id() here would strand the line and leave a cart the
-- customer cannot empty, so this is inserted directly to set the case up.
insert into cart_items (user_id, product_id, size_label, color, qty)
values ('11111111-1111-1111-1111-111111111111',
        'dddddddd-0000-0000-0000-000000000003', 'M', 'Rose', 1);

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select cart_set_qty('cart-retired', 'M', 'Rose', 0)$$) = '0',
  'cart: a withdrawn product can still be removed from the bag');

select assert(
  held('11111111-1111-1111-1111-111111111111', 'cart-retired', 'M') = 0,
  'cart: and it actually went');

-- ---------------------------------------------------------------------------
-- One customer cannot reach another's cart
-- ---------------------------------------------------------------------------

-- Same product, same size, same colour in both bags. If any function below
-- dropped its `user_id = require_caller()` scoping, the statement would match
-- Bhavna's row as readily as Asha's — which is the failure this section
-- exists for, and which identical variants are what make visible.
select as_user_scalar('22222222-2222-2222-2222-222222222222',
  $$select cart_add('cart-kurta', 'M', 'Rose', 7)$$);

select assert(
  held('22222222-2222-2222-2222-222222222222', 'cart-kurta', 'M') = 7,
  'cart: the second customer has seven of the same variant');

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select cart_set_qty('cart-kurta', 'M', 'Rose', 1)$$) = '1',
  'cart: the first customer sets their own line to one');

select assert(
  held('22222222-2222-2222-2222-222222222222', 'cart-kurta', 'M') = 7,
  'cart: which left the second customer''s seven alone');

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select cart_add('cart-kurta', 'M', 'Rose', 2)$$) = '3',
  'cart: adding two more takes the first customer to three, not nine');

select assert(
  held('22222222-2222-2222-2222-222222222222', 'cart-kurta', 'M') = 7,
  'cart: and still does not touch the second customer');

-- Removal has its own scoping to lose. The UPDATE branch above would at least
-- fail noisily if it matched two rows — `returning into` raises on more than
-- one — but a DELETE that matched two would take the other customer's line
-- and report success, which is the quietest way this could go wrong. So it
-- gets its own case, on the variant both customers hold.
select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select cart_set_qty('cart-kurta', 'M', 'Rose', 0)$$) = '0',
  'cart: the first customer removes the shared variant from their bag');

select assert(
  held('11111111-1111-1111-1111-111111111111', 'cart-kurta', 'M') = 0,
  'cart: which took it out of theirs');

select assert(
  held('22222222-2222-2222-2222-222222222222', 'cart-kurta', 'M') = 7,
  'cart: and left the second customer''s seven where it was');

select as_user_scalar('11111111-1111-1111-1111-111111111111',
  $$select cart_add('cart-kurta', 'M', 'Rose', 3)$$);

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select cart_clear()$$) = '1',
  'cart: clearing empties one line — the caller''s own');

select assert(
  held('11111111-1111-1111-1111-111111111111', 'cart-kurta', 'M') = 0,
  'cart: the first customer''s bag is empty');

select assert(
  held('22222222-2222-2222-2222-222222222222', 'cart-kurta', 'M') = 7,
  'cart: while the second customer''s bag is untouched');

-- ---------------------------------------------------------------------------
-- cart_merge
-- ---------------------------------------------------------------------------

-- Asha signs in on a new device carrying a locally-built bag. Two of the
-- kurta locally against seven stored, and one tee that the stored cart does
-- not have at all.
select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select cart_add('cart-kurta', 'M', 'Rose', 7)$$) = '7',
  'merge: seven kurtas are stored for the first customer');

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111', $$
    select cart_merge('[
      {"slug": "cart-kurta", "size": "M", "color": "Rose", "qty": 2},
      {"slug": "cart-tee", "size": "M", "color": "Rose", "qty": 4}
    ]'::jsonb)
  $$) = '2',
  'merge: both lines merged');

select assert(
  held('11111111-1111-1111-1111-111111111111', 'cart-kurta', 'M') = 7,
  'merge: the stored seven wins over the local two, rather than becoming nine');

select assert(
  held('11111111-1111-1111-1111-111111111111', 'cart-tee', 'M') = 4,
  'merge: and a line only the local cart had is brought in');

-- Idempotence is the property the whole design rests on: this runs on every
-- sign-in, the local cart is not cleared by signing in, and a customer signs
-- in again after every session expiry. Summing would double the bag each time.
select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111', $$
    select cart_merge('[
      {"slug": "cart-kurta", "size": "M", "color": "Rose", "qty": 2},
      {"slug": "cart-tee", "size": "M", "color": "Rose", "qty": 4}
    ]'::jsonb)
  $$) = '2',
  'merge: merging the same cart a second time is accepted');

select assert(
  held('11111111-1111-1111-1111-111111111111', 'cart-kurta', 'M') = 7,
  'merge: and changed nothing — the kurta is still seven');

select assert(
  held('11111111-1111-1111-1111-111111111111', 'cart-tee', 'M') = 4,
  'merge: and the tee is still four');

select assert(
  held('22222222-2222-2222-2222-222222222222', 'cart-tee', 'M') = 0,
  'merge: the second customer gained nothing from either merge');

-- A local cart that outlived the products in it must not make signing in fail.
select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111', $$
    select cart_merge('[
      {"slug": "cart-retired", "size": "M", "color": "Rose", "qty": 1},
      {"slug": "never-existed", "size": "M", "color": "Rose", "qty": 1},
      {"slug": "cart-kurta", "size": "XXL", "color": "Rose", "qty": 1}
    ]'::jsonb)
  $$) = '0',
  'merge: withdrawn, unknown and unsold-size lines are skipped, not raised');

select assert(
  held('11111111-1111-1111-1111-111111111111', 'cart-retired', 'M') = 0,
  'merge: and the withdrawn product did not enter the bag');

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    $$select cart_merge('{"slug": "cart-kurta"}'::jsonb)$$)
    like '%must be a JSON array%',
  'merge: an object where an array belongs is refused');

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111', $$
    select cart_merge('[{"slug": "cart-kurta", "size": "M", "color": "Rose", "qty": 4000}]'::jsonb)
  $$) = '1',
  'merge: a local cart claiming four thousand is accepted');

select assert(
  held('11111111-1111-1111-1111-111111111111', 'cart-kurta', 'M') = 99,
  'merge: and clamped to the ceiling rather than stored as given');

-- ---------------------------------------------------------------------------
-- The doors that are shut, and the ones deliberately left open
-- ---------------------------------------------------------------------------

select assert(
  is_denied('11111111-1111-1111-1111-111111111111', $$
    insert into cart_items (user_id, product_id, size_label, color, qty)
    values ('11111111-1111-1111-1111-111111111111',
            'dddddddd-0000-0000-0000-000000000001', 'S', 'Rose', 1)
  $$),
  'cart: a customer cannot insert a cart line directly');

-- Named rather than merely "denied": is_denied() cannot tell a revoked grant
-- from a policy that rejected the row, and those are different failures. The
-- grant is what makes the ceiling and the withdrawn-product check compulsory
-- instead of advisory, so it is the grant that has to be gone.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111', $$
    insert into cart_items (user_id, product_id, size_label, color, qty)
    values ('11111111-1111-1111-1111-111111111111',
            'dddddddd-0000-0000-0000-000000000001', 'S', 'Rose', 1)
  $$) like '%permission denied for table cart_items%',
  'cart: and it is the missing grant that stops it, not a policy');

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    $$update cart_items set qty = 5000$$)
    like '%permission denied for table cart_items%',
  'cart: nor can a customer update a quantity past the ceiling directly');

-- Deliberately still granted. Removing your own line cannot produce a state
-- the functions would have prevented, so routing it through one would buy
-- nothing — and asserting it works keeps a future tightening honest about
-- what it is changing.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    $$delete from cart_items where color = 'nothing-matches-this'$$) is null,
  'cart: deleting your own lines is still allowed');

select assert(
  visible_count('22222222-2222-2222-2222-222222222222',
    $$select count(*)::int from cart_items$$) = 1,
  'cart: a customer reads only their own cart');

-- Refused outright rather than filtered to zero rows: 0010 never granted
-- `anon` any privilege on cart_items, so the request dies before a policy is
-- consulted. anon_count() would raise here rather than return 0, and reading
-- that as a passing test is exactly the confusion this distinction avoids.
select assert(
  anon_denied($$select count(*) from cart_items$$),
  'cart: and a signed-out visitor cannot read the table at all');

-- ---------------------------------------------------------------------------
-- The helpers are not endpoints
-- ---------------------------------------------------------------------------

-- Supabase publishes every function in `public` at /rest/v1/rpc/. Left
-- executable, active_product_id() would answer "is there a product with this
-- slug" for withdrawn ones — a way to enumerate the catalogue we took down.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    $$select active_product_id('cart-kurta')$$)
    like '%permission denied for function active_product_id%',
  'cart: the slug resolver is not reachable as an endpoint');

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    $$select require_caller()$$)
    like '%permission denied for function require_caller%',
  'cart: nor is the caller helper');

-- ---------------------------------------------------------------------------
-- The ceiling is a constraint, not just a clamp in a function
-- ---------------------------------------------------------------------------

select assert(
  violates_constraint($$
    insert into cart_items (user_id, product_id, size_label, color, qty)
    values ('22222222-2222-2222-2222-222222222222',
            'dddddddd-0000-0000-0000-000000000002', 'M', 'Teal', 100)
  $$),
  'cart: the ninety-nine ceiling holds against the table owner too');

select assert(
  violates_constraint($$
    insert into cart_items (user_id, product_id, size_label, color, qty)
    values ('22222222-2222-2222-2222-222222222222',
            'dddddddd-0000-0000-0000-000000000002', 'M', 'Teal', 0)
  $$),
  'cart: and so does the existing floor of one');

rollback;
