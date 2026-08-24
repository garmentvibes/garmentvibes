-- A profile for every account, created the moment the account is.
--
-- `profiles` is what the app reads to know who someone is: their name, their
-- role, and (for a trade buyer) which business they belong to. Nothing created
-- it. Staff have been promoted by hand since 0001 — see supabase/README.md —
-- and that worked because there was exactly one of them; it does not scale to
-- customers signing themselves up.
--
-- Doing it in a trigger rather than in the signup action, because a profile is
-- a fact about an account existing rather than a step in one particular flow.
-- The app's own signup is only one of the ways an account appears: email
-- confirmation delays the session so there is no signed-in user to insert as,
-- a password reset can precede a first sign-in, and a future OAuth or
-- magic-link route would each need their own copy of the insert. One trigger
-- covers all of them, including the ones that do not exist yet.

-- ---------------------------------------------------------------------------
-- The role is NOT taken from the account's own metadata, except within limits
-- ---------------------------------------------------------------------------
--
-- `raw_user_meta_data` is whatever the client passed to signUp(). It is
-- attacker-controlled: anyone who can reach the signup endpoint can put
-- anything in it. Copying a `role` straight out of it would mean
--
--     supabase.auth.signUp({ ..., options: { data: { role: 'admin' } } })
--
-- is a working privilege escalation, and `is_staff()` gates the entire admin
-- panel and every staff RLS policy.
--
-- So the value is clamped: 'retail' or 'wholesale' — the two a person may
-- legitimately choose between at signup — and anything else, including
-- 'admin', becomes 'retail'. Promotion to staff stays a deliberate act
-- someone performs against the database.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requested text := new.raw_user_meta_data ->> 'role';
  v_role user_role;
begin
  v_role := case
    when v_requested = 'wholesale' then 'wholesale'::user_role
    else 'retail'::user_role
  end;

  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    -- `full_name` is NOT NULL, and signUp() does not require metadata — so a
    -- customer who signs up with just an email and password would otherwise
    -- fail this insert. Because the trigger fires AFTER INSERT on auth.users,
    -- that failure takes the account creation down with it: the signup returns
    -- a 500 and no account exists. The local part of the email is a poor name
    -- and a great deal better than a broken signup; the account page lets them
    -- change it.
    coalesce(
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
      split_part(coalesce(new.email, 'customer'), '@', 1)
    ),
    v_role
  )
  -- Defensive, and unreachable as things stand: profiles.id references
  -- auth.users(id), so no profile can exist before the insert that fires this
  -- trigger. It is here for a future flow that writes profiles directly — and
  -- because `do nothing` is the only safe answer if one ever does. It is NOT
  -- what protects a hand-promoted admin from being demoted; that is the
  -- `where not exists` on the backfill below, which is the statement that
  -- actually runs against a database with profiles already in it.
  --
  -- A mutation test that swaps this for `do update` survives, correctly: there
  -- is no reachable behaviour to detect.
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger functions are not API endpoints. Supabase exposes everything in
-- `public` at /rest/v1/rpc/, and this one is SECURITY DEFINER and writes
-- profiles — the same reasoning as 0011 applied to recompute_invoice_status().
-- Postgres checks EXECUTE against the table owner when firing a trigger, not
-- against whoever's insert fired it, so revoking here does not stop the
-- trigger.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

-- Any account that predates the trigger. Currently none in the live project,
-- but a migration that only works going forward leaves a database whose
-- answer to "who is this?" depends on when they signed up.
insert into profiles (id, email, full_name, role)
select
  u.id,
  u.email,
  coalesce(
    nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
    split_part(coalesce(u.email, 'customer'), '@', 1)
  ),
  'retail'::user_role
from auth.users u
where not exists (select 1 from profiles p where p.id = u.id)
on conflict (id) do nothing;
