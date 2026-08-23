-- ---------------------------------------------------------------------------
-- place_retail_order() — the only supported way an order gets written.
--
-- Two classes of thing are proven here, and the second is the one that is
-- easy to get wrong:
--
--   1. That a tampered order is refused. Straightforward to test and
--      straightforward to pass.
--   2. That a refused order leaves NOTHING behind. An oversell that raises
--      after already decrementing the first line's stock, or after writing an
--      order header, is a rejection that still damaged the database — and it
--      reads as a passing test if all you assert is "it was refused".
--
-- Every rejection case below therefore checks the aftermath as well as the
-- error, and the multi-line atomicity case exists specifically because that is
-- where a half-applied order would come from.
-- ---------------------------------------------------------------------------

begin;

truncate retail_products, promo_codes cascade;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'asha@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bhavna@example.com');

insert into profiles (id, role, full_name, email) values
  ('11111111-1111-1111-1111-111111111111', 'retail', 'Asha', 'asha@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'retail', 'Bhavna', 'bhavna@example.com');

-- ₹1,999 — under the ₹2,500 slab boundary, so 5% GST.
insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp)
values ('cccccccc-0000-0000-0000-000000000001', 'test-kurta', 'Test Kurta', 'Brand',
        'women', 'Kurtas', 199900, 249900);

-- S is deep enough that no test runs it out. It matters: the line loop takes
-- stock before the header totals are checked, so a size that empties partway
-- through makes every later test fail as an oversell no matter what it was
-- actually probing. M is the shallow one, reserved for the stock tests.
insert into retail_product_sizes (product_id, label, stock_qty) values
  ('cccccccc-0000-0000-0000-000000000001', 'S', 50),
  ('cccccccc-0000-0000-0000-000000000001', 'M', 2);

-- A second product so a multi-line order has a first line that must survive
-- or be undone as a unit with the second.
insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp)
values ('cccccccc-0000-0000-0000-000000000002', 'test-tee', 'Test Tee', 'Brand',
        'women', 'T-Shirts', 79900, 99900);

insert into retail_product_sizes (product_id, label, stock_qty) values
  ('cccccccc-0000-0000-0000-000000000002', 'M', 10);

insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp, is_active)
values ('cccccccc-0000-0000-0000-000000000003', 'retired-dress', 'Retired Dress', 'Brand',
        'women', 'Dresses', 149900, 199900, false);

insert into retail_product_sizes (product_id, label, stock_qty) values
  ('cccccccc-0000-0000-0000-000000000003', 'M', 4);

insert into promo_codes (code, percent, active) values ('SAVE10', 10, true);
insert into promo_codes (code, percent, active, expires_on)
values ('LASTYEAR', 25, true, current_date - 1);

-- ---------------------------------------------------------------------------
-- Test-local builders
-- ---------------------------------------------------------------------------

-- Builds one correctly-taxed line, so that a test which is not about tax does
-- not have to hand-compute it and accidentally test the wrong thing. Retail
-- prices are GST-inclusive: tax is backed out of the gross, never added on.
create or replace function line(
  p_slug text, p_size text, p_qty integer, p_price integer, p_rate numeric
) returns jsonb language sql as $$
  select jsonb_build_object(
    'slug', p_slug,
    'size', p_size,
    'color', 'Rose',
    'qty', p_qty,
    'price', p_price,
    'hsn_code', '6106',
    'tax_rate', p_rate,
    'taxable_value', round((p_qty * p_price * 100) / (100 + p_rate)),
    'tax_amount', p_qty * p_price - round((p_qty * p_price * 100) / (100 + p_rate))
  );
$$;

