-- ---------------------------------------------------------------------------
-- Raising a return versus deciding one.
--
-- 0007 drew this line carefully and its comment says so: "Customers raise
-- returns but never decide them: `status` is left at its default and every
-- transition afterwards is staff-only." The insert policy enforces it in a way
-- worth testing directly, because it is unusual — the WITH CHECK pins
-- `status = 'requested'` rather than merely checking ownership.
--
-- None of it was load-bearing until now. The customer's form and the admin
-- queue both used a zustand store, so no template id, status or refund figure
-- ever reached these tables.
--
-- The failure this guards against is a customer approving their own return and
-- refunding themselves.
-- ---------------------------------------------------------------------------

begin;

insert into auth.users (id, email) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'returns-staff@garmentvibes.com'),
  ('a1a1a1a1-0000-0000-0000-000000000002', 'shopper@example.com'),
  ('a1a1a1a1-0000-0000-0000-000000000003', 'stranger@example.com')
on conflict (id) do nothing;

insert into profiles (id, role, full_name, email) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'admin', 'Returns Staff', 'returns-staff@garmentvibes.com'),
  ('a1a1a1a1-0000-0000-0000-000000000002', 'retail', 'Shopper', 'shopper@example.com'),
  ('a1a1a1a1-0000-0000-0000-000000000003', 'retail', 'Stranger', 'stranger@example.com')
on conflict (id) do update set role = excluded.role;

insert into retail_orders (
  id, user_id, status, total, shipping_address, reference,
  customer_name, customer_email, phone, payment_method
) values (
  'a1a1a1a1-0000-0000-0000-00000000000a', 'a1a1a1a1-0000-0000-0000-000000000002',
  'delivered', 259800, '{"city":"Hyderabad"}'::jsonb, 'GV-7001',
  'Shopper', 'shopper@example.com', '+919876543210', 'upi'
) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Raising
-- ---------------------------------------------------------------------------

select assert(
  as_user_scalar('a1a1a1a1-0000-0000-0000-000000000002', $$
    with raised as (
      insert into return_requests (
        reference, order_id, customer_name, customer_email, phone,
        resolution, reason, refund_amount
      ) values (
        'RET-7001-A', 'a1a1a1a1-0000-0000-0000-00000000000a',
        'Shopper', 'shopper@example.com', '+919876543210',
        'refund', 'size_or_fit', 259800
      ) returning 1
    ) select count(*) from raised
  $$) = '1',
  'returns: a customer can raise a return on their own order');

-- The unusual half of the policy, and the reason it is written that way.
select assert(
  is_denied('a1a1a1a1-0000-0000-0000-000000000002', $$
    insert into return_requests (
      reference, order_id, customer_name, customer_email, phone,
      resolution, reason, refund_amount, status
    ) values (
      'RET-7001-B', 'a1a1a1a1-0000-0000-0000-00000000000a',
      'Shopper', 'shopper@example.com', '+919876543210',
      'refund', 'size_or_fit', 259800, 'approved'
    )
  $$),
  'returns: but cannot raise one that is already approved');

-- Somebody else's order is not theirs to return.
select assert(
  is_denied('a1a1a1a1-0000-0000-0000-000000000003', $$
    insert into return_requests (
      reference, order_id, customer_name, customer_email, phone,
      resolution, reason, refund_amount
    ) values (
      'RET-7001-C', 'a1a1a1a1-0000-0000-0000-00000000000a',
      'Stranger', 'stranger@example.com', '+919000000000',
      'refund', 'size_or_fit', 259800
    )
  $$),
  'returns: and cannot raise one against an order they do not own');

-- ---------------------------------------------------------------------------
-- Deciding
-- ---------------------------------------------------------------------------

-- The one that matters most. Raising is allowed; approving is not, and the
-- update has no policy for a customer at all — so it changes nothing rather
-- than raising, which is why this asserts the row afterwards.
select assert(
  as_user_scalar('a1a1a1a1-0000-0000-0000-000000000002', $$
    with moved as (
      update return_requests set status = 'approved'
       where reference = 'RET-7001-A' returning 1
    ) select count(*) from moved
  $$) = '0',
  'returns: a customer cannot approve their own return');

select assert(
  (select status from return_requests where reference = 'RET-7001-A') = 'requested',
  'returns: and it is still waiting on us');

-- Nor can they walk it straight to refunded.
select assert(
  as_user_scalar('a1a1a1a1-0000-0000-0000-000000000002', $$
    with moved as (
      update return_requests set status = 'refunded'
       where reference = 'RET-7001-A' returning 1
    ) select count(*) from moved
  $$) = '0',
  'returns: nor mark it refunded');

select assert(
  as_user_scalar('a1a1a1a1-0000-0000-0000-000000000001', $$
    with moved as (
      update return_requests set status = 'approved',
             decision_note = 'Approved — free pickup will be arranged.'
       where reference = 'RET-7001-A' returning 1
    ) select count(*) from moved
  $$) = '1',
  'returns: staff can approve it');

select assert(
  (select decision_note from return_requests where reference = 'RET-7001-A')
    = 'Approved — free pickup will be arranged.',
  'returns: with a note the customer can be given a reason from');

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

select assert(
  visible_count('a1a1a1a1-0000-0000-0000-000000000002',
    $$select count(*) from return_requests where reference = 'RET-7001-A'$$) = 1,
  'returns: a customer sees their own return');

select assert(
  visible_count('a1a1a1a1-0000-0000-0000-000000000003',
    $$select count(*) from return_requests where reference = 'RET-7001-A'$$) = 0,
  'returns: and nobody else''s');

select assert(
  visible_count('a1a1a1a1-0000-0000-0000-000000000001',
    $$select count(*) from return_requests where reference = 'RET-7001-A'$$) = 1,
  'returns: staff see every return, because they have to action them');

-- ---------------------------------------------------------------------------
-- The statuses the app can set
-- ---------------------------------------------------------------------------

-- RETURN_STATUSES is derived from RETURN_STATUS_LABELS in the app, and a
-- status offered there but missing from the enum would raise at whoever
-- pressed the button.
select assert(
  (select count(*) from unnest(enum_range(null::return_status)) as v
    where v::text in ('requested','approved','rejected','picked_up',
                      'refunded','exchange_shipped')) = 6,
  'returns: every status the panel offers exists in the enum');

rollback;
