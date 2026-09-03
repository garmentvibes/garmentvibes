-- ---------------------------------------------------------------------------
-- Deleting an account.
--
-- Four things under test, and the fourth is the one that would be worst to get
-- wrong:
--
--   1. That what has no retention basis is actually gone.
--   2. That what the tax law requires is actually kept, and stops being
--      attributable to an account.
--   3. That the refusals refuse — staff, business accounts, orders in flight,
--      returns still open.
--   4. That erasing one account erases exactly one account.
--
-- (4) is why the fixtures below give two customers the same shape: the same
-- product wishlisted, an alert on the same variant, an order on the same day.
-- `erase_my_account` is SECURITY DEFINER, so RLS is not consulted while it
-- runs and every statement in it is scoped by `require_caller()` alone. A test
-- where the two customers had nothing in common would pass with that scoping
-- removed, because the DELETEs would have nothing of the other's to match.
-- ---------------------------------------------------------------------------

begin;

truncate retail_products cascade;
truncate stock_alerts cascade;
truncate notifications cascade;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'asha@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bhavna@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'chetan@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'staff@garmentvibes.com'),
  ('55555555-5555-5555-5555-555555555555', 'buyer@business.com'),
  ('66666666-6666-6666-6666-666666666666', 'divya@example.com')
on conflict (id) do nothing;

insert into profiles (id, role, full_name, email, phone) values
  ('11111111-1111-1111-1111-111111111111', 'retail', 'Asha', 'asha@example.com', '+919000000001'),
  ('22222222-2222-2222-2222-222222222222', 'retail', 'Bhavna', 'bhavna@example.com', '+919000000002'),
  ('33333333-3333-3333-3333-333333333333', 'retail', 'Chetan', 'chetan@example.com', '+919000000003'),
  ('44444444-4444-4444-4444-444444444444', 'admin', 'Staff', 'staff@garmentvibes.com', null),
  ('55555555-5555-5555-5555-555555555555', 'wholesale', 'Buyer', 'buyer@business.com', null),
  ('66666666-6666-6666-6666-666666666666', 'retail', 'Divya', 'divya@example.com', '+919000000006')
on conflict (id) do update
  set role = excluded.role, full_name = excluded.full_name, phone = excluded.phone;

insert into wholesale_accounts (id, business_name, contact_name, email, status)
values ('bbbb0000-0000-0000-0000-000000000001', 'Business Ltd', 'Buyer', 'buyer@business.com', 'approved');

update profiles set wholesale_account_id = 'bbbb0000-0000-0000-0000-000000000001'
 where id = '55555555-5555-5555-5555-555555555555';

insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp)
values ('cccc0000-0000-0000-0000-000000000001', 'erase-tee', 'Erase Tee', 'Brand',
        'women', 'T-Shirts', 79900, 99900);

insert into retail_product_sizes (product_id, label, stock_qty)
values ('cccc0000-0000-0000-0000-000000000001', 'M', 5);

/** A delivered order, which is the state that permits erasure. */
create or replace function place(p_id uuid, p_user uuid, p_ref text, p_status order_status)
returns void language sql as $$
  insert into retail_orders
    (id, user_id, status, total, currency, shipping_address, customer_name,
     customer_email, phone, reference, payment_method, subtotal, discount,
     tax_cgst, tax_sgst, tax_igst, cod_fee)
  select p_id, p_user, p_status, 79900, 'INR', '{"line1":"1 Road"}'::jsonb,
         pr.full_name, pr.email, pr.phone, p_ref, 'cod', 79900, 0, 0, 0, 0, 0
    from profiles pr where pr.id = p_user;
$$;

-- Both customers, in the same shape. See the note at the top.
select place('dddd0000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111',
             'GV-ASHA-1', 'delivered');
select place('dddd0000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222',
             'GV-BHAV-1', 'delivered');

insert into wishlists (user_id, product_id) values
  ('11111111-1111-1111-1111-111111111111', 'cccc0000-0000-0000-0000-000000000001'),
  ('22222222-2222-2222-2222-222222222222', 'cccc0000-0000-0000-0000-000000000001');

