-- ---------------------------------------------------------------------------
-- The queries the store→database migration will actually issue.
--
-- Every zustand store in src/lib/stores/ has a table waiting for it (see the
-- map in supabase/README.md). This file runs the reads and writes each one
-- needs, AS THE ROLE THAT WILL RUN THEM, so the migration is a mechanical
-- rewrite rather than a discovery exercise.
--
-- The bugs this is aimed at do not look like errors. A read that RLS filters
-- to nothing returns an empty array, not a failure — so a catalogue with no
-- prices, a bag that looks empty, or a review list missing every entry all
-- render as a working page with nothing on it. Those are the cases below.
--
-- Runs against a scratch Postgres with the real migrations and seed applied.
-- Note what it does NOT cover: PostgREST and @supabase/ssr sit between the app
-- and these queries, and this environment's network policy blocks
-- *.supabase.co, so that hop is unverified here. Column names, RLS behaviour
-- and result shapes — where the mistakes actually live — are covered.
-- ---------------------------------------------------------------------------

begin;

truncate retail_products, wholesale_products, promo_codes cascade;

-- Two customers, one approved wholesale buyer, one staff member.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'asha@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bhavna@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'buyer@trade.example'),
  ('33333333-3333-3333-3333-333333333333', 'staff@garmentvibes.com');

insert into profiles (id, role, full_name, email) values
  ('11111111-1111-1111-1111-111111111111', 'retail', 'Asha', 'asha@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'retail', 'Bhavna', 'bhavna@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'wholesale', 'Trade Buyer', 'buyer@trade.example'),
  ('33333333-3333-3333-3333-333333333333', 'admin', 'Staff', 'staff@garmentvibes.com');

insert into wholesale_accounts (id, business_name, contact_name, email, status)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Trade Co', 'Trade Buyer',
        'buyer@trade.example', 'approved');

update profiles
set wholesale_account_id = 'aaaaaaaa-0000-0000-0000-000000000001'
where id = '44444444-4444-4444-4444-444444444444';

insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp)
values ('cccccccc-0000-0000-0000-000000000001', 'test-kurta', 'Test Kurta', 'Brand', 'women', 'Kurtas', 199900, 249900);

insert into retail_product_sizes (product_id, label, stock_qty)
values
  ('cccccccc-0000-0000-0000-000000000001', 'S', 5),
  ('cccccccc-0000-0000-0000-000000000001', 'M', 0);

insert into wholesale_products (id, sku, slug, name, category, subcategory, moq, pack_size)
values ('cccccccc-0000-0000-0000-000000000002', 'SKU-1', 'test-tee-bulk', 'Test Tee', 'unisex', 'T-Shirts', 100, 10);

insert into wholesale_price_tiers (product_id, min_qty, price_per_unit)
values
  ('cccccccc-0000-0000-0000-000000000002', 100, 21900),
  ('cccccccc-0000-0000-0000-000000000002', 500, 19900);

-- ---------------------------------------------------------------------------
-- Catalogue reads — the storefront is public, so these run as `anon`
-- ---------------------------------------------------------------------------

select assert(
  anon_count('select count(*) from retail_products') = 1,
  'catalogue-store: a signed-out visitor can read retail products'
);

-- The product page renders a size picker from this. If RLS hid it, every
-- product would render with no sizes and no way to add to bag — a working
-- page with nothing on it.
select assert(
  anon_count('select count(*) from retail_product_sizes') = 2,
  'catalogue-store: a signed-out visitor can read size and stock rows'
);

select assert(
  anon_count($q$
    select count(*) from retail_products p
    join retail_product_sizes s on s.product_id = p.id
    where p.slug = 'test-kurta'
  $q$) = 2,
  'catalogue-store: product joined to its sizes returns both rows for anon'
);

-- in_stock is generated from stock_qty, so the storefront must read it rather
-- than deriving its own and risking disagreement.
select assert(
  anon_count($q$
    select count(*) from retail_product_sizes
    where label = 'M' and in_stock = false
  $q$) = 1,
  'catalogue-store: a zero-stock size reads back as out of stock'
);

-- ---------------------------------------------------------------------------
-- Trade prices — the one catalogue read that is NOT public
-- ---------------------------------------------------------------------------

-- The wholesale catalogue stays browsable and indexable...
select assert(
  anon_count('select count(*) from wholesale_products') = 1,
  'catalogue-store: the wholesale catalogue is publicly browsable'
);

-- ...but its prices are not, and the MECHANISM matters to the migration.
--
-- `anon` has no SELECT privilege on this table at all — it is refused before
-- any policy is consulted, rather than filtered to zero rows. Through
-- PostgREST that surfaces as a 403, NOT as an empty array. A DAL that embeds
-- price tiers in the public wholesale catalogue query will therefore fail the
-- whole request for signed-out visitors and render nothing, instead of
-- degrading to "price on request".
--
-- The fix at migration time is to fetch tiers as a separate, authenticated
-- query rather than embedding them in the public one. This assertion is
-- written with anon_denied() rather than anon_count() specifically to pin
-- which of the two it is.
select assert(
  anon_denied('select 1 from wholesale_price_tiers'),
  'catalogue-store: trade prices are refused outright for a signed-out visitor, not filtered'
);

