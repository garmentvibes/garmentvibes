-- Stopping the same message being queued twice.
--
-- 0020 made sure a queued message is *sent* once: claiming takes rows with
-- `for update skip locked`, so two dispatch passes cannot both hand the same
-- row to a provider. That says nothing about how the row got there.
--
-- The enqueue side has a duplicate of its own, and the order confirmation is
-- the clearest case. An online order becomes confirmed when payment is
-- recorded, and payment is recorded from two places on purpose: the browser's
-- verify handoff and Razorpay's webhook. `mark_retail_order_paid` is written
-- to make the second one a no-op — see 0014 — but it still answers with the
-- order id, because both callers need to carry on. Enqueue on that answer and
-- the customer gets told twice, from two rows that 0020 will each dispatch
-- exactly once.
--
-- ---------------------------------------------------------------------------
-- Why a key rather than a constraint on (template, related_to, channel)
-- ---------------------------------------------------------------------------
--
-- Because most templates are allowed to repeat. `payment_overdue` goes out
-- every time an invoice is still unpaid; `cart_reminder` is explicitly "a
-- couple of nudges"; `support_reply` fires per reply on one thread. A unique
-- constraint over those three columns would silently swallow the second
-- reminder and the second support reply, and the failure would look like a
-- provider problem rather than a schema decision.
--
-- So uniqueness is opt-in: the caller names the thing that must happen once
-- ("order_placed:email:<order id>") and leaves the key null everywhere else.
-- A message with no key behaves exactly as it did before this migration.

alter table notifications add column if not exists dedupe_key text;

comment on column notifications.dedupe_key is
  'Opt-in idempotency key. Null means this message may repeat; a value means at most one row may ever carry it.';

-- Nulls do not collide with each other in a Postgres unique index, so a plain
-- one already gives "at most one row per key, any number with no key".
--
-- The tempting version is partial — `where dedupe_key is not null` — which
-- would cover only the rows that opted in rather than every row in an outbox
-- that only grows. It is not used, because a partial index can only be
-- inferred by `on conflict` when the statement repeats its predicate, and
-- PostgREST's `on_conflict` parameter cannot send one. The enqueue path would
-- then need two round trips, one for the keyed rows and one for the rest, to
-- save an index entry per row. Wrong trade.
create unique index if not exists notifications_dedupe_key_idx
  on notifications (dedupe_key);
