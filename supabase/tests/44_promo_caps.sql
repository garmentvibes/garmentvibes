-- ---------------------------------------------------------------------------
-- Promo redemption caps.
--
-- The thing under test is not "does a capped code get refused" — that is the
-- easy half and it would pass with the check in the browser, which is where it
-- has been living. It is that the count the cap is measured against lives
-- somewhere the person being counted cannot reach:
--
--   * a customer cannot write a redemption for anyone, so a campaign cannot be
--     exhausted on someone else's behalf;
--   * a customer cannot delete their own, so a one-per-customer code cannot be
--     reset by clearing site data or opening a second browser;
--   * the redemption is written in the same transaction as the order, so a
--     failed order leaves no redemption and a successful one cannot leave the
--     count behind.
--
-- The last of those is why the rejection cases below check the aftermath as
-- well as the error. An order refused for the wrong total that still consumed
-- a one-per-customer code is a rejection that damaged the customer, and it
-- reads as a passing test if all you assert is "it was refused".
-- ---------------------------------------------------------------------------

begin;

truncate retail_products, promo_codes cascade;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'asha@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bhavna@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'chetan@example.com')
on conflict (id) do nothing;

insert into profiles (id, role, full_name, email) values
  ('11111111-1111-1111-1111-111111111111', 'retail', 'Asha', 'asha@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'retail', 'Bhavna', 'bhavna@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'retail', 'Chetan', 'chetan@example.com')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

-- ₹1,999, under the ₹2,500 boundary, so 5% GST. Deep stock: nothing here is
-- about running out, and a size that empties partway through would make every
-- later test fail as an oversell no matter what it was probing.
insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp)
values ('eeeeeeee-0000-0000-0000-000000000001', 'promo-kurta', 'Promo Kurta', 'Brand',
        'women', 'Kurtas', 199900, 249900);

insert into retail_product_sizes (product_id, label, stock_qty) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'S', 500);

insert into promo_codes (code, percent, active) values ('UNCAPPED', 10, true);
insert into promo_codes (code, percent, active, max_per_customer) values ('ONCEEACH', 10, true, 1);
insert into promo_codes (code, percent, active, max_redemptions) values ('ONLYTWO', 10, true, 2);
insert into promo_codes (code, percent, active, max_redemptions, max_per_customer)
values ('BOTHCAPS', 10, true, 3, 1);

-- A referral reward: issued to Asha, and worthless to anyone else who learns
-- the code. Nothing writes issued_to yet — rewards are still handed out into
-- the browser store — so this is set by hand to exercise the rule.
insert into promo_codes (code, percent, active, issued_to)
values ('ASHASREWARD', 10, true, '11111111-1111-1111-1111-111111111111');

-- ---------------------------------------------------------------------------
-- Builders
-- ---------------------------------------------------------------------------

-- One correctly-taxed line of the kurta, so a test about caps does not have to
-- hand-compute GST and accidentally test that instead.
create or replace function pline(p_qty integer)
returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'slug', 'promo-kurta', 'size', 'S', 'color', 'Rose',
    'qty', p_qty, 'price', 199900, 'hsn_code', '6106', 'tax_rate', 5,
    'taxable_value', round((p_qty * 199900 * 100) / 105.0),
    'tax_amount', p_qty * 199900 - round((p_qty * 199900 * 100) / 105.0)
  ));
$$;

-- Places one kurta with a promo code, priced correctly for a 10% discount.
-- ₹1,999 less 10% is ₹1,799.10 → 179910 paise.
create or replace function buy(p_promo text, p_total integer default 179910)
returns text language sql as $$
  select format(
    $sql$select place_retail_order(
      %L::jsonb,
      '{"line1":"1 Test Lane","city":"Hyderabad","state":"Telangana","pincode":"500001"}'::jsonb,
      'Buyer', 'buyer@example.com', '9999999999',
      'upi'::payment_method, %L,
      199900, 19990, 0, %s, %s, 0, %s,
      '36', '36EBQPS5960G1ZX', %L
    )$sql$,
    pline(1), p_promo,
    (select (sum((v ->> 'tax_amount')::integer) / 2)::text from jsonb_array_elements(pline(1)) as t(v)),
    (select (sum((v ->> 'tax_amount')::integer)
             - sum((v ->> 'tax_amount')::integer) / 2)::text
       from jsonb_array_elements(pline(1)) as t(v)),
    p_total,
    'GV-' || substr(md5(random()::text), 1, 10)
  );
