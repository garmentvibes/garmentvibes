-- ---------------------------------------------------------------------------
-- Back-in-stock alerts.
--
-- Three things under test, and the third is the one this file exists for.
--
--   1. That registering does what it says — normalises the address, refuses
--      nonsense, and reports "already waiting" rather than failing.
--   2. That claiming fires exactly once per registration per restock.
--   3. That a caller cannot register on somebody else's behalf.
--
-- (3) is what 0029 changed. Before it, `anon` held INSERT under a policy whose
-- check was `true`, so a signed-out request could name any email AND any
-- `user_id` — filing a registration the named account never made, in a list
-- that account can read. The address still comes from the caller, because
-- registering without an account is the feature; `user_id` now comes from the
-- session, and the assertions below are what hold that apart.
-- ---------------------------------------------------------------------------

begin;

truncate retail_products cascade;
truncate stock_alerts cascade;

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
  ('aaaa1111-0000-0000-0000-000000000001', 'alert-kurta', 'Alert Kurta', 'Brand',
   'women', 'Kurtas', 199900, 249900),
  ('aaaa1111-0000-0000-0000-000000000002', 'alert-tee', 'Alert Tee', 'Brand',
   'women', 'T-Shirts', 79900, 99900);

-- Withdrawn from the start.
insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp, is_active)
values ('aaaa1111-0000-0000-0000-000000000003', 'alert-retired', 'Retired', 'Brand',
        'women', 'Dresses', 149900, 199900, false);

-- Withdrawn later, once a registration is already pending against it.
insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp)
values ('aaaa1111-0000-0000-0000-000000000004', 'alert-doomed', 'Doomed', 'Brand',
        'women', 'Dresses', 129900, 159900);

-- Everything starts sold out, which is the state a registration is made from.
insert into retail_product_sizes (product_id, label, stock_qty) values
  ('aaaa1111-0000-0000-0000-000000000001', 'M', 0),
  ('aaaa1111-0000-0000-0000-000000000001', 'L', 0),
  ('aaaa1111-0000-0000-0000-000000000002', 'M', 0),
  ('aaaa1111-0000-0000-0000-000000000003', 'M', 0),
  ('aaaa1111-0000-0000-0000-000000000004', 'M', 0);

/** How many registrations are still waiting on a variant. */
create or replace function pending(p_slug text, p_size text)
returns integer language sql as $$
  select count(*)::integer
    from stock_alerts a join retail_products p on p.id = a.product_id
   where p.slug = p_slug and a.size_label = p_size and a.notified_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Registering
-- ---------------------------------------------------------------------------

select assert(
  anon_scalar($$select stock_alert_subscribe('alert-kurta', 'M', '  Asha@Example.COM ', 'Asha')$$)
    = 'true',
  'alerts: a signed-out visitor can register interest');

-- Stored folded and trimmed, because the unique index keys on lower(email) and
-- an address differing only in case is the same inbox.
select assert(
  (select email from stock_alerts where name = 'Asha') = 'asha@example.com',
  'alerts: and the address is stored folded and trimmed');

select assert(
  (select user_id from stock_alerts where name = 'Asha') is null,
  'alerts: with no account attached, because there was no session');

-- The dedupe. Registering twice must not queue two emails later, which is
-- what 0005's partial unique index is for.
select assert(
  anon_scalar($$select stock_alert_subscribe('alert-kurta', 'M', 'ASHA@example.com', 'Asha')$$)
    = 'false',
  'alerts: registering the same address again reports nothing was written');

select assert(
  pending('alert-kurta', 'M') = 1,
  'alerts: and leaves one registration, not two');

-- The hole 0029 closes. `user_id` is not a parameter, so it cannot be chosen;
-- it is read from the session. Signed in, that means the row is attached to
-- the caller — and only ever to the caller.
select assert(
  as_user_scalar('22222222-2222-2222-2222-222222222222',
    $$select stock_alert_subscribe('alert-kurta', 'L', 'bhavna@example.com', 'Bhavna')$$)
    = 'true',
  'alerts: a signed-in customer can register too');

select assert(
  (select user_id from stock_alerts where email = 'bhavna@example.com')
    = '22222222-2222-2222-2222-222222222222',
  'alerts: and the row is attached to her account, from the session');

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111',
    $$select stock_alert_subscribe('alert-kurta', 'M', 'not-an-address', 'Asha')$$)
    like '%valid email%',
  'alerts: an address that is not one is refused with a sentence');

select assert(
  anon_error($$select stock_alert_subscribe('alert-kurta', 'M', '', 'Asha')$$)
    like '%valid email%',
  'alerts: and so is an empty one');