-- Wraps the 17-argument call so each test states only what it is varying.
-- Intra-state by default (Telangana, the seller's own state) so the CGST/SGST
-- split is exercised rather than IGST.
create or replace function place(
  p_items jsonb,
  p_subtotal integer,
  p_total integer,
  p_discount integer default 0,
  p_promo text default null,
  p_cod_fee integer default 0,
  p_method text default 'upi',
  p_cgst integer default null,
  p_sgst integer default null
) returns text language sql as $$
  select format(
    $sql$select place_retail_order(
      %L::jsonb,
      '{"line1":"1 Test Lane","city":"Hyderabad","state":"Telangana","pincode":"500001"}'::jsonb,
      'Asha', 'asha@example.com', '9999999999',
      %L::payment_method, %s,
      %s, %s, %s, %s, %s, 0, %s,
      '36', '36EBQPS5960G1ZX', %L
    )$sql$,
    p_items, p_method,
    coalesce(quote_literal(p_promo), 'null'),
    p_subtotal, p_discount, p_cod_fee,
    -- Default the split to half the line tax each, which is what an
    -- intra-state supply produces.
    coalesce(p_cgst::text, (
      select (sum((v ->> 'tax_amount')::integer) / 2)::text
      from jsonb_array_elements(p_items) as t(v)
    )),
    coalesce(p_sgst::text, (
      select (sum((v ->> 'tax_amount')::integer)
              - sum((v ->> 'tax_amount')::integer) / 2)::text
      from jsonb_array_elements(p_items) as t(v)
    )),
    p_total,
    -- `reference` is UNIQUE, so every order needs its own. Reusing one made
    -- the second successful placement fail on a duplicate key and report
    -- itself as an oversell, which is how the collision in
    -- generateReferenceId() came to light.
    'GV-' || substr(md5(random()::text), 1, 10)
  );
$$;

-- ---------------------------------------------------------------------------
-- The happy path
-- ---------------------------------------------------------------------------

-- 2 x ₹1,999 = ₹3,998. No promo, no COD fee.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    place(jsonb_build_array(line('test-kurta', 'S', 2, 199900, 5)),
          399800, 399800)) is null,
  'placement: a correctly priced order is accepted'
);

select assert(
  visible_count('11111111-1111-1111-1111-111111111111',
    'select count(*) from retail_orders') = 1,
  'placement: the order is visible to the customer who placed it'
);

select assert(
  visible_count('22222222-2222-2222-2222-222222222222',
    'select count(*) from retail_orders') = 0,
  'placement: and to nobody else'
);

select assert(
  (select user_id from retail_orders limit 1)
    = '11111111-1111-1111-1111-111111111111',
  'placement: the order is owned by the caller, not by whoever the payload names'
);

select assert(
  (select count(*) from retail_order_items) = 1,
  'placement: the order line is written in the same call'
);

-- The whole point of the exercise: stock moved.
select assert(
  (select stock_qty from retail_product_sizes
    where product_id = 'cccccccc-0000-0000-0000-000000000001' and label = 'S') = 48,
  'placement: stock is decremented by the quantity ordered'
);

select assert(
  (select stock_qty from retail_product_sizes
    where product_id = 'cccccccc-0000-0000-0000-000000000001' and label = 'M') = 2,
  'placement: a different size of the same product is untouched'
);

-- The line is addressed by slug and stored by id. A slug is editable — it is
-- part of the URL and gets rewritten when a product is renamed — so an order
-- that referenced one would silently repoint at whatever took the name over.
select assert(
  (select product_id from retail_order_items limit 1)
    = 'cccccccc-0000-0000-0000-000000000001',
  'placement: the line stores the catalogue uuid the slug resolved to, not the slug'
);

-- Renaming a product must not rewrite an order already placed.
select assert(
  (select product_name from retail_order_items limit 1) = 'Test Kurta',
  'placement: the product name is snapshotted from the catalogue'
);

select assert(
  (select status from retail_orders limit 1) = 'pending',
  'placement: an online order waits for payment rather than counting as a sale'
);

-- ---------------------------------------------------------------------------
-- Price tampering — the reason this is a function and not an INSERT
-- ---------------------------------------------------------------------------

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    place(jsonb_build_array(line('test-kurta', 'S', 1, 100, 5)),
          100, 100)) like '%price mismatch%',
  'placement: a ₹1 price for a ₹1,999 kurta is refused against the catalogue'
);

