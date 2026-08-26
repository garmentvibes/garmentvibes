-- A customer cannot promote themselves.
--
-- ---------------------------------------------------------------------------
-- The hole
-- ---------------------------------------------------------------------------
--
-- `profiles` carries two columns that decide what their owner may do:
--
--   role                  — 'admin' is what is_staff() reads, and is_staff()
--                           is the whole of the staff side. Every order, every
--                           business's credit ledger, the notification outbox,
--                           product and promo CRUD.
--   wholesale_account_id  — what wholesale_account_id() reads: trade pricing,
--                           that business's quotes, invoices and claims.
--
-- The update policy is `using (auth.uid() = id)` and nothing else. Postgres
-- reuses that expression as the WITH CHECK when none is given, so the row must
-- still belong to the caller after the update — but every other column is
-- theirs to set. One statement, from any signed-in customer:
--
--   update profiles set role = 'admin' where id = auth.uid();
--
-- and is_staff() returns true for them from the next request onward. The same
-- statement against wholesale_account_id joins them to any approved business
-- they can name and hands them its trade prices and its ledger.
--
-- 0015 already decided this was not allowed. Its signup trigger clamps the
-- requested role to 'retail' or 'wholesale' precisely so that "promotion to
-- staff stays a deliberate act someone performs against the database". That
-- bolted the signup door and left this one open — the clamp holds for about as
-- long as it takes to sign up and then send an update.
--
-- ---------------------------------------------------------------------------
-- Why a trigger rather than a policy
-- ---------------------------------------------------------------------------
--
-- The rule is "you may not CHANGE these", and a WITH CHECK expression sees
-- only the proposed row — there is no OLD to compare against. A policy could
-- pin the columns to fixed values, but staff have to be able to change them,
-- and that is a comparison a policy cannot make either. A BEFORE trigger sees
-- both rows and can ask who is calling.
--
-- Column grants were the other candidate: `revoke update (role) on profiles
-- from authenticated` is the tidiest possible statement of this. It fails on
-- the fact that Supabase has no staff role — an admin is an ordinary
-- `authenticated` user with profiles.role = 'admin' — so revoking the column
-- from `authenticated` revokes it from the only people allowed to set it.
--
-- ---------------------------------------------------------------------------
-- Who is exempt
-- ---------------------------------------------------------------------------
--
-- Roles that already bypass RLS: the table owner, and service_role. Gating
-- them here would buy nothing — a caller who bypasses every policy on the
-- table can rewrite the row however it likes, trigger or no trigger — and
-- would break the seed, the fixtures, and any back-office script holding the
-- service key. Asked as `rolbypassrls` rather than by name, because the owner
-- is `postgres` locally and `supabase_admin` on the hosted project, and a list
-- of names is a list that goes stale.

-- SECURITY INVOKER — the default, and load-bearing here rather than merely
-- conservative. Inside a SECURITY DEFINER function `current_user` is the
-- function's owner, so the rolbypassrls test below would read the owner's
-- flag and answer "privileged" for every caller, exempting the exact people
-- this guard exists to stop. The body needs no privilege of its own: pg_roles
-- is world-readable and is_staff() is SECURITY DEFINER in its own right.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  -- `rolsuper` as well as `rolbypassrls`: a superuser bypasses RLS implicitly
  -- and its rolbypassrls flag is usually false, so testing the flag alone
  -- exempts service_role and not the owner running the migrations.
  v_privileged boolean := is_staff() or coalesce(
    (select rolsuper or rolbypassrls from pg_roles where rolname = current_user),
    false);
begin
  if v_privileged then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      raise exception 'only staff can change a profile''s role'
        using errcode = 'insufficient_privilege';
    end if;
    if new.wholesale_account_id is distinct from old.wholesale_account_id then
      raise exception 'only staff can attach a profile to a business account'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  -- INSERT. Unreachable while a profile row exists for every account, because
  -- profiles.id references auth.users and 0015's trigger fills it in at
  -- signup. It stops being unreachable the moment a row is deleted or a future
  -- flow writes profiles directly, and the two columns are the same two.
  if new.role = 'admin' then
    raise exception 'a profile cannot be created as staff'
      using errcode = 'insufficient_privilege';
  end if;
  if new.wholesale_account_id is not null then
    raise exception 'only staff can attach a profile to a business account'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- Same reasoning as 0011 and 0015: Supabase publishes every function in
-- `public` at /rest/v1/rpc/, and a trigger function called as an endpoint is
-- at best an error and at worst a surface. Postgres checks EXECUTE when the
-- trigger is created, against its creator — not at every firing, and not
-- against whoever's update fired it — so revoking here does not stop it.
revoke all on function public.guard_profile_privileges() from public, authenticated;

drop trigger if exists profiles_guard_privileges on profiles;
create trigger profiles_guard_privileges
  before insert or update on profiles
  for each row execute function public.guard_profile_privileges();
