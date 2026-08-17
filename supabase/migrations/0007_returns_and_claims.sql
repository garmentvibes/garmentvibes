-- Returns, exchanges, and the wholesale equivalent.
--
-- Retail returns and exchanges are one table with a discriminator, not two
-- systems: they share the entire pipeline up to pickup and only diverge at the
-- last step, where one sends money back and the other sends a garment out.
--
-- Wholesale claims are a genuinely different shape and get their own table. A
-- bulk buyer is not returning a garment because it did not suit them — they
-- are reporting that the consignment did not match the invoice, which is
-- per-line and quantity-based ("billed for 300, received 288").

-- Reason codes rather than display strings. The wording shown to customers
-- lives in src/types/returns.ts, so rewording a reason is a copy change rather
-- than a migration; only the set of distinct reasons is a schema concern.
do $$ begin
  create type return_reason as enum (
    'size_or_fit',
    'damaged_or_defective',
    'wrong_item',
    'not_as_described',
    'quality_below_expectation',
    'changed_mind'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type return_resolution as enum ('refund', 'exchange');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type return_status as enum (
    'requested', 'approved', 'rejected', 'picked_up', 'refunded', 'exchange_shipped'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Retail returns and exchanges
-- ---------------------------------------------------------------------------

create table if not exists return_requests (
  id uuid primary key default gen_random_uuid(),
  -- The RET… code the customer sees and quotes at us.
  reference text,
  order_id uuid not null references retail_orders (id) on delete cascade,
  -- Denormalised from the order so a return can be authorised without reading
  -- the customer's whole order history, and so the request records who asked
  -- even if the account is later closed.
  customer_name text not null,
  customer_email text not null,
  phone text not null,
  resolution return_resolution not null,
  reason return_reason not null,
  comments text,
  status return_status not null default 'requested',
  -- Amount to send back, snapshotted at request time. Recomputing it later
  -- against a since-changed price would refund the wrong number.
  refund_amount integer not null default 0,
  -- Net difference on an exchange, in minor units. Signed: positive means the
  -- customer owes us because they swapped up, negative means we owe them.
  -- Zero for a like-for-like size swap, which is why that path never asks
  -- anyone for money.
  exchange_balance integer not null default 0,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Stamped when units go back on the shelf. Whether they should is decided by
  -- the reason — a garment returned as damaged must not be re-sold — and that
  -- rule lives in isRestockable() rather than being duplicated here. This
  -- column records what was actually done, so a double restock is visible.
  restocked_at timestamptz
);

create unique index if not exists return_requests_reference_key
  on return_requests (reference)
  where reference is not null;

create index if not exists return_requests_order_idx on return_requests (order_id);
create index if not exists return_requests_queue_idx
  on return_requests (created_at)
  where status = 'requested';

alter table return_requests drop constraint if exists return_requests_refund_non_negative;
alter table return_requests add constraint return_requests_refund_non_negative
  check (refund_amount >= 0);

-- A refund has no exchange balance to settle. Allowing one would let a refund
-- silently carry a charge.
alter table return_requests drop constraint if exists return_requests_balance_only_on_exchange;
alter table return_requests add constraint return_requests_balance_only_on_exchange check (
  resolution = 'exchange' or exchange_balance = 0
);

-- Only an exchange can reach the exchange-shipped state.
alter table return_requests drop constraint if exists return_requests_status_matches_resolution;
alter table return_requests add constraint return_requests_status_matches_resolution check (
  status <> 'exchange_shipped' or resolution = 'exchange'
);

drop trigger if exists return_requests_touch_updated_at on return_requests;
create trigger return_requests_touch_updated_at
  before update on return_requests
  for each row execute function public.touch_updated_at();

create table if not exists return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references return_requests (id) on delete cascade,
  product_id uuid not null references retail_products (id),
  product_name text not null,
  size_label text not null,
  color text not null,
  qty integer not null,
  -- As charged, in minor units.
  price integer not null,
  -- Exchange only. A size swap on the same product sets only the size; a
  -- cross-product exchange sets the product too, and the price difference is
  -- what exchange_balance above adds up to.
  exchange_for_size text,
  exchange_for_product_id uuid references retail_products (id),
  exchange_for_price integer
);

create index if not exists return_items_return_idx on return_items (return_id);
create index if not exists return_items_product_idx on return_items (product_id);
create index if not exists return_items_exchange_product_idx
  on return_items (exchange_for_product_id);

alter table return_items drop constraint if exists return_items_qty_positive;
alter table return_items add constraint return_items_qty_positive check (qty > 0);

-- A replacement we cannot price is a replacement we cannot settle the
-- difference on.
alter table return_items drop constraint if exists return_items_exchange_is_priced;
alter table return_items add constraint return_items_exchange_is_priced check (
  exchange_for_size is null or exchange_for_price is not null
);

-- Swapping to a different product without saying which size is not an order
-- anyone can pick and pack.
alter table return_items drop constraint if exists return_items_cross_product_needs_size;
alter table return_items add constraint return_items_cross_product_needs_size check (
  exchange_for_product_id is null or exchange_for_size is not null
);

alter table return_requests enable row level security;
alter table return_items enable row level security;

drop policy if exists "Users can view returns on their own orders" on return_requests;
create policy "Users can view returns on their own orders"
  on return_requests for select
  using (exists (
    select 1 from retail_orders
    where retail_orders.id = return_requests.order_id
      and retail_orders.user_id = auth.uid()
  ));

-- Customers raise returns but never decide them: `status` is left at its
-- default and every transition afterwards is staff-only.
drop policy if exists "Users can raise returns on their own orders" on return_requests;
create policy "Users can raise returns on their own orders"
  on return_requests for insert
  with check (
    status = 'requested'
    and exists (
      select 1 from retail_orders
      where retail_orders.id = return_requests.order_id
        and retail_orders.user_id = auth.uid()
    )
  );

drop policy if exists "Staff manage returns" on return_requests;
create policy "Staff manage returns"
  on return_requests for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Users can view their own return items" on return_items;
create policy "Users can view their own return items"
  on return_items for select
  using (exists (
    select 1 from return_requests r
    join retail_orders o on o.id = r.order_id
    where r.id = return_items.return_id and o.user_id = auth.uid()
  ));

drop policy if exists "Users can add items to their own returns" on return_items;
create policy "Users can add items to their own returns"
  on return_items for insert
  with check (exists (
    select 1 from return_requests r
    join retail_orders o on o.id = r.order_id
    where r.id = return_items.return_id and o.user_id = auth.uid()
  ));

drop policy if exists "Staff manage return items" on return_items;
create policy "Staff manage return items"
  on return_items for all
  using (public.is_staff())
  with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Wholesale claims
-- ---------------------------------------------------------------------------

do $$ begin
  create type claim_reason as enum (
    'short_shipment', 'damaged_in_transit', 'wrong_item_shipped', 'quality_below_sample'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type claim_resolution as enum ('credit_note', 'replacement');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type claim_status as enum (
    'submitted', 'under_review', 'approved', 'rejected', 'settled'
  );
exception when duplicate_object then null;
end $$;

create table if not exists wholesale_claims (
  id uuid primary key default gen_random_uuid(),
  reference text,
  quote_id uuid not null references wholesale_quotes (id) on delete cascade,
  account_id uuid references wholesale_accounts (id) on delete set null,
  business_name text not null,
  contact_name text not null,
  email text not null,
  reason claim_reason not null,
  requested_resolution claim_resolution not null,
  comments text,
  status claim_status not null default 'submitted',
  decision_note text,
  -- What was actually granted, which need not match what was asked for.
  settled_resolution claim_resolution,
  -- Value of the credit note raised, in minor units. Set on settlement.
  settled_amount integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz
);

create unique index if not exists wholesale_claims_reference_key
  on wholesale_claims (reference)
  where reference is not null;

create index if not exists wholesale_claims_quote_idx on wholesale_claims (quote_id);
create index if not exists wholesale_claims_account_idx on wholesale_claims (account_id);
create index if not exists wholesale_claims_queue_idx
  on wholesale_claims (created_at)
  where status in ('submitted', 'under_review');

alter table wholesale_claims drop constraint if exists wholesale_claims_settled_amount_sane;
alter table wholesale_claims add constraint wholesale_claims_settled_amount_sane check (
  settled_amount is null or settled_amount >= 0
);

-- A settled claim that records neither what was granted nor when is a claim
-- nobody can audit.
alter table wholesale_claims drop constraint if exists wholesale_claims_settlement_complete;
alter table wholesale_claims add constraint wholesale_claims_settlement_complete check (
  status <> 'settled' or (settled_resolution is not null and settled_at is not null)
);

drop trigger if exists wholesale_claims_touch_updated_at on wholesale_claims;
create trigger wholesale_claims_touch_updated_at
  before update on wholesale_claims
  for each row execute function public.touch_updated_at();

create table if not exists wholesale_claim_lines (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references wholesale_claims (id) on delete cascade,
  sku text not null,
  product_name text not null,
  -- Units billed on the invoice, and the number the buyer says are missing,
  -- damaged or wrong.
  billed_qty integer not null,
  claimed_qty integer not null,
  price_per_unit integer not null,
  -- Units actually allowed after review, which is often fewer than claimed.
  approved_qty integer
);

create index if not exists wholesale_claim_lines_claim_idx on wholesale_claim_lines (claim_id);

-- You cannot claim for more units than you were billed for, and a claim for
-- nothing is not a claim. This is the constraint that stops a typo becoming a
-- credit note for more than the invoice was worth.
alter table wholesale_claim_lines drop constraint if exists wholesale_claim_lines_qty_sane;
alter table wholesale_claim_lines add constraint wholesale_claim_lines_qty_sane check (
  billed_qty > 0
  and claimed_qty > 0
  and claimed_qty <= billed_qty
  and (approved_qty is null or (approved_qty >= 0 and approved_qty <= claimed_qty))
);

alter table wholesale_claims enable row level security;
alter table wholesale_claim_lines enable row level security;

drop policy if exists "Members can view their account's claims" on wholesale_claims;
create policy "Members can view their account's claims"
  on wholesale_claims for select
  using (account_id is not null and account_id = public.wholesale_account_id());

drop policy if exists "Approved buyers can raise claims" on wholesale_claims;
create policy "Approved buyers can raise claims"
  on wholesale_claims for insert
  with check (
    status = 'submitted'
    and public.is_approved_wholesale()
    and account_id = public.wholesale_account_id()
  );

drop policy if exists "Staff manage claims" on wholesale_claims;
create policy "Staff manage claims"
  on wholesale_claims for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Members can view their claim lines" on wholesale_claim_lines;
create policy "Members can view their claim lines"
  on wholesale_claim_lines for select
  using (exists (
    select 1 from wholesale_claims c
    where c.id = wholesale_claim_lines.claim_id
      and c.account_id = public.wholesale_account_id()
  ));

drop policy if exists "Members can add lines to their claims" on wholesale_claim_lines;
create policy "Members can add lines to their claims"
  on wholesale_claim_lines for insert
  with check (exists (
    select 1 from wholesale_claims c
    where c.id = wholesale_claim_lines.claim_id
      and c.account_id = public.wholesale_account_id()
  ));

drop policy if exists "Staff manage claim lines" on wholesale_claim_lines;
create policy "Staff manage claim lines"
  on wholesale_claim_lines for all
  using (public.is_staff())
  with check (public.is_staff());