select assert(
  (select count(*) from retail_orders) = 1,
  'placement: the refused underpriced order left no row behind'
);

select assert(
  (select stock_qty from retail_product_sizes
    where product_id = 'cccccccc-0000-0000-0000-000000000001' and label = 'S') = 48,
  'placement: nor did it take stock'
);

-- Correct line prices, lying header. Catches the case where someone patches
-- the summary rather than the lines.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    place(jsonb_build_array(line('test-kurta', 'S', 1, 199900, 5)),
          100, 100)) like '%subtotal mismatch%',
  'placement: a tampered subtotal is caught even when the lines are honest'
);

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    place(jsonb_build_array(line('test-kurta', 'S', 1, 199900, 5)),
          199900, 100)) like '%total mismatch%',
  'placement: a total that does not foot against its own parts is refused'
);

-- ---------------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------------

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    place(jsonb_build_array(line('test-kurta', 'M', 3, 199900, 5)),
          599700, 599700)) like '%not enough stock%',
  'placement: ordering 3 of a size with 2 left is refused'
);

select assert(
  (select stock_qty from retail_product_sizes
    where product_id = 'cccccccc-0000-0000-0000-000000000001' and label = 'M') = 2,
  'placement: the refused oversell did not move stock'
);

-- Exactly the remaining stock must succeed. An off-by-one here would make the
-- last unit of everything permanently unsellable.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    place(jsonb_build_array(line('test-kurta', 'M', 2, 199900, 5)),
          399800, 399800)) is null,
  'placement: ordering exactly the last two units is allowed'
);

select assert(
  (select stock_qty from retail_product_sizes
    where product_id = 'cccccccc-0000-0000-0000-000000000001' and label = 'M') = 0,
  'placement: which takes the size to zero'
);

select assert(
  (select in_stock from retail_product_sizes
    where product_id = 'cccccccc-0000-0000-0000-000000000001' and label = 'M') = false,
  'placement: and in_stock follows it down without anyone setting it'
);

-- ---------------------------------------------------------------------------
-- Atomicity — a rejected multi-line order must undo its own earlier lines
-- ---------------------------------------------------------------------------

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    place(jsonb_build_array(
            line('test-tee', 'M', 1, 79900, 5),
            line('test-kurta', 'M', 1, 199900, 5)),
          279800, 279800)) like '%not enough stock%',
  'placement: a two-line order fails when its second line cannot be filled'
);

-- The tee was in stock and would have been decremented first.
select assert(
  (select stock_qty from retail_product_sizes
    where product_id = 'cccccccc-0000-0000-0000-000000000002' and label = 'M') = 10,
  'placement: the line that COULD be filled was rolled back with the one that could not'
);

select assert(
  (select count(*) from retail_orders) = 2,
  'placement: and no order header survived the failure'
);

-- ---------------------------------------------------------------------------
-- Promo codes — the gap 0009 recorded, closed
-- ---------------------------------------------------------------------------

-- 1 x ₹1,999, 10% off = ₹199.90 discount, ₹1,799.10 to pay.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    place(jsonb_build_array(line('test-kurta', 'S', 1, 199900, 5)),
          199900, 179910, 19990, 'SAVE10')) is null,
  'placement: a live promo code discounts the order'
);

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    place(jsonb_build_array(line('test-kurta', 'S', 1, 199900, 5)),
          199900, 99900, 100000, 'SAVE10')) like '%discount mismatch%',
  'placement: a 50% discount from a 10% code is refused'
);

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    place(jsonb_build_array(line('test-kurta', 'S', 1, 199900, 5)),
          199900, 179910, 19990, 'NOSUCHCODE')) like '%not valid today%',
  'placement: an invented promo code is refused'
);

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    place(jsonb_build_array(line('test-kurta', 'S', 1, 199900, 5)),
          199900, 149925, 49975, 'LASTYEAR')) like '%not valid today%',
  'placement: an expired code is refused rather than honoured'
);

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    place(jsonb_build_array(line('test-kurta', 'S', 1, 199900, 5)),
          199900, 99900, 100000, null)) like '%discount applied with no promo code%',
  'placement: a discount with no code behind it is refused'
);

