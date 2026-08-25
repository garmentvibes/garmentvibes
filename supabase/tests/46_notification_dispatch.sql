-- ---------------------------------------------------------------------------
-- Draining the outbox.
--
-- The thing under test is not "does a message get sent" — the dispatcher is
-- TypeScript and an HTTP call. It is the bookkeeping around the send, which is
-- where the failures are expensive:
--
--   * a message claimed by two passes is a customer told twice that their
--     order shipped;
--   * an attempt that is not counted is a message retried for ever against a
--     paid API;
--   * a `sent_at` overwritten by a late duplicate is an audit trail that says
--     the wrong thing about when somebody was told.
--
-- None of that is visible from "the message eventually went out", so none of
-- it is covered by testing that.
-- ---------------------------------------------------------------------------

begin;

truncate notifications cascade;

insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'staff@garmentvibes.com')
on conflict (id) do nothing;

insert into profiles (id, role, full_name, email) values
  ('44444444-4444-4444-4444-444444444444', 'admin', 'Staff', 'staff@garmentvibes.com')
on conflict (id) do update set role = excluded.role;

insert into notifications (id, template, channel, recipient, recipient_name, subject, body)
values
  ('11111111-0000-0000-0000-00000000000a', 'order_placed', 'email',
   'asha@example.com', 'Asha', 'Your order is confirmed', 'Thanks for your order.'),
  ('11111111-0000-0000-0000-00000000000b', 'order_shipped', 'sms',
   '+919999999999', 'Asha', '', 'Your order has shipped.');

-- ---------------------------------------------------------------------------
-- Claiming
-- ---------------------------------------------------------------------------

select assert(
  (select count(*) from claim_notifications(10)) = 2,
  'dispatch: a pass claims the queued messages');

select assert(
  (select count(*) from notifications where claimed_at is not null) = 2,
  'dispatch: and stamps them as claimed');

-- The attempt is counted at claim time, not at failure. A pass that dies
-- mid-send never reports anything, and if only reported failures counted, such
-- a message would be retried for ever.
select assert(
  (select min(attempts) from notifications) = 1,
  'dispatch: the attempt is counted when the message is claimed');

-- The point of the whole exercise. A second pass running while the first is
-- still working must find nothing, or a customer is told twice.
select assert(
  (select count(*) from claim_notifications(10)) = 0,
  'dispatch: a second pass finds nothing to claim');

-- ---------------------------------------------------------------------------
-- Settling
-- ---------------------------------------------------------------------------

select assert(
  mark_notification_sent('11111111-0000-0000-0000-00000000000a'),
  'dispatch: a sent message settles');

select assert(
  (select status from notifications where id = '11111111-0000-0000-0000-00000000000a')::text = 'sent',
  'dispatch: and reads as sent');

select assert(
  (select sent_at from notifications where id = '11111111-0000-0000-0000-00000000000a') is not null,
  'dispatch: with a timestamp, which the schema requires of a sent message');

select assert(
  (select claimed_at from notifications where id = '11111111-0000-0000-0000-00000000000a') is null,
  'dispatch: and the claim released');

-- A provider that answers twice, or a retry racing a slow first attempt, must
-- not move sent_at to the later of the two — that timestamp is what an audit
-- reads as "when the customer was told".
select assert(
  not mark_notification_sent('11111111-0000-0000-0000-00000000000a'),
  'dispatch: settling an already-sent message reports that it did nothing');

-- ---------------------------------------------------------------------------
-- Failing, and backing off
-- ---------------------------------------------------------------------------

select assert(
  mark_notification_failed('11111111-0000-0000-0000-00000000000b', 'provider timeout'),
  'dispatch: a failed send settles too');

select assert(
  (select status from notifications where id = '11111111-0000-0000-0000-00000000000b')::text = 'queued',
  'dispatch: and goes back on the queue rather than being given up on');

select assert(
  (select failure_reason from notifications where id = '11111111-0000-0000-0000-00000000000b')
    = 'provider timeout',
  'dispatch: with the reason recorded, so it can be explained');

