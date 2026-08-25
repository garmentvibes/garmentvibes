-- The three templates the app has and the database does not.
--
-- 0009 created `notification_template` with eighteen values, and the comment
-- on it said src/types/notifications.ts "already treats it as exhaustive".
-- Three templates have been written since — cart_reminder, question_answered
-- and support_reply — and the TypeScript union grew while the enum did not.
--
-- That gap was harmless only for as long as nothing wrote to the table: the
-- outbox lived in a zustand store, so a template id never reached Postgres.
-- 0020 made the queue drainable and the enqueue path in
-- src/lib/notifications/enqueue.ts makes it writable, at which point the gap
-- becomes a runtime error on a template that TypeScript is perfectly happy
-- with — "invalid input value for enum notification_template" at the moment a
-- customer should have been told something.
--
-- Alone in its own file, like 0002 and 0012, because Postgres will not let a
-- new enum value be *used* in the transaction that adds it.

alter type notification_template add value if not exists 'cart_reminder' after 'back_in_stock';
alter type notification_template add value if not exists 'question_answered' after 'cart_reminder';
alter type notification_template add value if not exists 'support_reply' after 'question_answered';
