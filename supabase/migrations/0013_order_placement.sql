-- Placing a retail order.
--
-- Until now the app took payment and wrote the order to localStorage. A
-- customer could pay, clear their browser, and leave us holding a Razorpay
-- payment whose receipt id mapped to nothing we could ship, invoice or refund.
-- This is the server-side record that was missing.
--
-- ---------------------------------------------------------------------------
-- Why a function instead of an INSERT
-- ---------------------------------------------------------------------------
--
-- 0001 gave customers a direct INSERT policy on `retail_orders`, checking only
-- `auth.uid() = user_id`. Ownership is the only thing an RLS policy on an
-- INSERT can practically check — it cannot look at the catalogue — so that
-- policy happily accepts:
--
--     insert into retail_orders (user_id, total, ...) values (me, 100, ...)
--
-- ...for a basket of sarees. `/api/razorpay/order` is careful to price from
-- the catalogue precisely so that the browser cannot name its own amount;
-- letting the browser then write the order row hands the same power back at a
-- different door.
--
-- It also cannot be made atomic. Order row, order items and stock decrements
-- are three writes, and PostgREST gives the client no transaction to wrap
-- them in. A network drop between the first and the second leaves an order
-- with no lines, or stock sold with no order against it.
--
-- So: one function, one transaction, and the INSERT grants revoked below so
-- that it is the only door rather than the preferred one.
--
-- ---------------------------------------------------------------------------
-- What it verifies, and what it trusts
-- ---------------------------------------------------------------------------
--
-- Item prices, the promo discount and the arithmetic tying them to the total
-- are re-derived here and the call is rejected if the submitted figures
-- disagree.
--
-- Tax is the one place this stops short of re-deriving. Which slab applies to
-- which price (5% up to ₹2,500 a piece, 18% above) lives in src/lib/gst.ts
-- with a test suite around it, and a second implementation in PL/pgSQL would
-- be a second thing to keep correct. So the *rate* is taken as given — but
-- only after being checked against the rates GST actually has — and the
-- arithmetic that follows from it is recomputed in full: given a rate, a
-- GST-inclusive line has exactly one correct split into taxable value and
-- tax, and that is what gets stored. The header's CGST/SGST/IGST must then
-- sum to the line taxes. What survives all of that is a wrong slab choice on
-- the right rate list, which is not something a browser gets to influence.

-- ---------------------------------------------------------------------------
-- 1. CGST and SGST cannot always be exactly equal
-- ---------------------------------------------------------------------------
--
-- 0004 asserted `tax_cgst = tax_sgst`, which is right in spirit — a supply is
-- taxed half by the centre and half by the state — and impossible in integer
-- paise whenever the tax is an odd number of them. src/lib/gst.ts splits an
-- odd total as floor/remainder so that the pair still sums to the tax actually
-- charged, which is the property an invoice needs; the constraint then refused
-- the row.
--
-- Nothing has ever hit this because nothing has ever written an order. It is
-- not a rare edge either: over a thousand consecutive price points, 504
-- produce an odd total tax. A ₹1,999 kurta is one of them — CGST 47.59, SGST
-- 47.60. Roughly every second order would have been rejected by its own
-- schema the first time the storefront tried to save one.
--
-- One paise of tolerance is the whole fix. It still catches the bug the
-- constraint was written for — the entire tax landed in CGST, or the two
-- halves computed independently and drifting — while allowing the only case
-- where they can legitimately differ. Filing is in rupees, so a paise of
-- asymmetry never reaches a return.
alter table retail_orders drop constraint if exists retail_orders_cgst_equals_sgst;
alter table retail_orders add constraint retail_orders_cgst_equals_sgst
  check (abs(tax_cgst - tax_sgst) <= 1);

-- The wholesale side computes tax through the same summarise() and carries the
-- same constraint, so it has the same latent defect.
alter table wholesale_quotes drop constraint if exists wholesale_quotes_cgst_equals_sgst;
alter table wholesale_quotes add constraint wholesale_quotes_cgst_equals_sgst
  check (abs(tax_cgst - tax_sgst) <= 1);

-- ---------------------------------------------------------------------------
-- 2. The COD fee needs somewhere to live
-- ---------------------------------------------------------------------------

-- src/lib/payment-methods.ts charges a fee on cash on delivery and waives it
-- above a threshold. The order row had columns for subtotal, discount and tax
-- but nowhere to put it, so the total would not have footed against its parts.
alter table retail_orders add column if not exists cod_fee integer not null default 0;

alter table retail_orders drop constraint if exists retail_orders_cod_fee_non_negative;
alter table retail_orders add constraint retail_orders_cod_fee_non_negative
  check (cod_fee >= 0);

