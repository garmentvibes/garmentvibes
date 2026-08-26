-- ---------------------------------------------------------------------------
-- The policies 10_rls_isolation.sql does not reach.
--
-- 10 checks the tables a customer thinks about — orders, invoices, trade
-- pricing. This file covers the thirteen policies that had no behavioural
-- check at all, found by opening each one in turn (`using (true)`) and seeing
-- which mutations the suite failed to notice. Nine were caught; these thirteen
-- were not, which means until now they could have been deleted outright and
-- every test would still have passed.
--
-- They are not minor. Between them they decide whether a customer can read
-- everybody's purchase history and returns, write a review in somebody else's
-- name, read another business's order lines and the prices on them, and see
-- who is waiting for which product to come back in stock.
--
-- Written as exact counts and explicit denials for the same reason 10 is: "at
-- least one" passes against a policy that returns everything.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

begin;

truncate retail_products, wholesale_products cascade;

-- ---------------------------------------------------------------------------
-- Fixture: two retail customers, two businesses, one of each thing
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('a0a0a0a0-0000-0000-0000-000000000001', 'nadia@example.com'),
  ('a0a0a0a0-0000-0000-0000-000000000002', 'omar@example.com'),
  ('a0a0a0a0-0000-0000-0000-000000000003', 'ghost@example.com'),
  ('a0a0a0a0-0000-0000-0000-000000000004', 'trader-one@example.com'),
  ('a0a0a0a0-0000-0000-0000-000000000005', 'trader-two@example.com')
on conflict (id) do nothing;

insert into wholesale_accounts (id, business_name, contact_name, email, status, payment_terms)
values
  ('a0a0a0a0-aaaa-0000-0000-000000000001', 'Trader One Ltd', 'Trader One',
   'trader-one@example.com', 'approved', 'net30'),
  ('a0a0a0a0-aaaa-0000-0000-000000000002', 'Trader Two Ltd', 'Trader Two',
   'trader-two@example.com', 'approved', 'net30')
on conflict (id) do nothing;

insert into profiles (id, role, full_name, email, wholesale_account_id) values
  ('a0a0a0a0-0000-0000-0000-000000000001', 'retail', 'Nadia', 'nadia@example.com', null),
  ('a0a0a0a0-0000-0000-0000-000000000002', 'retail', 'Omar', 'omar@example.com', null),
  ('a0a0a0a0-0000-0000-0000-000000000004', 'wholesale', 'Trader One',
   'trader-one@example.com', 'a0a0a0a0-aaaa-0000-0000-000000000001'),
  ('a0a0a0a0-0000-0000-0000-000000000005', 'wholesale', 'Trader Two',
   'trader-two@example.com', 'a0a0a0a0-aaaa-0000-0000-000000000002')
on conflict (id) do update set
  role = excluded.role, wholesale_account_id = excluded.wholesale_account_id;

-- Deliberately left without a profile row, so the insert policy on `profiles`
-- has a real target: a row that does not exist and is not the caller's.
delete from profiles where id = 'a0a0a0a0-0000-0000-0000-000000000003';

insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp)
values ('a0a0a0a0-cccc-0000-0000-000000000001', 'policy-kurta', 'Policy Kurta', 'GV',
        'women', 'Kurtas', 129900, 199900);

insert into retail_product_sizes (product_id, label, stock_qty)
values ('a0a0a0a0-cccc-0000-0000-000000000001', 'M', 0);

-- One order each, one line each. Omar's line is the secret Nadia must not see.
insert into retail_orders (id, user_id, total, shipping_address, customer_email) values
  ('a0a0a0a0-dddd-0000-0000-000000000001', 'a0a0a0a0-0000-0000-0000-000000000001',
   129900, '{}'::jsonb, 'nadia@example.com'),
  ('a0a0a0a0-dddd-0000-0000-000000000002', 'a0a0a0a0-0000-0000-0000-000000000002',
   129900, '{}'::jsonb, 'omar@example.com');

