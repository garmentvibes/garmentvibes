-- Does the schema actually keep customers apart?
--
-- Structural checks ("RLS is enabled") pass on a table whose policy says
-- `using (true)`. The only way to know a policy works is to become two
-- different people and look. This file does that: it seeds a fixture, then
-- switches identity the same way a Supabase request does — `set local role
-- authenticated` plus the JWT subject GUC that auth.uid() reads.
--
-- Each assertion raises `ok: …` on success and aborts the transaction on
-- failure, so a silent file is a failed file (the runner checks for that).

\set ON_ERROR_STOP on
set client_min_messages to notice;

-- Rolled back at the end, so this file's fixture cannot skew the row counts
-- another test file asserts on. Helpers come from 01_helpers.sql, which the
-- runner applies once outside any transaction.
begin;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'asha@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bala@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'staff@garmentvibes.com'),
  ('44444444-4444-4444-4444-444444444444', 'buyer-one@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'buyer-two@example.com');

insert into profiles (id, role, full_name, email) values
  ('11111111-1111-1111-1111-111111111111', 'retail', 'Asha', 'asha@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'retail', 'Bala', 'bala@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'admin', 'Staff', 'staff@garmentvibes.com');

-- Two unrelated businesses: one approved, one still pending.
insert into wholesale_accounts (id, business_name, contact_name, email, status, payment_terms, gstin)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Approved Traders', 'Buyer One',
   'buyer-one@example.com', 'approved', 'net30', '36AAAAA0000A1Z5'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Pending Textiles', 'Buyer Two',
   'buyer-two@example.com', 'pending', 'prepay', '36BBBBB0000B1Z5');

insert into profiles (id, role, full_name, email, wholesale_account_id) values
  ('44444444-4444-4444-4444-444444444444', 'wholesale', 'Buyer One',
   'buyer-one@example.com', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('55555555-5555-5555-5555-555555555555', 'wholesale', 'Buyer Two',
   'buyer-two@example.com', 'aaaaaaaa-0000-0000-0000-000000000002');

insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp)
values ('cccccccc-0000-0000-0000-000000000001', 'test-kurta', 'Test Kurta', 'GV',
        'women', 'Kurtas', 129900, 199900);

insert into retail_product_sizes (product_id, label, stock_qty)
values ('cccccccc-0000-0000-0000-000000000001', 'M', 4);

