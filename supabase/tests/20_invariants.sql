-- Do the constraints and triggers actually hold?
--
-- Every check constraint in the migrations is a claim about what the database
-- will refuse. An untested claim is a comment. This file tries to do each
-- forbidden thing and asserts that it fails.
--
-- Runs as the table owner on purpose: constraints are not row-level security,
-- and one that only bites unprivileged callers is not a constraint at all.

\set ON_ERROR_STOP on
set client_min_messages to notice;

begin;

-- Same reason as 10_: the seeded catalogue is cleared so this file's fixture
-- is the only data present, and restored by the rollback at the end.
truncate retail_products, wholesale_products, promo_codes cascade;

insert into auth.users (id, email)
values ('99999999-0000-0000-0000-000000000001', 'inv@example.com');

insert into profiles (id, role, full_name, email)
values ('99999999-0000-0000-0000-000000000001', 'retail', 'Inv', 'inv@example.com')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, email = excluded.email;

insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp)
values ('cccccccc-1111-0000-0000-000000000001', 'inv-kurta', 'Inv Kurta', 'GV',
        'women', 'Kurtas', 129900, 199900);

insert into wholesale_accounts (id, business_name, contact_name, email, status, payment_terms)
values ('aaaaaaaa-1111-0000-0000-000000000001', 'Inv Traders', 'Inv', 'inv@example.com',
        'approved', 'net30');

-- ---------------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------------

insert into retail_product_sizes (product_id, label, stock_qty)
values ('cccccccc-1111-0000-0000-000000000001', 'M', 3);

-- The oversell guard. Two customers checking out the last units concurrently
-- both pass an application-level stock read; only the database stops the
-- second write.
select assert(
  violates_constraint($q$
    update retail_product_sizes set stock_qty = stock_qty - 5
    where product_id = 'cccccccc-1111-0000-0000-000000000001' and label = 'M'
  $q$),
  'stock cannot be driven negative'
);

-- in_stock is generated, so it cannot drift out of step with the number beside
-- it — the bug where a size shows as available and the order then fails.
update retail_product_sizes set stock_qty = 0
where product_id = 'cccccccc-1111-0000-0000-000000000001' and label = 'M';

select assert(
  (select not in_stock from retail_product_sizes
   where product_id = 'cccccccc-1111-0000-0000-000000000001' and label = 'M'),
  'in_stock follows stock_qty to zero'
);

update retail_product_sizes set stock_qty = 7
where product_id = 'cccccccc-1111-0000-0000-000000000001' and label = 'M';

select assert(
  (select in_stock from retail_product_sizes
   where product_id = 'cccccccc-1111-0000-0000-000000000001' and label = 'M'),
  'in_stock follows stock_qty back up'
);

select assert(
  violates_constraint($q$
    insert into retail_product_sizes (product_id, label, stock_qty)
    values ('cccccccc-1111-0000-0000-000000000001', 'M', 1)
  $q$),
  'a size cannot be listed twice on one product'
);

-- ---------------------------------------------------------------------------
-- GST on an invoice
-- ---------------------------------------------------------------------------

-- A supply is either intra-state (CGST + SGST) or inter-state (IGST). Both at
-- once produces an invoice the buyer cannot claim credit against.
select assert(
  violates_constraint($q$
    insert into retail_orders (user_id, total, shipping_address, tax_cgst, tax_sgst, tax_igst)
    values ('99999999-0000-0000-0000-000000000001', 100, '{}'::jsonb, 500, 500, 900)
  $q$),
  'an invoice cannot carry both IGST and CGST/SGST'
);

-- CGST and SGST are always levied at the same rate on the same value, so an
-- unequal pair is arithmetic gone wrong upstream.
select assert(
  violates_constraint($q$
    insert into retail_orders (user_id, total, shipping_address, tax_cgst, tax_sgst)
    values ('99999999-0000-0000-0000-000000000001', 100, '{}'::jsonb, 500, 400)
  $q$),
  'CGST and SGST must be equal'
);