insert into cart_items (user_id, product_id, size_label, color, qty) values
  ('11111111-1111-1111-1111-111111111111', 'cccc0000-0000-0000-0000-000000000001', 'M', 'Rose', 1),
  ('22222222-2222-2222-2222-222222222222', 'cccc0000-0000-0000-0000-000000000001', 'M', 'Rose', 1);

insert into retail_addresses
  (user_id, label, full_name, phone, address_line1, city, state, pincode) values
  ('11111111-1111-1111-1111-111111111111', 'Home', 'Asha', '+919000000001',
   '1 Road', 'Hyderabad', 'Telangana', '500001'),
  ('22222222-2222-2222-2222-222222222222', 'Home', 'Bhavna', '+919000000002',
   '2 Road', 'Hyderabad', 'Telangana', '500001');

insert into reviews (product_id, user_id, author, rating, title, body) values
  ('cccc0000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Asha', 5, 'Good', 'Nice tee'),
  ('cccc0000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Bhavna', 4, 'Fine', 'Fits well');

-- One alert per customer WITH the account attached, and one for Asha with the
-- account link already null — a registration she made before signing in. The
-- second is the case the cascade would miss: `stock_alerts.user_id` is ON
-- DELETE SET NULL, so deleting the login would blank the link and leave the
-- row holding her address.
insert into stock_alerts (product_id, size_label, email, name, user_id) values
  ('cccc0000-0000-0000-0000-000000000001', 'M', 'asha@example.com', 'Asha',
   '11111111-1111-1111-1111-111111111111'),
  ('cccc0000-0000-0000-0000-000000000001', 'M', 'bhavna@example.com', 'Bhavna',
   '22222222-2222-2222-2222-222222222222');

update stock_alerts set notified_at = now() where email = 'asha@example.com';
insert into stock_alerts (product_id, size_label, email, name, user_id)
values ('cccc0000-0000-0000-0000-000000000001', 'M', 'ASHA@example.com', 'Asha', null);

-- The outbox addresses people by email and by phone, so both are seeded.
insert into notifications (template, channel, recipient, recipient_name, subject, body) values
  ('order_placed', 'email', 'asha@example.com', 'Asha', 'Your order', 'Thanks'),
  ('order_shipped', 'sms', '+919000000001', 'Asha', '', 'Shipped'),
  ('order_placed', 'email', 'bhavna@example.com', 'Bhavna', 'Your order', 'Thanks');

-- ---------------------------------------------------------------------------
-- What the erasure refuses
-- ---------------------------------------------------------------------------

-- Two separate defences, and both are asserted. An earlier version checked
-- only that *something* refused, which passed with anon's execute grant
-- restored and passed again without it — so it was testing neither.

-- One: anon cannot reach the function at all.
select assert(
  anon_error($$select erase_my_account()$$) like '%permission denied%',
  'erasure: a signed-out caller cannot even reach the function');

-- Two: `require_caller()` refuses inside it. Reached as `authenticated` with no
-- subject claim, which is the shape of a request whose session has expired.
-- Without it, a null uuid would match no rows and the function would report a
-- successful erasure of nothing.
select assert(
  as_user_error(null, $$select erase_my_account()$$) like '%Not signed in%',
  'erasure: and a request with no subject is refused inside it');

select assert(
  as_user_error('44444444-4444-4444-4444-444444444444', $$select erase_my_account()$$)
    like '%staff account cannot be deleted%',
  'erasure: a staff account cannot be deleted from the storefront');

select assert(
  as_user_error('55555555-5555-5555-5555-555555555555', $$select erase_my_account()$$)
    like '%business account cannot be closed here%',
  'erasure: nor can one attached to a business account');

select assert(
  (select count(*) from profiles where id = '44444444-4444-4444-4444-444444444444') = 1
    and (select count(*) from profiles where id = '55555555-5555-5555-5555-555555555555') = 1,
  'erasure: and both of those accounts are still there');

