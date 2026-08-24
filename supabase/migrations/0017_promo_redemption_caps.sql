-- Redemption caps on promo codes.
--
-- 0009 created `promo_codes` and closed its own note with an admission:
--
--     Known limitation, recorded rather than quietly invented: there is no
--     redemption cap or per-customer limit here, because the app has no
--     concept of one. A percentage code with no cap can be shared publicly
--     and used without limit.
--
-- The app has had the concept since #58 — `PromoCode.maxRedemptions`,
-- `maxPerCustomer` and `issuedTo`, with `evaluatePromo()` enforcing all three.
-- All of it lives in a zustand store in localStorage, and the header of
-- src/lib/promo-eligibility.ts says what that is worth:
--
--     browser-side enforcement is advisory: the honest guard is a unique
--     constraint on (code, user) plus a counter checked in the same
--     transaction as the order.
--
-- This is that guard. Today a one-per-customer code is reusable by clearing
-- site data, and a code capped at 100 total is reusable for ever by anyone
-- with a second browser — the count lives on the machine of the person the
-- count is about.
--
-- ---------------------------------------------------------------------------
-- Why a ledger rather than a counter column
-- ---------------------------------------------------------------------------
--
-- `promo_codes.times_redeemed` would be one integer to increment, and it
-- cannot answer the per-customer question at all — which is half the feature,
-- because a cap of 500 total does nothing if one person can take all 500. A
-- row per redemption answers both caps from the same record, so the two can
-- never disagree about how many redemptions have happened, and it leaves an
-- audit trail: which order consumed which code, for the day somebody asks why
-- a campaign ran out.
--
-- ---------------------------------------------------------------------------
-- Why the cap is checked inside place_retail_order
-- ---------------------------------------------------------------------------
--
-- Same reason the price is. A check that runs before the order is written is a
-- check two concurrent checkouts both pass: both read "99 redeemed of 100",
-- both write, and the campaign settles at 101. The count has to be read and
-- the redemption written in one transaction, under a lock on the code, or the
-- cap is a suggestion.

-- ---------------------------------------------------------------------------
-- 1. The caps themselves
-- ---------------------------------------------------------------------------

-- Null means unlimited in both cases, which is the existing behaviour and the
-- right default for a migration applied to codes that were created without
-- either — silently capping live campaigns at some invented number would be a
-- worse surprise than leaving them as they are.
alter table promo_codes add column if not exists max_redemptions integer;
alter table promo_codes add column if not exists max_per_customer integer;

alter table promo_codes drop constraint if exists promo_codes_caps_positive;
alter table promo_codes add constraint promo_codes_caps_positive check (
  (max_redemptions is null or max_redemptions > 0)
  and (max_per_customer is null or max_per_customer > 0)
);

-- A cap of "at most 5 each, at most 3 in total" is not wrong so much as
-- meaningless — the per-customer number can never bind. Rejecting it catches
-- the transposed pair, which is the way this gets typed in wrong.
alter table promo_codes drop constraint if exists promo_codes_caps_ordered;
alter table promo_codes add constraint promo_codes_caps_ordered check (
  max_redemptions is null or max_per_customer is null
  or max_per_customer <= max_redemptions
);

-- A referral reward belongs to one person, and knowing the code must not be
-- enough to use it — the whole point of `rewardCodeFor()` is that it is issued
-- TO somebody.
--
-- A uuid rather than the email the client store keys on. An email is a display
-- string that changes; `auth.users.id` is what RLS and every other ownership
-- check in this schema are keyed to, and a reward that survives its owner
-- changing their address is the one worth having.
--
-- Nothing writes this yet: referral rewards are still issued into the browser
-- store by checkout, so every row in this table has a null here today. The
-- column and its enforcement are here so that issuing them server-side is a
-- change to one code path rather than to the rules as well.
alter table promo_codes add column if not exists issued_to uuid references auth.users (id) on delete cascade;

create index if not exists promo_codes_issued_to_idx on promo_codes (issued_to)
  where issued_to is not null;

-- ---------------------------------------------------------------------------
-- 2. The ledger
-- ---------------------------------------------------------------------------

create table if not exists promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  code text not null references promo_codes (code) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The order that consumed it. Cascades, so an order deleted in a cleanup
  -- does not leave a redemption standing against a code for ever.
  order_id uuid not null references retail_orders (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- One redemption per order. This is what makes a retry safe: place, fail,
  -- place again with the same reference and the second insert is refused
  -- rather than quietly charging the code twice for one basket.
  unique (order_id)
);

