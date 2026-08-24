-- ---------------------------------------------------------------------------
-- release_retail_order() and mark_retail_order_paid()
--
-- These are the two ends of the flow the checkout now uses: place as pending,
-- take the money, confirm — or release the stock if the money never comes.
--
-- The failure that matters most here is not a rejection, it is a *silent
-- double*. Releasing an order twice puts the stock back twice and invents
-- inventory; confirming a retried webhook twice is harmless only if the second
-- call genuinely changes nothing. Both are asserted by counting stock before
-- and after, rather than by trusting the return value.
-- ---------------------------------------------------------------------------

begin;

truncate retail_products, promo_codes cascade;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'asha@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bhavna@example.com');

insert into profiles (id, role, full_name, email) values
  ('11111111-1111-1111-1111-111111111111', 'retail', 'Asha', 'asha@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'retail', 'Bhavna', 'bhavna@example.com')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, email = excluded.email;

insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp)
values ('cccccccc-0000-0000-0000-000000000001', 'test-kurta', 'Test Kurta', 'Brand',
        'women', 'Kurtas', 199900, 249900);

insert into retail_product_sizes (product_id, label, stock_qty) values
  ('cccccccc-0000-0000-0000-000000000001', 'S', 10);

-- One pending online order for Asha: 2 x ₹1,999, tax 5% inclusive.
create or replace function place_pending(p_reference text, p_qty integer default 2)
returns text language sql as $$
  select as_user_error('11111111-1111-1111-1111-111111111111', format($sql$
    select place_retail_order(
      %L::jsonb,
      '{"city":"Hyderabad","state":"Telangana","pincode":"500001"}'::jsonb,
      'Asha', 'asha@example.com', '9999999999',
      'upi'::payment_method, null,
      %s, 0, 0, %s, %s, 0, %s,
      '36', '36EBQPS5960G1ZX', %L
    )$sql$,
    jsonb_build_array(jsonb_build_object(
      'slug', 'test-kurta', 'size', 'S', 'color', 'Rose',
      'qty', p_qty, 'price', 199900, 'hsn_code', '6106', 'tax_rate', 5,
      -- Cast at every step. round() returns numeric, and a jsonb value of
      -- 380762.0 fails ::integer on the other side — which surfaces as
      -- "the order was not placed" with no clue that the fixture is at fault.
      'taxable_value', round((p_qty * 199900 * 100) / 105.0)::integer,
      'tax_amount', (p_qty * 199900 - round((p_qty * 199900 * 100) / 105.0))::integer
    )),
    p_qty * 199900,
    ((p_qty * 199900 - round((p_qty * 199900 * 100) / 105.0))::integer / 2),
    ((p_qty * 199900 - round((p_qty * 199900 * 100) / 105.0))::integer)
      - ((p_qty * 199900 - round((p_qty * 199900 * 100) / 105.0))::integer / 2),
    p_qty * 199900,
    p_reference
  ));
$$;

select assert(place_pending('GV-REL-1') is null, 'lifecycle: a pending order is placed');

select assert(
  (select stock_qty from retail_product_sizes
    where product_id = 'cccccccc-0000-0000-0000-000000000001' and label = 'S') = 8,
  'lifecycle: placing it took the stock, as an unpaid order does'
);

-- ---------------------------------------------------------------------------
-- release_retail_order
-- ---------------------------------------------------------------------------

select assert(
  as_user_scalar('22222222-2222-2222-2222-222222222222', format(
    'select release_retail_order(%L)',
    (select id from retail_orders where reference = 'GV-REL-1'))) = 'false',
  'lifecycle: one customer cannot cancel another''s order'
);

select assert(
  (select stock_qty from retail_product_sizes
    where product_id = 'cccccccc-0000-0000-0000-000000000001' and label = 'S') = 8,
  'lifecycle: and that refusal moved no stock'
);

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111', format(
    'select release_retail_order(%L)',
    (select id from retail_orders where reference = 'GV-REL-1'))) = 'true',
  'lifecycle: the owner can cancel their own unpaid order'
);

select assert(
  (select stock_qty from retail_product_sizes
    where product_id = 'cccccccc-0000-0000-0000-000000000001' and label = 'S') = 10,
  'lifecycle: releasing put the stock back'
);

select assert(
  (select status from retail_orders where reference = 'GV-REL-1') = 'cancelled',
  'lifecycle: and the order reads as cancelled rather than lingering pending'
);

-- The double-release. Two tabs, a retry, a double-click: if the second call
-- also restores stock, the shop has invented two units it does not own.
select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111', format(
    'select release_retail_order(%L)',
    (select id from retail_orders where reference = 'GV-REL-1'))) = 'false',
  'lifecycle: releasing an already-cancelled order does nothing'
);

select assert(
  (select stock_qty from retail_product_sizes
    where product_id = 'cccccccc-0000-0000-0000-000000000001' and label = 'S') = 10,
  'lifecycle: so the stock was not restored twice'
);

