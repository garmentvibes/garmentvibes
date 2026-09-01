-- ---------------------------------------------------------------------------
-- The policy helpers are reachable by the policies and by nobody else.
--
-- 0026 moved is_staff(), wholesale_account_id() and is_approved_wholesale()
-- into app_private because PostgREST publishes everything in `public` at
-- /rest/v1/rpc/, and these are predicates, not endpoints.
--
-- The obvious alternative — revoke EXECUTE and leave them where they are —
-- takes the site down, and the two checks at the top of this file are the ones
-- that say so. A policy expression is permission-checked as the role running
-- the query, and all thirty-nine policies that call these are `to public`, so
-- anon and authenticated both evaluate them. Anonymous product browsing is
-- granted by a different, permissive policy, but permissive policies are OR'd
-- and NOT short-circuited: the staff branch runs anyway, and if its predicate
-- is unreachable the visitor gets `permission denied for function is_staff`
-- instead of a catalogue.
--
-- So these two assertions are not "does the site work". They are the reason
-- the grants below have to stay, kept next to the grants so that anybody
-- tidying them away sees what happens.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

begin;

insert into auth.users (id, email) values
  ('c0ffee00-0000-0000-0000-000000000001', 'shopper@example.com')
on conflict (id) do nothing;

insert into profiles (id, role, full_name, email) values
  ('c0ffee00-0000-0000-0000-000000000001', 'retail', 'Shopper', 'shopper@example.com')
on conflict (id) do update set role = excluded.role;

-- ---------------------------------------------------------------------------
-- The policies still evaluate
-- ---------------------------------------------------------------------------

select assert(
  anon_error('select count(*) from retail_products') is null,
  'helpers: a signed-out visitor can still browse the catalogue');

select assert(
  as_user_error('c0ffee00-0000-0000-0000-000000000001',
    'select count(*) from retail_orders') is null,
  'helpers: and a signed-in customer can still read their orders');

-- Both of the above pass trivially if the staff policies were simply deleted,
-- so the gate is checked in the same breath.
select assert(
  visible_count('c0ffee00-0000-0000-0000-000000000001',
    'select count(*) from notifications') = 0,
  'helpers: while the staff-only outbox stays shut to a customer');

select assert(
  is_staff_for('c0ffee00-0000-0000-0000-000000000001') = false,
  'helpers: and the relocated is_staff() still answers');

-- ---------------------------------------------------------------------------
-- The endpoints are gone
-- ---------------------------------------------------------------------------
--
-- Asked of the catalogue rather than by calling them: `public.is_staff()` not
-- existing is exactly what removes the /rest/v1/rpc/is_staff route, and it is
-- a fact about pg_proc, not about who may execute what.

select assert(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('is_staff', 'wholesale_account_id', 'is_approved_wholesale')) = 0,
  'helpers: none of the three is in the schema PostgREST publishes');

select assert(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.proname in ('is_staff', 'wholesale_account_id', 'is_approved_wholesale')) = 3,
  'helpers: all three are in app_private instead');

-- ---------------------------------------------------------------------------
-- Nothing was left behind
-- ---------------------------------------------------------------------------
--
-- A policy still naming the old function would have failed the migration, so
-- this is belt and braces — but a policy added later by copy-paste would not,
-- and that is the case worth catching.

select assert(
  (select count(*) from pg_policy pol join pg_class c on c.oid = pol.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ||
           coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
          ~ '(^|[^.])\m(is_staff|wholesale_account_id|is_approved_wholesale)\(\)') = 0,
  'helpers: no policy calls an unqualified helper');

select assert(
  (select count(*) from pg_policy pol join pg_class c on c.oid = pol.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ||
           coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
          like '%app_private.%') = 39,
  'helpers: and all thirty-nine reach them through app_private');

-- ---------------------------------------------------------------------------
-- The schema itself
-- ---------------------------------------------------------------------------

select assert(
  has_schema_privilege('anon', 'app_private', 'usage')
    and has_schema_privilege('authenticated', 'app_private', 'usage'),
  'helpers: both request roles can reach the schema');

-- USAGE on the schema is not enough on its own, and the two are removable
-- independently.
select assert(
  has_function_privilege('anon', 'app_private.is_staff()', 'execute')
    and has_function_privilege('authenticated', 'app_private.is_staff()', 'execute'),
  'helpers: and execute the predicate their policies are written in');

rollback;