-- An order in flight. Apple asks for a path that works from inside the app,
-- not for one that abandons a parcel already on its way to somebody we would
-- then have no way to reach.
select place('dddd0000-0000-0000-0000-00000000000c', '33333333-3333-3333-3333-333333333333',
             'GV-CHET-1', 'shipped');

select assert(
  as_user_error('33333333-3333-3333-3333-333333333333', $$select erase_my_account()$$)
    like '%GV-CHET-1 has not been delivered%',
  'erasure: an undelivered order blocks it, and the message names the order');

-- Delivered, and it stops blocking.
update retail_orders set status = 'delivered' where reference = 'GV-CHET-1';

insert into return_requests
  (order_id, customer_name, customer_email, phone, resolution, reason, status)
values ('dddd0000-0000-0000-0000-00000000000c', 'Chetan', 'chetan@example.com',
        '+919000000003', 'refund', 'size_or_fit', 'approved');

select assert(
  as_user_error('33333333-3333-3333-3333-333333333333', $$select erase_my_account()$$)
    like '%return on your account is still open%',
  'erasure: an open return blocks it too');

-- `refunded` is an ending, unlike `approved`. Getting this wrong the other way
-- would block erasure for ever after any completed return.
update return_requests set status = 'refunded'
 where order_id = 'dddd0000-0000-0000-0000-00000000000c';

select assert(
  as_user_error('33333333-3333-3333-3333-333333333333', $$select erase_my_account()$$) is null,
  'erasure: a settled return does not block it');

-- ---------------------------------------------------------------------------
-- What it erases, and what it keeps
-- ---------------------------------------------------------------------------

-- Somebody else's open return, on somebody else's order. The block has to be
-- scoped to the caller's own orders — joined through `retail_orders`, not
-- merely coincident with an open return existing somewhere.
insert into return_requests
  (order_id, customer_name, customer_email, phone, resolution, reason, status)
values ('dddd0000-0000-0000-0000-00000000000b', 'Bhavna', 'bhavna@example.com',
        '+919000000002', 'refund', 'changed_mind', 'approved');

select assert(
  as_user_error('11111111-1111-1111-1111-111111111111', $$select erase_my_account()$$) is null,
  'erasure: another customer''s open return does not block her, and she erases');

select assert(
  (select count(*) from auth.users where id = '11111111-1111-1111-1111-111111111111') = 0,
  'erasure: the login is gone');

select assert(
  (select count(*) from profiles where id = '11111111-1111-1111-1111-111111111111') = 0,
  'erasure: and the profile with it');

select assert(
  (select count(*) from wishlists where user_id = '11111111-1111-1111-1111-111111111111') = 0
    and (select count(*) from cart_items where user_id = '11111111-1111-1111-1111-111111111111') = 0
    and (select count(*) from retail_addresses where user_id = '11111111-1111-1111-1111-111111111111') = 0
    and (select count(*) from reviews where user_id = '11111111-1111-1111-1111-111111111111') = 0,
  'erasure: the bag, the wishlist, the address book and the reviews are gone');

-- The trap. A cascade would have blanked `user_id` and left the row, because
-- that foreign key is ON DELETE SET NULL — so the address would have survived
-- an "erasure" with nothing pointing at it to notice.
select assert(
  (select count(*) from stock_alerts where lower(email) = 'asha@example.com') = 0,
  'erasure: including the alert she registered before signing in, matched by address');

select assert(
  (select count(*) from notifications where recipient = 'asha@example.com') = 0,
  'erasure: her copies of what we emailed her are gone');

select assert(
  (select count(*) from notifications where recipient = '+919000000001') = 0,
  'erasure: and what we texted her, which is addressed by phone rather than email');

-- The retention. This is the half that must NOT be erased.
select assert(
  (select count(*) from retail_orders where reference = 'GV-ASHA-1') = 1,
  'erasure: her order is kept, as CGST Rule 56 requires');

select assert(
  (select user_id from retail_orders where reference = 'GV-ASHA-1') is null,
  'erasure: but severed from the account, so it is nobody''s history any more');