insert into retail_order_items (order_id, product_id, size, color, qty, price, product_name) values
  ('a0a0a0a0-dddd-0000-0000-000000000001', 'a0a0a0a0-cccc-0000-0000-000000000001',
   'M', 'Indigo', 1, 129900, 'Policy Kurta'),
  ('a0a0a0a0-dddd-0000-0000-000000000002', 'a0a0a0a0-cccc-0000-0000-000000000001',
   'M', 'Indigo', 1, 129900, 'Policy Kurta');

-- A return on each order, with a line on each.
insert into return_requests (id, order_id, customer_name, customer_email, phone,
                             resolution, reason, reference) values
  ('a0a0a0a0-eeee-0000-0000-000000000001', 'a0a0a0a0-dddd-0000-0000-000000000001',
   'Nadia', 'nadia@example.com', '9000000001', 'refund', 'size_or_fit', 'RET-P-0001'),
  ('a0a0a0a0-eeee-0000-0000-000000000002', 'a0a0a0a0-dddd-0000-0000-000000000002',
   'Omar', 'omar@example.com', '9000000002', 'refund', 'size_or_fit', 'RET-P-0002');

insert into return_items (return_id, product_id, product_name, size_label, color, qty, price) values
  ('a0a0a0a0-eeee-0000-0000-000000000001', 'a0a0a0a0-cccc-0000-0000-000000000001',
   'Policy Kurta', 'M', 'Indigo', 1, 129900),
  ('a0a0a0a0-eeee-0000-0000-000000000002', 'a0a0a0a0-cccc-0000-0000-000000000001',
   'Policy Kurta', 'M', 'Indigo', 1, 129900);

-- Both reviews are still pending, so the "published reviews are public" policy
-- is not what makes either visible — the owner policies are the only ones in
-- play. Nadia gets one of her own so the unfiltered probes further down have
-- something they are *allowed* to touch.
insert into reviews (id, product_id, user_id, author, rating, title, status) values
  ('a0a0a0a0-ffff-0000-0000-000000000001', 'a0a0a0a0-cccc-0000-0000-000000000001',
   'a0a0a0a0-0000-0000-0000-000000000001', 'Nadia', 5, 'Nadia''s draft', 'pending'),
  ('a0a0a0a0-ffff-0000-0000-000000000002', 'a0a0a0a0-cccc-0000-0000-000000000001',
   'a0a0a0a0-0000-0000-0000-000000000002', 'Omar', 4, 'Omar''s draft', 'pending');

insert into stock_alerts (id, product_id, size_label, email, name, user_id) values
  ('a0a0a0a0-9999-0000-0000-000000000001', 'a0a0a0a0-cccc-0000-0000-000000000001',
   'M', 'nadia@example.com', 'Nadia', 'a0a0a0a0-0000-0000-0000-000000000001'),
  ('a0a0a0a0-9999-0000-0000-000000000002', 'a0a0a0a0-cccc-0000-0000-000000000001',
   'M', 'omar@example.com', 'Omar', 'a0a0a0a0-0000-0000-0000-000000000002');

insert into wholesale_products (id, sku, slug, name, category, subcategory, moq, pack_size)
values ('a0a0a0a0-bbbb-0000-0000-000000000001', 'GV-POL-001', 'policy-tee-bulk',
        'Policy Tee Bulk', 'unisex', 'T-Shirts', 100, 20);

-- Trader One's quote. account_id is deliberately null: `wholesale_quotes` also
-- carries a members-of-the-account select policy, and leaving the account off
-- keeps that one out of the way so this file tests the owner policy alone.
insert into wholesale_quotes (id, user_id, account_id, status, total_estimate, reference,
                              business_name, contact_name, email)
values ('a0a0a0a0-7777-0000-0000-000000000001', 'a0a0a0a0-0000-0000-0000-000000000004',
        null, 'requested', 3200000, 'GV-Q-P001', 'Trader One Ltd', 'Trader One',
        'trader-one@example.com');

