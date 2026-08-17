-- Everything an order has to remember about itself.
--
-- The theme is snapshotting. A profile can be renamed, a product reworded, a
-- GST rate changed by notification, a courier swapped — none of which may
-- alter an invoice that has already been issued. So an order stores the values
-- as they stood when it was placed rather than joining out to live rows and
-- recomputing. The joins would be tidier and wrong.

do $$ begin
  create type payment_method as enum ('online', 'cod');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Retail orders
-- ---------------------------------------------------------------------------

-- Contact details as given at checkout. Deliberately not read through to
-- profiles: a customer who later corrects their phone number has not changed
-- who the courier should call about a parcel already in transit.
alter table retail_orders add column if not exists customer_name text;
alter table retail_orders add column if not exists customer_email text;
alter table retail_orders add column if not exists phone text;

-- The number a customer is quoted over the phone or reads in an email. A uuid
-- is unusable for that, and an invoice number is a different thing issued at a
-- different moment — an order gets one when it is placed, an invoice number
-- only when it is billed.
alter table retail_orders add column if not exists reference text;

create unique index if not exists retail_orders_reference_key
  on retail_orders (reference)
  where reference is not null;

alter table retail_orders add column if not exists payment_method payment_method not null default 'online';
alter table retail_orders add column if not exists promo_code text;
alter table retail_orders add column if not exists updated_at timestamptz not null default now();

-- Razorpay's identifiers, kept for reconciliation against the gateway's own
-- settlement reports. The payment id arrives only after capture, so it stays
-- nullable even on a paid order.
alter table retail_orders add column if not exists razorpay_order_id text;
alter table retail_orders add column if not exists razorpay_payment_id text;

-- Fulfilment. `delivered_at` is not decoration: the return window runs from
-- it, so a slow delivery must not eat into the customer's 7 days.
alter table retail_orders add column if not exists courier_id text;
alter table retail_orders add column if not exists awb text;
alter table retail_orders add column if not exists shipped_at date;
alter table retail_orders add column if not exists delivered_at date;
alter table retail_orders add column if not exists cancelled_at date;

-- GST snapshot.
--
-- `subtotal` is the taxable value after any discount; the tax columns are the
-- amounts actually charged. Retail prices are GST-inclusive, so these are
-- extracted from the price rather than added to it — which is precisely why
-- they must be stored. Recomputing at print time against whatever rate is
-- current would silently reissue a different document.
alter table retail_orders add column if not exists subtotal integer not null default 0;
alter table retail_orders add column if not exists discount integer not null default 0;
alter table retail_orders add column if not exists tax_cgst integer not null default 0;
alter table retail_orders add column if not exists tax_sgst integer not null default 0;
alter table retail_orders add column if not exists tax_igst integer not null default 0;

-- Two-character state code. Determines the CGST+SGST vs IGST split, so it is
-- part of the invoice, not merely part of the address.
alter table retail_orders add column if not exists place_of_supply text;

-- The registration the invoice was raised under. GarmentVibes trades under
-- Provident Global Services today; if that ever changes, old invoices must
-- keep naming the entity that actually issued them.
alter table retail_orders add column if not exists seller_gstin text;

-- GST requires invoices to be serially numbered per series per financial year.
-- Generating that series is the server's job — a half-designed numbering
-- scheme in the schema would be worse than none — but the uniqueness it has
-- to guarantee is enforced here.
alter table retail_orders add column if not exists invoice_number text;

create unique index if not exists retail_orders_invoice_number_key
  on retail_orders (invoice_number)
  where invoice_number is not null;

create index if not exists retail_orders_status_idx on retail_orders (status, created_at desc);

-- A supply is either intra-state (CGST + SGST) or inter-state (IGST), never
-- both. Getting this wrong produces an invoice the buyer cannot claim credit
-- against, so it is a constraint rather than a convention.
alter table retail_orders drop constraint if exists retail_orders_gst_split_exclusive;
alter table retail_orders add constraint retail_orders_gst_split_exclusive check (
  (tax_igst = 0) or (tax_cgst = 0 and tax_sgst = 0)
);

-- CGST and SGST are always levied at the same rate on the same value, so an
-- unequal pair is arithmetic that has gone wrong somewhere upstream.
alter table retail_orders drop constraint if exists retail_orders_cgst_equals_sgst;
alter table retail_orders add constraint retail_orders_cgst_equals_sgst check (tax_cgst = tax_sgst);

alter table retail_orders drop constraint if exists retail_orders_amounts_non_negative;
alter table retail_orders add constraint retail_orders_amounts_non_negative check (
  subtotal >= 0 and discount >= 0 and tax_cgst >= 0 and tax_sgst >= 0 and tax_igst >= 0 and total >= 0
);

drop trigger if exists retail_orders_touch_updated_at on retail_orders;
create trigger retail_orders_touch_updated_at
  before update on retail_orders
  for each row execute function public.touch_updated_at();

-- Per-line tax, because the rate is per-item: apparel is 5% up to ₹2,500 a
-- piece and 18% above it, so a single order routinely mixes both and an
-- order-level rate could not represent it.
alter table retail_order_items add column if not exists product_name text;
alter table retail_order_items add column if not exists hsn_code text;
alter table retail_order_items add column if not exists taxable_value integer not null default 0;
alter table retail_order_items add column if not exists tax_rate numeric(5, 2) not null default 0;
alter table retail_order_items add column if not exists tax_amount integer not null default 0;