-- No restock is coming for something we have stopped selling, so the
-- registration would wait for ever.
select assert(
  anon_error($$select stock_alert_subscribe('alert-retired', 'M', 'x@example.com', 'X')$$)
    like '%No such product%',
  'alerts: a withdrawn product takes no registrations');

select assert(
  anon_error($$select stock_alert_subscribe('no-such-slug', 'M', 'x@example.com', 'X')$$)
    like '%No such product%',
  'alerts: nor does a slug that names nothing');

-- Nothing else would catch this: stock_alerts stores the label as text with no
-- foreign key, so the registration would wait on a size that does not exist.
select assert(
  anon_error($$select stock_alert_subscribe('alert-kurta', 'XXL', 'x@example.com', 'X')$$)
    like '%not available%',
  'alerts: nor a size the product is not sold in');

select assert(
  anon_scalar($$select stock_alert_subscribe('alert-tee', 'M', 'solo@example.com', '   ')$$)
    = 'true',
  'alerts: a registration with no name is accepted');

select assert(
  (select name from stock_alerts where email = 'solo@example.com') = 'solo',
  'alerts: and addressed by the local part rather than by nothing');

-- ---------------------------------------------------------------------------
-- Claiming
-- ---------------------------------------------------------------------------

select assert(
  (select count(*) from claim_stock_alerts(100)) = 0,
  'alerts: nothing is claimed while every variant is still sold out');

-- The point of claiming by query rather than by call site: this is a plain
-- UPDATE, not adjust_retail_stock, and it still fires.
update retail_product_sizes set stock_qty = 4
 where product_id = 'aaaa1111-0000-0000-0000-000000000001' and label = 'M';

select assert(
  (select count(*) from claim_stock_alerts(100)) = 1,
  'alerts: a restock by any route makes the registration claimable');

select assert(
  pending('alert-kurta', 'M') = 0,
  'alerts: and the claim stamps it, so it leaves the pending set');

-- The property that makes it safe to run after every stock write and again on
-- a schedule.
select assert(
  (select count(*) from claim_stock_alerts(100)) = 0,
  'alerts: a second pass finds nothing, so nobody is emailed twice');

-- Restocking again does not re-fire a registration already spent. Hearing
-- about one restock is what was asked for; hearing about every future one is
-- not.
update retail_product_sizes set stock_qty = 9
 where product_id = 'aaaa1111-0000-0000-0000-000000000001' and label = 'M';

select assert(
  (select count(*) from claim_stock_alerts(100)) = 0,
  'alerts: and a later restock does not fire a registration that already went');

-- Registering again after being told once must work — that is what the
-- partial index is for, and it is the difference between a feature and a
-- one-shot.
select assert(
  anon_scalar($$select stock_alert_subscribe('alert-kurta', 'M', 'asha@example.com', 'Asha')$$)
    = 'true',
  'alerts: but the same person may register again for the next one');


-- A product withdrawn while a registration is pending must not fire: the email
-- would land somebody on a page that no longer exists.
select assert(
  anon_scalar($$select stock_alert_subscribe('alert-doomed', 'M', 'hope@example.com', 'Hope')$$)
    = 'true',
  'alerts: a registration is taken while the product is still for sale');

update retail_product_sizes set stock_qty = 3
 where product_id = 'aaaa1111-0000-0000-0000-000000000004' and label = 'M';
update retail_products set is_active = false where slug = 'alert-doomed';

select assert(
  (select count(*) from claim_stock_alerts(100)) = 1,
  'alerts: a restock claims the live registration');

select assert(
  pending('alert-doomed', 'M') = 1,
  'alerts: while the one on the withdrawn product stays pending rather than firing');

-- ---------------------------------------------------------------------------
-- The other route stock takes
-- ---------------------------------------------------------------------------
--
-- The one above was a plain UPDATE, standing for an admin setting a level.
-- This is `adjust_retail_stock` from 0023, which is what a return coming back
-- onto the shelf goes through — a different statement, in a different
-- function, called by different code.
--
-- Both are asserted because the claim's whole justification is that it does
-- not care: it asks which registrations name a variant that has stock, and
-- that question has one answer however the stock arrived. A test covering only
-- one route would pass just as well against a claim wired to that route.

insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'staff@garmentvibes.com')
on conflict (id) do nothing;

insert into profiles (id, role, full_name, email) values
  ('44444444-4444-4444-4444-444444444444', 'admin', 'Staff', 'staff@garmentvibes.com')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