insert into wholesale_quote_items (quote_id, product_id, qty, price_per_unit, sku, product_name)
values ('a0a0a0a0-7777-0000-0000-000000000001', 'a0a0a0a0-bbbb-0000-0000-000000000001',
        100, 32000, 'GV-POL-001', 'Policy Tee Bulk');

-- ---------------------------------------------------------------------------
-- profiles — the row that says what you are allowed to do
-- ---------------------------------------------------------------------------

select assert(
  visible_count('a0a0a0a0-0000-0000-0000-000000000001',
    'select count(*) from profiles') = 1,
  'policies: a customer sees exactly one profile, their own');

select assert(
  visible_count('a0a0a0a0-0000-0000-0000-000000000001',
    $q$select count(*) from profiles where email = 'omar@example.com'$q$) = 0,
  'policies: and not another customer''s name, email or phone');

-- Not a hypothetical: `ghost` has no profile row, so there is no primary key
-- to collide with and nothing but the policy in the way.
select assert(
  is_denied('a0a0a0a0-0000-0000-0000-000000000001', $q$
    insert into profiles (id, role, full_name, email)
    values ('a0a0a0a0-0000-0000-0000-000000000003', 'retail', 'Ghost', 'ghost@example.com')
  $q$),
  'policies: nor create a profile for somebody else');

-- ---------------------------------------------------------------------------
-- retail_order_items — what everybody bought, and what they paid
-- ---------------------------------------------------------------------------

select assert(
  visible_count('a0a0a0a0-0000-0000-0000-000000000001',
    'select count(*) from retail_order_items') = 1,
  'policies: a customer sees the lines of their own order');

select assert(
  visible_count('a0a0a0a0-0000-0000-0000-000000000001',
    $q$select count(*) from retail_order_items
        where order_id = 'a0a0a0a0-dddd-0000-0000-000000000002'$q$) = 0,
  'policies: and none of another customer''s');

select assert(
  visible_count(null, 'select count(*) from retail_order_items') = 0,
  'policies: a signed-out visitor sees no order lines');

-- ---------------------------------------------------------------------------
-- return_items — the same history, one table over
-- ---------------------------------------------------------------------------

select assert(
  visible_count('a0a0a0a0-0000-0000-0000-000000000001',
    'select count(*) from return_items') = 1,
  'policies: a customer sees the items on their own return');

select assert(
  visible_count('a0a0a0a0-0000-0000-0000-000000000001',
    $q$select count(*) from return_items
        where return_id = 'a0a0a0a0-eeee-0000-0000-000000000002'$q$) = 0,
  'policies: and none on anybody else''s');

-- Adding a line to a stranger's return is adding to the amount somebody else
-- gets refunded, on an order that is not yours.
select assert(
  is_denied('a0a0a0a0-0000-0000-0000-000000000001', $q$
    insert into return_items (return_id, product_id, product_name, size_label, color, qty, price)
    values ('a0a0a0a0-eeee-0000-0000-000000000002', 'a0a0a0a0-cccc-0000-0000-000000000001',
            'Policy Kurta', 'M', 'Indigo', 1, 129900)
  $q$),
  'policies: nor add a line to another customer''s return');

-- ---------------------------------------------------------------------------
-- reviews — writing in somebody else's name
-- ---------------------------------------------------------------------------

select assert(
  is_denied('a0a0a0a0-0000-0000-0000-000000000001', $q$
    insert into reviews (product_id, user_id, author, rating, title)
    values ('a0a0a0a0-cccc-0000-0000-000000000001', 'a0a0a0a0-0000-0000-0000-000000000002',
            'Omar', 1, 'Actually it is terrible')
  $q$),
  'policies: a customer cannot post a review as another customer');