-- Rule 46 wants the recipient named on the invoice. An order scrubbed of the
-- customer is not a valid tax invoice, so the snapshot stays.
select assert(
  (select customer_email from retail_orders where reference = 'GV-ASHA-1') = 'asha@example.com'
    and (select customer_name from retail_orders where reference = 'GV-ASHA-1') = 'Asha',
  'erasure: and still names her, because the invoice legally must');

-- ---------------------------------------------------------------------------
-- Exactly one account
-- ---------------------------------------------------------------------------
--
-- Every assertion above would also pass if the function erased everybody.

select assert(
  (select count(*) from auth.users where id = '22222222-2222-2222-2222-222222222222') = 1
    and (select count(*) from profiles where id = '22222222-2222-2222-2222-222222222222') = 1,
  'erasure: the other customer still has her account');

select assert(
  (select count(*) from wishlists where user_id = '22222222-2222-2222-2222-222222222222') = 1
    and (select count(*) from cart_items where user_id = '22222222-2222-2222-2222-222222222222') = 1
    and (select count(*) from retail_addresses where user_id = '22222222-2222-2222-2222-222222222222') = 1
    and (select count(*) from reviews where user_id = '22222222-2222-2222-2222-222222222222') = 1,
  'erasure: and her bag, wishlist, address and review — on the same product');

select assert(
  (select count(*) from stock_alerts where lower(email) = 'bhavna@example.com') = 1,
  'erasure: and her alert, on the same variant');

select assert(
  (select count(*) from notifications where recipient = 'bhavna@example.com') = 1,
  'erasure: and her copy of the same email');

select assert(
  (select user_id from retail_orders where reference = 'GV-BHAV-1')
    = '22222222-2222-2222-2222-222222222222',
  'erasure: and her order is still hers');

-- ---------------------------------------------------------------------------
-- The receipt
-- ---------------------------------------------------------------------------
--
-- The customer is shown this, so it has to be true. An erasure that quietly
-- keeps something is worse than one that says what it keeps and why.

-- A fourth customer, seeded with counts chosen so the receipt has something
-- to be wrong about: two wishlist items, one bag line, one review, two orders.
-- Captured once into a temp table, because reading it three times would mean
-- erasing her three times and the second attempt has no account to erase.

insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp)
values ('cccc0000-0000-0000-0000-000000000002', 'erase-kurta', 'Erase Kurta', 'Brand',
        'women', 'Kurtas', 129900, 159900);

insert into retail_product_sizes (product_id, label, stock_qty)
values ('cccc0000-0000-0000-0000-000000000002', 'M', 5);

insert into wishlists (user_id, product_id) values
  ('66666666-6666-6666-6666-666666666666', 'cccc0000-0000-0000-0000-000000000001'),
  ('66666666-6666-6666-6666-666666666666', 'cccc0000-0000-0000-0000-000000000002');

-- Three lines, one per colour. The counts below are deliberately all
-- different from the one before them in the order the function deletes: a
-- removed DELETE leaves its `get diagnostics` reading the previous statement's
-- row_count, and equal counts would let that leak through unnoticed.
insert into cart_items (user_id, product_id, size_label, color, qty) values
  ('66666666-6666-6666-6666-666666666666', 'cccc0000-0000-0000-0000-000000000001', 'M', 'Rose', 1),
  ('66666666-6666-6666-6666-666666666666', 'cccc0000-0000-0000-0000-000000000001', 'M', 'Indigo', 1),
  ('66666666-6666-6666-6666-666666666666', 'cccc0000-0000-0000-0000-000000000001', 'M', 'Black', 1);

insert into reviews (product_id, user_id, author, rating, title, body)
values ('cccc0000-0000-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666',
        'Divya', 5, 'Great', 'Lovely');

insert into retail_addresses
  (user_id, label, full_name, phone, address_line1, city, state, pincode) values
  ('66666666-6666-6666-6666-666666666666', 'Home', 'Divya', '+919000000006',
   '6 Road', 'Hyderabad', 'Telangana', '500001'),
  ('66666666-6666-6666-6666-666666666666', 'Work', 'Divya', '+919000000006',
   '7 Road', 'Hyderabad', 'Telangana', '500002');

