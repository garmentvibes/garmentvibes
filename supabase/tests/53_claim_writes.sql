-- ---------------------------------------------------------------------------
-- Raising a claim versus settling one.
--
-- The wholesale half of 52, and 0007 gates the buyer's insert harder than it
-- does returns — on three things at once:
--
--   status = 'submitted'  · a claim cannot arrive already granted
--   is_approved_wholesale() · an unapproved signup cannot file at all
--   account_id = wholesale_account_id() · nor file against another business
--
-- A claim is a request for money back, so all three matter. None of them were
-- load-bearing until now: the buyer's form and the admin queue both used a
-- zustand store, so nothing ever reached these tables.
-- ---------------------------------------------------------------------------

begin;

insert into auth.users (id, email) values
  ('b2b2b2b2-0000-0000-0000-000000000001', 'claims-staff@garmentvibes.com'),
  ('b2b2b2b2-0000-0000-0000-000000000002', 'buyer@approved.example'),
  ('b2b2b2b2-0000-0000-0000-000000000003', 'buyer@pending.example'),
  ('b2b2b2b2-0000-0000-0000-000000000004', 'buyer@rival.example')
on conflict (id) do nothing;

insert into wholesale_accounts (id, business_name, contact_name, email, status, payment_terms)
values
  ('b2b2b2b2-aaaa-0000-0000-000000000001', 'Approved Traders', 'Approved Buyer',
   'buyer@approved.example', 'approved', 'net30'),
  ('b2b2b2b2-aaaa-0000-0000-000000000002', 'Pending Textiles', 'Pending Buyer',
   'buyer@pending.example', 'pending', 'prepay'),
  ('b2b2b2b2-aaaa-0000-0000-000000000003', 'Rival Traders', 'Rival Buyer',
   'buyer@rival.example', 'approved', 'net30')
on conflict (id) do nothing;

insert into profiles (id, role, full_name, email, wholesale_account_id) values
  ('b2b2b2b2-0000-0000-0000-000000000001', 'admin', 'Claims Staff',
   'claims-staff@garmentvibes.com', null),
  ('b2b2b2b2-0000-0000-0000-000000000002', 'wholesale', 'Approved Buyer',
   'buyer@approved.example', 'b2b2b2b2-aaaa-0000-0000-000000000001'),
  ('b2b2b2b2-0000-0000-0000-000000000003', 'wholesale', 'Pending Buyer',
   'buyer@pending.example', 'b2b2b2b2-aaaa-0000-0000-000000000002'),
  ('b2b2b2b2-0000-0000-0000-000000000004', 'wholesale', 'Rival Buyer',
   'buyer@rival.example', 'b2b2b2b2-aaaa-0000-0000-000000000003')
on conflict (id) do update set
  role = excluded.role, wholesale_account_id = excluded.wholesale_account_id;

insert into wholesale_quotes (
  id, user_id, account_id, status, total_estimate, reference,
  business_name, contact_name, email
) values (
  'b2b2b2b2-cccc-0000-0000-000000000001', 'b2b2b2b2-0000-0000-0000-000000000002',
  'b2b2b2b2-aaaa-0000-0000-000000000001', 'shipped', 5256000, 'GV-Q-8001',
  'Approved Traders', 'Approved Buyer', 'buyer@approved.example'
) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Raising
-- ---------------------------------------------------------------------------

select assert(
  as_user_scalar('b2b2b2b2-0000-0000-0000-000000000002', $$
    with raised as (
      insert into wholesale_claims (
        reference, quote_id, account_id, business_name, contact_name, email,
        reason, requested_resolution
      ) values (
        'CLM-8001-A', 'b2b2b2b2-cccc-0000-0000-000000000001',
        'b2b2b2b2-aaaa-0000-0000-000000000001',
        'Approved Traders', 'Approved Buyer', 'buyer@approved.example',
        'short_shipment', 'credit_note'
      ) returning 1
    ) select count(*) from raised
  $$) = '1',
  'claims: an approved buyer can raise a claim on their own consignment');

select assert(
  is_denied('b2b2b2b2-0000-0000-0000-000000000002', $$
    insert into wholesale_claims (
      reference, quote_id, account_id, business_name, contact_name, email,
      reason, requested_resolution, status
    ) values (
      'CLM-8001-B', 'b2b2b2b2-cccc-0000-0000-000000000001',
      'b2b2b2b2-aaaa-0000-0000-000000000001',
      'Approved Traders', 'Approved Buyer', 'buyer@approved.example',
      'short_shipment', 'credit_note', 'approved'
    )
  $$),
  'claims: but cannot raise one that is already approved');

