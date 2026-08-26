-- ---------------------------------------------------------------------------
-- Can a customer make themselves staff?
--
-- Until 0025 the answer was yes, in one statement, from any signed-in account:
-- the update policy on `profiles` checks only that the row is yours, and
-- `role` is a column on that row. 0015 clamps the role at signup so that
-- "promotion to staff stays a deliberate act someone performs against the
-- database" — this file is what makes that true after signup as well.
--
-- The assertions are written against is_staff() and wholesale_account_id()
-- rather than against profiles.role, because those two functions are what the
-- policies actually call. A guard that leaves the column alone but lets the
-- function answer differently is not a guard.
-- ---------------------------------------------------------------------------

begin;

insert into auth.users (id, email) values
  ('cafe0000-0000-0000-0000-000000000001', 'climber@example.com'),
  ('cafe0000-0000-0000-0000-000000000002', 'realstaff@garmentvibes.com')
on conflict (id) do nothing;

insert into wholesale_accounts (id, business_name, contact_name, email, status, payment_terms)
values ('cafe0000-aaaa-0000-0000-000000000001', 'Someone Else Traders', 'Not Them',
        'else@example.com', 'approved', 'net30')
on conflict (id) do nothing;

insert into profiles (id, role, full_name, email) values
  ('cafe0000-0000-0000-0000-000000000001', 'retail', 'Climber', 'climber@example.com'),
  ('cafe0000-0000-0000-0000-000000000002', 'admin', 'Real Staff', 'realstaff@garmentvibes.com')
-- full_name is restated on conflict on purpose: 0015's signup trigger has
-- already created both rows and derived a name from the email local part, so
-- leaving it out leaves the fixture asserting against 'realstaff'.
on conflict (id) do update set
  role = excluded.role, full_name = excluded.full_name, wholesale_account_id = null;

-- ---------------------------------------------------------------------------
-- Promotion to staff
-- ---------------------------------------------------------------------------

select assert(
  as_user_error('cafe0000-0000-0000-0000-000000000001', $$
    update profiles set role = 'admin'
     where id = 'cafe0000-0000-0000-0000-000000000001'
  $$) like '%only staff can change a profile''s role%',
  'privileges: a customer cannot promote themselves to staff');

-- The one that matters. The column is the mechanism; this is the consequence.
select assert(
  is_staff_for('cafe0000-0000-0000-0000-000000000001') = false,
  'privileges: and is_staff() still says no');

-- The other door: the update policy itself, which is what confines a customer
-- to their own row in the first place.
--
-- Deliberately unfiltered. An UPDATE that names a column — in a WHERE clause
-- or in RETURNING — must also satisfy the SELECT policies, because Postgres
-- has to read the row to evaluate it, so `update … where id = <somebody
-- else's>` affects nothing whether the update policy exists or not. Written
-- that way this check passed against a table with no update policy at all.
-- Unfiltered, the update policy is the only thing choosing the rows.
select assert(
  as_user_error('cafe0000-0000-0000-0000-000000000001',
    $$update profiles set full_name = 'Renamed By A Stranger'$$) is null,
  'privileges: an unfiltered edit is filtered by policy, not refused');

select assert(
  (select full_name from profiles where id = 'cafe0000-0000-0000-0000-000000000002')
    = 'Real Staff',
  'privileges: and nobody else''s profile changed');

-- The control. Without it the check above passes just as well against a
-- statement that quietly did nothing at all.
select assert(
  (select full_name from profiles where id = 'cafe0000-0000-0000-0000-000000000001')
    = 'Renamed By A Stranger',
  'privileges: while their own name did change, so the statement really ran');

-- ---------------------------------------------------------------------------
-- Joining a business they do not belong to
-- ---------------------------------------------------------------------------

select assert(
  as_user_error('cafe0000-0000-0000-0000-000000000001', $$
    update profiles set wholesale_account_id = 'cafe0000-aaaa-0000-0000-000000000001'
     where id = 'cafe0000-0000-0000-0000-000000000001'
  $$) like '%only staff can attach a profile to a business account%',
  'privileges: a customer cannot join an approved business by updating their profile');