insert into stock_alerts (product_id, size_label, email, name, user_id)
values ('cccc0000-0000-0000-0000-000000000002', 'M', 'divya@example.com', 'Divya',
        '66666666-6666-6666-6666-666666666666');

insert into notifications (template, channel, recipient, recipient_name, subject, body) values
  ('order_placed', 'email', 'divya@example.com', 'Divya', 'Your order', 'Thanks'),
  ('order_shipped', 'email', 'divya@example.com', 'Divya', 'On its way', 'Shipped'),
  ('order_delivered', 'email', 'divya@example.com', 'Divya', 'Delivered', 'Arrived');

select place('dddd0000-0000-0000-0000-00000000000d', '66666666-6666-6666-6666-666666666666',
             'GV-DIVYA-1', 'delivered');
select place('dddd0000-0000-0000-0000-00000000000e', '66666666-6666-6666-6666-666666666666',
             'GV-DIVYA-2', 'cancelled');

-- A referral code issued to her, and a promo she redeemed. Both cascade from
-- `auth.users`, so deleting them explicitly changes nothing about the end
-- state — the receipt is the only place the difference shows, which is exactly
-- why the receipt is asserted field by field below.
insert into promo_codes (code, percent, issued_to)
values ('DIVYA10', 10, '66666666-6666-6666-6666-666666666666');

-- Two, one per order: `promo_redemptions.order_id` is unique, so an order is
-- the most a redemption can attach to.
insert into promo_redemptions (code, user_id, order_id) values
  ('DIVYA10', '66666666-6666-6666-6666-666666666666',
   'dddd0000-0000-0000-0000-00000000000d'),
  ('DIVYA10', '66666666-6666-6666-6666-666666666666',
   'dddd0000-0000-0000-0000-00000000000e');

create temp table erasure_receipt as
select as_user_scalar('66666666-6666-6666-6666-666666666666',
                      $$select erase_my_account()$$)::jsonb as r;

-- Every field, not a sample. Most of these tables cascade from `auth.users`,
-- so the explicit DELETE that produced each count has no other observable
-- effect — remove one and the row still goes, silently, and the receipt
-- becomes a lie. The receipt is what the customer is shown, so a lie in it is
-- the failure that matters.
select assert(
  (select r -> 'erased' ->> 'wishlist_items' from erasure_receipt) = '2',
  'erasure: the receipt counts the wishlist items it erased');

select assert(
  (select r -> 'erased' ->> 'cart_items' from erasure_receipt) = '3',
  'erasure: and the bag');

select assert(
  (select r -> 'erased' ->> 'reviews' from erasure_receipt) = '1',
  'erasure: and the reviews');

select assert(
  (select r -> 'erased' ->> 'addresses' from erasure_receipt) = '2',
  'erasure: and the address book');

select assert(
  (select r -> 'erased' ->> 'stock_alerts' from erasure_receipt) = '1',
  'erasure: and the back-in-stock registrations');

select assert(
  (select r -> 'erased' ->> 'notifications' from erasure_receipt) = '3',
  'erasure: and the outbox copies');

select assert(
  (select r -> 'erased' ->> 'promo_redemptions' from erasure_receipt) = '2',
  'erasure: and the promo redemptions');

select assert(
  (select r -> 'erased' ->> 'referral_codes' from erasure_receipt) = '1',
  'erasure: and the referral codes issued to her');

-- Two, including the cancelled one: cancelled is a terminal state, not a
-- reason to throw the record away.
select assert(
  (select r ->> 'orders_retained' from erasure_receipt) = '2',
  'erasure: and says how many orders it kept');

select assert(
  (select r ->> 'retained_because' from erasure_receipt) like '%CGST%',
  'erasure: and why it kept them');

select assert(
  (select count(*) from retail_orders
    where reference in ('GV-DIVYA-1', 'GV-DIVYA-2') and user_id is null) = 2,
  'erasure: and both of those orders really are severed');

rollback;