-- Deliberately no WHERE clause, and this is the whole point of the check.
--
-- An UPDATE or DELETE that names a column — in a WHERE clause, or in RETURNING
-- — must satisfy the table's SELECT policies as well, because Postgres has to
-- read the row to evaluate it. So `update … where id = <somebody else's>` is
-- stopped by the select policy whether the update policy is there or not:
-- deleting this policy outright leaves that statement affecting zero rows, and
-- a test written that way passes against a table with no write policy at all.
-- Both earlier drafts of this file made exactly that mistake.
--
-- An unfiltered statement reads nothing, so the update policy is the only
-- thing deciding which rows are touched. Nadia's own review is the control: if
-- hers does not change either, the check has stopped testing anything.
select assert(
  as_user_error('a0a0a0a0-0000-0000-0000-000000000001',
    $q$update reviews set title = 'Edited by a stranger'$q$) is null,
  'policies: an unfiltered update is filtered by policy, not refused');

select assert(
  (select title from reviews where id = 'a0a0a0a0-ffff-0000-0000-000000000002')
    = 'Omar''s draft',
  'policies: and another customer''s review still says what its author wrote');

select assert(
  (select title from reviews where id = 'a0a0a0a0-ffff-0000-0000-000000000001')
    = 'Edited by a stranger',
  'policies: while her own did change, so the statement really ran');

-- ---------------------------------------------------------------------------
-- stock_alerts — who is waiting on what, and at which address
-- ---------------------------------------------------------------------------

select assert(
  visible_count('a0a0a0a0-0000-0000-0000-000000000001',
    'select count(*) from stock_alerts') = 1,
  'policies: a customer sees only their own stock alert');

select assert(
  visible_count('a0a0a0a0-0000-0000-0000-000000000001',
    $q$select count(*) from stock_alerts where email = 'omar@example.com'$q$) = 0,
  'policies: not who else is waiting, nor at which address');

-- Cancelling somebody else's alert is quiet: they simply never hear that the
-- thing they were waiting for came back. Unfiltered, for the reason given
-- above the reviews check — a delete naming a column is stopped by the select
-- policy first, so it cannot tell whether this one is doing anything.
select assert(
  as_user_error('a0a0a0a0-0000-0000-0000-000000000001',
    'delete from stock_alerts') is null,
  'policies: an unfiltered delete is filtered by policy, not refused');

select assert(
  (select count(*) from stock_alerts where id = 'a0a0a0a0-9999-0000-0000-000000000002') = 1,
  'policies: and another customer''s alert is still standing');

select assert(
  (select count(*) from stock_alerts where id = 'a0a0a0a0-9999-0000-0000-000000000001') = 0,
  'policies: while her own went, so the statement really ran');

-- ---------------------------------------------------------------------------
-- wholesale quotes and their lines — another business's order book
-- ---------------------------------------------------------------------------

select assert(
  visible_count('a0a0a0a0-0000-0000-0000-000000000004',
    'select count(*) from wholesale_quote_items') = 1,
  'policies: a buyer sees the lines of their own quote');

select assert(
  visible_count('a0a0a0a0-0000-0000-0000-000000000005',
    'select count(*) from wholesale_quote_items') = 0,
  'policies: and another business sees neither the quantities nor the prices');

select assert(
  is_denied('a0a0a0a0-0000-0000-0000-000000000005', $q$
    insert into wholesale_quote_items (quote_id, product_id, qty, price_per_unit, sku, product_name)
    values ('a0a0a0a0-7777-0000-0000-000000000001', 'a0a0a0a0-bbbb-0000-0000-000000000001',
            9999, 1, 'GV-POL-001', 'Policy Tee Bulk')
  $q$),
  'policies: nor add lines to it');

-- Raising a quote in another buyer's name is an order somebody else is on the
-- hook for, against their credit terms.
select assert(
  is_denied('a0a0a0a0-0000-0000-0000-000000000005', $q$
    insert into wholesale_quotes (user_id, total_estimate, reference,
                                  business_name, contact_name, email)
    values ('a0a0a0a0-0000-0000-0000-000000000004', 9900000, 'GV-Q-FORGED',
            'Trader One Ltd', 'Trader One', 'trader-one@example.com')
  $q$),
  'policies: a buyer cannot raise a quote in another buyer''s name');

rollback;