-- ---------------------------------------------------------------------------
-- Tax must reconcile
-- ---------------------------------------------------------------------------

-- A line declaring itself entirely untaxed. Note that this SUMS correctly —
-- taxable 199900 + tax 0 is exactly the gross — so a check that only asked
-- the two to add up would wave it through. Given the rate, there is one right
-- split, and this is not it.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111', place(
    jsonb_build_array(jsonb_build_object(
      'slug', 'test-kurta', 'size', 'S',
      'color', 'Rose', 'qty', 1, 'price', 199900, 'hsn_code', '6106',
      'tax_rate', 5, 'taxable_value', 199900, 'tax_amount', 0)),
    199900, 199900, 0, null, 0, 'upi', 0, 0)) like '%tax is wrong for product%',
  'placement: a line claiming to carry no tax at 5% is refused even though its figures sum'
);

-- Taxable value and tax that do not add up to what is being charged.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111', place(
    jsonb_build_array(jsonb_build_object(
      'slug', 'test-kurta', 'size', 'S',
      'color', 'Rose', 'qty', 1, 'price', 199900, 'hsn_code', '6106',
      'tax_rate', 5, 'taxable_value', 190381, 'tax_amount', 0)),
    199900, 199900, 0, null, 0, 'upi', 0, 0)) like '%tax is wrong for product%',
  'placement: a line whose parts do not sum to its gross is refused'
);

-- An invented rate. The slab choice is gst.ts's call, but the rate has to be
-- one that exists.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111', place(
    jsonb_build_array(jsonb_build_object(
      'slug', 'test-kurta', 'size', 'S',
      'color', 'Rose', 'qty', 1, 'price', 199900, 'hsn_code', '6106',
      'tax_rate', 0.5, 'taxable_value', 198905, 'tax_amount', 995)),
    199900, 199900, 0, null, 0, 'upi', 497, 498)) like '%is not a GST rate%',
  'placement: a decimal-point slip turning 5% into 0.5% is caught'
);

-- 18% is a real rate and the split below is arithmetically correct for it, so
-- this is accepted. It documents the deliberate limit: the function does not
-- decide which slab a ₹1,999 kurta belongs in, and a wrong slab on a real rate
-- passes. That decision is gst.ts's, made server-side, and is not reachable
-- from a browser.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111', place(
    jsonb_build_array(jsonb_build_object(
      'slug', 'test-kurta', 'size', 'S',
      'color', 'Rose', 'qty', 1, 'price', 199900, 'hsn_code', '6106',
      'tax_rate', 18, 'taxable_value', 169407, 'tax_amount', 30493)),
    199900, 199900, 0, null, 0, 'upi', 15246, 15247)) is null,
  'placement: a correct split at the wrong slab is accepted — the slab is not this function''s call'
);

-- Lines are taxed correctly, the header claims less.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    place(jsonb_build_array(line('test-kurta', 'S', 1, 199900, 5)),
          199900, 199900, 0, null, 0, 'upi', 0, 0))
    like '%order tax does not match its lines%',
  'placement: a header understating the tax its own lines carry is refused'
);

-- ---------------------------------------------------------------------------
-- An odd number of paise of tax
--
-- 0004 required tax_cgst = tax_sgst exactly, which no honest halving of an odd
-- total can satisfy. Over a thousand consecutive price points, 504 produce an
-- odd total — including this one. Before 0013 relaxed it, this order could not
-- be saved at all, and the failure would have arrived as a constraint name in
-- front of a customer who had already paid.
-- ---------------------------------------------------------------------------

-- ₹1,999 at 5% inclusive: tax 95.19, which halves to 47.59 and 47.60.
select assert(
  (select round((199900 * 5) / 105.0)) = 9519,
  'placement: the ₹1,999 kurta really does carry an odd number of paise of tax'
);

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    place(jsonb_build_array(line('test-kurta', 'S', 1, 199900, 5)),
          199900, 199900, 0, null, 0, 'upi', 4759, 4760)) is null,
  'placement: an order whose tax is an odd number of paise can be saved'
);