insert into retail_orders (id, user_id, total, shipping_address, tax_cgst, tax_sgst, invoice_number)
values ('dddddddd-1111-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001',
        129900, '{}'::jsonb, 3093, 3093, 'GV/2026-27/0001');

select assert(
  violates_constraint($q$
    insert into retail_orders (user_id, total, shipping_address, invoice_number)
    values ('99999999-0000-0000-0000-000000000001', 100, '{}'::jsonb, 'GV/2026-27/0001')
  $q$),
  'an invoice number cannot be issued twice'
);

-- The partial unique index must still allow any number of un-invoiced orders.
insert into retail_orders (user_id, total, shipping_address)
values ('99999999-0000-0000-0000-000000000001', 100, '{}'::jsonb),
       ('99999999-0000-0000-0000-000000000001', 200, '{}'::jsonb);

select assert(
  (select count(*) from retail_orders where invoice_number is null) = 2,
  'orders without an invoice number are not treated as duplicates'
);

-- ---------------------------------------------------------------------------
-- Credit terms
-- ---------------------------------------------------------------------------

-- Offering terms to an account we have not agreed to trade with is a
-- contradiction.
select assert(
  violates_constraint($q$
    insert into wholesale_accounts (business_name, contact_name, email, status, payment_terms)
    values ('Unapproved Credit Ltd', 'X', 'x@example.com', 'pending', 'net30')
  $q$),
  'credit terms require an approved account'
);

-- One account per GSTIN: the same registration signing up twice is the same
-- business, and two ledgers for one debtor is how exposure gets lost.
insert into wholesale_accounts (business_name, contact_name, email, gstin)
values ('Dup One', 'X', 'dup1@example.com', '36CCCCC0000C1Z5');

select assert(
  violates_constraint($q$
    insert into wholesale_accounts (business_name, contact_name, email, gstin)
    values ('Dup Two', 'Y', 'dup2@example.com', '36ccccc0000c1z5')
  $q$),
  'one wholesale account per GSTIN, case-insensitively'
);

-- ---------------------------------------------------------------------------
-- Invoice status is derived from its payments
-- ---------------------------------------------------------------------------

insert into credit_invoices (id, account_id, business_name, contact_name, email, amount, due_on)
values ('ffffffff-1111-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001',
        'Inv Traders', 'Inv', 'inv@example.com', 100000, current_date + 30);

select assert(
  (select status from credit_invoices where id = 'ffffffff-1111-0000-0000-000000000001') = 'open',
  'a new invoice starts open'
);

insert into credit_payments (invoice_id, amount, method)
values ('ffffffff-1111-0000-0000-000000000001', 40000, 'bank_transfer');

select assert(
  (select status from credit_invoices where id = 'ffffffff-1111-0000-0000-000000000001') = 'part_paid',
  'a partial payment moves the invoice to part_paid'
);

insert into credit_payments (invoice_id, amount, method)
values ('ffffffff-1111-0000-0000-000000000001', 60000, 'upi');

select assert(
  (select status from credit_invoices where id = 'ffffffff-1111-0000-0000-000000000001') = 'paid',
  'settling the balance moves the invoice to paid'
);

select assert(
  (select amount_outstanding from credit_invoice_balances
   where id = 'ffffffff-1111-0000-0000-000000000001') = 0,
  'a settled invoice shows nothing outstanding'
);

-- Reversing a mistaken receipt has to walk the status back, or the ledger
-- claims money we do not have.
delete from credit_payments
where invoice_id = 'ffffffff-1111-0000-0000-000000000001' and amount = 60000;

select assert(
  (select status from credit_invoices where id = 'ffffffff-1111-0000-0000-000000000001') = 'part_paid',
  'deleting a payment walks the status back'
);

-- A write-off is an accounting decision. A late payment against one is worth
-- recording, but it does not undo the decision.
update credit_invoices set status = 'written_off'
where id = 'ffffffff-1111-0000-0000-000000000001';

insert into credit_payments (invoice_id, amount, method)
values ('ffffffff-1111-0000-0000-000000000001', 60000, 'cheque');