$$;

/** How many redemptions stand against a code, read as the owner. */
create or replace function redeemed(p_code text)
returns integer language sql as $$
  select count(*)::integer from promo_redemptions where code = p_code;
$$;

-- ---------------------------------------------------------------------------
-- An uncapped code stays uncapped
-- ---------------------------------------------------------------------------

-- The behaviour every existing campaign has, and the one a migration must not
-- quietly change. Capping codes that were created without a cap would be a
-- worse surprise than leaving them alone.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111', buy('UNCAPPED')) is null,
  'promo: an uncapped code is accepted');

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111', buy('UNCAPPED')) is null,
  'promo: and again, by the same customer');

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111', buy('UNCAPPED')) is null,
  'promo: and a third time');

select assert(redeemed('UNCAPPED') = 3, 'promo: all three redemptions are on the ledger');

-- ---------------------------------------------------------------------------
-- One per customer
-- ---------------------------------------------------------------------------

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111', buy('ONCEEACH')) is null,
  'promo: a one-per-customer code works once');

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111', buy('ONCEEACH'))
    like '%already been used by this account%',
  'promo: and is refused the second time');

select assert(
  redeemed('ONCEEACH') = 1,
  'promo: the refused order left no redemption behind');

-- The point of the whole exercise. In the browser store this count lived in
-- the localStorage of the person being counted, so a second browser — or the
-- Clear Site Data button — reset it. Here it does not.
select assert(
  as_user_error('22222222-2222-2222-2222-222222222222', buy('ONCEEACH')) is null,
  'promo: a different customer still gets their own use of it');

select assert(redeemed('ONCEEACH') = 2, 'promo: which is counted separately');

-- ---------------------------------------------------------------------------
-- A total cap, spent by different people
-- ---------------------------------------------------------------------------

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111', buy('ONLYTWO')) is null,
  'promo: the first of two goes through');

select assert(
  as_user_error('22222222-2222-2222-2222-222222222222', buy('ONLYTWO')) is null,
  'promo: and the second');

select assert(
  as_user_error('33333333-3333-3333-3333-333333333333', buy('ONLYTWO'))
    like '%fully claimed%',
  'promo: the third is refused as fully claimed');

select assert(redeemed('ONLYTWO') = 2, 'promo: and the cap held at two');

-- A total cap with no per-customer limit is the gap the app already knew
-- about: "a cap of 500 total does nothing if one person can use all 500".
-- BOTHCAPS carries both, so one customer can take exactly one of its three.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111', buy('BOTHCAPS')) is null,
  'promo: a code with both caps allows one per person');

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111', buy('BOTHCAPS'))
    like '%already been used by this account%',
  'promo: and stops that person taking a second of the three');

select assert(redeemed('BOTHCAPS') = 1, 'promo: so two of the three are still available');

-- ---------------------------------------------------------------------------
-- A reward belongs to one person
-- ---------------------------------------------------------------------------

select assert(
  as_user_error('22222222-2222-2222-2222-222222222222', buy('ASHASREWARD'))
    like '%issued to another account%',
  'promo: knowing a referral reward code is not enough to use it');

select assert(
  redeemed('ASHASREWARD') = 0,
  'promo: and the attempt consumed nothing');

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111', buy('ASHASREWARD')) is null,
  'promo: the account it was issued to can use it');

-- ---------------------------------------------------------------------------
-- A refused order consumes nothing
-- ---------------------------------------------------------------------------

-- The order fails on its arithmetic, after the promo has been checked and
-- locked. If the redemption were written before the totals were verified, or
-- committed independently of them, this would burn a one-per-customer code on
-- an order that never existed.
insert into promo_codes (code, percent, active, max_per_customer)
values ('FRAGILE', 10, true, 1);

