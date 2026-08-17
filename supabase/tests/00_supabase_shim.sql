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