select assert(
  (select status from credit_invoices where id = 'ffffffff-1111-0000-0000-000000000001') = 'written_off',
  'a payment against a written-off invoice does not resurrect it'
);

select assert(
  (select amount_outstanding from credit_invoice_balances
   where id = 'ffffffff-1111-0000-0000-000000000001') = 0,
  'a written-off invoice shows nothing outstanding'
);

-- ---------------------------------------------------------------------------
-- Returns and exchanges
-- ---------------------------------------------------------------------------

insert into return_requests (id, order_id, customer_name, customer_email, phone,
                             resolution, reason, refund_amount)
values ('bbbbbbbb-1111-0000-0000-000000000001', 'dddddddd-1111-0000-0000-000000000001',
        'Inv', 'inv@example.com', '+919000000000', 'refund', 'size_or_fit', 129900);

-- A refund with a price difference attached would silently charge someone.
select assert(
  violates_constraint($q$
    update return_requests set exchange_balance = 5000
    where id = 'bbbbbbbb-1111-0000-0000-000000000001'
  $q$),
  'a refund cannot carry an exchange balance'
);

select assert(
  violates_constraint($q$
    update return_requests set status = 'exchange_shipped'
    where id = 'bbbbbbbb-1111-0000-0000-000000000001'
  $q$),
  'a refund cannot reach the exchange-shipped state'
);

-- A replacement we cannot price is one we cannot settle the difference on.
select assert(
  violates_constraint($q$
    insert into return_items (return_id, product_id, product_name, size_label, color, qty,
                             price, exchange_for_size)
    values ('bbbbbbbb-1111-0000-0000-000000000001', 'cccccccc-1111-0000-0000-000000000001',
            'Inv Kurta', 'M', 'Rose', 1, 129900, 'L')
  $q$),
  'an exchange size must come with a price'
);

-- ---------------------------------------------------------------------------
-- Wholesale claims
-- ---------------------------------------------------------------------------

insert into wholesale_quotes (id, user_id, total_estimate, account_id)
values ('eeeeeeee-1111-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001',
        500000, 'aaaaaaaa-1111-0000-0000-000000000001');

insert into wholesale_claims (id, quote_id, account_id, business_name, contact_name, email,
                             reason, requested_resolution)
values ('aaaabbbb-1111-0000-0000-000000000001', 'eeeeeeee-1111-0000-0000-000000000001',
        'aaaaaaaa-1111-0000-0000-000000000001', 'Inv Traders', 'Inv', 'inv@example.com',
        'short_shipment', 'credit_note');

-- Claiming for more units than were billed is how a typo becomes a credit note
-- worth more than the invoice.
select assert(
  violates_constraint($q$
    insert into wholesale_claim_lines (claim_id, sku, product_name, billed_qty, claimed_qty,
                                       price_per_unit)
    values ('aaaabbbb-1111-0000-0000-000000000001', 'GV-1', 'Tee', 300, 400, 32000)
  $q$),
  'a claim cannot exceed the quantity billed'
);

select assert(
  violates_constraint($q$
    insert into wholesale_claim_lines (claim_id, sku, product_name, billed_qty, claimed_qty,
                                       price_per_unit, approved_qty)
    values ('aaaabbbb-1111-0000-0000-000000000001', 'GV-2', 'Tee', 300, 12, 32000, 20)
  $q$),
  'more units cannot be approved than were claimed'
);

-- A settled claim that records neither what was granted nor when cannot be
-- audited.
select assert(
  violates_constraint($q$
    update wholesale_claims set status = 'settled'
    where id = 'aaaabbbb-1111-0000-0000-000000000001'
  $q$),
  'a claim cannot be settled without recording the settlement'
);

-- ---------------------------------------------------------------------------
-- Addresses and promo codes
-- ---------------------------------------------------------------------------

insert into retail_addresses (user_id, label, full_name, phone, address_line1, city, state,
                              pincode, is_default)