select assert(
  as_user_error('33333333-3333-3333-3333-333333333333', buy('FRAGILE', 1))
    like '%total mismatch%',
  'promo: an order with a wrong total is refused');

select assert(
  redeemed('FRAGILE') = 0,
  'promo: and left no redemption, so the code is still the customer''s to use');

select assert(
  as_user_error('33333333-3333-3333-3333-333333333333', buy('FRAGILE')) is null,
  'promo: proven by spending it afterwards');

-- ---------------------------------------------------------------------------
-- Cancelling gives the code back
-- ---------------------------------------------------------------------------

-- Abandoning a checkout must not spend a one-per-customer code. The promo
-- store already redeems at order time rather than at "Apply" for this reason;
-- release_retail_order carries the same argument through to the other end.
insert into promo_codes (code, percent, active, max_per_customer)
values ('GIVEBACK', 10, true, 1);

select as_user_scalar('22222222-2222-2222-2222-222222222222', buy('GIVEBACK'));

select assert(redeemed('GIVEBACK') = 1, 'promo: placing the order took the redemption');

select assert(
  as_user_scalar('22222222-2222-2222-2222-222222222222', format(
    $$select release_retail_order(%L::uuid)$$,
    (select id from retail_orders where promo_code = 'GIVEBACK' order by created_at desc limit 1)
  )) = 'true',
  'promo: the customer cancels it');

select assert(redeemed('GIVEBACK') = 0, 'promo: which gave the redemption back');

select assert(
  as_user_error('22222222-2222-2222-2222-222222222222', buy('GIVEBACK')) is null,
  'promo: so the code can be used again, rather than burnt by an abandoned order');

-- ---------------------------------------------------------------------------
-- The ledger is not writable by the people it counts
-- ---------------------------------------------------------------------------

-- Named rather than merely "denied": is_denied() cannot tell a revoked grant
-- from a policy that rejected the row, and only the grant makes these
-- impossible for staff-shaped callers too. A customer who can delete their own
-- redemption has a one-per-customer code with no limit at all, which is the
-- entire attack this migration exists to stop.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    $$delete from promo_redemptions$$)
    like '%permission denied for table promo_redemptions%',
  'promo: a customer cannot delete their own redemptions');

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111', format(
    $$insert into promo_redemptions (code, user_id, order_id)
      values ('ONLYTWO', %L, %L)$$,
    '22222222-2222-2222-2222-222222222222',
    (select id from retail_orders limit 1)))
    like '%permission denied for table promo_redemptions%',
  'promo: nor insert one against somebody else to exhaust a campaign');

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    $$update promo_redemptions set code = 'UNCAPPED'$$)
    like '%permission denied for table promo_redemptions%',
  'promo: nor move a redemption off the code it was spent on');

select assert(
  visible_count('11111111-1111-1111-1111-111111111111',
    $$select count(*)::int from promo_redemptions
       where user_id = '22222222-2222-2222-2222-222222222222'$$) = 0,
  'promo: and cannot read another customer''s redemption history');

select assert(
  visible_count('22222222-2222-2222-2222-222222222222',
    $$select count(*)::int from promo_redemptions$$) > 0,
  'promo: while seeing their own');

select assert(
  anon_denied($$select count(*) from promo_redemptions$$),
  'promo: a signed-out visitor cannot read the ledger at all');

-- ---------------------------------------------------------------------------
-- One redemption per order
-- ---------------------------------------------------------------------------

select assert(
  violates_constraint(format(
    $$insert into promo_redemptions (code, user_id, order_id)
      values ('UNCAPPED', %L, %L)$$,
    '11111111-1111-1111-1111-111111111111',
    (select order_id from promo_redemptions limit 1))),
  'promo: an order cannot carry two redemptions, even written by the owner');

-- ---------------------------------------------------------------------------
-- The lock the cap rests on
-- ---------------------------------------------------------------------------

