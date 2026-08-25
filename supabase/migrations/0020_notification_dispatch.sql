-- Making the outbox drainable.
--
-- 0009 created `notifications` and the store that feeds it says what it has
-- been so far:
--
--     Nothing is delivered yet — no provider is connected. Messages are queued
--     here and staff can read exactly what a customer would have received.
--
-- Two things have to become true before a message can actually be sent. This
-- migration is the second of them; the first is that the queue lives in the
-- database at all, which is what src/lib/notifications/outbox.ts does — today
-- it is a zustand store in one admin's browser, and a queue on one laptop is
-- not something a sender can drain.
--
-- ---------------------------------------------------------------------------
-- Why claiming is a separate step from sending
-- ---------------------------------------------------------------------------
--
-- Sending is an HTTP call to somebody else's API, so it cannot happen inside
-- the transaction that decides to send. That leaves a gap, and the gap is
-- where a message gets sent twice: two dispatch passes both read the same
-- queued row, both call the provider, and a customer gets two copies of "your
-- order has shipped".
--
-- So a pass *claims* rows first — one transaction, `for update skip locked`,
-- stamping `claimed_at` — and settles them afterwards. `skip locked` is what
-- makes two passes running at once take disjoint work rather than one of them
-- blocking behind the other.
--
-- ---------------------------------------------------------------------------
-- Why claiming does not use a status
-- ---------------------------------------------------------------------------
--
-- The obvious shape is a `sending` value on `notification_status`. Postgres
-- will not let a new enum value be used in the transaction that adds it, so
-- that is two migration files before anything works — 0002 and 0012 both paid
-- that toll. A nullable timestamp needs neither, and it carries more
-- information: a row claimed and never settled has a `claimed_at` old enough
-- to reclaim, where a `sending` status is just stuck.

-- When a dispatch pass took this row. Null means nobody is working on it.
alter table notifications add column if not exists claimed_at timestamptz;

-- The earliest a failed message may be retried. Null means "as soon as
-- possible", which is where every message starts.
--
-- Without this a permanently failing message is retried as fast as the
-- dispatcher runs, which is how you get rate-limited by your own provider for
-- a message that was never going to send.
alter table notifications add column if not exists next_attempt_at timestamptz;

-- The queue read: queued, due, and not already claimed. Partial, because the
-- rows that matter are a small fraction of an outbox that only grows.
create index if not exists notifications_dispatch_idx
  on notifications (next_attempt_at nulls first, created_at)
  where status = 'queued';

-- ---------------------------------------------------------------------------
-- How many attempts is enough
-- ---------------------------------------------------------------------------
--
-- Five, with the delay roughly doubling: about a minute, then two, four, eight,
-- sixteen. A transient provider outage is well inside that; a wrong phone
-- number is not going to be fixed by a sixth try.
--
-- Enforced as a constraint rather than only in the dispatcher, so a bug in the
-- retry arithmetic cannot quietly turn into an infinite loop against a paid
-- API.
alter table notifications drop constraint if exists notifications_attempts_bounded;
alter table notifications add constraint notifications_attempts_bounded check (attempts <= 5);

-- ---------------------------------------------------------------------------
-- Claiming
-- ---------------------------------------------------------------------------

/**
 * Takes up to `p_limit` messages off the queue and returns them to send.
 *
 * Claiming stamps `claimed_at` and increments `attempts` — the increment
 * happens here, at claim time, rather than on failure. That is deliberate: a
 * pass that dies mid-send never reports anything, and if attempts only counted
 * reported failures such a message would be retried for ever. Counting at
 * claim time means every attempt is counted whether or not anyone lived to
 * describe it.
 *
 * `p_stale_after` is how long a claim is honoured before the message is
 * considered abandoned and available again. It has to be comfortably longer
 * than a send takes and comfortably shorter than a human would wait.
 */
create or replace function public.claim_notifications(
  p_limit integer default 20,
  p_stale_after interval default interval '5 minutes'
)
returns setof notifications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with due as (
    select n.id
      from notifications n
     where n.status = 'queued'
       and n.attempts < 5
       -- Not yet due for a retry.
       and (n.next_attempt_at is null or n.next_attempt_at <= now())
       -- Not claimed, or claimed so long ago that the pass holding it is gone.
       and (n.claimed_at is null or n.claimed_at < now() - p_stale_after)
     order by n.next_attempt_at nulls first, n.created_at
     limit p_limit
     -- Two passes running at once take disjoint work instead of one waiting
     -- behind the other — and, more importantly, instead of both sending the
     -- same message.
     for update skip locked
  )
  update notifications n
     set claimed_at = now(),
         attempts = n.attempts + 1
    from due
   where n.id = due.id
  returning n.*;
end;
$$;

-- ---------------------------------------------------------------------------
-- Settling
-- ---------------------------------------------------------------------------

/**
 * Records that a message went out.
 *
 * Only settles a row that is still queued. A message already marked sent stays
 * as it was: a provider that answers twice, or a retry racing a slow first
 * attempt, must not move `sent_at` to the later of the two — that timestamp is
 * what an audit reads as "when the customer was told".
 */
create or replace function public.mark_notification_sent(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  update notifications
     set status = 'sent',
         sent_at = now(),
         claimed_at = null,
         failure_reason = null
   where id = p_id and status = 'queued';

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

/**
 * Records that a send failed, and when to try again.
 *
 * A message that has used its attempts moves to `failed` and stops. Anything
 * else goes back on the queue with a delay that roughly doubles each time,
 * computed from the attempt count already recorded at claim time.
 *
 * The reason is stored on both paths. A failed message nobody can explain is
 * a support ticket that starts from nothing.
 */
create or replace function public.mark_notification_failed(p_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempts integer;
begin
  select attempts into v_attempts from notifications where id = p_id and status = 'queued';
  if not found then
    return false;
  end if;

  if v_attempts >= 5 then
    update notifications
       set status = 'failed',
           claimed_at = null,
           failure_reason = left(coalesce(p_reason, 'unknown'), 500)
     where id = p_id;
    return true;
  end if;

  update notifications
     set claimed_at = null,
         failure_reason = left(coalesce(p_reason, 'unknown'), 500),
         -- 1, 2, 4, 8, 16 minutes. Computed here rather than passed in, so
         -- every caller backs off the same way.
         next_attempt_at = now() + (power(2, v_attempts - 1) * interval '1 minute')
   where id = p_id;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- service_role only. These are the dispatcher's, and the dispatcher runs on a
-- schedule with no user behind it — there is no request whose session would
-- make sense to check. Staff manage the outbox through the policy 0009 gave
-- them; nobody needs to claim a message by hand.
revoke all on function public.claim_notifications(integer, interval) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer, interval) to service_role;

revoke all on function public.mark_notification_sent(uuid) from public, anon, authenticated;
grant execute on function public.mark_notification_sent(uuid) to service_role;

revoke all on function public.mark_notification_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_notification_failed(uuid, text) to service_role;
