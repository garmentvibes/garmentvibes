-- ---------------------------------------------------------------------------
-- handle_new_user()
--
-- One assertion here matters more than the rest: a signup cannot make itself
-- staff. `raw_user_meta_data` is whatever the browser passed to signUp(), and
-- `is_staff()` gates the admin panel and every staff RLS policy — so a role
-- copied out of that metadata would be a working privilege escalation reached
-- by typing one extra field into a public endpoint.
--
-- The rest is ordinary: a profile appears, it carries what was given, and
-- re-applying the migration leaves a promoted admin promoted.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- A profile appears for a new account
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values ('dddddddd-0000-0000-0000-000000000001', 'new@example.com',
        '{"full_name":"New Customer"}'::jsonb);

select assert(
  (select count(*) from profiles where id = 'dddddddd-0000-0000-0000-000000000001') = 1,
  'signup: a profile is created for a new account'
);

select assert(
  (select full_name from profiles where id = 'dddddddd-0000-0000-0000-000000000001')
    = 'New Customer',
  'signup: it carries the name that was given'
);

select assert(
  (select email from profiles where id = 'dddddddd-0000-0000-0000-000000000001')
    = 'new@example.com',
  'signup: and the email the account was created with'
);

select assert(
  (select role from profiles where id = 'dddddddd-0000-0000-0000-000000000001') = 'retail',
  'signup: an account that asked for nothing is a retail customer'
);

-- ---------------------------------------------------------------------------
-- The escalation attempt
-- ---------------------------------------------------------------------------

-- This is the shape of the attack, verbatim:
--
--   supabase.auth.signUp({ email, password, options: { data: { role: 'admin' } } })
--
-- Everything in `data` lands in raw_user_meta_data, unfiltered, chosen by
-- whoever made the request.
insert into auth.users (id, email, raw_user_meta_data)
values ('dddddddd-0000-0000-0000-000000000002', 'sneaky@example.com',
        '{"full_name":"Sneaky","role":"admin"}'::jsonb);

select assert(
  (select role from profiles where id = 'dddddddd-0000-0000-0000-000000000002') = 'retail',
  'signup: an account cannot make itself admin by asking to be one'
);

select assert(
  not is_staff_for('dddddddd-0000-0000-0000-000000000002'),
  'signup: and is_staff() does not recognise it, which is what actually gates /admin'
);

-- Anything unrecognised falls back rather than erroring or being stored.
insert into auth.users (id, email, raw_user_meta_data)
values ('dddddddd-0000-0000-0000-000000000003', 'odd@example.com',
        '{"role":"superuser"}'::jsonb);

select assert(
  (select role from profiles where id = 'dddddddd-0000-0000-0000-000000000003') = 'retail',
  'signup: a role that is not a role at all becomes retail'
);

-- ---------------------------------------------------------------------------
-- The one role a signup MAY choose
-- ---------------------------------------------------------------------------

-- A trade buyer picks the wholesale portal at signup, and that choice carries
-- no privilege on its own: `is_approved_wholesale()` also requires an approved
-- wholesale_accounts row, which only staff can grant.
insert into auth.users (id, email, raw_user_meta_data)
values ('dddddddd-0000-0000-0000-000000000004', 'trade@example.com',
        '{"full_name":"Trade Buyer","role":"wholesale"}'::jsonb);

select assert(
  (select role from profiles where id = 'dddddddd-0000-0000-0000-000000000004') = 'wholesale',
  'signup: a trade buyer may choose the wholesale role'
);

select assert(
  not is_staff_for('dddddddd-0000-0000-0000-000000000004'),
  'signup: which still is not staff'
);

-- ---------------------------------------------------------------------------
-- Re-applying the migration
-- ---------------------------------------------------------------------------

-- Staff are promoted by hand, per supabase/README.md, and migrations are
-- written to be safely re-appliable. The backfill at the bottom of 0015 walks
-- every account without a profile — so the property that matters is that
-- neither it nor a re-fired trigger can write over a row that already exists.
-- Getting this wrong demotes an admin to retail and locks them out of /admin.
--
-- Note the ordering: profiles.id references auth.users(id), so a profile
-- cannot exist before its account. The account comes first, the trigger makes
-- a retail profile, and the promotion happens after — which is the only
-- sequence the schema actually permits, and therefore the one to test.
insert into auth.users (id, email, raw_user_meta_data)
values ('dddddddd-0000-0000-0000-000000000005', 'staff@garmentvibes.com',
        '{"full_name":"Promoted First"}'::jsonb);

update profiles set role = 'admin'
 where id = 'dddddddd-0000-0000-0000-000000000005';

-- Re-run the backfill exactly as 0015 would on a second apply.
insert into profiles (id, email, full_name, role)
select u.id, u.email,
       coalesce(nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
                split_part(coalesce(u.email, 'customer'), '@', 1)),
       'retail'::user_role
from auth.users u
where not exists (select 1 from profiles p where p.id = u.id)
on conflict (id) do nothing;

select assert(
  (select role from profiles where id = 'dddddddd-0000-0000-0000-000000000005') = 'admin',
  'signup: re-applying the migration does not demote a promoted admin'
);

select assert(
  is_staff_for('dddddddd-0000-0000-0000-000000000005'),
  'signup: and they are still staff as far as is_staff() is concerned'
);

-- ---------------------------------------------------------------------------
-- Reachability
-- ---------------------------------------------------------------------------

-- Supabase exposes every function in `public` at /rest/v1/rpc/. This one is
-- SECURITY DEFINER and writes profiles, so it must not be callable directly —
-- the trigger still fires, because Postgres checks EXECUTE against the table
-- owner rather than whoever's insert fired it.
select assert(
  not has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE'),
  'signup: the trigger function is not callable by a signed-out visitor'
);

select assert(
  not has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE'),
  'signup: nor by a signed-in one'
);

-- Whole-file invariant: every account has exactly one profile, and none of
-- them is staff except the one that was promoted deliberately.
select assert(
  not exists (
    select 1 from auth.users u
     where not exists (select 1 from profiles p where p.id = u.id)
  ),
  'signup: every account has a profile'
);

select assert(
  (select count(*) from profiles where role = 'admin') = 1,
  'signup: exactly one profile is staff, and it is the hand-promoted one'
);

rollback;
