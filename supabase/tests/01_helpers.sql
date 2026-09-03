-- Assertion helpers shared by the test files.
--
-- Applied once by the runner and left in the database, so each test file can
-- roll its own transaction back without taking these with it.

create or replace function assert(condition boolean, description text)
returns void language plpgsql as $$
begin
  if condition then
    raise notice 'ok: %', description;
  else
    raise exception 'FAILED: %', description;
  end if;
end;
$$;

/**
 * Row count visible to a given user, as that user.
 *
 * Wrapped in a function so each probe gets its own scope for the role switch —
 * `set local role` inside a plpgsql block reverts when the block exits, which
 * keeps one probe from leaking its identity into the next. Passing null for
 * as_user probes as a signed-out visitor.
 */
create or replace function visible_count(as_user uuid, query text)
returns integer language plpgsql as $$
declare
  result integer;
begin
  perform set_config('request.jwt.claim.sub', coalesce(as_user::text, ''), true);
  set local role authenticated;
  execute query into result;
  reset role;
  return result;
end;
$$;

/** As visible_count, but for a signed-out request. */
create or replace function anon_count(query text)
returns integer language plpgsql as $$
declare
  result integer;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  execute query into result;
  reset role;
  return result;
end;
$$;

/**
 * as_user_scalar()'s counterpart for a signed-out request.
 *
 * Needed wherever a function is meant to work without an account and the thing
 * being asserted is its answer rather than whether it was refused. Passing null
 * to as_user_scalar() is not the same probe: it clears the subject claim but
 * still runs as `authenticated`, so it exercises an expired session rather than
 * a visitor who never had one — and the two have different grants.
 */
create or replace function anon_scalar(query text)
returns text language plpgsql as $$
declare
  result text;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  execute query into result;
  reset role;
  return result;
end;
$$;

/**
 * True when a signed-out request is refused outright.
 *
 * Distinct from anon_count() returning zero: this is the stronger guarantee
 * that `anon` has no table privilege at all, so the request is rejected before
 * any policy is consulted.
 */
create or replace function anon_denied(statement text)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin
    execute statement;
    reset role;
    return false;
  exception when insufficient_privilege or check_violation then
    reset role;
    return true;
  end;
end;
$$;

/** True when the statement is rejected — by policy, or by a missing grant. */
create or replace function is_denied(as_user uuid, statement text)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(as_user::text, ''), true);
  set local role authenticated;
  begin
    execute statement;
    reset role;
    return false;
  exception
    -- A policy violation on INSERT raises check_violation; a blocked UPDATE or
    -- DELETE simply affects nothing, so those are probed by counting instead.
    when insufficient_privilege or check_violation then
      reset role;
      return true;
  end;
end;
$$;

/**
 * True when a statement run as the table owner violates a constraint.
 *
 * Deliberately not role-switched: constraints are not RLS, and a check that
 * only holds for unprivileged callers is not a constraint at all.
 */
create or replace function violates_constraint(statement text)
returns boolean language plpgsql as $$
begin
  begin
    execute statement;
    return false;
  exception
    when check_violation or unique_violation or foreign_key_violation
      or not_null_violation or exclusion_violation then
      return true;
  end;
end;
$$;

/**
 * Runs a statement as a signed-in user and returns the error it raised, or
 * null if it succeeded.
 *
 * is_denied() answers "was this refused?" for the two errors RLS and grants
 * produce. A function that validates its own arguments raises for many more
 * reasons than that, and "it was rejected" is the weak half of what matters —
 * a price check that rejects an oversell for the *wrong reason* is a check
 * that will pass its test while failing its job. Returning the message lets a
 * test name which guard it expects to fire.
 */
create or replace function as_user_error(as_user uuid, statement text)
returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(as_user::text, ''), true);
  set local role authenticated;
  begin
    execute statement;
    reset role;
    return null;
  exception when others then
    reset role;
    return sqlerrm;
  end;
end;
$$;

/** Runs a query as a signed-in user and returns its first column as text. */
create or replace function as_user_scalar(as_user uuid, query text)
returns text language plpgsql as $$
declare
  result text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(as_user::text, ''), true);
  set local role authenticated;
  execute query into result;
  reset role;
  return result;
end;
$$;

/**
 * as_user_error() for a signed-out request.
 *
 * anon_denied() answers "was this refused?", which for a view over a protected
 * table is true for two quite different reasons: the view itself is ungranted,
 * or the table beneath it is. Those are not interchangeable — one is removable
 * by a later `grant select` that looks harmless — so a test that cares which
 * one is holding the door needs the message, not the boolean.
 */
create or replace function anon_error(statement text)
returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin
    execute statement;
    reset role;
    return null;
  exception when others then
    reset role;
    return sqlerrm;
  end;
end;
$$;

/**
 * The error a statement raised, or null if it succeeded.
 *
 * as_user_error()'s counterpart for statements that run as the owner rather
 * than as a request role — a service_role-only function, for instance, which
 * `authenticated` cannot even reach, so probing it as a user would report a
 * permission error instead of the check being tested.
 *
 * violates_constraint() is not a substitute: it catches only the handful of
 * SQLSTATEs a table constraint produces, so a function that validates its own
 * arguments and raises 22023 falls straight through it and the test reads as
 * passing.
 */
create or replace function raises(statement text)
returns text language plpgsql as $$
begin
  begin
    execute statement;
    return null;
  exception when others then
    return sqlerrm;
  end;
end;
$$;

/**
 * app_private.is_staff() evaluated as a given user.
 *
 * Reading `profiles.role` directly would test the column; this tests the
 * function that actually gates /admin and every staff RLS policy. They can
 * disagree — is_staff() could be changed to read something else — and the one
 * that matters is the one the policies call.
 *
 * Schema-qualified since 0026 moved it out of `public`, where PostgREST was
 * publishing it at /rest/v1/rpc/. Qualified rather than left to search_path
 * for the same reason the policies are: a test that resolves the function by
 * search_path could be testing a different one than the policies call.
 */
create or replace function is_staff_for(as_user uuid)
returns boolean language plpgsql as $$
declare
  result boolean;
begin
  perform set_config('request.jwt.claim.sub', coalesce(as_user::text, ''), true);
  set local role authenticated;
  select app_private.is_staff() into result;
  reset role;
  return coalesce(result, false);
end;
$$;