select assert(
  anon_scalar($$select stock_alert_subscribe('alert-tee', 'M', 'returns@example.com', 'Ret')$$)
    = 'true',
  'alerts: somebody registers for a size that is sold out');

select assert(
  as_user_scalar('44444444-4444-4444-4444-444444444444',
    $$select adjust_retail_stock('alert-tee', 'M', 2)$$) = '2',
  'alerts: and a return puts two units back through adjust_retail_stock');

select assert(
  (select count(*) from claim_stock_alerts(100)
    where email = 'returns@example.com') = 1,
  'alerts: which the claim finds, without knowing that route exists');

-- The limit is what keeps one pass inside a serverless wall clock.
truncate stock_alerts;

insert into stock_alerts (product_id, size_label, email, name, created_at)
select 'aaaa1111-0000-0000-0000-000000000001', 'M',
       'bulk' || i || '@example.com', 'Bulk ' || i,
       now() - (100 - i) * interval '1 minute'
  from generate_series(1, 5) i;

select assert(
  (select count(*) from claim_stock_alerts(2)) = 2,
  'alerts: a pass claims no more than it was asked for');

-- Oldest first, so somebody who has waited a month hears before somebody who
-- registered this morning.
select assert(
  (select count(*) from stock_alerts
    where notified_at is not null and email in ('bulk1@example.com', 'bulk2@example.com')) = 2,
  'alerts: and takes the oldest registrations first');

select assert(
  (select count(*) from claim_stock_alerts(100)) = 3,
  'alerts: the rest are still there for the next pass');

-- ---------------------------------------------------------------------------
-- The function is the only door
-- ---------------------------------------------------------------------------
--
-- 0029 revokes INSERT so `user_id` cannot be chosen and a withdrawn product
-- cannot be registered against, and UPDATE so nothing but the claim can move
-- `notified_at`.

select assert(
  anon_denied($$
    insert into stock_alerts (product_id, size_label, email, name, user_id)
    values ('aaaa1111-0000-0000-0000-000000000001', 'M', 'forged@example.com',
            'Forged', '11111111-1111-1111-1111-111111111111')
  $$),
  'alerts: a signed-out request cannot insert a row naming somebody''s account');

select assert(
  is_denied('22222222-2222-2222-2222-222222222222', $$
    insert into stock_alerts (product_id, size_label, email, name, user_id)
    values ('aaaa1111-0000-0000-0000-000000000001', 'M', 'forged@example.com',
            'Forged', '11111111-1111-1111-1111-111111111111')
  $$),
  'alerts: nor can a signed-in customer file one under another account');

select assert(
  is_denied('11111111-1111-1111-1111-111111111111',
    $$update stock_alerts set notified_at = now()$$),
  'alerts: and nobody may stamp a registration by hand');

-- Claiming takes a registration off the queue, and a mistake there is a
-- customer who is never told. No session should be able to do it — not even a
-- staff one, as 0020 decided for the outbox.
select assert(
  as_user_error('11111111-1111-1111-1111-111111111111', $$select claim_stock_alerts(1)$$)
    like '%permission denied for function claim_stock_alerts%',
  'alerts: a customer cannot claim registrations');

select assert(
  anon_error($$select claim_stock_alerts(1)$$)
    like '%permission denied for function claim_stock_alerts%',
  'alerts: nor can a signed-out visitor');

-- ---------------------------------------------------------------------------
-- Who can read a registration
-- ---------------------------------------------------------------------------

truncate stock_alerts;

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    $$select stock_alert_subscribe('alert-kurta', 'M', 'asha@example.com', 'Asha')$$) = 'true',
  'alerts: one customer registers');

select assert(
  as_user_scalar('22222222-2222-2222-2222-222222222222',
    $$select stock_alert_subscribe('alert-kurta', 'L', 'bhavna@example.com', 'Bhavna')$$) = 'true',
  'alerts: and so does another');

select assert(
  visible_count('11111111-1111-1111-1111-111111111111',
    $$select count(*) from stock_alerts$$) = 1,
  'alerts: each reads only her own');

select assert(
  visible_count('22222222-2222-2222-2222-222222222222',
    $$select count(*) from stock_alerts$$) = 1,
  'alerts: and only her own');

-- A signed-out registration belongs to nobody, so nobody can read it back.
-- That is the cost of not requiring an account, and it is the right trade:
-- the alternative is letting an unauthenticated caller read rows by address.
select assert(
  anon_denied($$select count(*) from stock_alerts$$),
  'alerts: a signed-out visitor reads none of them');

rollback;