alter table retail_order_items drop constraint if exists retail_order_items_qty_positive;
alter table retail_order_items add constraint retail_order_items_qty_positive check (qty > 0);

-- ---------------------------------------------------------------------------
-- Wholesale quotes / bulk orders
-- ---------------------------------------------------------------------------

do $$ begin
  create type wholesale_record_kind as enum ('quote', 'order');
exception when duplicate_object then null;
end $$;

-- A quote becomes an order without changing identity — same row, same history,
-- one discriminator — so a buyer can see the price they were quoted against
-- what they were eventually billed.
alter table wholesale_quotes add column if not exists kind wholesale_record_kind not null default 'quote';

alter table wholesale_quotes add column if not exists reference text;

create unique index if not exists wholesale_quotes_reference_key
  on wholesale_quotes (reference)
  where reference is not null;

alter table wholesale_quotes add column if not exists business_name text;
alter table wholesale_quotes add column if not exists contact_name text;
alter table wholesale_quotes add column if not exists email text;
alter table wholesale_quotes add column if not exists updated_at timestamptz not null default now();

-- The buyer's own GSTIN, snapshotted. A B2B invoice must carry it for the
-- buyer to claim input credit, and it belongs to the invoice rather than to
-- the account, which may be corrected later.
alter table wholesale_quotes add column if not exists buyer_gstin text;
alter table wholesale_quotes add column if not exists place_of_supply text;
alter table wholesale_quotes add column if not exists seller_gstin text;
alter table wholesale_quotes add column if not exists invoice_number text;

alter table wholesale_quotes add column if not exists courier_id text;
alter table wholesale_quotes add column if not exists awb text;
alter table wholesale_quotes add column if not exists shipped_at date;
alter table wholesale_quotes add column if not exists delivered_at date;

-- Wholesale prices are quoted ex-GST, so unlike retail these amounts are
-- added on top rather than extracted.
alter table wholesale_quotes add column if not exists subtotal integer not null default 0;
alter table wholesale_quotes add column if not exists tax_cgst integer not null default 0;
alter table wholesale_quotes add column if not exists tax_sgst integer not null default 0;
alter table wholesale_quotes add column if not exists tax_igst integer not null default 0;
alter table wholesale_quotes add column if not exists grand_total integer not null default 0;

create unique index if not exists wholesale_quotes_invoice_number_key
  on wholesale_quotes (invoice_number)
  where invoice_number is not null;

create index if not exists wholesale_quotes_status_idx on wholesale_quotes (status, created_at desc);

alter table wholesale_quotes drop constraint if exists wholesale_quotes_gst_split_exclusive;
alter table wholesale_quotes add constraint wholesale_quotes_gst_split_exclusive check (
  (tax_igst = 0) or (tax_cgst = 0 and tax_sgst = 0)
);

alter table wholesale_quotes drop constraint if exists wholesale_quotes_cgst_equals_sgst;
alter table wholesale_quotes add constraint wholesale_quotes_cgst_equals_sgst check (tax_cgst = tax_sgst);

drop trigger if exists wholesale_quotes_touch_updated_at on wholesale_quotes;
create trigger wholesale_quotes_touch_updated_at
  before update on wholesale_quotes
  for each row execute function public.touch_updated_at();

alter table wholesale_quote_items add column if not exists sku text;
alter table wholesale_quote_items add column if not exists product_name text;
alter table wholesale_quote_items add column if not exists hsn_code text;
alter table wholesale_quote_items add column if not exists taxable_value integer not null default 0;
alter table wholesale_quote_items add column if not exists tax_rate numeric(5, 2) not null default 0;
alter table wholesale_quote_items add column if not exists tax_amount integer not null default 0;

alter table wholesale_quote_items drop constraint if exists wholesale_quote_items_qty_positive;
alter table wholesale_quote_items add constraint wholesale_quote_items_qty_positive check (qty > 0);

-- ---------------------------------------------------------------------------
-- Staff and customer access
-- ---------------------------------------------------------------------------

-- Staff run fulfilment, so they need every order and the ability to advance
-- its status. Customers deliberately get no update policy: cancelling is a
-- state transition with rules attached (only before dispatch), which belongs
-- in a server action, not in an UPDATE the client can shape freely.
drop policy if exists "Staff manage retail orders" on retail_orders;
create policy "Staff manage retail orders"
  on retail_orders for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Staff manage retail order items" on retail_order_items;
create policy "Staff manage retail order items"
  on retail_order_items for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Staff manage wholesale quotes" on wholesale_quotes;
create policy "Staff manage wholesale quotes"
  on wholesale_quotes for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Staff manage wholesale quote items" on wholesale_quote_items;
create policy "Staff manage wholesale quote items"
  on wholesale_quote_items for all
  using (public.is_staff())
  with check (public.is_staff());

-- 0001 let a customer insert an order row but never its lines, which would
-- have produced empty orders.
drop policy if exists "Users can add items to their own retail orders" on retail_order_items;
create policy "Users can add items to their own retail orders"
  on retail_order_items for insert
  with check (exists (
    select 1 from retail_orders
    where retail_orders.id = retail_order_items.order_id
      and retail_orders.user_id = auth.uid()
  ));

drop policy if exists "Users can add items to their own wholesale quotes" on wholesale_quote_items;
create policy "Users can add items to their own wholesale quotes"
  on wholesale_quote_items for insert
  with check (exists (
    select 1 from wholesale_quotes
    where wholesale_quotes.id = wholesale_quote_items.quote_id
      and wholesale_quotes.user_id = auth.uid()
  ));
