-- Promo codes and the transactional message outbox.

-- ---------------------------------------------------------------------------
-- Promo codes
-- ---------------------------------------------------------------------------

-- This table closes a gap the client-side store could not.
--
-- Today the two built-in codes are compiled into src/lib/pricing.ts because the
-- payment route runs on the server and cannot read a browser store — so a code
-- created in the admin panel discounts the basket in the UI and is then
-- rejected at checkout. Once codes live here, both sides read the same row and
-- the discrepancy disappears.
create table if not exists promo_codes (
  -- Uppercase. Codes are matched case-insensitively, and normalising on write
  -- means the lookup is a primary key hit rather than a function scan.
  code text primary key,
  percent integer not null,
  active boolean not null default true,
  starts_on date,
  expires_on date,
  -- Defined in src/lib/pricing.ts as the server's fallback list. Can be
  -- deactivated but not deleted, so the UI and the payment route can never
  -- disagree about which codes exist.
  built_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table promo_codes drop constraint if exists promo_codes_code_is_upper;
alter table promo_codes add constraint promo_codes_code_is_upper
  check (code = upper(code) and length(code) between 3 and 32);

alter table promo_codes drop constraint if exists promo_codes_percent_range;
alter table promo_codes add constraint promo_codes_percent_range check (percent between 1 and 100);

alter table promo_codes drop constraint if exists promo_codes_window_ordered;
alter table promo_codes add constraint promo_codes_window_ordered check (
  starts_on is null or expires_on is null or expires_on >= starts_on
);

create index if not exists promo_codes_active_idx on promo_codes (code) where active;

drop trigger if exists promo_codes_touch_updated_at on promo_codes;
create trigger promo_codes_touch_updated_at
  before update on promo_codes
  for each row execute function public.touch_updated_at();

-- Known limitation, recorded rather than quietly invented: there is no
-- redemption cap or per-customer limit here, because the app has no concept of
-- one. A percentage code with no cap can be shared publicly and used without
-- limit, so anything beyond a private code needs that added first.

alter table promo_codes enable row level security;

-- Checkout has to be able to validate a code, including for a signed-out
-- visitor filling their basket. Only live codes are visible, so the response
-- cannot be used to enumerate unreleased campaigns.
drop policy if exists "Live promo codes are readable" on promo_codes;
create policy "Live promo codes are readable"
  on promo_codes for select
  using (
    active
    and (starts_on is null or starts_on <= current_date)
    and (expires_on is null or expires_on >= current_date)
  );

drop policy if exists "Staff can read every promo code" on promo_codes;
create policy "Staff can read every promo code"
  on promo_codes for select
  using (public.is_staff());

drop policy if exists "Staff can create promo codes" on promo_codes;
create policy "Staff can create promo codes"
  on promo_codes for insert
  with check (public.is_staff());

drop policy if exists "Staff can edit promo codes" on promo_codes;
create policy "Staff can edit promo codes"
  on promo_codes for update
  using (public.is_staff())
  with check (public.is_staff());

-- The built-in rule, enforced by the database rather than by the UI that
-- happens to hide the button: a built-in code is in the server's fallback list,
-- so deleting it here would put the two out of step.
drop policy if exists "Staff can delete only non-built-in codes" on promo_codes;
create policy "Staff can delete only non-built-in codes"
  on promo_codes for delete
  using (public.is_staff() and not built_in);

-- ---------------------------------------------------------------------------
-- Notification outbox
-- ---------------------------------------------------------------------------

do $$ begin
  create type notification_channel as enum ('email', 'sms', 'whatsapp');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type notification_status as enum ('queued', 'sent', 'failed');
exception when duplicate_object then null;
end $$;

-- An enum rather than free text, so a typo'd template id fails on write rather
-- than becoming a message nobody can explain. Adding a template means a
-- migration, which is the honest cost — the set of things we send is a schema
-- decision, and src/types/notifications.ts already treats it as exhaustive.
do $$ begin
  create type notification_template as enum (
    'order_placed',
    'order_shipped',
    'order_delivered',
    'order_cancelled',
    'return_requested',
    'return_approved',
    'return_rejected',
    'exchange_shipped',
    'back_in_stock',
    'refund_initiated',
    'wholesale_account_approved',
    'wholesale_account_rejected',
    'quote_ready',
    'bulk_order_shipped',
    'claim_received',
    'claim_resolved',
    'credit_terms_approved',
    'payment_overdue'
  );
exception when duplicate_object then null;
end $$;

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  template notification_template not null,
  channel notification_channel not null,
  -- Email address or E.164 phone number, depending on channel.
  recipient text not null,
  recipient_name text not null,
  -- Rendered at enqueue time, not at send time. Staff can then read exactly
  -- what the customer will receive, and a later copy change cannot silently
  -- rewrite a message already in the queue.
  subject text not null default '',
  body text not null,
  status notification_status not null default 'queued',
  -- Order/quote/account reference this refers to, for cross-linking from the
  -- admin view. Free text rather than a foreign key because one outbox spans
  -- several unrelated tables, and a message must survive the deletion of the
  -- thing it was about.
  related_to text,
  -- Delivery bookkeeping. `attempts` is what stops a permanently failing
  -- message being retried forever once a provider is connected.
  attempts integer not null default 0,
  failure_reason text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table notifications drop constraint if exists notifications_attempts_non_negative;
alter table notifications add constraint notifications_attempts_non_negative check (attempts >= 0);

-- A sent message with no timestamp cannot be audited or rate-limited.
alter table notifications drop constraint if exists notifications_sent_has_timestamp;
alter table notifications add constraint notifications_sent_has_timestamp check (
  status <> 'sent' or sent_at is not null
);

-- The send queue: whatever process drains this only ever wants what is still
-- waiting, oldest first.
create index if not exists notifications_queue_idx
  on notifications (created_at)
  where status = 'queued';

-- The admin dashboard surfaces failures, which is how a broken template or a
-- dead provider gets noticed at all.
create index if not exists notifications_failed_idx
  on notifications (created_at desc)
  where status = 'failed';

create index if not exists notifications_related_idx on notifications (related_to);

alter table notifications enable row level security;

-- Staff-only, and no customer-facing policy at all. The outbox holds every
-- message sent to every customer; there is no view in the app where one
-- customer should read from it, and the sender runs as service_role, which
-- bypasses RLS.
drop policy if exists "Staff manage the outbox" on notifications;
create policy "Staff manage the outbox"
  on notifications for all
  using (public.is_staff())
  with check (public.is_staff());
