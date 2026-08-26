-- ---------------------------------------------------------------------------
-- Fulfilment: who can see an order, and who can move it.
--
-- The admin panel used to render six fictional orders from
-- src/lib/mock/admin-data.ts with status changes kept in localStorage, so none
-- of this mattered — nothing staff pressed reached a row. Now the panel reads
-- `retail_orders` and writes status, shipment and the dates back to it, which
-- makes the policies from 0001 and 0004 load-bearing for the first time.
--
-- Two properties, and the second is the one with teeth:
--
--   * staff see every order, because they cannot fulfil what they cannot see;
--   * a customer sees only their own, and cannot MOVE any order at all —
--     including their own. An UPDATE policy for customers would let somebody
--     mark their own order delivered (starting the return clock early), or
--     un-cancel one, or edit the address after it shipped.
-- ---------------------------------------------------------------------------

begin;

insert into auth.users (id, email) values
  ('dddddddd-1111-1111-1111-111111111111', 'fulfil-staff@garmentvibes.com'),
  ('dddddddd-2222-2222-2222-222222222222', 'buyer-one@example.com'),
  ('dddddddd-3333-3333-3333-333333333333', 'buyer-two@example.com')
on conflict (id) do nothing;

insert into profiles (id, role, full_name, email) values
  ('dddddddd-1111-1111-1111-111111111111', 'admin', 'Fulfil Staff', 'fulfil-staff@garmentvibes.com'),
  ('dddddddd-2222-2222-2222-222222222222', 'retail', 'Buyer One', 'buyer-one@example.com'),
  ('dddddddd-3333-3333-3333-333333333333', 'retail', 'Buyer Two', 'buyer-two@example.com')
on conflict (id) do update set role = excluded.role;

insert into retail_orders (
  id, user_id, status, total, shipping_address, reference,
  customer_name, customer_email, phone, payment_method
) values
  ('dddddddd-0000-0000-0000-00000000000a', 'dddddddd-2222-2222-2222-222222222222',
   'confirmed', 129900, '{"city":"Hyderabad"}'::jsonb, 'GV-9001',
   'Buyer One', 'buyer-one@example.com', '+919876543210', 'upi'),
  ('dddddddd-0000-0000-0000-00000000000b', 'dddddddd-3333-3333-3333-333333333333',
   'confirmed', 99900, '{"city":"Chennai"}'::jsonb, 'GV-9002',
   'Buyer Two', 'buyer-two@example.com', '+919876500000', 'cod')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Seeing
-- ---------------------------------------------------------------------------

select assert(
  visible_count('dddddddd-1111-1111-1111-111111111111',
    $$select count(*) from retail_orders where reference in ('GV-9001','GV-9002')$$) = 2,
  'admin-orders: staff see every order, not just their own');

select assert(
  visible_count('dddddddd-2222-2222-2222-222222222222',
    $$select count(*) from retail_orders where reference in ('GV-9001','GV-9002')$$) = 1,
  'admin-orders: a customer sees only their own');

-- Refused outright rather than filtered to zero rows: `anon` holds no grant on
-- this table at all, so the read dies before RLS is consulted. Asserted as a
-- refusal rather than as `count = 0`, because a count would raise here — and a
-- test written that way would fail for the right reason by accident and stop
-- meaning anything the day a grant appeared.
select assert(
  anon_denied($$select count(*) from retail_orders$$),
  'admin-orders: a signed-out visitor cannot read orders at all');

-- ---------------------------------------------------------------------------
-- Moving
-- ---------------------------------------------------------------------------

select assert(
  as_user_scalar('dddddddd-1111-1111-1111-111111111111', $$
    with moved as (
      update retail_orders set status = 'shipped', shipped_at = current_date
       where reference = 'GV-9001' returning 1
    ) select count(*) from moved
  $$) = '1',
  'admin-orders: staff can ship an order');

select assert(
  (select status from retail_orders where reference = 'GV-9001') = 'shipped',
  'admin-orders: and the row carries the new status');

-- The one that matters. There is no customer UPDATE policy, so this changes
-- nothing rather than raising — RLS filters the rows an update can see, so an
-- unauthorised update is silently a no-op. That is why this asserts the row is
-- unchanged rather than that an error was raised: a test looking only for an
-- exception would pass just as happily if the update had succeeded.
select assert(
  as_user_scalar('dddddddd-3333-3333-3333-333333333333', $$
    with moved as (
      update retail_orders set status = 'delivered'
       where reference = 'GV-9002' returning 1
    ) select count(*) from moved
  $$) = '0',
  'admin-orders: a customer cannot move their own order');

select assert(
  (select status from retail_orders where reference = 'GV-9002') = 'confirmed',
  'admin-orders: and their own order is untouched');

-- Marking somebody else's order delivered would start their return clock.
select assert(
  as_user_scalar('dddddddd-2222-2222-2222-222222222222', $$
    with moved as (
      update retail_orders set status = 'delivered', delivered_at = current_date
       where reference = 'GV-9002' returning 1
    ) select count(*) from moved
  $$) = '0',
  'admin-orders: nor anybody else''s');

select assert(
  (select delivered_at from retail_orders where reference = 'GV-9002') is null,
  'admin-orders: and no delivery date was stamped on it');

-- ---------------------------------------------------------------------------
-- The statuses the app can set
-- ---------------------------------------------------------------------------

-- `packed` came from 0002, and the app's RETAIL_ORDER_STATUSES has always
-- included it. Setting a status the enum does not have raises at the admin
-- rather than saving, so the two lists have to agree.
select assert(
  (select count(*) from unnest(enum_range(null::order_status)) as v
    where v::text in ('pending','confirmed','packed','shipped','delivered','cancelled')) = 6,
  'admin-orders: every status the panel offers exists in the enum');

rollback;