select assert(
  visible_count('11111111-1111-1111-1111-111111111111',
    'select count(*) from wholesale_price_tiers') = 0,
  'catalogue-store: trade prices are invisible to a retail customer'
);

select assert(
  visible_count('44444444-4444-4444-4444-444444444444',
    'select count(*) from wholesale_price_tiers') = 2,
  'catalogue-store: an approved wholesale buyer sees every price break'
);

-- ---------------------------------------------------------------------------
-- cart-store → cart_items
-- ---------------------------------------------------------------------------

insert into cart_items (user_id, product_id, size_label, color, qty) values
  ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001', 'S', 'Rose', 2),
  ('22222222-2222-2222-2222-222222222222', 'cccccccc-0000-0000-0000-000000000001', 'S', 'Navy', 1);

select assert(
  visible_count('11111111-1111-1111-1111-111111111111',
    'select count(*) from cart_items') = 1,
  'cart-store: a customer sees only their own bag'
);

-- Denied at the grant level, like the trade prices above — `anon` has no
-- SELECT privilege on any user-scoped table, so this is a 403 through
-- PostgREST rather than an empty bag.
select assert(
  anon_denied('select 1 from cart_items'),
  'cart-store: a signed-out visitor is refused the cart table outright'
);

-- The unique key is what makes "add the same variant twice" an increment
-- rather than a duplicate row, which is how the current store behaves.
select assert(
  violates_constraint($q$
    insert into cart_items (user_id, product_id, size_label, color, qty)
    values ('11111111-1111-1111-1111-111111111111',
            'cccccccc-0000-0000-0000-000000000001', 'S', 'Rose', 1)
  $q$),
  'cart-store: the same variant cannot be added as a second line'
);

select assert(
  is_denied('11111111-1111-1111-1111-111111111111', $q$
    insert into cart_items (user_id, product_id, size_label, color, qty)
    values ('22222222-2222-2222-2222-222222222222',
            'cccccccc-0000-0000-0000-000000000001', 'L', 'Rose', 1)
  $q$),
  'cart-store: a customer cannot put items in someone else''s bag'
);

-- ---------------------------------------------------------------------------
-- wishlist-store → wishlists
-- ---------------------------------------------------------------------------

insert into wishlists (user_id, product_id) values
  ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001');

select assert(
  visible_count('22222222-2222-2222-2222-222222222222',
    'select count(*) from wishlists') = 0,
  'wishlist-store: one customer cannot read another''s wishlist'
);

-- ---------------------------------------------------------------------------
-- reviews-store → reviews
--
-- Reviews start unpublished. The storefront read must therefore be filtered,
-- and the moderation queue must see what the storefront does not.
-- ---------------------------------------------------------------------------

insert into reviews (product_id, user_id, author, rating, title, body, status) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Asha', 5, 'Lovely', 'Great fabric.', 'published'),
  ('cccccccc-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'Bhavna', 1, 'Awaiting moderation', 'Not yet approved.', 'pending');

select assert(
  anon_count('select count(*) from reviews') = 1,
  'reviews-store: a signed-out visitor sees published reviews only'
);

select assert(
  visible_count('33333333-3333-3333-3333-333333333333',
    'select count(*) from reviews') = 2,
  'reviews-store: staff see the unpublished one too, for moderation'
);

-- An aggregate over the same filter — the product page prints an average, and
-- it must be the average of what is displayed, not of everything written.
select assert(
  anon_count($q$
    select count(*) from reviews where rating = 1
  $q$) = 0,
  'reviews-store: an unpublished one-star review does not drag the average down'
);

-- ---------------------------------------------------------------------------
-- address-store → retail_addresses
-- ---------------------------------------------------------------------------

insert into retail_addresses (user_id, label, full_name, phone, address_line1, city, state, pincode)
values ('11111111-1111-1111-1111-111111111111', 'Home', 'Asha', '9999999999',
        '1 Test Lane', 'Mumbai', 'Maharashtra', '400001');

select assert(
  visible_count('22222222-2222-2222-2222-222222222222',
    'select count(*) from retail_addresses') = 0,
  'address-store: one customer cannot read another''s address book'
);

select assert(
  anon_denied('select 1 from retail_addresses'),
  'address-store: a signed-out visitor is refused the address table outright'
);

-- ---------------------------------------------------------------------------
-- promo-store → promo_codes
--
-- The checkout code box has to validate before an order exists, so anon needs
-- to read live codes — but not the ones that are switched off.
-- ---------------------------------------------------------------------------

insert into promo_codes (code, percent, built_in) values ('LIVE10', 10, true);
insert into promo_codes (code, percent, active) values ('SWITCHEDOFF', 50, false);

select assert(
  anon_count('select count(*) from promo_codes') = 1,
  'promo-store: a signed-out visitor can validate a live code'
);

select assert(
  anon_count($q$select count(*) from promo_codes where code = 'SWITCHEDOFF'$q$) = 0,
  'promo-store: a deactivated code is not discoverable'
);

rollback;