select assert(
  exists (select 1 from retail_orders where tax_cgst = 4759 and tax_sgst = 4760),
  'placement: and it is stored with the halves it was given, not rounded to equal'
);

-- The tolerance is one paise, not a licence. A split this uneven is the bug
-- the original constraint was written to catch, and it must still be caught.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    place(jsonb_build_array(line('test-kurta', 'S', 1, 199900, 5)),
          199900, 199900, 0, null, 0, 'upi', 9519, 0))
    like '%not halves of the same tax%',
  'placement: putting the whole tax in CGST is still refused'
);

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    place(jsonb_build_array(line('test-kurta', 'S', 1, 199900, 5)),
          199900, 199900, 0, null, 0, 'upi', 4758, 4761))
    like '%not halves of the same tax%',
  'placement: so is a two-paise gap — the tolerance is one, not "roughly equal"'
);

-- A supply is taxed by the centre and the state, or by IGST across a border.
-- Never both, or the same value is taxed twice. Split so the three still sum
-- to the line tax, otherwise the reconciliation check fires first and this
-- would pass without ever reaching the guard it names.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111', $q$
    select place_retail_order(
      '[{"slug":"test-kurta","size":"S","color":"Rose",
         "qty":1,"price":199900,"hsn_code":"6106","tax_rate":5,
         "taxable_value":190381,"tax_amount":9519}]'::jsonb,
      '{}'::jsonb, 'Asha', 'asha@example.com', '9999999999',
      'upi'::payment_method, null,
      199900, 0, 0, 3000, 3000, 3519, 199900, '36', '36EBQPS5960G1ZX', 'GV-TEST')
  $q$) like '%intra-state or inter-state, not both%',
  'placement: an order cannot carry CGST and IGST at the same time'
);

-- ---------------------------------------------------------------------------
-- Catalogue state
-- ---------------------------------------------------------------------------

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    place(jsonb_build_array(line('retired-dress', 'M', 1, 149900, 5)),
          149900, 149900)) like '%not on sale%',
  'placement: a withdrawn product cannot be ordered even at the right price'
);

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    place(jsonb_build_array(line('test-kurta', 'XXL', 1, 199900, 5)),
          199900, 199900)) like '%has no size%',
  'placement: a size that does not exist is refused rather than silently skipped'
);

-- ---------------------------------------------------------------------------
-- Cash on delivery
-- ---------------------------------------------------------------------------

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    place(jsonb_build_array(line('test-kurta', 'S', 1, 199900, 5)),
          199900, 204800, 0, null, 4900, 'cod')) is null,
  'placement: a COD order carries its fee into the total'
);

select assert(
  (select status from retail_orders where payment_method = 'cod') = 'confirmed',
  'placement: COD is confirmed on placement — there is no payment to wait for'
);

select assert(
  (select cod_fee from retail_orders where payment_method = 'cod') = 4900,
  'placement: and the fee is recorded rather than folded invisibly into the total'
);

-- The six methods 0012 added must actually be storable.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    place(jsonb_build_array(line('test-tee', 'M', 1, 79900, 5)),
          79900, 79900, 0, null, 0, 'netbanking')) is null,
  'placement: net banking is recorded as itself, not flattened to "online"'
);

-- ---------------------------------------------------------------------------
-- The direct door is shut
-- ---------------------------------------------------------------------------