-- Filing against another business's consignment would be a credit note paid to
-- the wrong company.
--
-- The buyer here is APPROVED, and deliberately so. An earlier version used the
-- pending buyer, which passed for the wrong reason: is_approved_wholesale()
-- turned them away before the ownership check was ever reached, so removing
-- `account_id = wholesale_account_id()` from the policy broke nothing and the
-- test still passed. Two doors, and it only proved one was shut.
select assert(
  is_denied('b2b2b2b2-0000-0000-0000-000000000004', $$
    insert into wholesale_claims (
      reference, quote_id, account_id, business_name, contact_name, email,
      reason, requested_resolution
    ) values (
      'CLM-8001-C', 'b2b2b2b2-cccc-0000-0000-000000000001',
      'b2b2b2b2-aaaa-0000-0000-000000000001',
      'Rival Traders', 'Rival Buyer', 'buyer@rival.example',
      'short_shipment', 'credit_note'
    )
  $$),
  'claims: an approved buyer cannot file against another business''s account');

-- An account still awaiting approval has no trading relationship to claim on.
select assert(
  is_denied('b2b2b2b2-0000-0000-0000-000000000003', $$
    insert into wholesale_claims (
      reference, quote_id, account_id, business_name, contact_name, email,
      reason, requested_resolution
    ) values (
      'CLM-8001-D', 'b2b2b2b2-cccc-0000-0000-000000000001',
      'b2b2b2b2-aaaa-0000-0000-000000000002',
      'Pending Textiles', 'Pending Buyer', 'buyer@pending.example',
      'short_shipment', 'credit_note'
    )
  $$),
  'claims: nor can an unapproved account raise one at all');

-- ---------------------------------------------------------------------------
-- The quantity constraint
-- ---------------------------------------------------------------------------

-- The one that stops a typo becoming a credit note worth more than the
-- invoice. Checked as the table owner: this is a constraint, not a policy.
select assert(
  violates_constraint($$
    insert into wholesale_claim_lines (claim_id, sku, product_name, billed_qty, claimed_qty, price_per_unit)
    select id, 'GV-WS-TEE-001', 'Cotton Tee', 240, 300, 21900
      from wholesale_claims where reference = 'CLM-8001-A'
  $$),
  'claims: cannot claim for more units than were billed');

select assert(
  violates_constraint($$
    insert into wholesale_claim_lines (claim_id, sku, product_name, billed_qty, claimed_qty, price_per_unit)
    select id, 'GV-WS-TEE-001', 'Cotton Tee', 240, 0, 21900
      from wholesale_claims where reference = 'CLM-8001-A'
  $$),
  'claims: and a claim for nothing is not a claim');

-- ---------------------------------------------------------------------------
-- Settling
-- ---------------------------------------------------------------------------

select assert(
  as_user_scalar('b2b2b2b2-0000-0000-0000-000000000002', $$
    with moved as (
      update wholesale_claims set status = 'approved'
       where reference = 'CLM-8001-A' returning 1
    ) select count(*) from moved
  $$) = '0',
  'claims: a buyer cannot approve their own claim');

select assert(
  (select status from wholesale_claims where reference = 'CLM-8001-A') = 'submitted',
  'claims: and it is still waiting on us');

-- A settled claim that records neither what was granted nor when is one nobody
-- can audit, which is why 0007 refuses it — and why the action stamps both.
select assert(
  violates_constraint($$
    update wholesale_claims set status = 'settled'
     where reference = 'CLM-8001-A'
  $$),
  'claims: settling without recording the resolution is refused');

select assert(
  as_user_scalar('b2b2b2b2-0000-0000-0000-000000000001', $$
    with moved as (
      update wholesale_claims
         set status = 'settled',
             settled_resolution = 'credit_note',
             settled_at = now()
       where reference = 'CLM-8001-A' returning 1
    ) select count(*) from moved
  $$) = '1',
  'claims: staff can settle it when the resolution is recorded');

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

select assert(
  visible_count('b2b2b2b2-0000-0000-0000-000000000003',
    $$select count(*) from wholesale_claims where reference = 'CLM-8001-A'$$) = 0,
  'claims: one business cannot read another''s claim');

select assert(
  visible_count('b2b2b2b2-0000-0000-0000-000000000001',
    $$select count(*) from wholesale_claims where reference = 'CLM-8001-A'$$) = 1,
  'claims: staff see every claim');

-- ---------------------------------------------------------------------------
-- The statuses the app can set
-- ---------------------------------------------------------------------------

select assert(
  (select count(*) from unnest(enum_range(null::claim_status)) as v
    where v::text in ('submitted','under_review','approved','rejected','settled')) = 5,
  'claims: every status the panel offers exists in the enum');

rollback;