select assert(
  (select next_attempt_at from notifications where id = '11111111-0000-0000-0000-00000000000b') > now(),
  'dispatch: and a delay before the next try');

-- Not due yet, so a pass running immediately afterwards must leave it alone.
-- Without this a permanently failing message is retried as fast as the
-- dispatcher runs, which is how a provider rate-limits you over a message that
-- was never going to send.
select assert(
  (select count(*) from claim_notifications(10)) = 0,
  'dispatch: a message that is not due yet is not claimed');

-- ---------------------------------------------------------------------------
-- Giving up
-- ---------------------------------------------------------------------------

insert into notifications (id, template, channel, recipient, recipient_name, body, attempts)
values ('11111111-0000-0000-0000-00000000000c', 'order_delivered', 'email',
        'bad@@example', 'Nobody', 'Delivered.', 4);

select assert(
  (select count(*) from claim_notifications(10)) = 1,
  'dispatch: a message with attempts left is still claimed');

select assert(
  (select attempts from notifications where id = '11111111-0000-0000-0000-00000000000c') = 5,
  'dispatch: which uses its last attempt');

select assert(
  mark_notification_failed('11111111-0000-0000-0000-00000000000c', 'invalid address'),
  'dispatch: and its failure settles');

select assert(
  (select status from notifications where id = '11111111-0000-0000-0000-00000000000c')::text = 'failed',
  'dispatch: to failed, rather than back onto the queue for ever');

select assert(
  (select count(*) from claim_notifications(10)) = 0,
  'dispatch: a failed message is never claimed again');

-- The constraint backs the dispatcher up. A bug in the retry arithmetic must
-- not be able to turn into an unbounded loop against a paid API.
select assert(
  violates_constraint($$
    update notifications set attempts = 6
     where id = '11111111-0000-0000-0000-00000000000c'
  $$),
  'dispatch: attempts cannot exceed the limit, whatever the dispatcher thinks');

-- ---------------------------------------------------------------------------
-- Reclaiming abandoned work
-- ---------------------------------------------------------------------------

-- A pass that died holding a claim. Without a staleness window the message is
-- stuck for ever, claimed by a process that no longer exists.
insert into notifications (id, template, channel, recipient, recipient_name, body, claimed_at)
values ('11111111-0000-0000-0000-00000000000d', 'order_placed', 'email',
        'stuck@example.com', 'Stuck', 'Queued.', now() - interval '1 hour');

select assert(
  (select count(*) from claim_notifications(10, interval '5 minutes')) = 1,
  'dispatch: a claim older than the staleness window is taken again');

select assert(
  (select count(*) from claim_notifications(10, interval '2 hours')) = 0,
  'dispatch: while a fresher one inside the window is left alone');

-- ---------------------------------------------------------------------------
-- The dispatcher is not reachable from a browser
-- ---------------------------------------------------------------------------

-- These run on a schedule with no user behind them, so there is no session
-- whose permissions would mean anything. Reachable by `authenticated`, a
-- customer could claim a message — taking it off the queue so it is never
-- sent — or mark somebody else's as sent.
select assert(
  as_user_error('44444444-4444-4444-4444-444444444444', $$select claim_notifications(1)$$)
    like '%permission denied for function claim_notifications%',
  'dispatch: not even staff can claim messages by hand');

select assert(
  as_user_error('44444444-4444-4444-4444-444444444444',
    $$select mark_notification_sent('11111111-0000-0000-0000-00000000000d')$$)
    like '%permission denied for function mark_notification_sent%',
  'dispatch: nor mark one sent');

select assert(
  anon_denied($$select claim_notifications(1)$$),
  'dispatch: and a signed-out visitor certainly cannot');

-- The outbox itself stays staff-only, as 0009 left it: it holds every
-- customer's address and phone number in one table.
select assert(
  anon_denied($$select count(*) from notifications$$),
  'dispatch: the outbox is not readable by a signed-out visitor');

rollback;