-- ---------------------------------------------------------------------------
-- 3. place_retail_order()
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER for one reason: decrementing `retail_product_sizes.stock_qty`.
-- Writing stock is staff-only under RLS and must stay that way — a customer who
-- can write stock can restock a sold-out item and order it. The function
-- borrows that privilege for the duration of one order and does nothing else
-- with it.
--
-- search_path is pinned, per the same reasoning as 0011: an unqualified name
-- inside a definer-rights function is resolved through whatever search_path
-- the caller happens to have set.
--
-- Everything is validated BEFORE the order row is written. Inserting first and
-- checking after is tempting — the items need an order id to reference — but
-- it means the table's own constraints fire ahead of the checks here, and the
-- caller gets `violates check constraint "retail_orders_cgst_equals_sgst"`
-- where it should have been told its price was wrong. The resolved lines are
-- accumulated and written at the end instead.
create or replace function public.place_retail_order(
  p_items jsonb,
  p_address jsonb,
  p_customer_name text,
  p_customer_email text,
  p_phone text,
  p_payment_method payment_method,
  p_promo_code text,
  p_subtotal integer,
  p_discount integer,
  p_cod_fee integer,
  p_tax_cgst integer,
  p_tax_sgst integer,
  p_tax_igst integer,
  p_total integer,
  p_place_of_supply text,
  p_seller_gstin text,
  p_reference text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_order_id uuid;
  v_item jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_product_id uuid;
  v_catalog_price integer;
  v_product_name text;
  v_is_active boolean;
  v_derived_subtotal integer := 0;
  v_derived_tax integer := 0;
  v_header_tax integer;
  v_percent integer;
  v_expected_discount integer;
  v_line_gross integer;
  v_qty integer;
  v_price integer;
  v_taxable integer;
  v_tax integer;
  v_rate numeric;
  v_expected_taxable integer;
  v_promo text := nullif(upper(trim(coalesce(p_promo_code, ''))), '');
begin
  -- Signed out is not an error we can price around. Checkout requires an
  -- account by design, and an order with no owner is unshippable and
  -- unrefundable.
  if v_user is null then
    raise exception 'place_retail_order: no authenticated user'
      using errcode = '28000';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'place_retail_order: order must contain at least one item'
      using errcode = '22023';
  end if;

  if coalesce(p_discount, 0) < 0 or coalesce(p_cod_fee, 0) < 0 then
    raise exception 'place_retail_order: discount and COD fee cannot be negative'
      using errcode = '22023';
  end if;

  -- -------------------------------------------------------------------
  -- Resolve every line against the catalogue, and take its stock
  -- -------------------------------------------------------------------
  --
  -- Sorting by product id before locking is what stops two simultaneous
  -- checkouts of the same two products deadlocking against each other: both
  -- take the row locks in the same sequence, so one waits instead of each
  -- holding half of what the other needs.
  for v_item in
    select value from jsonb_array_elements(p_items) as t(value)
    order by (value ->> 'slug'), (value ->> 'size')
  loop
    v_qty := (v_item ->> 'qty')::integer;
    v_price := (v_item ->> 'price')::integer;
    v_taxable := coalesce((v_item ->> 'taxable_value')::integer, 0);
    v_tax := coalesce((v_item ->> 'tax_amount')::integer, 0);

    if v_qty is null or v_qty < 1 then
      raise exception 'place_retail_order: invalid quantity for product %',
        v_item ->> 'slug' using errcode = '22023';
    end if;

    -- Lines are addressed by slug, not by id.
    --
    -- The app's own catalogue in src/lib/mock/ numbers products "r1", "r10"
    -- and so on; the database generates its own uuids and the seed joins the
    -- two by slug. So the slug is the only identifier both sides share, and
    -- the browser never has to learn a uuid. The resolved id is what gets
    -- stored on the line, because that is the stable reference — a slug can be
    -- rewritten when a product is renamed, and an order already placed must
    -- not follow it.
    select p.id, p.price, p.name, p.is_active
      into v_product_id, v_catalog_price, v_product_name, v_is_active
      from retail_products p
     where p.slug = (v_item ->> 'slug');

    if not found then
      raise exception 'place_retail_order: unknown product %',
        v_item ->> 'slug' using errcode = '23503';
    end if;

    if not v_is_active then
      raise exception 'place_retail_order: product % is not on sale',
        v_item ->> 'slug' using errcode = '22023';
    end if;

    if v_price is distinct from v_catalog_price then
      raise exception 'place_retail_order: price mismatch for product % (sent %, catalogue %)',
        v_item ->> 'slug', v_price, v_catalog_price using errcode = '22023';
    end if;

    v_line_gross := v_qty * v_catalog_price;
    v_rate := coalesce((v_item ->> 'tax_rate')::numeric, -1);

    -- Which slab applies to which price is src/lib/gst.ts's business and is
    -- deliberately not reimplemented here. What IS checked is that the rate is
    -- a rate GST actually has — a typo turning 5 into 0.5, or a rate of 500,
    -- gets no further than this.
    if v_rate not in (0, 5, 12, 18, 28) then
      raise exception 'place_retail_order: % is not a GST rate', v_rate
        using errcode = '22023';
    end if;

    -- Retail prices are GST-inclusive, so tax is backed out of the gross
    -- rather than added on: taxable is the gross less the tax fraction, and
    -- the tax is whatever remains. Both halves are recomputed here.
    --
    -- Checking only that they sum to the gross would be much weaker than it
    -- looks: a line declaring the whole gross taxable and zero tax sums
    -- perfectly well and is simply wrong. Given the rate, there is exactly one
    -- correct split, so that is what this insists on.
    v_expected_taxable := round((v_line_gross * 100) / (100 + v_rate));

    if v_taxable <> v_expected_taxable or v_tax <> v_line_gross - v_expected_taxable then
      raise exception 'place_retail_order: tax is wrong for product % at rate % (taxable %/%, tax %/%)',
        v_item ->> 'slug', v_rate,
        v_taxable, v_expected_taxable,
        v_tax, v_line_gross - v_expected_taxable
        using errcode = '22023';
    end if;

    -- Lock the size row, then decrement. `for update` holds it until this
    -- transaction ends, so a second checkout for the last unit waits here and
    -- then reads the decremented figure rather than the stale one.
    perform 1
       from retail_product_sizes s
      where s.product_id = v_product_id
        and s.label = (v_item ->> 'size')
      for update;

    if not found then
      raise exception 'place_retail_order: product % has no size %',
        v_item ->> 'slug', v_item ->> 'size' using errcode = '23503';
    end if;

    -- The `stock_qty >= 0` check constraint from 0005 is the real oversell
    -- guard; this raises the readable error before it fires so the customer
    -- is told what is out of stock rather than seeing a constraint name.
    update retail_product_sizes
       set stock_qty = stock_qty - v_qty
     where product_id = v_product_id
       and label = (v_item ->> 'size')
       and stock_qty >= v_qty;

    if not found then
      raise exception 'place_retail_order: not enough stock for product % size %',
        v_item ->> 'slug', v_item ->> 'size' using errcode = '23514';
    end if;

    v_derived_subtotal := v_derived_subtotal + v_line_gross;
    v_derived_tax := v_derived_tax + v_tax;

    v_lines := v_lines || jsonb_build_object(
      'product_id', v_product_id,
      'size', v_item ->> 'size',
      'color', coalesce(v_item ->> 'color', ''),
      'qty', v_qty,
      'price', v_catalog_price,
      -- Snapshotted from the catalogue, not from the caller: an order shows
      -- what was actually bought even after the product is renamed.
      'product_name', v_product_name,
      'hsn_code', v_item ->> 'hsn_code',
      'taxable_value', v_taxable,
      'tax_rate', coalesce((v_item ->> 'tax_rate')::numeric, 0),
      'tax_amount', v_tax
    );
  end loop;

  -- -------------------------------------------------------------------
  -- The arithmetic has to foot
  -- -------------------------------------------------------------------

  if p_subtotal is distinct from v_derived_subtotal then
    raise exception 'place_retail_order: subtotal mismatch (sent %, catalogue %)',
      p_subtotal, v_derived_subtotal using errcode = '22023';
  end if;

  -- A promo code is either live and worth what it says, or it is not applied.
  -- Checking it here is what finally makes a code created in the admin panel
  -- discount the payment as well as the basket — the note in 0009 called this
  -- out as the gap, and this closes it.
  if v_promo is null then
    if coalesce(p_discount, 0) <> 0 then
      raise exception 'place_retail_order: discount applied with no promo code'
        using errcode = '22023';
    end if;
  else
    select percent into v_percent
      from promo_codes
     where code = v_promo
       and active
       and (starts_on is null or starts_on <= current_date)
       and (expires_on is null or expires_on >= current_date);

    if not found then
      raise exception 'place_retail_order: promo code % is not valid today', v_promo
        using errcode = '22023';
    end if;

    v_expected_discount := round((v_derived_subtotal * v_percent) / 100.0);
    if coalesce(p_discount, 0) is distinct from v_expected_discount then
      raise exception 'place_retail_order: discount mismatch for % (sent %, expected %)',
        v_promo, p_discount, v_expected_discount using errcode = '22023';
    end if;
  end if;

  v_header_tax := coalesce(p_tax_cgst, 0) + coalesce(p_tax_sgst, 0) + coalesce(p_tax_igst, 0);

  if v_header_tax is distinct from v_derived_tax then
    raise exception 'place_retail_order: order tax does not match its lines (header %, lines %)',
      v_header_tax, v_derived_tax using errcode = '22023';
  end if;

  -- A supply carries either CGST+SGST or IGST, never both. The table asserts
  -- this too; saying it here is what makes the caller's error readable.
  if coalesce(p_tax_igst, 0) > 0
     and (coalesce(p_tax_cgst, 0) > 0 or coalesce(p_tax_sgst, 0) > 0) then
    raise exception 'place_retail_order: a supply is either intra-state or inter-state, not both'
      using errcode = '22023';
  end if;

  -- One paise of asymmetry is the most an honest halving can produce.
  if abs(coalesce(p_tax_cgst, 0) - coalesce(p_tax_sgst, 0)) > 1 then
    raise exception 'place_retail_order: CGST % and SGST % are not halves of the same tax',
      p_tax_cgst, p_tax_sgst using errcode = '22023';
  end if;

  if p_total is distinct from
     (v_derived_subtotal - coalesce(p_discount, 0) + coalesce(p_cod_fee, 0)) then
    raise exception 'place_retail_order: total mismatch (sent %, expected %)',
      p_total, v_derived_subtotal - coalesce(p_discount, 0) + coalesce(p_cod_fee, 0)
      using errcode = '22023';
  end if;

  -- -------------------------------------------------------------------
  -- Everything reconciles. Write it.
  -- -------------------------------------------------------------------

  insert into retail_orders (
    user_id, status, subtotal, discount, cod_fee,
    tax_cgst, tax_sgst, tax_igst, total, currency,
    shipping_address, customer_name, customer_email, phone,
    payment_method, promo_code, place_of_supply, seller_gstin, reference
  ) values (
    v_user,
    -- COD is confirmed on placement; there is no payment step to wait for.
    -- Everything else stays `pending` until Razorpay says otherwise, so an
    -- abandoned payment never looks like a sale.
    case when p_payment_method = 'cod' then 'confirmed'::order_status
         else 'pending'::order_status end,
    p_subtotal, coalesce(p_discount, 0), coalesce(p_cod_fee, 0),
    coalesce(p_tax_cgst, 0), coalesce(p_tax_sgst, 0), coalesce(p_tax_igst, 0),
    p_total, 'INR',
    p_address, p_customer_name, p_customer_email, p_phone,
    p_payment_method, v_promo, p_place_of_supply, p_seller_gstin, p_reference
  )
  returning id into v_order_id;

  insert into retail_order_items (
    order_id, product_id, size, color, qty, price,
    product_name, hsn_code, taxable_value, tax_rate, tax_amount
  )
  select
    v_order_id,
    (l ->> 'product_id')::uuid,
    l ->> 'size',
    l ->> 'color',
    (l ->> 'qty')::integer,
    (l ->> 'price')::integer,
    l ->> 'product_name',
    l ->> 'hsn_code',
    (l ->> 'taxable_value')::integer,
    (l ->> 'tax_rate')::numeric,
    (l ->> 'tax_amount')::integer
  from jsonb_array_elements(v_lines) as t(l);

  return v_order_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Close the direct door
-- ---------------------------------------------------------------------------

-- With the function in place, a direct INSERT is no longer the supported path
-- — it is the unpriced one. Both the grant and the policies go: the grant is
-- what actually stops it, and leaving the policies behind would suggest a
-- route that no longer exists.
--
-- This revokes staff's ability to insert orders too, because grants are
-- per-role and staff are `authenticated` like everyone else. That is
-- deliberate rather than collateral: a phone order typed in by hand should be
-- priced by the same code that prices every other order. When that flow is
-- built it gets its own function with a staff check, not a hole left open
-- against the day someone might need it.
revoke insert on retail_orders from authenticated;
revoke insert on retail_order_items from authenticated;

drop policy if exists "Users can create their own retail orders" on retail_orders;
drop policy if exists "Users can add items to their own retail orders" on retail_order_items;

-- `service_role` keeps its INSERT. It bypasses RLS entirely by design and is
-- only ever used from our own server; the Razorpay webhook needs it to mark an
-- order paid without a user session to act as.

-- Customers call this; nobody else needs to.
revoke all on function public.place_retail_order(
  jsonb, jsonb, text, text, text, payment_method, text,
  integer, integer, integer, integer, integer, integer, integer, text, text, text
) from public, anon;

grant execute on function public.place_retail_order(
  jsonb, jsonb, text, text, text, payment_method, text,
  integer, integer, integer, integer, integer, integer, integer, text, text, text
) to authenticated, service_role;