-- The two reads the caps need: the total for a code, and one customer's share
-- of it. Partial to neither, because both run on every discounted checkout.
create index if not exists promo_redemptions_code_idx on promo_redemptions (code);
create index if not exists promo_redemptions_code_user_idx on promo_redemptions (code, user_id);

-- Not redundant with the composite above, which leads on `code` and so cannot
-- serve a lookup by user alone. That lookup is what a cascading delete of an
-- account does, and 20_invariants.sql asserts every single-column foreign key
-- has an index precisely so an unindexed one cannot ship — it caught this.
create index if not exists promo_redemptions_user_idx on promo_redemptions (user_id);

alter table promo_redemptions enable row level security;

-- A customer may see which codes they have used — "you've already used that
-- code" is a claim they are entitled to check. They may see nobody else's:
-- the full ledger is how many people used a campaign and when, which is
-- commercial information.
drop policy if exists "Users can see their own redemptions" on promo_redemptions;
create policy "Users can see their own redemptions"
  on promo_redemptions for select
  using (auth.uid() = user_id);

drop policy if exists "Staff can see every redemption" on promo_redemptions;
create policy "Staff can see every redemption"
  on promo_redemptions for all
  using (public.is_staff())
  with check (public.is_staff());

-- Writes go through place_retail_order and nowhere else. Left grantable, a
-- customer could insert somebody else's redemptions to exhaust a campaign, or
-- delete their own to reuse a one-per-customer code — which is the entire
-- attack this migration exists to stop, arriving through the front door.
revoke insert, update, delete on promo_redemptions from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reading a code's standing, before the customer commits to paying
-- ---------------------------------------------------------------------------

/**
 * Whether the caller may use a code, and if not, why.
 *
 * The rejection vocabulary matches `PromoRejection` in
 * src/lib/promo-eligibility.ts exactly — unknown, inactive, expired,
 * exhausted, already_used, not_yours — so the storefront can render the same
 * message whether the answer came from here or from the local store. Two
 * vocabularies for one decision is how the server starts refusing codes the
 * UI has just said are fine.
 *
 * `inactive` and `expired` are deliberately reachable. The RLS policy on
 * `promo_codes` hides both from a customer's own SELECT, and it is right to —
 * a plain read should not enumerate unreleased campaigns. But a customer who
 * types a code off last month's flyer is owed "that code has expired" rather
 * than "we don't recognise that code", and this function answers about one
 * code the caller already named. It cannot be used to discover anything,
 * because you have to know the code to ask about it.
 */