select assert(
  as_user_scalar('cafe0000-0000-0000-0000-000000000001',
    'select coalesce(wholesale_account_id::text, ''none'') from profiles where id = auth.uid()')
    = 'none',
  'privileges: and they still belong to no business');

-- ---------------------------------------------------------------------------
-- What a customer may still do
-- ---------------------------------------------------------------------------
--
-- A guard that blocks the account page is a guard that gets removed. Name,
-- phone and email are the fields the page exists to edit.

select assert(
  as_user_scalar('cafe0000-0000-0000-0000-000000000001', $$
    with u as (
      update profiles set full_name = 'Climber Renamed', phone = '9000000001'
       where id = 'cafe0000-0000-0000-0000-000000000001' returning 1
    ) select count(*) from u
  $$) = '1',
  'privileges: a customer can still edit their own name and phone');

-- An update that names `role` without changing it must not trip the guard —
-- PostgREST sends whole objects, so this is what a save from a form looks like.
select assert(
  as_user_error('cafe0000-0000-0000-0000-000000000001', $$
    update profiles set full_name = 'Climber Again', role = 'retail'
     where id = 'cafe0000-0000-0000-0000-000000000001'
  $$) is null,
  'privileges: writing back the role they already have is not a change');

-- ---------------------------------------------------------------------------
-- What staff may do
-- ---------------------------------------------------------------------------

select assert(
  as_user_error('cafe0000-0000-0000-0000-000000000002', $$
    update profiles set role = 'wholesale',
                        wholesale_account_id = 'cafe0000-aaaa-0000-0000-000000000001'
     where id = 'cafe0000-0000-0000-0000-000000000001'
  $$) is null,
  'privileges: staff can attach a customer to a business');

select assert(
  as_user_scalar('cafe0000-0000-0000-0000-000000000001',
    'select role::text from profiles where id = auth.uid()') = 'wholesale',
  'privileges: and the change took');

-- ---------------------------------------------------------------------------
-- Creating a profile that arrives already privileged
-- ---------------------------------------------------------------------------
--
-- Unreachable while every account has a profile row, and one deletion away
-- from reachable. The insert policy checks only that the id is the caller's.

insert into auth.users (id, email)
values ('cafe0000-0000-0000-0000-000000000003', 'fresh@example.com')
on conflict (id) do nothing;
delete from profiles where id = 'cafe0000-0000-0000-0000-000000000003';

select assert(
  as_user_error('cafe0000-0000-0000-0000-000000000003', $$
    insert into profiles (id, role, full_name, email)
    values ('cafe0000-0000-0000-0000-000000000003', 'admin', 'Fresh', 'fresh@example.com')
  $$) like '%a profile cannot be created as staff%',
  'privileges: a profile cannot be created as staff');

select assert(
  as_user_error('cafe0000-0000-0000-0000-000000000003', $$
    insert into profiles (id, role, full_name, email, wholesale_account_id)
    values ('cafe0000-0000-0000-0000-000000000003', 'wholesale', 'Fresh',
            'fresh@example.com', 'cafe0000-aaaa-0000-0000-000000000001')
  $$) like '%only staff can attach a profile to a business account%',
  'privileges: nor created already inside a business');

select assert(
  as_user_error('cafe0000-0000-0000-0000-000000000003', $$
    insert into profiles (id, role, full_name, email)
    values ('cafe0000-0000-0000-0000-000000000003', 'retail', 'Fresh', 'fresh@example.com')
  $$) is null,
  'privileges: an ordinary profile is still fine');

-- ---------------------------------------------------------------------------
-- The exemption
-- ---------------------------------------------------------------------------
--
-- service_role and the table owner bypass RLS entirely, so gating them here
-- would buy nothing and break the seed and every fixture. Asserted so that
-- narrowing the guard to `is_staff()` alone shows up as a failure here rather
-- than as a broken migration on somebody's machine.

select assert(
  raises($$
    update profiles set role = 'admin'
     where id = 'cafe0000-0000-0000-0000-000000000003'
  $$) is null,
  'privileges: the owner is exempt, because it bypasses RLS anyway');

rollback;