-- One order each, so "can Asha see Bala's order" has a real answer.
insert into retail_orders (id, user_id, total, shipping_address, customer_email) values
  ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   129900, '{}'::jsonb, 'asha@example.com'),
  ('dddddddd-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   129900, '{}'::jsonb, 'bala@example.com');

insert into wholesale_products (id, sku, slug, name, category, subcategory, moq, pack_size)
values ('eeeeeeee-0000-0000-0000-000000000001', 'GV-TEE-001', 'test-tee-bulk',
        'Test Tee Bulk', 'unisex', 'T-Shirts', 100, 20);

insert into wholesale_price_tiers (product_id, min_qty, price_per_unit)
values ('eeeeeeee-0000-0000-0000-000000000001', 100, 32000);

insert into credit_invoices (id, account_id, business_name, contact_name, email, amount, due_on)
values ('ffffffff-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
        'Approved Traders', 'Buyer One', 'buyer-one@example.com', 500000,
        current_date + 30);

insert into promo_codes (code, percent, built_in) values ('GARMENT10', 10, true);
insert into promo_codes (code, percent, active) values ('SECRETSALE', 50, false);

-- ---------------------------------------------------------------------------
-- Retail order isolation
-- ---------------------------------------------------------------------------

select assert(
  visible_count('11111111-1111-1111-1111-111111111111', 'select count(*) from retail_orders') = 1,
  'a customer sees their own order'
);

select assert(
  visible_count('22222222-2222-2222-2222-222222222222',
    'select count(*) from retail_orders where id = ''dddddddd-0000-0000-0000-000000000001''') = 0,
  'a customer cannot see another customer''s order'
);

select assert(
  visible_count('33333333-3333-3333-3333-333333333333', 'select count(*) from retail_orders') = 2,
  'staff see every order'
);

-- Signed out means signed out, even for a table the policy filters by user id:
-- auth.uid() is null and must match nothing rather than everything.
select assert(
  visible_count(null, 'select count(*) from retail_orders') = 0,
  'a signed-out visitor sees no orders'
);

-- Forging someone else's user_id on insert is the obvious attack against a
-- policy that trusts a column.
select assert(
  is_denied('11111111-1111-1111-1111-111111111111', $q$
    insert into retail_orders (user_id, total, shipping_address)
    values ('22222222-2222-2222-2222-222222222222', 100, '{}'::jsonb)
  $q$),
  'a customer cannot create an order in someone else''s name'
);

-- ---------------------------------------------------------------------------
-- Trade pricing is gated on approval
-- ---------------------------------------------------------------------------

select assert(
  visible_count('44444444-4444-4444-4444-444444444444',
    'select count(*) from wholesale_price_tiers') = 1,
  'an approved buyer can read trade pricing'
);

select assert(
  visible_count('55555555-5555-5555-5555-555555555555',
    'select count(*) from wholesale_price_tiers') = 0,
  'a buyer awaiting approval cannot read trade pricing'
);

select assert(
  visible_count('11111111-1111-1111-1111-111111111111',
    'select count(*) from wholesale_price_tiers') = 0,
  'a retail customer cannot read trade pricing'
);

-- The catalogue itself stays public so it can still be browsed and indexed —
-- only the prices behind it are restricted.
select assert(
  anon_count('select count(*) from wholesale_products') = 1,
  'the wholesale catalogue is still publicly browsable'
);

-- Belt and braces on trade pricing: `anon` holds no privilege on the table at
-- all, so a signed-out request is refused before any policy is evaluated.
select assert(
  anon_denied('select count(*) from wholesale_price_tiers'),
  'a signed-out request cannot touch the trade pricing table'
);

select assert(
  anon_denied('select count(*) from retail_orders'),
  'a signed-out request cannot touch the orders table'
);

select assert(
  anon_denied('select count(*) from notifications'),
  'a signed-out request cannot touch the outbox'
);

-- ---------------------------------------------------------------------------
-- Credit ledger isolation
-- ---------------------------------------------------------------------------

select assert(
  visible_count('44444444-4444-4444-4444-444444444444',
    'select count(*) from credit_invoices') = 1,
  'a business sees its own invoices'
);

select assert(
  visible_count('55555555-5555-5555-5555-555555555555',
    'select count(*) from credit_invoices') = 0,
  'a business cannot see another business''s invoices'
);

-- The view is the interesting case: without security_invoker it would run as
-- its owner and leak every business's debts through the back door.
select assert(
  visible_count('55555555-5555-5555-5555-555555555555',
    'select count(*) from credit_invoice_balances') = 0,
  'the balances view does not leak past RLS'
);

select assert(
  visible_count('44444444-4444-4444-4444-444444444444',
    'select count(*) from credit_invoice_balances') = 1,
  'a business sees its own balances through the view'
);

-- ---------------------------------------------------------------------------
-- Promo codes
-- ---------------------------------------------------------------------------

select assert(
  anon_count('select count(*) from promo_codes') = 1,
  'a visitor sees only live promo codes'
);

select assert(
  visible_count('33333333-3333-3333-3333-333333333333', 'select count(*) from promo_codes') = 2,
  'staff see inactive promo codes too'
);

-- The built-in rule, enforced by policy rather than by a hidden button.
select assert(
  visible_count('33333333-3333-3333-3333-333333333333',
    $q$ with deleted as (delete from promo_codes where code = 'GARMENT10' returning 1)
        select count(*) from deleted $q$) = 0,
  'staff cannot delete a built-in promo code'
);

select assert(
  visible_count('33333333-3333-3333-3333-333333333333',
    $q$ with deleted as (delete from promo_codes where code = 'SECRETSALE' returning 1)
        select count(*) from deleted $q$) = 1,
  'staff can delete a non-built-in promo code'
);

-- ---------------------------------------------------------------------------
-- Wholesale account application
-- ---------------------------------------------------------------------------

-- Applying is allowed; approving yourself is not.
select assert(
  is_denied(null, $q$
    insert into wholesale_accounts (business_name, contact_name, email, status)
    values ('Self Approved Ltd', 'Nobody', 'nobody@example.com', 'approved')
  $q$),
  'an applicant cannot approve their own wholesale account'
);

select assert(
  is_denied(null, $q$
    insert into wholesale_accounts (business_name, contact_name, email, payment_terms)
    values ('Self Credit Ltd', 'Nobody', 'nobody2@example.com', 'net30')
  $q$),
  'an applicant cannot grant themselves credit terms'
);

-- ---------------------------------------------------------------------------
-- The outbox holds every customer's messages
-- ---------------------------------------------------------------------------

insert into notifications (template, channel, recipient, recipient_name, body)
values ('order_placed', 'email', 'asha@example.com', 'Asha', 'Your order is confirmed.');

select assert(
  visible_count('11111111-1111-1111-1111-111111111111', 'select count(*) from notifications') = 0,
  'a customer cannot read the notification outbox'
);

select assert(
  visible_count('33333333-3333-3333-3333-333333333333', 'select count(*) from notifications') = 1,
  'staff can read the notification outbox'
);

rollback;