-- A structural check, and stated as one because it is weaker than everything
-- above it.
--
-- Every cap in this file is read-then-write: count the redemptions, decide,
-- insert. That is only sound if no other transaction can slip between the two,
-- and what stops it is `for update` on the promo row. Take the lock away and
-- every assertion above still passes — they run one after another in a single
-- session, and a race needs two. The failure it guards against is precisely
-- the one this file cannot reach.
--
-- So this asserts the lock is still written, rather than that it works. It
-- cannot tell a correct lock from a mistyped one, and it would not notice the
-- clause moving somewhere useless. What it does do is fail loudly when someone
-- tidies it away — which, for a clause whose absence is invisible in testing,
-- is the failure worth catching. The stock decrement above it has the same
-- shape and the same untested gap.
select assert(
  (select count(*)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'place_retail_order'
      and p.prosrc ~ '(?s)from promo_codes.{0,200}?for update') = 1,
  'promo: the code row is still locked before its redemptions are counted');

-- ---------------------------------------------------------------------------
-- evaluate_promo — the same answers, before the customer commits to paying
-- ---------------------------------------------------------------------------

insert into promo_codes (code, percent, active) values ('DEACTIVATED', 10, false);
insert into promo_codes (code, percent, active, expires_on)
values ('LASTYEAR', 10, true, current_date - 1);
insert into promo_codes (code, percent, active, starts_on)
values ('NEXTYEAR', 10, true, current_date + 30);

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select evaluate_promo('UNCAPPED') ->> 'ok'$$) = 'true',
  'evaluate: a live code is ok');

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select evaluate_promo('UNCAPPED') ->> 'percent'$$) = '10',
  'evaluate: and reports what it is worth');

-- Case and whitespace are what a customer actually types, off a flyer or a
-- forwarded message.
select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select evaluate_promo('  uncapped ') ->> 'ok'$$) = 'true',
  'evaluate: typed in lower case with spaces, it is still the same code');

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select evaluate_promo('NOSUCHCODE') ->> 'reason'$$) = 'unknown',
  'evaluate: an invented code is unknown');

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select evaluate_promo('') ->> 'reason'$$) = 'unknown',
  'evaluate: so is an empty one');

-- The four distinct rejections are the point. `promoPercentFromStore` returned
-- 0 for all of them and checkout said "Invalid or expired promo code" to
-- everything, which is why src/lib/promo-eligibility.ts exists at all — and a
-- server that collapses them again undoes that.
select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select evaluate_promo('DEACTIVATED') ->> 'reason'$$) = 'inactive',
  'evaluate: a deactivated code says so, rather than reading as unknown');

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select evaluate_promo('LASTYEAR') ->> 'reason'$$) = 'expired',
  'evaluate: an expired code says expired');

-- Deliberately `expired` rather than a reason of its own: "not yet valid"
-- confirms to anyone guessing that a campaign is coming.
select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select evaluate_promo('NEXTYEAR') ->> 'reason'$$) = 'expired',
  'evaluate: a code whose window has not opened does not announce itself');

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select evaluate_promo('ONCEEACH') ->> 'reason'$$) = 'already_used',
  'evaluate: a code this customer has spent reads as already_used');

select assert(
  as_user_scalar('33333333-3333-3333-3333-333333333333',
    $$select evaluate_promo('ONCEEACH') ->> 'ok'$$) = 'true',
  'evaluate: while a customer who has not spent it is told they may');

select assert(
  as_user_scalar('33333333-3333-3333-3333-333333333333',
    $$select evaluate_promo('ONLYTWO') ->> 'reason'$$) = 'exhausted',
  'evaluate: a fully-claimed code reads as exhausted, not as already_used');

select assert(
  as_user_scalar('22222222-2222-2222-2222-222222222222',
    $$select evaluate_promo('ASHASREWARD') ->> 'reason'$$) = 'not_yours',
  'evaluate: somebody else''s reward reads as not_yours');

select assert(
  anon_denied($$select evaluate_promo('UNCAPPED')$$),
  'evaluate: a signed-out visitor cannot call it');

rollback;
