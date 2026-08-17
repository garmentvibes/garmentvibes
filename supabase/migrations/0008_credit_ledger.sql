-- Credit ledger for wholesale accounts on Net terms.
--
-- Granting credit without recording what is outstanding is the trap this
-- closes: the portal could already mark an account Net-30, but nothing
-- recorded what had been invoiced, what had been paid, or who was overdue —
-- which is the entire reason a supplier offers terms in the first place.

do $$ begin
  create type invoice_status as enum ('open', 'part_paid', 'paid', 'written_off');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type credit_payment_method as enum ('bank_transfer', 'cheque', 'upi', 'adjustment');
exception when duplicate_object then null;
end $$;

create table if not exists credit_invoices (
  id uuid primary key default gen_random_uuid(),
  reference text,
  -- The bulk order this bills.
  quote_id uuid references wholesale_quotes (id) on delete set null,
  account_id uuid not null references wholesale_accounts (id) on delete restrict,
  -- Snapshotted, so a renamed business does not rewrite its own invoice
  -- history, and a closed account still has an auditable ledger.
  business_name text not null,
  contact_name text not null,
  email text not null,
  -- GST-inclusive amount payable, minor units.
  amount integer not null,
  issued_on date not null default current_date,
  -- issued_on plus the account's terms, computed once and stored rather than
  -- derived on read: shortening an account's terms next year must not
  -- retroactively make last year's invoices overdue.
  due_on date not null,
  status invoice_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ON DELETE RESTRICT above, not CASCADE, and deliberately: deleting an account
-- must not silently erase the record of money it still owes.

create unique index if not exists credit_invoices_reference_key
  on credit_invoices (reference)
  where reference is not null;

create index if not exists credit_invoices_account_idx on credit_invoices (account_id, issued_on desc);
create index if not exists credit_invoices_quote_idx on credit_invoices (quote_id);

-- Chasing overdue money is the most common query against this table, and it
-- only ever looks at invoices that are still owed.
create index if not exists credit_invoices_outstanding_idx
  on credit_invoices (due_on)
  where status in ('open', 'part_paid');

alter table credit_invoices drop constraint if exists credit_invoices_amount_positive;
alter table credit_invoices add constraint credit_invoices_amount_positive check (amount > 0);

alter table credit_invoices drop constraint if exists credit_invoices_due_after_issue;
alter table credit_invoices add constraint credit_invoices_due_after_issue check (due_on >= issued_on);

drop trigger if exists credit_invoices_touch_updated_at on credit_invoices;
create trigger credit_invoices_touch_updated_at
  before update on credit_invoices
  for each row execute function public.touch_updated_at();

create table if not exists credit_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references credit_invoices (id) on delete cascade,
  amount integer not null,
  received_on date not null default current_date,
  method credit_payment_method not null,
  -- UTR, cheque number, UPI reference — whatever the bank statement will show.
  reference text,
  -- Which staff account keyed it in. Cash handling needs a name against it.
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists credit_payments_invoice_idx on credit_payments (invoice_id);
create index if not exists credit_payments_recorded_by_idx on credit_payments (recorded_by);

alter table credit_payments drop constraint if exists credit_payments_amount_positive;
alter table credit_payments add constraint credit_payments_amount_positive check (amount > 0);

-- ---------------------------------------------------------------------------
-- Status is derived, never asserted
-- ---------------------------------------------------------------------------

-- The client-side store already computed status from the payments rather than
-- setting it by hand, "so it can never disagree with the arithmetic
-- underneath it". That guarantee belongs in the database, where a stray UPDATE
-- from any code path cannot break it.
--
-- Overpayment is allowed rather than rejected: duplicate transfers and
-- rounding on part-settlements genuinely happen, and refusing the payment
-- would leave the ledger further from the truth than recording it does. It
-- simply caps at 'paid'.
create or replace function public.recompute_invoice_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target uuid := coalesce(new.invoice_id, old.invoice_id);
  paid integer;
  invoice_amount integer;
  current_status invoice_status;
begin
  select amount, status into invoice_amount, current_status
  from public.credit_invoices where id = target;

  -- A written-off invoice stays written off. A late payment against one is
  -- worth recording, but it does not undo the accounting decision.
  if current_status = 'written_off' then
    return coalesce(new, old);
  end if;

  select coalesce(sum(amount), 0) into paid
  from public.credit_payments where invoice_id = target;

  update public.credit_invoices
  set status = case
    when paid >= invoice_amount then 'paid'::invoice_status
    when paid > 0 then 'part_paid'::invoice_status
    else 'open'::invoice_status
  end
  where id = target;

  return coalesce(new, old);
end;
$$;

drop trigger if exists credit_payments_recompute_status on credit_payments;
create trigger credit_payments_recompute_status
  after insert or update or delete on credit_payments
  for each row execute function public.recompute_invoice_status();

-- ---------------------------------------------------------------------------
-- Outstanding balances
-- ---------------------------------------------------------------------------

-- security_invoker is the whole reason this view is safe.
--
-- A Postgres view runs with its *owner's* privileges by default, which would
-- bypass the RLS on credit_invoices and let any buyer read every other
-- business's debts through it. With security_invoker the view evaluates as the
-- caller, so the policies below still apply.
create or replace view public.credit_invoice_balances
with (security_invoker = true) as
select
  i.id,
  i.reference,
  i.account_id,
  i.business_name,
  i.amount,
  i.issued_on,
  i.due_on,
  i.status,
  coalesce(p.paid, 0) as amount_paid,
  case
    when i.status = 'written_off' then 0
    else greatest(0, i.amount - coalesce(p.paid, 0))
  end as amount_outstanding,
  (current_date - i.due_on) as days_overdue
from public.credit_invoices i
left join (
  select invoice_id, sum(amount) as paid
  from public.credit_payments
  group by invoice_id
) p on p.invoice_id = i.id;

comment on view public.credit_invoice_balances is
  'Invoices with paid/outstanding totals and days past due. Ageing buckets stay in src/types/credit.ts so the UI and any report agree on the boundaries.';

alter table credit_invoices enable row level security;
alter table credit_payments enable row level security;

-- A business can see its own ledger. It cannot write to it — issuing invoices
-- and recording receipts is ours to do.
drop policy if exists "Members can view their account's invoices" on credit_invoices;
create policy "Members can view their account's invoices"
  on credit_invoices for select
  using (account_id = public.wholesale_account_id());

drop policy if exists "Staff manage credit invoices" on credit_invoices;
create policy "Staff manage credit invoices"
  on credit_invoices for all
  using (public.is_staff())
  with check (public.is_staff());

-- Buyers can see payments recorded against their own invoices, which is how
-- they reconcile what we think they have paid against what they sent.
drop policy if exists "Members can view payments on their invoices" on credit_payments;
create policy "Members can view payments on their invoices"
  on credit_payments for select
  using (exists (
    select 1 from credit_invoices i
    where i.id = credit_payments.invoice_id
      and i.account_id = public.wholesale_account_id()
  ));

drop policy if exists "Staff manage credit payments" on credit_payments;
create policy "Staff manage credit payments"
  on credit_payments for all
  using (public.is_staff())
  with check (public.is_staff());