create or replace function public.evaluate_promo(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_code text := nullif(upper(trim(coalesce(p_code, ''))), '');
  v_promo promo_codes%rowtype;
  v_total integer;
  v_mine integer;
begin
  if v_code is null then
    return jsonb_build_object('ok', false, 'percent', 0, 'reason', 'unknown');
  end if;

  select * into v_promo from promo_codes where code = v_code;

  if not found then
    return jsonb_build_object('ok', false, 'percent', 0, 'reason', 'unknown');
  end if;

  if not v_promo.active then
    return jsonb_build_object('ok', false, 'percent', 0, 'reason', 'inactive');
  end if;

  -- A code whose window has not opened reads as `expired` rather than getting
  -- a reason of its own. "Not yet valid" would confirm to anyone guessing that
  -- a campaign is coming, and the customer's next move is the same either way.
  if (v_promo.starts_on is not null and v_promo.starts_on > current_date)
     or (v_promo.expires_on is not null and v_promo.expires_on < current_date) then
    return jsonb_build_object('ok', false, 'percent', 0, 'reason', 'expired');
  end if;

  -- Ownership before the caps, so a reward issued to somebody else is refused
  -- for the true reason rather than for a limit this caller never had.
  if v_promo.issued_to is not null and v_promo.issued_to is distinct from v_user then
    return jsonb_build_object('ok', false, 'percent', 0, 'reason', 'not_yours');
  end if;

  if v_promo.max_redemptions is not null then
    select count(*) into v_total from promo_redemptions where code = v_code;
    if v_total >= v_promo.max_redemptions then
      return jsonb_build_object('ok', false, 'percent', 0, 'reason', 'exhausted');
    end if;
  end if;

  if v_promo.max_per_customer is not null then
    -- No account means no way to attribute a redemption, so a per-customer cap
    -- cannot be enforced and the safe direction is to refuse: the alternative
    -- is an unlimited code for anyone who signs out. Checkout requires an
    -- account anyway, so in practice this is unreachable from the only place
    -- that matters.
    if v_user is null then
      return jsonb_build_object('ok', false, 'percent', 0, 'reason', 'already_used');
    end if;

    select count(*) into v_mine
      from promo_redemptions where code = v_code and user_id = v_user;

    if v_mine >= v_promo.max_per_customer then
      return jsonb_build_object('ok', false, 'percent', 0, 'reason', 'already_used');
    end if;
  end if;

  return jsonb_build_object('ok', true, 'percent', v_promo.percent);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Enforcing it where it counts
-- ---------------------------------------------------------------------------

-- place_retail_order gains the cap check and the ledger write. Everything else
-- about it is unchanged; it is restated in full because `create or replace`
-- takes the whole body, and a patch file that only showed the promo block
-- would leave the deployed definition unreadable from the migrations alone.
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
  v_promo_row promo_codes%rowtype;
  v_redeemed integer;
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
    -- `for update` is the whole cap. Without it, two checkouts on the last
    -- redemption of a code both count 99 of 100, both pass, and both write —
    -- the same shape of race the stock lock above exists for, and it gets the
    -- same answer. It serialises checkouts using one code, which for a code
    -- being redeemed by two people in the same second is the intent.
    --
    -- Taken after the stock locks rather than before, so that every caller
    -- acquires locks in the same order — sizes, then the code. A checkout that
    -- took the code first would deadlock against one already holding a size it
    -- needs.
    select * into v_promo_row
      from promo_codes
     where code = v_promo
       and active
       and (starts_on is null or starts_on <= current_date)
       and (expires_on is null or expires_on >= current_date)
     for update;

    if not found then
      raise exception 'place_retail_order: promo code % is not valid today', v_promo
        using errcode = '22023';
    end if;

    v_percent := v_promo_row.percent;

    -- Ownership before the caps, so a reward issued to somebody else is
    -- refused for the true reason rather than for a limit this caller never
    -- had.
    if v_promo_row.issued_to is not null and v_promo_row.issued_to is distinct from v_user then
      raise exception 'place_retail_order: promo code % was issued to another account', v_promo
        using errcode = '22023';
    end if;

    if v_promo_row.max_redemptions is not null then
      select count(*) into v_redeemed from promo_redemptions where code = v_promo;
      if v_redeemed >= v_promo_row.max_redemptions then
        raise exception 'place_retail_order: promo code % has been fully claimed', v_promo
          using errcode = '22023';
      end if;
    end if;

    if v_promo_row.max_per_customer is not null then
      select count(*) into v_redeemed
        from promo_redemptions where code = v_promo and user_id = v_user;
      if v_redeemed >= v_promo_row.max_per_customer then
        raise exception 'place_retail_order: promo code % has already been used by this account',
          v_promo using errcode = '22023';
      end if;
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

  -- Written in the same transaction as the order it belongs to, which is what
  -- makes the count above trustworthy for the next checkout. A redemption
  -- recorded afterwards — by the app, once the call returns — is one that a
  -- crash in between leaves unrecorded, and an uncapped code is what you get.
  if v_promo is not null then
    insert into promo_redemptions (code, user_id, order_id)
    values (v_promo, v_user, v_order_id);
  end if;

  return v_order_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Giving it back
-- ---------------------------------------------------------------------------

-- A cancelled order releases its stock. It has to release its redemption too,
-- or a one-per-customer code is spent by an order that never happened —
-- abandoning a checkout would burn the code, and the customer would be told
-- they had already used something they never received.
--
-- This is the same argument the promo store already makes for redeeming at
-- order time rather than at "Apply", carried through to the other end.
create or replace function public.release_retail_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
  v_status order_status;
begin
  if v_user is null then
    return false;
  end if;

  select user_id, status into v_owner, v_status
    from retail_orders
   where id = p_order_id
   for update;

  if not found or v_owner is distinct from v_user or v_status <> 'pending' then
    return false;
  end if;

  update retail_product_sizes s
     set stock_qty = s.stock_qty + i.qty
    from retail_order_items i
   where i.order_id = p_order_id
     and s.product_id = i.product_id
     and s.label = i.size;

  -- Deleted rather than marked released. The ledger's job is to answer "how
  -- many times has this been redeemed", and a cancelled order is not a
  -- redemption — leaving a tombstone would mean every count in this schema
  -- had to remember to exclude it, and one that forgot would silently
  -- re-cap the code.
  delete from promo_redemptions where order_id = p_order_id;

  update retail_orders
     set status = 'cancelled', cancelled_at = current_date
   where id = p_order_id;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.evaluate_promo(text) from public, anon;
grant execute on function public.evaluate_promo(text) to authenticated, service_role;