-- This is the insert 0001 allowed. If it ever succeeds again, every check
-- above is decoration: a customer can write whatever total they like.
--
-- Asserting only "it was refused" is not enough, and this file learned that
-- the hard way. 0013 does two things — revokes the INSERT grant and drops the
-- policy — and either alone denies the statement. A test that just checks for
-- refusal passes with the grant handed back, which is the weaker arrangement:
-- a policy can be re-added by a later migration meaning to grant something
-- narrow, and the door reopens with nothing failing.
--
-- Missing grant and failed policy both raise SQLSTATE 42501, so the message is
-- what separates them: `permission denied for table` means the request never
-- reached a policy at all.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111', $q$
    insert into retail_orders (user_id, status, total, shipping_address, subtotal)
    values ('11111111-1111-1111-1111-111111111111', 'confirmed', 100, '{}'::jsonb, 100)
  $q$) like '%permission denied for table retail_orders%',
  'placement: a customer is refused the orders table outright, not merely filtered by policy'
);

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111', $q$
    insert into retail_order_items (order_id, product_id, size, color, qty, price)
    select id, 'cccccccc-0000-0000-0000-000000000001', 'S', 'Rose', 1, 1
    from retail_orders limit 1
  $q$) like '%permission denied for table retail_order_items%',
  'placement: and the same for order lines'
);

-- A signed-out caller has no order to place and no user to place it for.
select assert(
  anon_denied($q$select place_retail_order(
    '[]'::jsonb, '{}'::jsonb, 'x', 'x@example.com', '9999999999',
    'upi'::payment_method, null, 0, 0, 0, 0, 0, 0, 0, '36', '36EBQPS5960G1ZX', 'GV-X')$q$),
  'placement: the function is not callable by a signed-out visitor'
);

-- ---------------------------------------------------------------------------
-- Whole-file invariants
--
-- Everything above tests one call at a time. These hold over every order this
-- file managed to place, including the ones placed incidentally by tests
-- aimed at something else — which is where an unnoticed inconsistency would
-- be hiding.
-- ---------------------------------------------------------------------------

select assert(
  not exists (
    select 1 from retail_orders o
     where o.tax_cgst + o.tax_sgst + o.tax_igst
       <> (select coalesce(sum(i.tax_amount), 0)
             from retail_order_items i where i.order_id = o.id)
  ),
  'placement: every stored order carries exactly the tax its own lines add up to'
);

select assert(
  not exists (
    select 1 from retail_orders o
     where o.total <> o.subtotal - o.discount + o.cod_fee
  ),
  'placement: every stored total foots against its own subtotal, discount and fee'
);

select assert(
  not exists (
    select 1 from retail_orders o
     where o.subtotal <> (select coalesce(sum(i.qty * i.price), 0)
                            from retail_order_items i where i.order_id = o.id)
  ),
  'placement: and every stored subtotal is the sum of its lines'
);

-- Stock taken must equal stock ordered, per size, across every call this file
-- made — the successful ones and the sixteen that were refused.
--
-- This is the assertion that catches a refused order quietly keeping the stock
-- it took on its way to being refused. Each rejection test above checks the
-- one size it touched; this checks all of them at once, including sizes no
-- individual test thought to look at afterwards.
select assert(
  not exists (
    select 1
      from retail_product_sizes s
      join (values
              ('cccccccc-0000-0000-0000-000000000001'::uuid, 'S', 50),
              ('cccccccc-0000-0000-0000-000000000001'::uuid, 'M', 2),
              ('cccccccc-0000-0000-0000-000000000002'::uuid, 'M', 10),
              ('cccccccc-0000-0000-0000-000000000003'::uuid, 'M', 4)
           ) as opening(product_id, label, qty)
        on opening.product_id = s.product_id and opening.label = s.label
     where s.stock_qty <> opening.qty - coalesce((
             select sum(i.qty) from retail_order_items i
              where i.product_id = s.product_id and i.size = s.label), 0)
  ),
  'placement: every size holds its opening stock less exactly what was ordered from it'
);

-- An order with no lines is the shape a non-atomic implementation leaves
-- behind when the second write fails.
select assert(
  not exists (
    select 1 from retail_orders o
     where not exists (select 1 from retail_order_items i where i.order_id = o.id)
  ),
  'placement: no order was left without lines'
);

drop function line(text, text, integer, integer, numeric);
drop function place(jsonb, integer, integer, integer, text, integer, text, integer, integer);

rollback;
