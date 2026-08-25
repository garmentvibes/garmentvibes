-- ---------------------------------------------------------------------------
-- Putting messages in the outbox.
--
-- 46 covers taking them out once. This covers putting them in once, which is
-- the other half of the same guarantee and is not implied by it: 0020's
-- `for update skip locked` makes each *row* dispatch once and has nothing to
-- say about two rows carrying the same message.
--
-- The order confirmation is the case that forces it. An online order is
-- confirmed when payment is recorded, and payment is recorded from two places
-- deliberately — Razorpay's webhook and the browser's verify handoff, either
-- of which may arrive first. Both then queue a confirmation.
-- ---------------------------------------------------------------------------

begin;

truncate notifications cascade;

-- ---------------------------------------------------------------------------
-- The key stops the duplicate
-- ---------------------------------------------------------------------------

insert into notifications (template, channel, recipient, recipient_name, subject, body, dedupe_key)
values ('order_placed', 'email', 'asha@example.com', 'Asha',
        'Order GV-1001 confirmed', 'Thanks for your order.',
        'order_placed:email:11111111-1111-1111-1111-111111111111');

select assert(
  violates_constraint($$
    insert into notifications (template, channel, recipient, recipient_name, subject, body, dedupe_key)
    values ('order_placed', 'email', 'asha@example.com', 'Asha',
            'Order GV-1001 confirmed', 'Thanks for your order.',
            'order_placed:email:11111111-1111-1111-1111-111111111111')
  $$),
  'enqueue: the same message cannot be queued twice under one key');

-- What the enqueue path actually issues: `on conflict do nothing`, which needs
-- the index to be inferrable from the column alone. A partial index — the
-- tempting `where dedupe_key is not null` — cannot be inferred without the
-- predicate, and PostgREST has no way to send one. This is that statement.
insert into notifications (template, channel, recipient, recipient_name, subject, body, dedupe_key)
values ('order_placed', 'email', 'asha@example.com', 'Asha',
        'Order GV-1001 confirmed', 'REWRITTEN BODY',
        'order_placed:email:11111111-1111-1111-1111-111111111111')
on conflict (dedupe_key) do nothing;

select assert(
  (select count(*) from notifications
    where dedupe_key = 'order_placed:email:11111111-1111-1111-1111-111111111111') = 1,
  'enqueue: a repeat insert on the key is a no-op rather than an error');

-- do nothing, not do update. What staff read in the outbox has to be what the
-- customer received, and that only holds if the row is written once.
select assert(
  (select body from notifications
    where dedupe_key = 'order_placed:email:11111111-1111-1111-1111-111111111111')
    = 'Thanks for your order.',
  'enqueue: and does not rewrite the message already queued');

-- ---------------------------------------------------------------------------
-- The key does not stop the channels
-- ---------------------------------------------------------------------------

-- One event, three channels, three rows. The email and the SMS are two things
-- that each happen once, not one thing that happens twice, so a scheme that
-- keyed on the order alone would silently drop two of the three.
insert into notifications (template, channel, recipient, recipient_name, subject, body, dedupe_key)
values
  ('order_placed', 'sms', '+919999999999', 'Asha', '', 'Order GV-1001 confirmed.',
   'order_placed:sms:11111111-1111-1111-1111-111111111111'),
  ('order_placed', 'whatsapp', '+919999999999', 'Asha', '', 'Order GV-1001 confirmed.',
   'order_placed:whatsapp:11111111-1111-1111-1111-111111111111');

select assert(
  (select count(*) from notifications
    where related_to is not distinct from null
      and dedupe_key like 'order_placed:%:11111111-1111-1111-1111-111111111111') = 3,
  'enqueue: the same event still queues one message per channel');

-- ---------------------------------------------------------------------------
-- Messages that are allowed to repeat
-- ---------------------------------------------------------------------------

-- Most templates repeat by design: payment_overdue fires on every reminder,
-- cart_reminder is explicitly "a couple of nudges", support_reply fires per
-- reply on one thread. A blanket unique constraint over (template, channel,
-- related_to) would swallow the second of each, and it would look like a
-- provider fault rather than a schema decision.
insert into notifications (template, channel, recipient, recipient_name, subject, body, related_to)
values
  ('payment_overdue', 'email', 'buyer@example.com', 'Buyer', 'Invoice past due', 'First notice.', 'INV-77'),
  ('payment_overdue', 'email', 'buyer@example.com', 'Buyer', 'Invoice past due', 'Second notice.', 'INV-77');

select assert(
  (select count(*) from notifications where related_to = 'INV-77') = 2,
  'enqueue: a message with no key may be queued as often as the event happens');

-- ---------------------------------------------------------------------------
-- Templates the app can render
-- ---------------------------------------------------------------------------

-- 0009 created the enum and its comment said src/types/notifications.ts
-- "already treats it as exhaustive". Three templates were written afterwards
-- without it growing, which was invisible while the outbox lived in
-- localStorage and no template id ever reached Postgres. 0021 closed the gap.
--
-- scripts/qa/schema.mjs checks the whole union against the enum by reading the
-- source; these three are named here so the file that added them says which
-- ones they were.
select assert(
  (select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'notification_template'
      and e.enumlabel in ('cart_reminder', 'question_answered', 'support_reply')) = 3,
  'enqueue: the templates written after 0009 exist in the enum');

-- ---------------------------------------------------------------------------
-- Who may enqueue
-- ---------------------------------------------------------------------------

-- The outbox has no customer-facing policy at all, which is what stops a
-- customer choosing the recipient of a message the shop sends. Enqueueing runs
-- as service_role, from the server, on values read back out of the database.
select assert(
  anon_denied($$
    insert into notifications (template, channel, recipient, recipient_name, body)
    values ('order_placed', 'email', 'attacker@example.com', 'Nobody', 'hello')
  $$),
  'enqueue: a signed-out visitor cannot put a message in the outbox');

rollback;
