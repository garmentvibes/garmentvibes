-- ---------------------------------------------------------------------------
-- Who may put money on the ledger.
--
-- 20_invariants covers the arithmetic — the trigger deriving status from the
-- payments, a deleted receipt walking it back, a write-off surviving a late
-- payment. 10_rls_isolation covers who may *read* an invoice.
--
-- Neither covers who may WRITE one, and until now nothing did, because
-- /admin/credit recorded payments into a zustand store and no code path
-- reached these tables at all. Moving those writes to the database makes this
-- the boundary that matters:
--
--   a buyer who could insert a payment against their own invoice could mark
--   themselves paid, and the trigger would faithfully move the invoice to
--   `paid` on the strength of it.
--
-- 0008 gives buyers select and nothing else, deliberately — "issuing invoices
-- and recording receipts is ours to do". This is that sentence, as a test.
-- ---------------------------------------------------------------------------

begin;

insert into auth.users (id, email) values
  ('ffffffff-aaaa-0000-0000-000000000001', 'credit-staff@garmentvibes.com'),
  ('ffffffff-bbbb-0000-0000-000000000002', 'owner@debtor.example')
on conflict (id) do nothing;

insert into profiles (id, role, full_name, email) values
  ('ffffffff-aaaa-0000-0000-000000000001', 'admin', 'Credit Staff', 'credit-staff@garmentvibes.com'),
  ('ffffffff-bbbb-0000-0000-000000000002', 'wholesale', 'Debtor Owner', 'owner@debtor.example')
on conflict (id) do update set role = excluded.role;

insert into wholesale_accounts (id, business_name, contact_name, email, status, payment_terms)
values ('ffffffff-cccc-0000-0000-000000000003',
        'Debtor Traders', 'Debtor Owner', 'owner@debtor.example', 'approved', 'net30')
on conflict (id) do nothing;

-- Membership is not a column on the account: `wholesale_account_id()` resolves
-- it from the profile, or failing that from an active row in
-- `wholesale_account_members`. The profile is the shorter of the two here.
update profiles set wholesale_account_id = 'ffffffff-cccc-0000-0000-000000000003'
 where id = 'ffffffff-bbbb-0000-0000-000000000002';

insert into credit_invoices (
  id, reference, account_id, business_name, contact_name, email, amount, due_on
) values (
  'ffffffff-dddd-0000-0000-000000000004', 'GV-INV-9100',
  'ffffffff-cccc-0000-0000-000000000003', 'Debtor Traders', 'Debtor Owner',
  'owner@debtor.example', 250000, current_date + 30
) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The buyer
-- ---------------------------------------------------------------------------

select assert(
  visible_count('ffffffff-bbbb-0000-0000-000000000002',
    $$select count(*) from credit_invoices where reference = 'GV-INV-9100'$$) = 1,
  'credit: a business can read its own invoice');

-- The one that matters. No insert policy exists for a buyer, so this changes
-- nothing — RLS filters what an insert may write, so an unauthorised one is
-- refused rather than silently accepted.
select assert(
  is_denied('ffffffff-bbbb-0000-0000-000000000002', $$
    insert into credit_payments (invoice_id, amount, method)
    values ('ffffffff-dddd-0000-0000-000000000004', 250000, 'bank_transfer')
  $$),
  'credit: a business cannot record a payment against its own invoice');

select assert(
  (select status from credit_invoices where reference = 'GV-INV-9100') = 'open',
  'credit: and the invoice is still owed in full');

-- Nor by the other route to the same result.
select assert(
  as_user_scalar('ffffffff-bbbb-0000-0000-000000000002', $$
    with moved as (
      update credit_invoices set status = 'paid'
       where reference = 'GV-INV-9100' returning 1
    ) select count(*) from moved
  $$) = '0',
  'credit: nor mark the invoice paid directly');

select assert(
  (select status from credit_invoices where reference = 'GV-INV-9100') = 'open',
  'credit: and that left the status alone too');

-- Writing their own debt off would be the same trick with a different word.
select assert(
  as_user_scalar('ffffffff-bbbb-0000-0000-000000000002', $$
    with moved as (
      update credit_invoices set status = 'written_off'
       where reference = 'GV-INV-9100' returning 1
    ) select count(*) from moved
  $$) = '0',
  'credit: nor write their own debt off');

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------

select assert(
  as_user_scalar('ffffffff-aaaa-0000-0000-000000000001', $$
    with added as (
      insert into credit_payments (invoice_id, amount, method, recorded_by)
      values ('ffffffff-dddd-0000-0000-000000000004', 100000, 'upi',
              'ffffffff-aaaa-0000-0000-000000000001')
      returning 1
    ) select count(*) from added
  $$) = '1',
  'credit: staff can record a receipt');

-- The insert is the whole write. Status follows from the trigger, which is why
-- the action does not set it — and this is what proves the action does not
-- need to.
select assert(
  (select status from credit_invoices where reference = 'GV-INV-9100') = 'part_paid',
  'credit: and the status follows from the payment, not from the caller');

select assert(
  (select recorded_by from credit_payments
    where invoice_id = 'ffffffff-dddd-0000-0000-000000000004')
    = 'ffffffff-aaaa-0000-0000-000000000001',
  'credit: with the staff member who keyed it in recorded against it');

select assert(
  as_user_scalar('ffffffff-aaaa-0000-0000-000000000001', $$
    with moved as (
      update credit_invoices set status = 'written_off'
       where reference = 'GV-INV-9100' returning 1
    ) select count(*) from moved
  $$) = '1',
  'credit: staff can write an invoice off');

-- ---------------------------------------------------------------------------
-- Signed out
-- ---------------------------------------------------------------------------

select assert(
  anon_denied($$select count(*) from credit_invoices$$),
  'credit: a signed-out visitor cannot read the ledger');

select assert(
  anon_denied($$
    insert into credit_payments (invoice_id, amount, method)
    values ('ffffffff-dddd-0000-0000-000000000004', 1, 'upi')
  $$),
  'credit: nor write to it');

rollback;