values ('99999999-0000-0000-0000-000000000001', 'Home', 'Inv', '+919000000000',
        '1 Road', 'Hyderabad', 'Telangana', '500001', true);

-- The app rewrites every row to enforce this in JavaScript; the index makes it
-- true even when two tabs try at once.
select assert(
  violates_constraint($q$
    insert into retail_addresses (user_id, label, full_name, phone, address_line1, city, state,
                                  pincode, is_default)
    values ('99999999-0000-0000-0000-000000000001', 'Office', 'Inv', '+919000000000',
            '2 Road', 'Hyderabad', 'Telangana', '500002', true)
  $q$),
  'a customer can only have one default address'
);

-- Codes are matched case-insensitively, so storing a lowercase one would make
-- the lookup miss.
select assert(
  violates_constraint($q$ insert into promo_codes (code, percent) values ('lowercase', 10) $q$),
  'a promo code must be stored uppercase'
);

select assert(
  violates_constraint($q$ insert into promo_codes (code, percent) values ('TOOMUCH', 150) $q$),
  'a promo code cannot discount more than 100 percent'
);

select assert(
  violates_constraint($q$
    insert into promo_codes (code, percent, starts_on, expires_on)
    values ('BACKWARDS', 10, current_date, current_date - 1)
  $q$),
  'a promo code cannot expire before it starts'
);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

select assert(
  violates_constraint($q$
    insert into notifications (template, channel, recipient, recipient_name, body, status)
    values ('order_placed', 'email', 'x@example.com', 'X', 'hi', 'sent')
  $q$),
  'a sent message must record when it was sent'
);

-- ---------------------------------------------------------------------------
-- Size display order
-- ---------------------------------------------------------------------------

-- Rows come back from Postgres in whatever order it finds them, so the order
-- sizes are shown in has to be stored. Two sizes of one product claiming the
-- same slot leaves the tie broken by the planner, which is a size picker whose
-- order moves between page loads.
insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp)
values ('aaaaaaaa-0000-0000-0000-00000000000f', 'order-test-tee', 'Order Test Tee', 'Brand',
        'men', 'T-Shirts', 49900, 69900);

insert into retail_product_sizes (product_id, label, stock_qty, sort_order) values
  ('aaaaaaaa-0000-0000-0000-00000000000f', 'S', 5, 0),
  ('aaaaaaaa-0000-0000-0000-00000000000f', 'M', 5, 1);

-- Forced immediate for the probe. The constraint is DEFERRABLE INITIALLY
-- DEFERRED, so left alone it raises at COMMIT — after violates_constraint()
-- has already returned false and the test has read as passing.
set constraints retail_product_sizes_order_unique immediate;

select assert(
  violates_constraint($q$
    insert into retail_product_sizes (product_id, label, stock_qty, sort_order)
    values ('aaaaaaaa-0000-0000-0000-00000000000f', 'L', 5, 1)
  $q$),
  'two sizes of one product cannot share a display position'
);

-- And that it really is deferrable, because that is what the seed depends on:
-- re-running it after a size is inserted into the middle of a run renumbers
-- the rows in one statement, passing through states where two of them briefly
-- share a position. Made NOT DEFERRABLE, the assertion above would still pass
-- and the seed would start failing.
select assert(
  (select condeferrable from pg_constraint
    where conname = 'retail_product_sizes_order_unique'),
  'the display-order constraint is deferrable, so a run can be renumbered'
);

-- Scoped per product, not global. Every product starts its own run at zero and
-- a constraint that forgot the product_id would make the second product in the
-- catalogue unsavable.
insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp)
values ('aaaaaaaa-0000-0000-0000-00000000001f', 'order-test-cap', 'Order Test Cap', 'Brand',
        'men', 'Caps', 29900, 39900);

select assert(
  not violates_constraint($q$
    insert into retail_product_sizes (product_id, label, stock_qty, sort_order)
    values ('aaaaaaaa-0000-0000-0000-00000000001f', 'S', 5, 0)
  $q$),
  'while a different product may start its own run at the same position'
);

rollback;