select assert(
  as_user_scalar('11111111-1111-1111-1111-111111111111',
    'select release_retail_order(''cccccccc-9999-9999-9999-999999999999'')') = 'false',
  'lifecycle: releasing an order that does not exist is false, not an error'
);

-- ---------------------------------------------------------------------------
-- mark_retail_order_paid
-- ---------------------------------------------------------------------------

select assert(place_pending('GV-PAID-1') is null, 'lifecycle: a second order is placed to pay for');

-- Not something a customer may do at any price.
select assert(
  is_denied('11111111-1111-1111-1111-111111111111',
    'select mark_retail_order_paid(''GV-PAID-1'', ''pay_forged'', 399800)'),
  'lifecycle: a customer cannot mark their own order paid'
);

select assert(
  anon_denied('select mark_retail_order_paid(''GV-PAID-1'', ''pay_forged'', 399800)'),
  'lifecycle: nor can a signed-out visitor'
);

select assert(
  (select status from retail_orders where reference = 'GV-PAID-1') = 'pending',
  'lifecycle: after both refusals the order is still unpaid'
);

-- The amount is the load-bearing check. A real notification for a partial or
-- different payment must not confirm an order.
-- The amount is the load-bearing check here, so the assertion pins the reason
-- rather than settling for "it was refused": an amount check that fires for
-- the wrong reason passes its test and fails its job.
select assert(
  raises('select mark_retail_order_paid(''GV-PAID-1'', ''pay_1'', 100)')
    like '%but the order is for%',
  'lifecycle: a payment for the wrong amount does not confirm the order'
);

select assert(
  (select status from retail_orders where reference = 'GV-PAID-1') = 'pending',
  'lifecycle: and the underpaid order is still pending'
);

select assert(
  (select mark_retail_order_paid('GV-PAID-1', 'pay_ok', 399800))
    = (select id from retail_orders where reference = 'GV-PAID-1'),
  'lifecycle: a payment for the right amount confirms it'
);

select assert(
  (select status from retail_orders where reference = 'GV-PAID-1') = 'confirmed',
  'lifecycle: and the status moves to confirmed'
);

select assert(
  (select razorpay_payment_id from retail_orders where reference = 'GV-PAID-1') = 'pay_ok',
  'lifecycle: with the payment id recorded, so it can be reconciled'
);

-- Confirming does NOT move stock: placement already took it.
select assert(
  (select stock_qty from retail_product_sizes
    where product_id = 'cccccccc-0000-0000-0000-000000000001' and label = 'S') = 8,
  'lifecycle: confirming a payment does not take the stock a second time'
);

-- Razorpay sends payment.captured and order.paid for the same payment, and
-- retries anything it does not get a 2xx for. Every repeat has to be a no-op.
select assert(
  (select mark_retail_order_paid('GV-PAID-1', 'pay_ok', 399800))
    = (select id from retail_orders where reference = 'GV-PAID-1'),
  'lifecycle: the same notification arriving twice is accepted quietly'
);

select assert(
  (select stock_qty from retail_product_sizes
    where product_id = 'cccccccc-0000-0000-0000-000000000001' and label = 'S') = 8,
  'lifecycle: and the repeat changed nothing'
);

-- A DIFFERENT payment id against an already-confirmed order is not a retry.
-- It is two payments for one order, and it must be looked at by a person.
select assert(
  raises('select mark_retail_order_paid(''GV-PAID-1'', ''pay_second'', 399800)')
    like '%not pending%',
  'lifecycle: a second, different payment on a confirmed order is refused'
);

select assert(
  (select razorpay_payment_id from retail_orders where reference = 'GV-PAID-1') = 'pay_ok',
  'lifecycle: and it did not overwrite the payment already recorded'
);

-- A cancelled order is not payable. Releasing the stock and then confirming
-- would sell something already returned to the shelf.
select assert(
  raises('select mark_retail_order_paid(''GV-REL-1'', ''pay_late'', 399800)')
    like '%not pending%',
  'lifecycle: a released order cannot then be marked paid'
);

select assert(
  raises('select mark_retail_order_paid(''GV-NOSUCH'', ''pay_x'', 1)')
    like '%no order with reference%',
  'lifecycle: a receipt that matches no order is refused'
);

-- ---------------------------------------------------------------------------
-- Whole-file invariant
-- ---------------------------------------------------------------------------

-- Stock is opening less what live orders hold. Cancelled orders hold nothing.
select assert(
  (select stock_qty from retail_product_sizes
    where product_id = 'cccccccc-0000-0000-0000-000000000001' and label = 'S')
  = 10 - coalesce((
      select sum(i.qty)
        from retail_order_items i
        join retail_orders o on o.id = i.order_id
       where o.status <> 'cancelled'), 0),
  'lifecycle: stock equals opening less what the uncancelled orders hold'
);

drop function place_pending(text, integer);

rollback;
