-- Local stand-in for the parts of Supabase our migrations depend on.
--
-- NOT a migration and never applied to a real project: Supabase provides all
-- of this already. It exists so `npm run qa:schema` can apply the real
-- migration files to a throwaway Postgres and prove they work — schema that
-- has never been executed is a document, not a database.
--
-- Kept deliberately thin. Anything beyond what the migrations actually
-- reference would be inventing behaviour we then "verify" against, which is
-- worse than not testing at all.

-- Supabase's three request roles. Policies written `to authenticated` fail to
-- create if the role is missing, so an absent role here would look like a
-- broken migration.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;

-- Only the columns our foreign keys and triggers touch. The real table has
-- far more; adding them here would imply we test against them.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Mirrors one of Supabase's own definitions: the authenticated user comes
-- from a request-scoped GUC, so tests switch users with `set local`.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

grant usage on schema auth to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Default privileges — the part whose absence made a whole class of test lie
-- ---------------------------------------------------------------------------
--
-- A hosted Supabase project carries these, so every function created in
-- `public` arrives already holding EXECUTE for the three request roles —
-- granted EXPLICITLY, not through PUBLIC. That matters because
-- `revoke all on function ... from public` does not remove an explicit grant.
-- A migration that revokes only from `public` therefore shuts the door here
-- and leaves it open on the real project.
--
-- Without these lines the local database is not a smaller Supabase, it is a
-- different one, and every `permission denied for function` assertion is a
-- claim about a database we do not ship to. `npm run qa:drift` measured the
-- gap: seven functions held EXECUTE for service_role on the project and for
-- nobody locally, which is exactly this.
--
-- Applied to the roles Supabase names, in the schema Supabase names them in.
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

-- The same grant for what already exists, since the migrations run after this
-- file and default privileges only apply to objects created afterwards — but
-- a future contributor moving files around should not silently lose it.
grant execute on all functions in schema public to anon, authenticated, service_role;
